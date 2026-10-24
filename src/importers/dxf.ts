import DxfParser from 'dxf-parser';
import type {
  IArcEntity,
  ICircleEntity,
  IEntity,
  IInsertEntity,
  ILineEntity,
  ILwpolylineEntity,
  IMtextEntity,
  IPointEntity,
  IPolylineEntity,
  ISplineEntity,
  ITextEntity,
} from 'dxf-parser';
import { guessCrs, makeToWgs84 } from '../geo/crs';
import { simplify } from '../geo/measure';
import type { LonLat, MapFeature } from '../geo/types';

/** A shape still in the drawing's own X/Y units (before projection to lat/lon). */
interface RawShape {
  kind: 'point' | 'line';
  pts: { x: number; y: number; z: number }[];
  closed?: boolean;
  layer: string;
  color?: string;
  label?: string;
}

export interface DxfDrawing {
  shapes: RawShape[];
  layers: string[];
  /** Entity types we could not draw, with counts, so the user knows what was skipped. */
  skipped: Record<string, number>;
  /** Suggested CRS id from looking at the coordinate values, or null. */
  guessedCrs: string | null;
}

const ARC_SEGMENTS = 48;

const hex = (rgb: number) => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;

/** Points along a circular arc. Angles in radians, counter-clockwise. */
function arcPoints(cx: number, cy: number, z: number, r: number, start: number, end: number) {
  let sweep = end - start;
  if (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(4, Math.ceil((ARC_SEGMENTS * sweep) / (Math.PI * 2)));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (sweep * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z });
  }
  return pts;
}

/**
 * Polyline vertices may carry a "bulge" meaning the segment to the next vertex
 * is an arc (bulge = tan(angle/4)). Haul roads and pit outlines use these a lot.
 */
function expandBulges(
  verts: { x: number; y: number; z?: number; bulge?: number }[],
  closed: boolean,
  elevation = 0,
) {
  const out: { x: number; y: number; z: number }[] = [];
  const count = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const z = a.z || elevation;
    out.push({ x: a.x, y: a.y, z });
    if (i >= count) continue;
    const b = verts[(i + 1) % verts.length];
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) < 1e-9) continue;
    const theta = 4 * Math.atan(bulge);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const chord = Math.hypot(dx, dy);
    if (chord === 0) continue;
    const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
    // Centre lies on the perpendicular bisector of the chord.
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2)) * Math.sign(bulge) * (Math.abs(theta) > Math.PI ? -1 : 1);
    const cx = mx - (h * dy) / chord;
    const cy = my + (h * dx) / chord;
    const startA = Math.atan2(a.y - cy, a.x - cx);
    const steps = Math.max(2, Math.ceil((ARC_SEGMENTS * Math.abs(theta)) / (Math.PI * 2)));
    for (let s = 1; s < steps; s++) {
      const ang = startA + (theta * s) / steps;
      out.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), z });
    }
  }
  if (closed && out.length > 0) out.push(out[0]);
  return out;
}

