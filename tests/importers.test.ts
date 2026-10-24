import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import JSZip from 'jszip';
import { toUtm } from '../src/geo/crs';
import { haversine } from '../src/geo/measure';
import { dxfToFeatures, parseDxf } from '../src/importers/dxf';
import { detectKind } from '../src/importers';
import { parseKml, parseKmz } from '../src/importers/kml';

const kmlText = readFileSync(join(__dirname, 'fixtures', 'sample.kml'), 'utf8');

test('detectKind', () => {
  assert.equal(detectKind('Pit_Design.DXF'), 'dxf');
  assert.equal(detectKind('roads.kmz'), 'kmz');
  assert.equal(detectKind('plan.dwg'), 'dwg');
  assert.equal(detectKind('photo.jpg'), null);
});

test('KML: points, lines and polygons with names and altitude', () => {
  const f = parseKml(kmlText);
  assert.equal(f.length, 3);
  assert.equal(f[0].name, 'Уурхайн оффис');
  assert.deepEqual(f[0].geom, { kind: 'point', coord: [105.9, 43.6] });
  assert.equal(f[0].elevation, 1450);
  assert.equal(f[1].geom.kind, 'line');
  assert.equal(f[1].color, '#ff0000');
  assert.equal(f[2].geom.kind, 'polygon');
});

test('KMZ: reads doc.kml from inside the zip', async () => {
  const zip = new JSZip();
  zip.file('doc.kml', kmlText);
  zip.file('files/icon.png', new Uint8Array([1, 2, 3]));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  assert.equal((await parseKmz(bytes)).length, 3);
});

test('KMZ without KML is rejected with a clear code', async () => {
  const zip = new JSZip();
  zip.file('readme.txt', 'x');
  await assert.rejects(parseKmz(await zip.generateAsync({ type: 'uint8array' })), /NO_KML_IN_KMZ/);
});

/** Builds a tiny DXF in UTM 48N around Tavan Tolgoi. */
function sampleDxf() {
  const a = toUtm(43.6, 105.85);
  const b = toUtm(43.61, 105.86);
  const e = (x: number) => x.toFixed(3);
  const g = (code: number, v: string | number) => `${code}\n${v}\n`;
  return (
    g(0, 'SECTION') + g(2, 'ENTITIES') +
    // Straight haul-road segment on layer ROAD at bench elevation 1250 m
    g(0, 'LINE') + g(8, 'ROAD') + g(10, e(a.easting)) + g(20, e(a.northing)) + g(30, 1250) + g(11, e(b.easting)) + g(21, e(b.northing)) + g(31, 1250) +
    // Closed pit outline with one bulged (arc) segment
    g(0, 'LWPOLYLINE') + g(8, 'PIT') + g(90, 3) + g(70, 1) +
    g(10, e(a.easting)) + g(20, e(a.northing)) + g(42, 1) +
    g(10, e(a.easting + 200)) + g(20, e(a.northing)) +
    g(10, e(a.easting + 200)) + g(20, e(a.northing + 200)) +
    // Survey label
    g(0, 'TEXT') + g(8, 'SURVEY') + g(10, e(a.easting)) + g(20, e(a.northing)) + g(30, 0) + g(40, 2) + g(1, 'BM-12') +
    // Something we don't draw
    g(0, '3DFACE') + g(8, 'DTM') + g(10, 0) + g(20, 0) + g(30, 0) + g(11, 1) + g(21, 0) + g(31, 0) + g(12, 1) + g(22, 1) + g(32, 0) + g(13, 0) + g(23, 1) + g(33, 0) +
    g(0, 'ENDSEC') + g(0, 'EOF')
  );
}

test('DXF: entities, CRS guess, projection to lat/lon, arcs and skipped types', () => {
  const drawing = parseDxf(sampleDxf(), 105.85);
  assert.equal(drawing.guessedCrs, 'utm48n');
  assert.deepEqual(drawing.layers, ['DTM', 'PIT', 'ROAD', 'SURVEY']);
  assert.equal(drawing.skipped['3DFACE'], 1);

  const features = dxfToFeatures(drawing, { crsId: 'utm48n', swapXY: false, simplifyM: 0 });
  const road = features.find((f) => f.name?.startsWith('ROAD'))!;
  assert.equal(road.geom.kind, 'line');
  assert.equal(road.elevation, 1250);
  if (road.geom.kind !== 'line') throw new Error();
  const [lon, lat] = road.geom.coords[0];
  assert.ok(haversine(lat, lon, 43.6, 105.85) < 0.01, 'first vertex lands on the original point');

  const pit = features.find((f) => f.name === 'PIT')!;
  if (pit.geom.kind !== 'line') throw new Error();
  // 3 vertices + interpolated arc points + closing vertex
  assert.ok(pit.geom.coords.length > 10);
  // The semicircle (bulge = 1) between the first two vertices dips ~100 m south of the chord.
  const minLat = Math.min(...pit.geom.coords.map((c) => c[1]));
  assert.ok(haversine(minLat, 105.85, 43.6, 105.85) > 95);

  const label = features.find((f) => f.name === 'BM-12')!;
  assert.equal(label.geom.kind, 'point');
});

test('DXF: layer filter and swapXY', () => {
  const drawing = parseDxf(sampleDxf());
  assert.equal(dxfToFeatures(drawing, { crsId: 'utm48n', swapXY: false, simplifyM: 0, layers: ['ROAD'] }).length, 1);
  // Swapping X/Y on a file that doesn't need it puts the points nowhere near Mongolia (or drops them).
  const swapped = dxfToFeatures(drawing, { crsId: 'utm48n', swapXY: true, simplifyM: 0, layers: ['ROAD'] });
  if (swapped.length) {
    const g = swapped[0].geom;
    if (g.kind !== 'line') throw new Error();
    assert.ok(haversine(g.coords[0][1], g.coords[0][0], 43.6, 105.85) > 100_000);
  }
});
