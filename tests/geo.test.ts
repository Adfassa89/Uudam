import assert from 'node:assert/strict';
import { test } from 'node:test';
import proj4 from 'proj4';
import { guessCrs, makeToWgs84, toUtm, utmZoneForLon } from '../src/geo/crs';
import { formatCoord, formatDuration } from '../src/geo/format';
import { haversine, simplify, trackStats } from '../src/geo/measure';
import type { LonLat, TrackPoint } from '../src/geo/types';

test('haversine: 1° of latitude ≈ 111.2 km', () => {
  assert.ok(Math.abs(haversine(43, 105, 44, 105) - 111_195) < 50);
});

test('UTM zones cover Mongolia (Ulaanbaatar is 48N, Tavan Tolgoi 48N, Khovd 46N)', () => {
  assert.equal(utmZoneForLon(106.9), 48);
  assert.equal(utmZoneForLon(105.8), 48);
  assert.equal(utmZoneForLon(91.6), 46);
});

test('UTM round trip through the DXF converter is sub-millimetre', () => {
  const lat = 43.6;
  const lon = 105.85;
  const u = toUtm(lat, lon);
  assert.equal(u.zone, 48);
  const [lon2, lat2] = makeToWgs84('utm48n')(u.easting, u.northing);
  assert.ok(Math.abs(lon2 - lon) < 1e-8 && Math.abs(lat2 - lat) < 1e-8);
});

test('Gauss-Krüger zone 18 (Pulkovo 1942) round trip and zone-prefix detection', () => {
  const gk = '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=18500000 +y_0=0 +ellps=krass +towgs84=23.92,-141.27,-80.9,0,0.35,0.82,-0.12 +units=m +no_defs';
  const [x, y] = proj4('EPSG:4326', gk).forward([105.85, 43.6]);
  assert.equal(Math.floor(x / 1_000_000), 18);
  const [lon, lat] = makeToWgs84('gk18')(x, y);
  assert.ok(haversine(lat, lon, 43.6, 105.85) < 0.01);
  // Treating GK numbers as UTM-like would be wrong; guessCrs must spot the zone prefix.
  assert.equal(guessCrs([{ x, y }]), 'gk18');
});

test('guessCrs recognises UTM eastings, degrees, and gives up on local grids', () => {
  const u = toUtm(43.6, 105.85);
  assert.equal(guessCrs([{ x: u.easting, y: u.northing }], 105.85), 'utm48n');
  assert.equal(guessCrs([{ x: 105.85, y: 43.6 }]), 'wgs84');
  assert.equal(guessCrs([{ x: 1200, y: 3400 }]), null);
});

test('formatCoord', () => {
  assert.equal(formatCoord(47.918, 106.917, 'dd'), '47.918000, 106.917000');
  assert.equal(formatCoord(47.5, 106.25, 'dms'), '47°30′00.0″N 106°15′00.0″E');
  assert.match(formatCoord(43.6, 105.85, 'utm'), /^48N \d{6}E \d{7}N$/);
  assert.equal(formatDuration(3725), '1:02:05');
});

test('trackStats ignores GPS altitude jitter below 3 m but counts real climbs', () => {
  const base = { acc: 5, speed: 1, lon: 105 };
  const alts = [1000, 1001, 999, 1001, 1000, 1010, 1020, 1015, 1005];
  const pts: TrackPoint[] = alts.map((alt, i) => ({ ...base, lat: 43 + i * 0.0001, alt, t: i * 10_000 }));
  const s = trackStats(pts);
  assert.equal(s.ascentM, 20);
  assert.equal(s.descentM, 15);
  assert.equal(s.minAlt, 999);
  assert.equal(s.maxAlt, 1020);
  assert.equal(s.durationS, 80);
  assert.ok(Math.abs(s.distanceM - 8 * 11.12) < 1);
});

test('simplify keeps corners and drops collinear points', () => {
  const line: LonLat[] = [];
  for (let i = 0; i <= 100; i++) line.push([105 + i * 0.0001, 43]);
  line.push([105.01, 43.01]);
  const s = simplify(line, 1);
  assert.equal(s.length, 3);
  assert.deepEqual(s[0], line[0]);
  assert.deepEqual(s[2], line[line.length - 1]);
});
