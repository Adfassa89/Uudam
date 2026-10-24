// Shared geometry types used across the app.
// Coordinates are always [longitude, latitude] in WGS84 degrees (same order as GeoJSON).

export type LonLat = [number, number];

export type Geometry =
  | { kind: 'point'; coord: LonLat }
  | { kind: 'line'; coords: LonLat[] }
  | { kind: 'polygon'; rings: LonLat[][] };

export interface MapFeature {
  geom: Geometry;
  name?: string;
  description?: string;
  /** Hex colour such as "#ff0000". Falls back to the layer colour. */
  color?: string;
  /** Elevation (Z) in metres when the source file had one, e.g. DXF contour lines. */
  elevation?: number;
}

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  /** Metres above sea level (GPS altitude, can be null when the phone has no fix in 3D). */
  alt: number | null;
  /** Horizontal accuracy in metres. */
  acc: number | null;
  /** Speed in m/s. */
  speed: number | null;
  /** Unix time in milliseconds. */
  t: number;
}