/** Reads DXF text. Coordinates stay in drawing units until `dxfToFeatures`. */
export function parseDxf(text: string, deviceLon?: number): DxfDrawing {
  const dxf = new DxfParser().parseSync(text);
  if (!dxf) throw new Error('DXF_PARSE_FAILED');

  const layerColors: Record<string, string> = {};
  for (const [name, layer] of Object.entries(dxf.tables?.layer?.layers ?? {})) {
    if (typeof layer.color === 'number') layerColors[name] = hex(layer.color);
  }

  const shapes: RawShape[] = [];
  const skipped: Record<string, number> = {};
  const layers = new Set<string>();

  for (const e of dxf.entities as IEntity[]) {
    if (e.inPaperSpace) continue; // paper-space = printed sheet layout, not real-world geometry
    const base = {
      layer: e.layer ?? '0',
      color: typeof e.color === 'number' ? hex(e.color) : layerColors[e.layer],
    };
    layers.add(base.layer);
    switch (e.type) {
      case 'LINE': {
        const l = e as ILineEntity;
        shapes.push({ ...base, kind: 'line', pts: l.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z ?? 0 })) });
        break;
      }
      case 'LWPOLYLINE': {
        const l = e as ILwpolylineEntity;
        if (l.vertices.length < 2) break;
        shapes.push({ ...base, kind: 'line', closed: l.shape, pts: expandBulges(l.vertices, l.shape, l.elevation) });
        break;
      }
      case 'POLYLINE': {
        const l = e as IPolylineEntity;
        if (l.is3dPolygonMesh || l.isPolyfaceMesh) {
          skipped['POLYLINE (mesh)'] = (skipped['POLYLINE (mesh)'] ?? 0) + 1;
          break;
        }
        if (l.vertices.length < 2) break;
        shapes.push({ ...base, kind: 'line', closed: l.shape, pts: expandBulges(l.vertices, l.shape) });
        break;
      }
      case 'CIRCLE': {
        const c = e as ICircleEntity;
        shapes.push({ ...base, kind: 'line', closed: true, pts: arcPoints(c.center.x, c.center.y, c.center.z ?? 0, c.radius, 0, Math.PI * 2) });
        break;
      }
      case 'ARC': {
        const a = e as IArcEntity;
        shapes.push({ ...base, kind: 'line', pts: arcPoints(a.center.x, a.center.y, a.center.z ?? 0, a.radius, a.startAngle, a.endAngle) });
        break;
      }
      case 'SPLINE': {
        // Approximate a spline by its fit points (or control points when there are none).
        const s = e as ISplineEntity;
        const pts = (s.fitPoints?.length ? s.fitPoints : s.controlPoints) ?? [];
        if (pts.length >= 2) shapes.push({ ...base, kind: 'line', pts: pts.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 })) });
        break;
      }
      case 'POINT': {
        const p = (e as IPointEntity).position;
        shapes.push({ ...base, kind: 'point', pts: [{ x: p.x, y: p.y, z: p.z ?? 0 }] });
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const t = e as ITextEntity & IMtextEntity;
        const p = t.startPoint ?? t.position;
        const label = (t.text ?? '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;|[{}]/g, '').trim();
        if (p && label) shapes.push({ ...base, kind: 'point', label, pts: [{ x: p.x, y: p.y, z: p.z ?? 0 }] });
        break;
      }
      case 'INSERT': {
        // Block references (e.g. survey-point symbols): show as a point named after the block.
        const ins = e as IInsertEntity;
        shapes.push({ ...base, kind: 'point', label: ins.name, pts: [{ x: ins.position.x, y: ins.position.y, z: ins.position.z ?? 0 }] });
        break;
      }
      default:
        skipped[e.type] = (skipped[e.type] ?? 0) + 1;
    }
  }

  // Sample up to ~500 coordinates for CRS guessing.
  const sample: { x: number; y: number }[] = [];
  const stride = Math.max(1, Math.floor(shapes.length / 500));
  for (let i = 0; i < shapes.length; i += stride) sample.push(shapes[i].pts[0]);

  return { shapes, layers: [...layers].sort(), skipped, guessedCrs: guessCrs(sample, deviceLon) };
}

export interface DxfConvertOptions {
  crsId: string;
  /** Some survey software writes X = northing, Y = easting (Russian/Soviet convention). */
  swapXY: boolean;
  /** Line simplification tolerance in metres (0 = keep every vertex). */
  simplifyM: number;
  /** Only import these CAD layers (undefined = all). */
  layers?: string[];
}

function shapeConverter(opts: DxfConvertOptions) {
  const toLonLat = makeToWgs84(opts.crsId);
  const allowed = opts.layers ? new Set(opts.layers) : null;
  return (s: RawShape): MapFeature | null => {
    if (allowed && !allowed.has(s.layer)) return null;
    const coords: LonLat[] = s.pts.map((p) => (opts.swapXY ? toLonLat(p.y, p.x) : toLonLat(p.x, p.y)));
    if (coords.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90)) return null;
    const z = s.pts[0].z;
    const elevation = z !== 0 ? z : undefined;
    const name = s.label ?? (elevation != null ? `${s.layer} · ${elevation.toFixed(1)} m` : s.layer);
    if (s.kind === 'point') return { geom: { kind: 'point', coord: coords[0] }, name, color: s.color, elevation };
    const line = opts.simplifyM > 0 ? simplify(coords, opts.simplifyM) : coords;
    return line.length >= 2 ? { geom: { kind: 'line', coords: line }, name, color: s.color, elevation } : null;
  };
}

export function dxfToFeatures(drawing: DxfDrawing, opts: DxfConvertOptions): MapFeature[] {
  const convert = shapeConverter(opts);
  const features: MapFeature[] = [];
  for (const s of drawing.shapes) {
    const f = convert(s);
    if (f) features.push(f);
  }
  return features;
}

/**
 * Same as dxfToFeatures, but works in chunks and pauses between them so the
 * screen stays responsive (and can show progress) on drawings with 100 000+ objects.
 */
export async function dxfToFeaturesAsync(
  drawing: DxfDrawing,
  opts: DxfConvertOptions,
  onProgress?: (fraction: number) => void,
): Promise<MapFeature[]> {
  const convert = shapeConverter(opts);
  const features: MapFeature[] = [];
  const CHUNK = 2000;
  for (let i = 0; i < drawing.shapes.length; i += CHUNK) {
    for (const s of drawing.shapes.slice(i, i + CHUNK)) {
      const f = convert(s);
      if (f) features.push(f);
    }
    onProgress?.(Math.min(1, (i + CHUNK) / drawing.shapes.length));
    await new Promise((r) => setTimeout(r, 0));
  }
  return features;
}
