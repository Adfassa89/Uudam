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

// WGS84 ellipsoid
const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;

/** Metres per radian of latitude (meridian) and of longitude (parallel) at a latitude, on WGS84. */
function localRadii(latDeg: number) {
  const s = Math.sin(toRad(latDeg));
  const w = 1 - WGS84_E2 * s * s;
  const meridian = (WGS84_A * (1 - WGS84_E2)) / (w * Math.sqrt(w));
  const parallel = (WGS84_A / Math.sqrt(w)) * Math.cos(toRad(latDeg));
  return { meridian, parallel };
}

/** Beyond this, the flat local approximation is not used. */
const LOCAL_LIMIT_M = 20_000;

/**
 * Ground distance on the WGS84 ellipsoid. For the short distances of survey
 * work (< 20 km) this is accurate to millimetres, unlike the spherical
 * haversine formula which is off by up to ~0.3 % (≈ 3 m per km) in Mongolia.
 */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const { meridian, parallel } = localRadii((lat1 + lat2) / 2);
  const d = Math.hypot(toRad(lat2 - lat1) * meridian, toRad(lon2 - lon1) * parallel);
  return d < LOCAL_LIMIT_M ? d : haversine(lat1, lon1, lat2, lon2);
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
  let dist = 0;
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
      dist += distanceM(q.lat, q.lon, p.lat, p.lon);
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
    distanceM: dist,
    durationS,
    ascentM,
    descentM,
    minAlt,
    maxAlt,
    avgSpeedKmh: durationS > 0 ? (dist / durationS) * 3.6 : 0,
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

/** Length of a line through the points, in metres. */
export function lineLength(coords: LonLat[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += distanceM(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  return d;
}

/**
 * Ground area of a closed polygon in m², using a flat projection centred on the
 * polygon with the ellipsoid's local radii (error ≪ 0.1 % for mine-site sizes).
 */
export function polygonArea(coords: LonLat[]): number {
  if (coords.length < 3) return 0;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const { meridian, parallel } = localRadii(lat0);
  const kx = (parallel * Math.PI) / 180;
  const ky = (meridian * Math.PI) / 180;
  let twice = 0;
  for (let i = 0; i < coords.length; i++) {
    const [ax, ay] = coords[i];
    const [bx, by] = coords[(i + 1) % coords.length];
    twice += (ax - lon0) * kx * ((by - lat0) * ky) - (bx - lon0) * kx * ((ay - lat0) * ky);
  }
  return Math.abs(twice) / 2;
}

/**
 * Points every `stepM` metres along a line (always including every vertex),
 * each with its distance from the start — used for elevation profiles.
 */
export function samplePath(coords: LonLat[], stepM: number): { lat: number; lon: number; d: number }[] {
  const out: { lat: number; lon: number; d: number }[] = [];
  if (coords.length === 0) return out;
  let dist = 0;
  out.push({ lon: coords[0][0], lat: coords[0][1], d: 0 });
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const seg = distanceM(lat1, lon1, lat2, lon2);
    const n = Math.max(1, Math.ceil(seg / stepM));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      out.push({ lon: lon1 + (lon2 - lon1) * f, lat: lat1 + (lat2 - lat1) * f, d: dist + seg * f });
    }
    dist += seg;
  }
  return out;
}

export interface ProfileStats {
  minAlt: number;
  maxAlt: number;
  ascentM: number;
  descentM: number;
  /** Overall gradient start → end, in percent (rise / horizontal distance). */
  overallGradePct: number;
  /** Steepest stretch at least `windowM` long, in percent (sign shows up/down). */
  maxGradePct: number;
  /** Length along the slope (includes the vertical component). */
  slopeLengthM: number;
}

/** Statistics of an elevation profile; points without elevation are skipped. */
export function profileStats(profile: { d: number; alt: number | null }[], windowM = 50): ProfileStats | null {
  const p = profile.filter((x): x is { d: number; alt: number } => x.alt != null);
  if (p.length < 2) return null;
  let ascentM = 0;
  let descentM = 0;
  let slopeLengthM = 0;
  let maxGradePct = 0;
  let j = 0;
  for (let i = 1; i < p.length; i++) {
    const dz = p[i].alt - p[i - 1].alt;
    if (dz > 0) ascentM += dz;
    else descentM -= dz;
    slopeLengthM += Math.hypot(p[i].d - p[i - 1].d, dz);
    // Grade over a sliding window, so one noisy sample can't produce a spike.
    while (j < i && p[i].d - p[j + 1].d >= windowM) j++;
    const run = p[i].d - p[j].d;
    if (run >= windowM) {
      const g = ((p[i].alt - p[j].alt) / run) * 100;
      if (Math.abs(g) > Math.abs(maxGradePct)) maxGradePct = g;
    }
  }
  const run = p[p.length - 1].d - p[0].d;
  return {
    minAlt: Math.min(...p.map((x) => x.alt)),
    maxAlt: Math.max(...p.map((x) => x.alt)),
    ascentM,
    descentM,
    overallGradePct: run > 0 ? ((p[p.length - 1].alt - p[0].alt) / run) * 100 : 0,
    maxGradePct,
    slopeLengthM,
  };
}
