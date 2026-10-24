import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrackPoint } from '../src/geo/types';
import { acceptPoints, parseNdjson, toNdjson } from '../src/tracking/points';

const pt = (t: number, lat: number, acc = 5): TrackPoint => ({ lat, lon: 105.85, alt: 1200, acc, speed: 2, t });
// ~11 m per 0.0001° of latitude
const STEP = 0.0001;

test('acceptPoints drops inaccurate fixes and fixes closer than the minimum distance', () => {
  const kept = acceptPoints(null, [pt(1, 43.6), pt(2, 43.6 + STEP / 4), pt(3, 43.6 + STEP), pt(4, 43.6 + 2 * STEP, 80)], 5);
  assert.deepEqual(kept.map((p) => p.t), [1, 3]);
});

test('acceptPoints continues from the last saved point', () => {
  const last = pt(10, 43.6);
  assert.equal(acceptPoints(last, [pt(11, 43.6 + STEP / 4)], 5).length, 0);
  assert.equal(acceptPoints(last, [pt(11, 43.6 + STEP)], 5).length, 1);
});

test('acceptPoints sorts background batches and drops repeated or late timestamps', () => {
  const last = pt(10, 43.6);
  const kept = acceptPoints(last, [pt(13, 43.6 + 3 * STEP), pt(9, 43.6 + 5 * STEP), pt(12, 43.6 + STEP), pt(12, 43.6 + 2 * STEP)], 5);
  assert.deepEqual(kept.map((p) => p.t), [12, 13]);
});

test('NDJSON round trip survives a half-written last line', () => {
  const pts = [pt(1, 43.6), pt(2, 43.7)];
  const text = toNdjson(pts) + '{"lat":43.8,"lo';
  assert.deepEqual(parseNdjson(text), pts);
});
