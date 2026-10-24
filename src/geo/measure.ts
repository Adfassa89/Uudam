import type { BBox, Geometry, LonLat, MapFeature, TrackPoint } from './types';

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres between two lat/lon points. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing in degrees (0 = north, 90 = east). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface TrackStats {
  distanceM: number;
  durationS: number;
  /** Total climb in metres (GPS noise below the threshold is ignored). */
  ascentM: number;
  descentM: number;
  minAlt: number | null;
  maxAlt: number | null;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
}

/**
 * Summary numbers for a recorded track.
 * GPS altitude jitters by several metres, so climbs are only counted once the
 * change since the last counted point exceeds `altThresholdM` (hysteresis).
 */
export function trackStats(points: TrackPoint[], altThresholdM = 3): TrackStats {
  let distanceM = 0;
  let ascentM = 0;
  let descentM = 0;
  let minAlt: number | null = null;
  let maxAlt: number | null = null;
  let maxSpeed = 0;
  let refAlt: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      distanceM += haversine(q.lat, q.lon, p.lat, p.lon);
    }
    if (p.speed != null && p.speed > maxSpeed) maxSpeed = p.speed;
    if (p.alt != null) {
      minAlt = minAlt == null ? p.alt : Math.min(minAlt, p.alt);
      maxAlt = maxAlt == null ? p.alt : Math.max(maxAlt, p.alt);
      if (refAlt == null) {
        refAlt = p.alt;
      } else {
        const diff = p.alt - refAlt;
        if (diff >= altThresholdM) {
          ascentM += diff;
          refAlt = p.alt;
        } else if (diff <= -altThresholdM) {
          descentM -= diff;
          refAlt = p.alt;
        }
      }
    }
  }

  const durationS = points.length > 1 ? (points[points.length - 1].t - points[0].t) / 1000 : 0;
  return {
    distanceM,
    durationS,
    ascentM,
    descentM,
    minAlt,
    maxAlt,
    avgSpeedKmh: durationS > 0 ? (distanceM / durationS) * 3.6 : 0,
    maxSpeedKmh: maxSpeed * 3.6,
  };
}

function extend(b: BBox, [lon, lat]: LonLat) {
  if (lon < b.minLon) b.minLon = lon;
  if (lon > b.maxLon) b.maxLon = lon;
  if (lat < b.minLat) b.minLat = lat;
  if (lat > b.maxLat) b.maxLat = lat;
}

function geometryCoords(g: Geometry): LonLat[] {
  if (g.kind === 'point') return [g.coord];
  if (g.kind === 'line') return g.coords;
  return g.rings.flat();
}

export function featuresBBox(features: MapFeature[]): BBox | null {
  const b: BBox = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
  for (const f of features) for (const c of geometryCoords(f.geom)) extend(b, c);
  return Number.isFinite(b.minLon) ? b : null;
}

/**
 * Douglas–Peucker line simplification on lon/lat, tolerance in metres.
 * Large CAD drawings can contain hundreds of thousands of vertices; phones
 * cannot draw them all smoothly, so we drop vertices that don't change the shape.
 */
export function simplify(coords: LonLat[], toleranceM: number): LonLat[] {
  if (coords.length <= 2 || toleranceM <= 0) return coords;
  // Local flat projection is accurate enough at the scale of a tolerance.
  const lat0 = toRad(coords[0][1]);
  const mx = (EARTH_RADIUS_M * Math.PI) / 180;
  const xy = coords.map(([lon, lat]) => [lon * mx * Math.cos(lat0), lat * mx]);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  const tol2 = toleranceM * toleranceM;

  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = xy[s];
    const [bx, by] = xy[e];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = xy[i];
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}
