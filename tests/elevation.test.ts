import assert from 'node:assert/strict';
import { test } from 'node:test';
import UPNG from 'upng-js';
import { decodeTerrarium, sampleHeights, TILE_SIZE, tilePixel } from '../src/elevation/terrarium';
import { ellipsoidToSeaLevel, geoidHeight } from '../src/geo/geoid';
import { lonLatToTile } from '../src/offline/tiles';

test('geoid grid matches the full EGM96 model at reference points (≤ 0.1 m)', () => {
  // [lat, lon, N] from the full EGM96 model (egm96-universal), see src/geo/geoidData.ts
  const ref: [number, number, number][] = [
    [47.92, 106.92, -37.21], // Ulaanbaatar
    [43.6, 105.85, -42.22], // Tavan Tolgoi
    [48.0, 91.6, -46.67], // Khovd
    [48.07, 114.5, -19.54], // Choibalsan
    [50.1, 100.2, -41.15],
  ];
  for (const [lat, lon, n] of ref) assert.ok(Math.abs(geoidHeight(lat, lon)! - n) <= 0.1, `${lat},${lon}`);
  assert.equal(geoidHeight(10, 10), null);
});

test('Android ellipsoid height → sea level adds about 42 m at Tavan Tolgoi', () => {
  assert.ok(Math.abs(ellipsoidToSeaLevel(1548, 43.6, 105.85) - 1590.2) < 0.2);
  assert.equal(ellipsoidToSeaLevel(100, 0, 0), 100); // outside the grid: unchanged
});

/** Builds a terrarium PNG whose height increases 1 m per pixel to the east, starting at `base`. */
function rampTile(base: number): ArrayBuffer {
  const rgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = base + x + 32768;
      const o = (y * TILE_SIZE + x) * 4;
      rgba[o] = Math.floor(v / 256);
      rgba[o + 1] = Math.floor(v) % 256;
      rgba[o + 2] = Math.round((v % 1) * 256);
      rgba[o + 3] = 255;
    }
  return UPNG.encode([rgba.buffer], TILE_SIZE, TILE_SIZE, 0);
}

test('terrarium PNG decoding and bilinear sampling', () => {
  const png = UPNG.decode(rampTile(1500));
  const h = decodeTerrarium(new Uint8Array(UPNG.toRGBA8(png)[0]));
  assert.equal(h[0], 1500);
  assert.equal(h[255], 1755);
  // Pixel centres are at +0.5; halfway between pixel 10 and 11 → 1510.5
  assert.ok(Math.abs(sampleHeights(h, 11, 50)! - 1510.5) < 1e-6);
  assert.equal(sampleHeights(h, 0, 0), 1500); // clamped at the edge
  assert.equal(sampleHeights(new Float32Array(TILE_SIZE * TILE_SIZE).fill(-32768), 5, 5), null);
});

test('tilePixel agrees with the map tile numbering', () => {
  const p = tilePixel(43.6, 105.85, 12);
  assert.deepEqual({ x: p.x, y: p.y }, lonLatToTile(105.85, 43.6, 12));
  assert.ok(p.px >= 0 && p.px < 256 && p.py >= 0 && p.py < 256);
});
