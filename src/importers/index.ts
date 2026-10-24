import { gpx as gpxToGeoJson } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import type { MapFeature } from '../geo/types';
import { parseKml, parseKmz } from './kml';

export type ImportKind = 'kml' | 'kmz' | 'gpx' | 'dxf' | 'dwg';

export function detectKind(fileName: string): ImportKind | null {
  const ext = fileName.toLowerCase().split('.').pop();
  switch (ext) {
    case 'kml':
    case 'kmz':
    case 'gpx':
    case 'dxf':
    case 'dwg':
      return ext;
    default:
      return null;
  }
}

/** GPX (from Garmin units etc.) reuses the KML converter via GeoJSON. */
function parseGpx(text: string): MapFeature[] {
  const fc = gpxToGeoJson(new DOMParser().parseFromString(text, 'text/xml'));
  const out: MapFeature[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    const name = f.properties?.name as string | undefined;
    if (!g) continue;
    if (g.type === 'Point') out.push({ geom: { kind: 'point', coord: [g.coordinates[0], g.coordinates[1]] }, name });
    if (g.type === 'LineString') out.push({ geom: { kind: 'line', coords: g.coordinates.map((c) => [c[0], c[1]]) }, name });
    if (g.type === 'MultiLineString')
      for (const line of g.coordinates) out.push({ geom: { kind: 'line', coords: line.map((c) => [c[0], c[1]]) }, name });
  }
  return out;
}

/**
 * Parses formats that are already in WGS84 lat/lon (KML, KMZ, GPX).
 * DXF needs a coordinate-system choice first, see ./dxf.ts.
 */
export async function parseGeographic(kind: 'kml' | 'kmz' | 'gpx', data: { text(): Promise<string>; bytes(): Promise<Uint8Array> }) {
  if (kind === 'kmz') return parseKmz(await data.bytes());
  const text = await data.text();
  return kind === 'kml' ? parseKml(text) : parseGpx(text);
}
