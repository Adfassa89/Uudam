import { haversine } from '../geo/measure';
import type { TrackPoint } from '../geo/types';

/** GPS fixes worse than this (metres) are not added to a recorded route. */
export const MAX_ACCURACY_M = 50;

/**
 * Decides which new GPS fixes become route points: drops inaccurate fixes,
 * fixes closer than `minDistanceM` to the last kept point, and out-of-order
 * timestamps (background batches can repeat or arrive late).
 */
export function acceptPoints(last: TrackPoint | null, incoming: TrackPoint[], minDistanceM: number): TrackPoint[] {
  const kept: TrackPoint[] = [];
  let prev = last;
  for (const p of [...incoming].sort((a, b) => a.t - b.t)) {
    if (p.acc != null && p.acc > MAX_ACCURACY_M) continue;
    if (prev && p.t <= prev.t) continue;
    if (prev && haversine(prev.lat, prev.lon, p.lat, p.lon) < minDistanceM) continue;
    kept.push(p);
    prev = p;
  }
  return kept;
}

/** One JSON point per line, so recording only ever appends to the file. */
export const toNdjson = (points: TrackPoint[]) => points.map((p) => JSON.stringify(p) + '\n').join('');

/** Reads NDJSON points, ignoring a half-written last line left by a crash or power loss. */
export function parseNdjson(text: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as TrackPoint);
    } catch {
      // skip a damaged line
    }
  }
  return out;
}
