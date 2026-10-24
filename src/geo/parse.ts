import { fromUtm, getCrs, guessCrs, makeToWgs84 } from './crs';

export interface ParsedCoord {
  lat: number;
  lon: number;
  /** Which system the text was read as, shown to the user for confirmation. */
  system: string;
}

const NUM = /-?\d+(?:\.\d+)?/g;
const inRange = (lat: number, lon: number) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/**
 * Reads a typed coordinate. Accepts:
 *   47.918, 106.917              decimal degrees (lat, lon — or lon, lat if unambiguous)
 *   47°55'06"N 106°55'03"E       degrees minutes seconds (also D M.m, and N/S/E/W letters)
 *   48N 650123 5310456           UTM zone, easting, northing ("48 650123E 5310456N" too)
 *   650123 5310456               easting/northing without a zone → UTM zone from `deviceLon`
 *   18512345 4830000             Gauss–Krüger (Pulkovo 1942) with zone prefix
 * X/Y in either order is accepted for projected coordinates (Soviet surveys write X = north).
 */
export function parseCoordinate(input: string, deviceLon?: number): ParsedCoord | null {
  let text = input.trim().toUpperCase().replace(/[;\t]/g, ' ');
  if (!text) return null;
  // Decimal commas ("47,918 106,917") when no dot is used anywhere.
  if (!text.includes('.') && /\d,\d+\s+\S/.test(text)) text = text.replace(/(\d),(\d)/g, '$1.$2');
  text = text.replace(/,/g, ' ');

  // UTM with an explicit zone: "48N 650123 5310456", "48 T 650123E 5310456N"
  const utm = text.match(/^(\d{1,2})\s*([C-X])?\s+(\d{5,7}(?:\.\d+)?)\s*E?\s+(\d{6,8}(?:\.\d+)?)\s*N?$/);
  if (utm) {
    const zone = Number(utm[1]);
    if (zone < 1 || zone > 60) return null;
    const south = !!utm[2] && utm[2] < 'N';
    const [lon, lat] = fromUtm(zone, Number(utm[3]), Number(utm[4]), south);
    return inRange(lat, lon) ? { lat, lon, system: `UTM ${zone}${south ? 'S' : 'N'}` } : null;
  }

  const nums = (text.match(NUM) ?? []).map(Number);
  const hemis = text.replace(/[^NSEW]/g, '');

  // Degrees with minutes (and seconds): split the numbers evenly between the two axes.
  if (nums.length === 4 || nums.length === 6) {
    const half = nums.length / 2;
    const toDeg = (parts: number[]) => {
      const sign = parts[0] < 0 ? -1 : 1;
      const [d, m = 0, s = 0] = parts.map(Math.abs);
      return m >= 60 || s >= 60 ? NaN : sign * (d + m / 60 + s / 3600);
    };
    const a = toDeg(nums.slice(0, half));
    const b = toDeg(nums.slice(half));
    return orderLatLon(a, b, hemis, 'WGS84 (DMS)');
  }

  if (nums.length !== 2) return null;
  const [a, b] = nums;

  // Plain degrees
  if (Math.abs(a) <= 180 && Math.abs(b) <= 180) return orderLatLon(a, b, hemis, 'WGS84');

  // Projected metres: work out which number is the northing (Mongolia: 4.5–5.9 million).
  const isNorthing = (v: number) => v > 4_400_000 && v < 6_000_000;
  let [x, y] = [a, b];
  if (isNorthing(a) && !isNorthing(b)) [x, y] = [b, a];
  const crsId = guessCrs([{ x, y }], deviceLon);
  if (!crsId || crsId === 'wgs84') return null;
  const [lon, lat] = makeToWgs84(crsId)(x, y);
  if (!inRange(lat, lon)) return null;
  return { lat, lon, system: getCrs(crsId).label };
}

function orderLatLon(a: number, b: number, hemis: string, system: string): ParsedCoord | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let lat = a;
  let lon = b;
  // Letters decide the order and sign when present: "106.9E 47.9N"
  if (hemis.length === 2) {
    if ('EW'.includes(hemis[0]) && 'NS'.includes(hemis[1])) [lat, lon] = [b, a];
    if (hemis.includes('S')) lat = -Math.abs(lat);
    if (hemis.includes('W')) lon = -Math.abs(lon);
  } else if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
    [lat, lon] = [lon, lat]; // clearly "lon, lat"
  }
  return inRange(lat, lon) ? { lat, lon, system } : null;
}
