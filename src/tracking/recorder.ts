import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { PermissionsAndroid, Platform } from 'react-native';
import { ellipsoidToSeaLevel } from '../geo/geoid';
import type { TrackPoint } from '../geo/types';
import { activeTrackFile, recordingStateFile } from '../storage/files';
import { acceptPoints, parseNdjson, toNdjson } from './points';

/**
 * Route recording that keeps running with the screen off.
 *
 * The phone's OS delivers GPS fixes to BACKGROUND_TASK even while the app is in
 * the background — and on Android even after the app is swiped away, in which
 * case only this file runs (no screens). So everything the task needs lives on
 * disk: the recording settings in recording.json and the points in active.ndjson.
 * The screens just listen for new points (see `subscribe`).
 *
 * Android shows a permanent notification while recording (required by Android
 * for a "foreground service"). Because recording is always started from the
 * open app, only the normal "while using the app" location permission is needed.
 *
 * Expo Go cannot run background tasks; there we fall back to 'foreground' mode,
 * where the open map screen feeds points in via `addForegroundFixes`.
 */

export const BACKGROUND_TASK = 'uudam-route-recording';

export type RecordingMode = 'background' | 'foreground';

/** Translated texts for the recording notification and its permission prompt. */
export interface NotificationText {
  title: string;
  body: string;
  permissionTitle: string;
  permissionMessage: string;
  ok: string;
}

interface RecordingState {
  mode: RecordingMode;
  minDistanceM: number;
  startedAt: number;
}

// Module-level cache so we don't re-read the file for every GPS fix.
let state: RecordingState | null = null;
let lastPoint: TrackPoint | null = null;
let loaded = false;
const listeners = new Set<(added: TrackPoint[]) => void>();

function load() {
  if (loaded) return;
  loaded = true;
  const f = recordingStateFile();
  try {
    state = f.exists ? (JSON.parse(f.textSync()) as RecordingState) : null;
  } catch {
    state = null;
  }
  if (state) {
    const pts = readActivePoints();
    lastPoint = pts[pts.length - 1] ?? null;
  }
}

export function readActivePoints(): TrackPoint[] {
  const f = activeTrackFile();
  return f.exists ? parseNdjson(f.textSync()) : [];
}

export function getRecordingState(): RecordingState | null {
  load();
  return state;
}

/** Filters new fixes, appends the kept ones to disk and notifies the screens. */
function append(fixes: TrackPoint[]) {
  load();
  if (!state) return;
  const kept = acceptPoints(lastPoint, fixes, state.minDistanceM);
  if (kept.length === 0) return;
  activeTrackFile().writeSync(toNdjson(kept), { append: true });
  lastPoint = kept[kept.length - 1];
  listeners.forEach((l) => l(kept));
}

export function subscribe(listener: (added: TrackPoint[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Android GPS altitude is above the ellipsoid; convert it to sea level like iPhones report. */
const seaLevelAlt = (alt: number | null, lat: number, lon: number) =>
  alt == null ? null : Platform.OS === 'android' ? ellipsoidToSeaLevel(alt, lat, lon) : alt;

export const toTrackPoint = (l: Location.LocationObject): TrackPoint => ({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  alt: seaLevelAlt(l.coords.altitude, l.coords.latitude, l.coords.longitude),
  acc: l.coords.accuracy,
  speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  t: l.timestamp,
});

/** Fixes from the on-screen GPS watcher; only used when background mode is unavailable. */
export function addForegroundFixes(fixes: TrackPoint[]) {
  if (getRecordingState()?.mode === 'foreground') append(fixes);
}

// Must run when the JS bundle loads (also in Android's headless mode), so this
// file is imported from the app entry point (index.ts) before anything else.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  try {
    append(data.locations.map(toTrackPoint));
  } catch {
    // Never let a storage error crash the background service.
  }
});

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Android 13+ hides the recording notification unless the user allows
 * notifications. Recording works either way, so a refusal is not an error.
 * The explanation dialog is shown by Android only after an earlier refusal.
 */
async function ensureNotificationPermission(text: NotificationText) {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (await PermissionsAndroid.check(permission)) return;
    await PermissionsAndroid.request(permission, {
      title: text.permissionTitle,
      message: text.permissionMessage,
      buttonPositive: text.ok,
    });
  } catch {
    // Ignore: the notification is optional for recording to work.
  }
}

async function startBackgroundUpdates(minDistanceM: number, notification: NotificationText) {
  await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: minDistanceM,
    timeInterval: 2000,
    // iOS: keep updating with the screen off and show the blue location pill.
    activityType: Location.ActivityType.OtherNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    // Android: foreground-service notification; keep recording if the app is swiped away.
    foregroundService: {
      notificationTitle: notification.title,
      notificationBody: notification.body,
      notificationColor: '#e53935',
      killServiceOnDestroy: false,
    },
  });
}

/**
 * Starts a new recording. Returns the mode actually used: 'foreground' means the
 * app must stay open (Expo Go, or the OS refused background updates).
 */
export async function startRecording(
  minDistanceM: number,
  notification: NotificationText,
  firstPoint: TrackPoint | null,
): Promise<RecordingMode> {
  let mode: RecordingMode = 'foreground';
  if (!isExpoGo) {
    await ensureNotificationPermission(notification);
    try {
      await startBackgroundUpdates(minDistanceM, notification);
      mode = 'background';
    } catch {
      mode = 'foreground';
    }
  }
  state = { mode, minDistanceM, startedAt: Date.now() };
  lastPoint = null;
  loaded = true;
  const f = activeTrackFile();
  if (f.exists) f.delete();
  recordingStateFile().writeSync(JSON.stringify(state));
  if (firstPoint) append([firstPoint]);
  return mode;
}

/**
 * Called on app start while a recording is in progress: makes sure background
 * updates are still running (e.g. after the phone was restarted).
 */
export async function resumeRecording(notification: NotificationText): Promise<RecordingMode | null> {
  const s = getRecordingState();
  if (!s) return null;
  if (s.mode === 'background' && !(await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false))) {
    try {
      await startBackgroundUpdates(s.minDistanceM, notification);
    } catch {
      state = { ...s, mode: 'foreground' };
      recordingStateFile().writeSync(JSON.stringify(state));
    }
  }
  return state!.mode;
}

/** Stops GPS updates; the points stay on disk until `clearRecording`. */
export async function stopRecording(): Promise<TrackPoint[]> {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK).catch(() => {});
  }
  state = null;
  const f = recordingStateFile();
  if (f.exists) f.delete();
  return readActivePoints();
}

export function clearRecording() {
  lastPoint = null;
  const f = activeTrackFile();
  if (f.exists) f.delete();
}
