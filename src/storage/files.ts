import { Directory, File, Paths } from 'expo-file-system';
import type { BBox, MapFeature, TrackPoint } from '../geo/types';

/**
 * Everything the user creates is stored as JSON files in the app's private
 * document folder, so it works fully offline and survives app restarts.
 *
 *   layers/index.json      list of imported layers (name, colour, visible…)
 *   layers/<id>.json       the features of one layer
 *   tracks/index.json      list of recorded routes with summary stats
 *   tracks/<id>.json       all GPS points of one route
 */

function dir(name: string): Directory {
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

function readJson<T>(file: File, fallback: T): T {
  if (!file.exists) return fallback;
  try {
    return JSON.parse(file.textSync()) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: File, value: unknown) {
  file.writeSync(JSON.stringify(value));
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---------- Imported layers ----------

export interface LayerMeta {
  id: string;
  name: string;
  /** 'measure' = a line or area saved from the measuring tool. */
  source: 'kml' | 'kmz' | 'gpx' | 'dxf' | 'measure';
  color: string;
  visible: boolean;
  featureCount: number;
  bbox: BBox | null;
  createdAt: number;
  /** For DXF: the CRS the user picked, kept for reference. */
  crsId?: string;
}

const layersDir = () => dir('layers');

export const loadLayerIndex = (): LayerMeta[] => readJson(new File(layersDir(), 'index.json'), []);
export const saveLayerIndex = (layers: LayerMeta[]) => writeJson(new File(layersDir(), 'index.json'), layers);
export const loadLayerFeatures = (id: string): MapFeature[] => readJson(new File(layersDir(), `${id}.json`), []);
export const saveLayerFeatures = (id: string, features: MapFeature[]) =>
  writeJson(new File(layersDir(), `${id}.json`), features);
export function deleteLayerFiles(id: string) {
  const f = new File(layersDir(), `${id}.json`);
  if (f.exists) f.delete();
}

// ---------- Recorded tracks (timeline) ----------

export interface TrackMeta {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  pointCount: number;
  distanceM: number;
  ascentM: number;
  descentM: number;
  minAlt: number | null;
  maxAlt: number | null;
}

const tracksDir = () => dir('tracks');

export const loadTrackIndex = (): TrackMeta[] => readJson(new File(tracksDir(), 'index.json'), []);
export const saveTrackIndex = (tracks: TrackMeta[]) => writeJson(new File(tracksDir(), 'index.json'), tracks);
export const loadTrackPoints = (id: string): TrackPoint[] => readJson(new File(tracksDir(), `${id}.json`), []);
export const saveTrackPoints = (id: string, points: TrackPoint[]) =>
  writeJson(new File(tracksDir(), `${id}.json`), points);
export function deleteTrackFiles(id: string) {
  const f = new File(tracksDir(), `${id}.json`);
  if (f.exists) f.delete();
}

/**
 * The route being recorded: one point per line, appended as GPS fixes arrive,
 * so a crash, a dead battery or Android killing the app doesn't lose it.
 */
export const activeTrackFile = () => new File(tracksDir(), 'active.ndjson');
/** Exists only while a recording is in progress; holds its settings (see tracking/recorder.ts). */
export const recordingStateFile = () => new File(tracksDir(), 'recording.json');

// ---------- Waypoints ----------

export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Elevation in metres if known (GPS or typed in). */
  alt: number | null;
  note?: string;
  createdAt: number;
}

const waypointsFile = () => new File(dir('waypoints'), 'waypoints.json');
export const loadWaypoints = (): Waypoint[] => readJson(waypointsFile(), []);
export const saveWaypoints = (list: Waypoint[]) => writeJson(waypointsFile(), list);

/** Directory where map tiles are cached for offline use (Android). */
export function tileCacheDir(basemapId: string): string {
  return dir(`tiles/${basemapId}`).uri;
}

/** Writes a temporary file for sharing (export) and returns its URI. */
export function writeExportFile(name: string, content: string): string {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.writeSync(content);
  return f.uri;
}
