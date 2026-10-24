import proj4 from 'proj4';

/**
 * Coordinate reference systems that mine survey / CAD files in Mongolia are
 * commonly drawn in. DXF/DWG files store plain X/Y numbers with no CRS info,
 * so the user must tell us which system the drawing uses.
 *
 * Mongolia spans roughly 87°E–120°E, i.e.
 *   - UTM zones 45N–50N (WGS84; MONREF97 differs from WGS84 by well under 1 m)
 *   - Gauss–Krüger 6° zones 15–21 (Pulkovo 1942 / Krasovsky ellipsoid; older Soviet-era plans)
 */

export interface CrsOption {
  id: string;
  /** Shown in the UI. Not translated because these are standard technical names. */
  label: string;
  proj: string;
}

/** Pulkovo 1942 → WGS84 7-parameter shift (EPSG:5044). Typically good to a few metres. */
const PULKOVO_TOWGS84 = '23.92,-141.27,-80.9,0,0.35,0.82,-0.12';

export const WGS84 = 'EPSG:4326';

function utm(zone: number): CrsOption {
  return {
    id: `utm${zone}n`,
    label: `WGS84 / UTM ${zone}N (MONREF97)`,
    proj: `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`,
  };
}

function gaussKruger(zone: number, withZonePrefix: boolean): CrsOption {
  const lon0 = zone * 6 - 3;
  const x0 = withZonePrefix ? zone * 1_000_000 + 500_000 : 500_000;
  return {
    id: `gk${zone}${withZonePrefix ? '' : 'nz'}`,
    label: `Pulkovo 1942 / Gauss-Krüger ${zone} (${withZonePrefix ? `X=${zone}xxxxxx` : 'no zone prefix'}, CM ${lon0}°E)`,
    proj: `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=1 +x_0=${x0} +y_0=0 +ellps=krass +towgs84=${PULKOVO_TOWGS84} +units=m +no_defs`,
  };
}

const UTM_ZONES = [45, 46, 47, 48, 49, 50];
const GK_ZONES = [15, 16, 17, 18, 19, 20, 21];

export const CRS_OPTIONS: CrsOption[] = [
  { id: 'wgs84', label: 'WGS84 (longitude / latitude degrees)', proj: WGS84 },
  ...UTM_ZONES.map(utm),
  ...GK_ZONES.map((z) => gaussKruger(z, true)),
  ...GK_ZONES.map((z) => gaussKruger(z, false)),
];

export function getCrs(id: string): CrsOption {
  const crs = CRS_OPTIONS.find((c) => c.id === id);
  if (!crs) throw new Error(`Unknown CRS ${id}`);
  return crs;
}

export function utmZoneForLon(lon: number): number {
  return Math.floor((lon + 180) / 6) + 1;
}

/** Converts projected X (easting) / Y (northing) into [lon, lat]. */
export function makeToWgs84(crsId: string): (x: number, y: number) => [number, number] {
  const crs = getCrs(crsId);
  if (crs.proj === WGS84) return (x, y) => [x, y];
  const converter = proj4(crs.proj, WGS84);
  return (x, y) => converter.forward([x, y]) as [number, number];
}

export interface UtmCoord {
  zone: number;
  easting: number;
  northing: number;
}

export function toUtm(lat: number, lon: number): UtmCoord {
  const zone = utmZoneForLon(lon);
  const [easting, northing] = proj4(WGS84, utm(zone).proj).forward([lon, lat]);
  return { zone, easting, northing };
}

/** UTM (any zone, WGS84) → [lon, lat]. */
export function fromUtm(zone: number, easting: number, northing: number, south = false): [number, number] {
  const proj = `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
  return proj4(proj, WGS84).forward([easting, northing]) as [number, number];
}

/**
 * Looks at a sample of drawing coordinates and guesses the CRS.
 * Returns null when nothing fits; the user always confirms the choice.
 * `deviceLon` (the phone's current longitude) helps pick the UTM zone.
 */
export function guessCrs(sample: { x: number; y: number }[], deviceLon?: number): string | null {
  if (sample.length === 0) return null;
  const xs = sample.map((p) => p.x).sort((a, b) => a - b);
  const ys = sample.map((p) => p.y).sort((a, b) => a - b);
  const x = xs[Math.floor(xs.length / 2)];
  const y = ys[Math.floor(ys.length / 2)];

  // Degrees within Mongolia's neighbourhood.
  if (x > 80 && x < 125 && y > 38 && y < 55) return 'wgs84';

  // Mongolia lies between ~41.5°N and ~52.2°N → northing 4.6–5.8 million metres.
  const northingOk = y > 4_500_000 && y < 5_900_000;
  if (!northingOk) return null;

  // Gauss–Krüger with zone prefix: X = zone * 1,000,000 + ~500,000.
  const zonePrefix = Math.floor(x / 1_000_000);
  if (GK_ZONES.includes(zonePrefix)) return `gk${zonePrefix}`;

  // Plain eastings (100 000–900 000 m): UTM is far more common in modern mine plans.
  if (x > 100_000 && x < 900_000) {
    const zone = deviceLon != null ? utmZoneForLon(deviceLon) : 48;
    return UTM_ZONES.includes(zone) ? `utm${zone}n` : 'utm48n';
  }
  return null;
}
