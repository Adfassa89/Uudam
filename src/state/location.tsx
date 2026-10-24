import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { haversine, trackStats } from '../geo/measure';
import type { TrackPoint } from '../geo/types';
import * as store from '../storage/files';
import { useData } from './data';
import { useSettings } from './settings';

/** GPS fixes worse than this (metres) are not added to a recorded route. */
const MAX_ACCURACY_M = 50;
/** Save the in-progress route to disk every N new points. */
const AUTOSAVE_EVERY = 10;
const KEEP_AWAKE_TAG = 'uudam-recording';

interface LocationCtx {
  permission: 'unknown' | 'granted' | 'denied';
  current: TrackPoint | null;
  recording: boolean;
  points: TrackPoint[];
  startRecording: () => void;
  /** Stops recording and returns the points; call `saveRecording` or `discardRecording` next. */
  stopRecording: () => TrackPoint[];
  saveRecording: (name: string) => void;
  discardRecording: () => void;
}

const Ctx = createContext<LocationCtx | null>(null);

const toPoint = (l: Location.LocationObject): TrackPoint => ({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  alt: l.coords.altitude,
  acc: l.coords.accuracy,
  speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  t: l.timestamp,
});

export function LocationProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const { addTrack } = useData();
  const [permission, setPermission] = useState<LocationCtx['permission']>('unknown');
  const [current, setCurrent] = useState<TrackPoint | null>(null);
  const [recording, setRecording] = useState(false);
  const [points, setPoints] = useState<TrackPoint[]>([]);

  // Refs so the GPS callback always sees fresh values without re-subscribing.
  const recordingRef = useRef(false);
  const pointsRef = useRef<TrackPoint[]>([]);
  const minDistRef = useRef(settings.recordDistanceM);
  minDistRef.current = settings.recordDistanceM;

  // Recover a route that was being recorded when the app was closed or crashed.
  useEffect(() => {
    const file = store.activeTrackFile();
    if (!file.exists) return;
    try {
      const saved = JSON.parse(file.textSync()) as TrackPoint[];
      if (saved.length > 0) {
        pointsRef.current = saved;
        setPoints(saved);
        recordingRef.current = true;
        setRecording(true);
        activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
      }
    } catch {
      file.delete();
    }
  }, []);

  useEffect(() => {
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
          const p = toPoint(loc);
          setCurrent(p);
          if (!recordingRef.current) return;
          if (p.acc != null && p.acc > MAX_ACCURACY_M) return;
          const prev = pointsRef.current[pointsRef.current.length - 1];
          if (prev && haversine(prev.lat, prev.lon, p.lat, p.lon) < minDistRef.current) return;
          const next = [...pointsRef.current, p];
          pointsRef.current = next;
          setPoints(next);
          if (next.length % AUTOSAVE_EVERY === 0) store.activeTrackFile().writeSync(JSON.stringify(next));
        },
      );
      if (cancelled) sub.remove();
    })().catch(() => setPermission('denied'));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const startRecording = useCallback(() => {
    pointsRef.current = current && (current.acc == null || current.acc <= MAX_ACCURACY_M) ? [current] : [];
    setPoints(pointsRef.current);
    recordingRef.current = true;
    setRecording(true);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  }, [current]);

  const stopRecording = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    return pointsRef.current;
  }, []);

  const clear = useCallback(() => {
    pointsRef.current = [];
    setPoints([]);
    const f = store.activeTrackFile();
    if (f.exists) f.delete();
  }, []);

  const saveRecording = useCallback(
    (name: string) => {
      const pts = pointsRef.current;
      if (pts.length >= 2) {
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
      }
      clear();
    },
    [addTrack, clear],
  );

  const value = useMemo(
    () => ({ permission, current, recording, points, startRecording, stopRecording, saveRecording, discardRecording: clear }),
    [permission, current, recording, points, startRecording, stopRecording, saveRecording, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocation must be used inside LocationProvider');
  return ctx;
}
