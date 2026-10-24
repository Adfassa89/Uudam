import { kml as kmlToGeoJson } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import type { Geometry as GJGeometry, Position } from 'geojson';
import JSZip from 'jszip';
import type { Geometry, LonLat, MapFeature } from '../geo/types';

const ll = (p: Position): LonLat => [p[0], p[1]];

function convertGeometry(g: GJGeometry | null): Geometry[] {
  if (!g) return [];
  switch (g.type) {
    case 'Point':
      return [{ kind: 'point', coord: ll(g.coordinates) }];
    case 'MultiPoint':
      return g.coordinates.map((c) => ({ kind: 'point', coord: ll(c) }));
    case 'LineString':
      return [{ kind: 'line', coords: g.coordinates.map(ll) }];
    case 'MultiLineString':
      return g.coordinates.map((line) => ({ kind: 'line', coords: line.map(ll) }));
    case 'Polygon':
      return [{ kind: 'polygon', rings: g.coordinates.map((r) => r.map(ll)) }];
    case 'MultiPolygon':
      return g.coordinates.map((poly) => ({ kind: 'polygon', rings: poly.map((r) => r.map(ll)) }));
    case 'GeometryCollection':
      return g.geometries.flatMap(convertGeometry);
  }
}

/** Parses KML text (Google Earth format) into map features. */
export function parseKml(text: string): MapFeature[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const fc = kmlToGeoJson(doc);
  const out: MapFeature[] = [];
  for (const f of fc.features) {
    const props = f.properties ?? {};
    const color = (props.stroke as string | undefined) ?? (props['marker-color'] as string | undefined);
    // Placemark points often carry an altitude as the third coordinate.
    const z = f.geometry?.type === 'Point' ? f.geometry.coordinates[2] : undefined;
    for (const geom of convertGeometry(f.geometry)) {
      out.push({
        geom,
        name: props.name as string | undefined,
        description: typeof props.description === 'string' ? props.description : undefined,
        color,
        elevation: typeof z === 'number' && z !== 0 ? z : undefined,
      });
    }
  }
  return out;
}

/** KMZ is a ZIP archive containing a KML file (usually "doc.kml") plus icons/images. */
export async function parseKmz(bytes: Uint8Array): Promise<MapFeature[]> {
  const zip = await JSZip.loadAsync(bytes);
  const kmlFiles = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith('.kml'));
  if (kmlFiles.length === 0) throw new Error('NO_KML_IN_KMZ');
  // doc.kml is the root by convention; otherwise read every KML inside.
  const root = kmlFiles.find((f) => f.name.toLowerCase() === 'doc.kml');
  const files = root ? [root] : kmlFiles;
  const all: MapFeature[] = [];
  for (const f of files) all.push(...parseKml(await f.async('string')));
  return all;
}
