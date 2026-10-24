import type { BBox } from '../geo/types';

/**
 * Web-map tile maths ("slippy map" XYZ scheme used by Google, Esri, OSM…).
 * At zoom z the world is 2^z × 2^z tiles of 256 px; x grows east, y grows south.
 */

/** Web Mercator cannot show the poles. */
const MAX_LAT = 85.05112878;

export interface TileRange {
  z: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return { x: clamp(x), y: clamp(y) };
}

export function tileRange(b: BBox, z: number): TileRange {
  const nw = lonLatToTile(b.minLon, b.maxLat, z);
  const se = lonLatToTile(b.maxLon, b.minLat, z);
  return { z, minX: nw.x, maxX: se.x, minY: nw.y, maxY: se.y };
}

export const rangeCount = (r: TileRange) => (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1);

export function countTiles(b: BBox, minZoom: number, maxZoom: number): number {
  let n = 0;
  for (let z = minZoom; z <= maxZoom; z++) n += rangeCount(tileRange(b, z));
  return n;
}

export function* iterateTiles(b: BBox, minZoom: number, maxZoom: number): Generator<{ z: number; x: number; y: number }> {
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRange(b, z);
    for (let x = r.minX; x <= r.maxX; x++) for (let y = r.minY; y <= r.maxY; y++) yield { z, x, y };
  }
}

/** TMS servers number rows from the south instead of the north. */
export const flipY = (y: number, z: number) => 2 ** z - 1 - y;

export function tileUrl(template: string, z: number, x: number, y: number, tms = false): string {
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(tms ? flipY(y, z) : y));
}

/**
 * Row number the map library uses in its cache file name (<cache>/{z}/{x}/{y}).
 * Android always uses the XYZ row; iOS (Apple Maps) stores TMS layers by their flipped row.
 */
export function cacheRow(y: number, z: number, tms: boolean, platform: string): number {
  return tms && platform === 'ios' ? flipY(y, z) : y;
}

export function tileInArea(t: { z: number; x: number; y: number }, area: { bbox: BBox; minZoom: number; maxZoom: number }) {
  if (t.z < area.minZoom || t.z > area.maxZoom) return false;
  const r = tileRange(area.bbox, t.z);
  return t.x >= r.minX && t.x <= r.maxX && t.y >= r.minY && t.y <= r.maxY;
}

/** Ground size of one screen pixel in metres at a zoom level and latitude. */
export const metresPerPixel = (z: number, lat: number) => (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/** Approximate zoom level of a map region shown `widthPx` points wide. */
export const zoomForRegion = (longitudeDelta: number, widthPx: number) =>
  Math.log2((360 * widthPx) / (256 * Math.max(longitudeDelta, 1e-9)));
