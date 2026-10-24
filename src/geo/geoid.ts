import { GEOID_DM, GEOID_GRID } from './geoidData';

/**
 * Geoid height N (EGM96): how far mean sea level lies above the WGS84 ellipsoid,
 * in metres. In Mongolia N is about −20 to −47 m, i.e. sea level is *below* the
 * ellipsoid. Returns null outside the embedded grid (Mongolia with a margin).
 */
export function geoidHeight(lat: number, lon: number): number | null {
  const { lat0, lon0, step, rows, cols } = GEOID_GRID;
  const fi = (lat - lat0) / step;
  const fj = (lon - lon0) / step;
  if (fi < 0 || fj < 0 || fi > rows - 1 || fj > cols - 1) return null;
  const i = Math.min(Math.floor(fi), rows - 2);
  const j = Math.min(Math.floor(fj), cols - 2);
  const di = fi - i;
  const dj = fj - j;
  const g = (r: number, c: number) => GEOID_DM[r * cols + c] / 10;
  return (
    g(i, j) * (1 - di) * (1 - dj) + g(i + 1, j) * di * (1 - dj) + g(i, j + 1) * (1 - di) * dj + g(i + 1, j + 1) * di * dj
  );
}

/**
 * Height above the WGS84 ellipsoid → height above sea level.
 * Android reports GPS altitude above the ellipsoid (about 40 m too low in
 * Mongolia compared with maps and survey data); iPhones already report sea level.
 */
export function ellipsoidToSeaLevel(alt: number, lat: number, lon: number): number {
  const n = geoidHeight(lat, lon);
  return n == null ? alt : alt - n;
}
