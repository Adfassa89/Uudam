import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cacheRow,
  countTiles,
  flipY,
  iterateTiles,
  lonLatToTile,
  metresPerPixel,
  tileInArea,
  tileRange,
  tileUrl,
  zoomForRegion,
} from '../src/offline/tiles';

test('lonLatToTile matches the standard slippy-map formula', () => {
  assert.deepEqual(lonLatToTile(0, 0, 1), { x: 1, y: 1 });
  assert.deepEqual(lonLatToTile(-180, 85, 0), { x: 0, y: 0 });
  // Ulaanbaatar at zoom 10 (cross-checked with the asinh form of the formula)
  assert.deepEqual(lonLatToTile(106.9176, 47.9186, 10), { x: 816, y: 356 });
  // Out-of-range latitude and the antimeridian are clamped, not wrapped
  assert.deepEqual(lonLatToTile(180, -90, 2), { x: 3, y: 3 });
});

test('tile ranges and counts for a pit-sized area', () => {
  const pit = { minLon: 105.84, minLat: 43.59, maxLon: 105.87, maxLat: 43.62 };
  const r = tileRange(pit, 15);
  assert.ok(r.minX <= r.maxX && r.minY <= r.maxY);
  const n = countTiles(pit, 3, 17);
  assert.equal(n, [...iterateTiles(pit, 3, 17)].length);
  // Each extra zoom level roughly quadruples the count once the area spans several tiles
  assert.ok(countTiles(pit, 17, 17) > 3 * countTiles(pit, 16, 16));
});

test('TMS rows and cache file rows', () => {
  assert.equal(flipY(0, 3), 7);
  assert.equal(tileUrl('https://t/{z}/{x}/{y}.png', 3, 5, 0), 'https://t/3/5/0.png');
  assert.equal(tileUrl('https://t/{z}/{x}/{y}', 3, 5, 0, true), 'https://t/3/5/7');
  assert.equal(tileUrl('https://t/{z}/{y}/{x}', 3, 5, 1), 'https://t/3/1/5');
  assert.equal(cacheRow(0, 3, true, 'android'), 0);
  assert.equal(cacheRow(0, 3, true, 'ios'), 7);
  assert.equal(cacheRow(0, 3, false, 'ios'), 0);
});

test('tileInArea respects zoom limits and bounds', () => {
  const area = { bbox: { minLon: 105.84, minLat: 43.59, maxLon: 105.87, maxLat: 43.62 }, minZoom: 3, maxZoom: 15 };
  const inside = lonLatToTile(105.85, 43.6, 15);
  assert.ok(tileInArea({ z: 15, ...inside }, area));
  assert.ok(!tileInArea({ z: 16, ...lonLatToTile(105.85, 43.6, 16) }, area));
  assert.ok(!tileInArea({ z: 15, ...lonLatToTile(106.9, 47.9, 15) }, area));
});

test('scale helpers', () => {
  assert.ok(Math.abs(metresPerPixel(0, 0) - 156543.03) < 0.01);
  assert.ok(Math.abs(metresPerPixel(17, 43.6) - 0.86) < 0.01);
  assert.ok(Math.abs(zoomForRegion(360, 256) - 0) < 1e-9);
});
