import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LayerIndex, padBBox } from '../src/geo/lod';
import type { LonLat, MapFeature } from '../src/geo/types';

/** A synthetic mine plan: `n` contour-like lines spread over ~10 × 10 km, plus survey points. */
function bigPlan(n: number): MapFeature[] {
  const out: MapFeature[] = [];
  for (let i = 0; i < n; i++) {
    const lon0 = 105.8 + (i % 300) * 0.0004;
    const lat0 = 43.55 + Math.floor(i / 300) * 0.0004;
    const coords: LonLat[] = [];
    for (let k = 0; k < 40; k++) coords.push([lon0 + k * 0.00001, lat0 + Math.sin(k / 3) * 0.00001]);
    out.push({ geom: { kind: 'line', coords }, name: `c${i}` });
  }
  for (let i = 0; i < 2000; i++) out.push({ geom: { kind: 'point', coord: [105.8 + i * 0.00005, 43.6] }, name: `p${i}` });
  // one big pit outline that must always win at low zoom
  out.push({ geom: { kind: 'line', coords: [[105.79, 43.54], [105.93, 43.54], [105.93, 43.7], [105.79, 43.7], [105.79, 43.54]] }, name: 'pit' });
  return out;
}

test('100 000-line plan: queries are fast, bounded, and show the big outline when zoomed out', () => {
  const features = bigPlan(100_000);
  const t0 = Date.now();
  const index = new LayerIndex(features);
  const buildMs = Date.now() - t0;

  const whole = { bbox: { minLon: 105.7, minLat: 43.5, maxLon: 106.0, maxLat: 43.8 }, zoom: 11 };
  const t1 = Date.now();
  const r = index.query(whole, 3000, 300);
  const queryMs = Date.now() - t1;
  assert.ok(r.items.length <= 3300);
  assert.equal(r.items[0].feature.name, 'pit', 'largest shape first');
  // At zoom 11 (~55 m/px) each 16 m contour is under a pixel → skipped entirely
  assert.equal(r.items.filter((x) => x.geom.kind === 'line').length, 1);
  assert.ok(buildMs < 3000 && queryMs < 500, `build ${buildMs} ms, query ${queryMs} ms`);
});

test('zoomed in: only shapes in view, simplified to ~1 px but never below 2 points', () => {
  const index = new LayerIndex(bigPlan(30_000));
  const view = { bbox: { minLon: 105.8, minLat: 43.55, maxLon: 105.802, maxLat: 43.552 }, zoom: 17 };
  const r = index.query(view, 3000, 300);
  const lines = r.items.filter((x) => x.geom.kind === 'line' && x.feature.name !== 'pit');
  assert.ok(lines.length > 0 && lines.length < 100, `${lines.length} lines in view`);
  for (const l of lines) {
    if (l.geom.kind !== 'line' || l.feature.geom.kind !== 'line') continue;
    assert.ok(l.geom.coords.length >= 2 && l.geom.coords.length <= l.feature.geom.coords.length);
  }
  // Same query again comes from the cache (identical objects)
  const again = index.query(view, 3000, 300);
  assert.equal(again.items.find((x) => x.index === lines[0].index)!.geom, lines[0].geom);
});

test('point budget and padBBox', () => {
  const index = new LayerIndex(bigPlan(10));
  const r = index.query({ bbox: { minLon: 105, minLat: 43, maxLon: 107, maxLat: 44 }, zoom: 18 }, 1000, 50);
  assert.equal(r.items.filter((x) => x.geom.kind === 'point').length, 50);
  assert.ok(r.total > r.items.length);
  assert.deepEqual(padBBox({ minLon: 0, minLat: 0, maxLon: 10, maxLat: 20 }, 0.1), { minLon: -1, minLat: -2, maxLon: 11, maxLat: 22 });
});
