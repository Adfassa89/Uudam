import assert from 'node:assert/strict';
import { test } from 'node:test';
import proj4 from 'proj4';
import { lineLength, polygonArea, profileStats, samplePath } from '../src/geo/measure';
import type { LonLat } from '../src/geo/types';

const UTM48 = '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs';
/** Square-ish polygon given in UTM metres, converted to lon/lat. */
const fromUtm = (pts: [number, number][]): LonLat[] => pts.map((p) => proj4(UTM48, 'EPSG:4326').forward(p) as LonLat);
/** UTM point scale factor ~150 km east of the central meridian: grid distance = ground distance × k. */
const K = 0.9996 * (1 + 150_000 ** 2 / (2 * 6_381_000 ** 2));

test('polygonArea: 2 km × 1 km UTM block gives its true ground area (grid area / k²) within 0.01 %', () => {
  const e = 650_000;
  const n = 4_829_000;
  const poly = fromUtm([
    [e, n],
    [e + 2000, n],
    [e + 2000, n + 1000],
    [e, n + 1000],
  ]);
  const area = polygonArea(poly);
  assert.ok(Math.abs(area / (2_000_000 / K ** 2) - 1) < 1e-4, `area ${area.toFixed(0)}`);
  assert.ok(Math.abs(polygonArea([...poly].reverse()) - area) < 1e-6, 'orientation does not matter');
  assert.equal(polygonArea(poly.slice(0, 2)), 0);
});

test('lineLength and samplePath', () => {
  const line = fromUtm([
    [650_000, 4_829_000],
    [650_300, 4_829_000],
    [650_300, 4_829_400],
  ]);
  const len = lineLength(line);
  assert.ok(Math.abs(len - 700 / K) < 0.05, `len ${len}`);
  const s = samplePath(line, 120);
  assert.equal(s[0].d, 0);
  assert.ok(Math.abs(s[s.length - 1].d - len) < 1e-6);
  assert.equal(s.length, 1 + 3 + 4); // start + 3 samples on the 300 m leg + 4 on the 400 m leg
  for (let i = 1; i < s.length; i++) assert.ok(s[i].d - s[i - 1].d <= 120);
});

test('profileStats: haul-road ramp gradient, climb and slope length', () => {
  // 0–500 m flat at 1500 m, then a 1 km ramp rising 80 m (8 %), with a missing sample
  const prof: { d: number; alt: number | null }[] = [];
  for (let d = 0; d <= 1500; d += 25) prof.push({ d, alt: d <= 500 ? 1500 : 1500 + (d - 500) * 0.08 });
  prof[10].alt = null;
  const s = profileStats(prof)!;
  assert.equal(s.minAlt, 1500);
  assert.ok(Math.abs(s.maxAlt - 1580) < 1e-9);
  assert.ok(Math.abs(s.ascentM - 80) < 1e-9);
  assert.equal(s.descentM, 0);
  assert.ok(Math.abs(s.maxGradePct - 8) < 1e-9);
  assert.ok(Math.abs(s.overallGradePct - (80 / 1500) * 100) < 1e-9);
  assert.ok(Math.abs(s.slopeLengthM - (500 + Math.hypot(1000, 80))) < 0.01);
});

test('profileStats ignores a single noisy spike shorter than the window', () => {
  const prof = [0, 25, 50, 75, 100, 125, 150].map((d) => ({ d, alt: d === 75 ? 1510 : 1500 }));
  assert.ok(Math.abs(profileStats(prof, 50)!.maxGradePct) <= 20); // a 25 m window would report 40 %
  assert.equal(profileStats([{ d: 0, alt: 1 }]), null);
});
