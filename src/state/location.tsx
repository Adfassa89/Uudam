import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';
import { trackStats } from '../geo/measure';
import type { TrackPoint } from '../geo/types';
import * as store from '../storage/files';
import * as recorder from '../tracking/recorder';
import { MAX_ACCURACY_M } from '../tracking/points';
import { useData } from './data';
import { useSettings } from './settings';

const KEEP_AWAKE_TAG = 'uudam-recording';

interface LocationCtx {
  permission: 'unknown' | 'granted' | 'denied';
  current: TrackPoint | null;
  recording: boolean;
  /** 'background' keeps recording with the screen off; 'foreground' needs the app open. */
  recordingMode: recorder.RecordingMode | null;
  points: TrackPoint[];
  startRecording: () => Promise<void>;
  /** Stops recording and returns the points; call `saveRecording` or `discardRecording` next. */
  stopRecording: () => Promise<TrackPoint[]>;
  saveRecording: (name: string) => void;
  discardRecording: () => void;
}

const Ctx = createContext<LocationCtx | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { addTrack } = useData();
  const [permission, setPermission] = useState<LocationCtx['permission']>('unknown');
  const [current, setCurrent] = useState<TrackPoint | null>(null);
  const [recordingMode, setRecordingMode] = useState<recorder.RecordingMode | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const pointsRef = useRef<TrackPoint[]>([]);

  const setAllPoints = useCallback((pts: TrackPoint[]) => {
    pointsRef.current = pts;
    setPoints(pts);
  }, []);

  const notification = useCallback(
    (): recorder.NotificationText => ({
      title: t('map.notificationTitle'),
      body: t('map.notificationBody'),
      permissionTitle: t('map.notificationPermissionTitle'),
      permissionMessage: t('map.notificationPermissionMessage'),
      ok: t('common.ok'),
    }),
    [t],
  );

  const persistTrack = useCallback(
    (pts: TrackPoint[], name: string) => {
      if (pts.length < 2) return;
      const id = store.newId();
      const s = trackStats(pts);
      store.saveTrackPoints(id, pts);
      addTrack({
        id,
        name,
        startedAt: pts[0].t,
        endedAt: pts[pts.length - 1].t,
        pointCount: pts.length,
        distanceM: s.distanceM,
        ascentM: s.ascentM,
        descentM: s.descentM,
        minAlt: s.minAlt,
        maxAlt: s.maxAlt,
      });
    },
    [addTrack],
  );

  // On start: continue a recording that was running when the app was closed or
  // crashed, or keep a finished-but-unsaved route so it's never lost.
  useEffect(() => {
    const pts = recorder.readActivePoints();
    if (recorder.getRecordingState()) {
      setAllPoints(pts);
      recorder
        .resumeRecording(notification())
        .then((mode) => setRecordingMode(mode))
        .catch(() => {});
    } else if (pts.length > 0) {
      persistTrack(pts, t('tracks.untitled', { date: new Date(pts[0].t).toLocaleString() }));
      recorder.clearRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New points from the recorder (background task or on-screen GPS).
  useEffect(() => recorder.subscribe((added) => setAllPoints([...pointsRef.current, ...added])), [setAllPoints]);

  // Track whether the app is on screen; re-read points written while it was not.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAppActive(s === 'active');
      if (s === 'active' && recorder.getRecordingState()) setAllPoints(recorder.readActivePoints());
    });
    return () => sub.remove();
  }, [setAllPoints]);

  // Keep the screen on only when recording cannot continue with the screen off.
  useEffect(() => {
    if (recordingMode === 'foreground') activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    else deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  }, [recordingMode]);

  // Live position for the map, only while the app is visible (saves battery).
  useEffect(() => {
    if (!appActive) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 1 },
        (loc) => {
          const p = recorder.toTrackPoint(loc);
          setCurrent(p);
          recorder.addForegroundFixes([p]);
        },
      );
      if (cancelled) sub.remove();
    })().catch(() => setPermission('denied'));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [appActive]);

  const startRecording = useCallback(async () => {
    const first = current && (current.acc == null || current.acc <= MAX_ACCURACY_M) ? current : null;
    setAllPoints([]);
    const mode = await recorder.startRecording(settings.recordDistanceM, notification(), first);
    setAllPoints(recorder.readActivePoints());
    setRecordingMode(mode);
  }, [current, settings.recordDistanceM, notification, setAllPoints]);

  const stopRecording = useCallback(async () => {
    const pts = await recorder.stopRecording();
    setRecordingMode(null);
    setAllPoints(pts);
    return pts;
  }, [setAllPoints]);

  const discardRecording = useCallback(() => {
    recorder.clearRecording();
    setAllPoints([]);
  }, [setAllPoints]);

  const saveRecording = useCallback(
    (name: string) => {
      persistTrack(pointsRef.current, name);
      discardRecording();
    },
    [persistTrack, discardRecording],
  );

  const value = useMemo(
    () => ({
      permission,
      current,
      recording: recordingMode != null,
      recordingMode,
      points,
      startRecording,
      stopRecording,
      saveRecording,
      discardRecording,
    }),
    [permission, current, recordingMode, points, startRecording, stopRecording, saveRecording, discardRecording],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocation must be used inside LocationProvider');
  return ctx;
}
