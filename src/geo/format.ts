import { toUtm } from './crs';

export type CoordFormat = 'dd' | 'dms' | 'utm';

function dms(value: number, pos: string, neg: string): string {
  const hemi = value >= 0 ? pos : neg;
  const v = Math.abs(value);
  let d = Math.floor(v);
  let m = Math.floor((v - d) * 60);
  let s = (v - d - m / 60) * 3600;
  if (s >= 59.95) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″${hemi}`;
}

export function formatCoord(lat: number, lon: number, format: CoordFormat): string {
  switch (format) {
    case 'dd':
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    case 'dms':
      return `${dms(lat, 'N', 'S')} ${dms(lon, 'E', 'W')}`;
    case 'utm': {
      const u = toUtm(lat, lon);
      return `${u.zone}${lat >= 0 ? 'N' : 'S'} ${u.easting.toFixed(0)}E ${u.northing.toFixed(0)}N`;
    }
  }
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(2)} km`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatAlt(alt: number | null | undefined): string {
  return alt == null ? '—' : `${alt.toFixed(0)} m`;
}
