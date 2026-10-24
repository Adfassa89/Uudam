import assert from 'node:assert/strict';
import { test } from 'node:test';
import proj4 from 'proj4';
import { toUtm } from '../src/geo/crs';
import { cardinal, formatCoord } from '../src/geo/format';
import { haversine } from '../src/geo/measure';
import { parseCoordinate } from '../src/geo/parse';
import { parseKml } from '../src/importers/kml';
import { waypointsToGpx, waypointsToKml } from '../src/tracking/export';

const near = (r: ReturnType<typeof parseCoordinate>, lat: number, lon: number, tolM = 0.5) => {
  assert.ok(r, 'parsed');
  const d = haversine(r.lat, r.lon, lat, lon);
  assert.ok(d < tolM, `off by ${d.toFixed(2)} m`);
};

test('decimal degrees in common spellings', () => {
  near(parseCoordinate('47.918, 106.917'), 47.918, 106.917);
  near(parseCoordinate('47.918 106.917'), 47.918, 106.917);
  near(parseCoordinate('47,918 106,917'), 47.918, 106.917);
  near(parseCoordinate('106.917, 47.918'), 47.918, 106.917); // lon first, unambiguous
  near(parseCoordinate('106.917E 47.918N'), 47.918, 106.917);
  near(parseCoordinate('-33.5 S, 70.6 W'), -33.5, -70.6);
});

test('degrees minutes seconds', () => {
  near(parseCoordinate(`47°55'06.0"N 106°55'03.0"E`), 47 + 55 / 60 + 6 / 3600, 106 + 55 / 60 + 3 / 3600);
  near(parseCoordinate('47 55 06 106 55 03'), 47 + 55 / 60 + 6 / 3600, 106 + 55 / 60 + 3 / 3600);
  near(parseCoordinate('47°55.1′N 106°55.05′E'), 47 + 55.1 / 60, 106 + 55.05 / 60);
  assert.equal(parseCoordinate('47 75 06 106 55 03'), null); // 75 minutes is invalid
});

test('UTM with and without zone', () => {
  const u = toUtm(43.6, 105.85);
  const e = u.easting.toFixed(1);
  const n = u.northing.toFixed(1);
  const r = parseCoordinate(`48N ${e} ${n}`);
  near(r, 43.6, 105.85);
  assert.equal(r!.system, 'UTM 48N');
  near(parseCoordinate(`48 ${e}E ${n}N`), 43.6, 105.85);
  near(parseCoordinate(`48T ${e} ${n}`), 43.6, 105.85);
  near(parseCoordinate(`${e} ${n}`, 105.85), 43.6, 105.85); // zone from phone position
  near(parseCoordinate(`${n} ${e}`, 105.85), 43.6, 105.85); // X = north order
});

test('Gauss–Krüger with zone prefix', () => {
  const gk = '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=18500000 +y_0=0 +ellps=krass +towgs84=23.92,-141.27,-80.9,0,0.35,0.82,-0.12 +units=m +no_defs';
  const [x, y] = proj4('EPSG:4326', gk).forward([105.85, 43.6]);
  const r = parseCoordinate(`${y.toFixed(2)} ${x.toFixed(2)}`);
  near(r, 43.6, 105.85);
  assert.match(r!.system, /Gauss-Krüger 18/);
});

test('rejects nonsense', () => {
  assert.equal(parseCoordinate(''), null);
  assert.equal(parseCoordinate('hello'), null);
  assert.equal(parseCoordinate('1 2 3'), null);
  assert.equal(parseCoordinate('95.5 200.1'), null);
  assert.equal(parseCoordinate('1200 3400'), null); // local mine grid: unknown system
});

test('cardinal directions', () => {
  assert.equal(cardinal(0), 'N');
  assert.equal(cardinal(44), 'NE');
  assert.equal(cardinal(181), 'S');
  assert.equal(cardinal(350), 'N');
});

test('every coordinate format the app displays can be typed back in', () => {
  for (const fmt of ['dd', 'dms', 'utm'] as const) {
    const shown = formatCoord(43.61234, 105.85678, fmt);
    near(parseCoordinate(shown), 43.61234, 105.85678, fmt === 'dd' ? 0.2 : 2);
  }
});

test('waypoint exports round-trip through the KML/GPX importers', () => {
  const wps = [{ name: 'BM-12 <survey>', lat: 43.6, lon: 105.85, alt: 1250, note: 'Benchmark' }];
  const kml = parseKml(waypointsToKml('Points', wps));
  assert.equal(kml.length, 1);
  assert.equal(kml[0].name, 'BM-12 <survey>');
  assert.deepEqual(kml[0].geom, { kind: 'point', coord: [105.85, 43.6] });
  assert.equal(kml[0].elevation, 1250);
  assert.match(waypointsToGpx(wps), /<wpt lat="43.6000000" lon="105.8500000"><ele>1250.0<\/ele><name>BM-12 &lt;survey&gt;<\/name>/);
});
