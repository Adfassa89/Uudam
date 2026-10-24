/**
 * "Terrarium" elevation tiles (AWS Terrain Tiles / Mapzen): ordinary 256×256 PNG
 * map tiles whose colours encode height above sea level:
 *     height = R × 256 + G + B / 256 − 32768   (metres)
 * Sources for Mongolia are mainly SRTM (≈30–90 m), i.e. the ground surface around
 * the year 2000 — open pits and dumps dug since then are not in the data.
 */

export const TILE_SIZE = 256;

export function decodeTerrarium(rgba: Uint8Array): Float32Array {
  const out = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let i = 0; i < out.length; i++) {
    const o = i * 4;
    out[i] = rgba[o] * 256 + rgba[o + 1] + rgba[o + 2] / 256 - 32768;
  }
  return out;
}

/** Tile and fractional pixel position of a point at zoom z. */
export function tilePixel(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const rad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n;
  const x = Math.min(n - 1, Math.max(0, Math.floor(fx)));
  const y = Math.min(n - 1, Math.max(0, Math.floor(fy)));
  return { x, y, px: (fx - x) * TILE_SIZE, py: (fy - y) * TILE_SIZE };
}

/**
 * Bilinear interpolation between the four nearest pixel centres.
 * Near the tile edge the outermost pixels are reused (error well under a pixel).
 */
export function sampleHeights(h: Float32Array, px: number, py: number): number | null {
  const fx = Math.min(TILE_SIZE - 1, Math.max(0, px - 0.5));
  const fy = Math.min(TILE_SIZE - 1, Math.max(0, py - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(TILE_SIZE - 1, x0 + 1);
  const y1 = Math.min(TILE_SIZE - 1, y0 + 1);
  const dx = fx - x0;
  const dy = fy - y0;
  const v =
    h[y0 * TILE_SIZE + x0] * (1 - dx) * (1 - dy) +
    h[y0 * TILE_SIZE + x1] * dx * (1 - dy) +
    h[y1 * TILE_SIZE + x0] * (1 - dx) * dy +
    h[y1 * TILE_SIZE + x1] * dx * dy;
  // Values far below sea level mean "no data" in this format.
  return v < -1000 ? null : v;
}
