import { simplify } from './measure';
import type { BBox, Geometry, LonLat, MapFeature } from './types';
import { metresPerPixel } from '../offline/tiles';

/**
 * Level-of-detail index for large imported layers (mine plans with tens or
 * hundreds of thousands of lines). The phone can only draw a few thousand map
 * shapes smoothly, so for each view we hand the map only:
 *   - shapes that intersect the visible area,
 *   - that are at least about a pixel big at the current zoom,
 *   - simplified to about one pixel of detail for that zoom (cached per zoom level),
 *   - biggest first, up to a budget.
 * Zoomed out you see the pit outline and main roads; zoomed in, every contour.
 */

export interface View {
  bbox: BBox;
  zoom: number;
}

export interface VisibleFeature {
  /** Index in the layer's feature list (stable React key). */
  index: number;
  feature: MapFeature;
  geom: Geometry;
}

/** Shapes smaller than this many pixels are skipped (they'd be a dot). */
const MIN_PIXELS = 1.5;

export class LayerIndex {
  private readonly features: MapFeature[];
  /** minLon, minLat, maxLon, maxLat per feature. */
  private readonly boxes: Float64Array;
  /** Approximate size of each feature in metres (bounding-box diagonal). */
  private readonly sizes: Float32Array;
  private readonly cache = new Map<number, Geometry>();

  constructor(features: MapFeature[]) {
    this.features = features;
    this.boxes = new Float64Array(features.length * 4);
    this.sizes = new Float32Array(features.length);
    features.forEach((f, i) => {
      let minLon = Infinity;
      let minLat = Infinity;
      let maxLon = -Infinity;
      let maxLat = -Infinity;
      const visit = (c: LonLat) => {
        if (c[0] < minLon) minLon = c[0];
        if (c[0] > maxLon) maxLon = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[1] > maxLat) maxLat = c[1];
      };
      const g = f.geom;
      if (g.kind === 'point') visit(g.coord);
      else if (g.kind === 'line') g.coords.forEach(visit);
      else g.rings.forEach((r) => r.forEach(visit));
      this.boxes.set([minLon, minLat, maxLon, maxLat], i * 4);
      const latM = (maxLat - minLat) * 111_320;
      const lonM = (maxLon - minLon) * 111_320 * Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
      this.sizes[i] = Math.hypot(latM, lonM);
    });
  }

  get size() {
    return this.features.length;
  }

  /**
   * Shapes to draw for a view. `budget` caps lines/polygons, `pointBudget` caps
   * pins (which are much heavier to draw); the biggest shapes win.
   */
  query(view: View, budget: number, pointBudget: number): { items: VisibleFeature[]; total: number } {
    const { minLon, minLat, maxLon, maxLat } = view.bbox;
    const level = Math.max(0, Math.min(22, Math.floor(view.zoom)));
    const mpp = metresPerPixel(level, (minLat + maxLat) / 2);
    const minSize = mpp * MIN_PIXELS;
    const shapes: number[] = [];
    const points: number[] = [];
    const b = this.boxes;
    for (let i = 0; i < this.features.length; i++) {
      const o = i * 4;
      if (b[o] > maxLon || b[o + 2] < minLon || b[o + 1] > maxLat || b[o + 3] < minLat) continue;
      if (this.features[i].geom.kind === 'point') points.push(i);
      else if (this.sizes[i] >= minSize) shapes.push(i);
    }
    const total = shapes.length + points.length;
    if (shapes.length > budget) shapes.sort((a, c) => this.sizes[c] - this.sizes[a]).length = budget;
    if (points.length > pointBudget) points.length = pointBudget;

    const items: VisibleFeature[] = [];
    for (const i of shapes) items.push({ index: i, feature: this.features[i], geom: this.simplified(i, level, mpp) });
    for (const i of points) items.push({ index: i, feature: this.features[i], geom: this.features[i].geom });
    return { items, total };
  }

  /** Geometry simplified to ~1 pixel at this zoom level, cached. */
  private simplified(i: number, level: number, mpp: number): Geometry {
    const key = i * 32 + level;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const g = this.features[i].geom;
    let out: Geometry = g;
    if (g.kind === 'line') {
      const coords = simplify(g.coords, mpp);
      out = { kind: 'line', coords: coords.length >= 2 ? coords : g.coords };
    } else if (g.kind === 'polygon') {
      out = { kind: 'polygon', rings: g.rings.map((r) => (r.length > 4 ? simplify(r, mpp) : r)).filter((r) => r.length >= 3) };
      if (out.rings.length === 0) out = g;
    }
    // Keep the cache from growing without bound on huge layers.
    if (this.cache.size > 50_000) this.cache.clear();
    this.cache.set(key, out);
    return out;
  }
}

/** The visible area enlarged on every side, so small pans don't reveal empty edges. */
export function padBBox(b: BBox, fraction: number): BBox {
  const dx = (b.maxLon - b.minLon) * fraction;
  const dy = (b.maxLat - b.minLat) * fraction;
  return { minLon: b.minLon - dx, minLat: b.minLat - dy, maxLon: b.maxLon + dx, maxLat: b.maxLat + dy };
}

/** One index per loaded feature list (shared by the map and the camera view). */
const indexes = new WeakMap<MapFeature[], LayerIndex>();
export function indexFor(features: MapFeature[]): LayerIndex {
  let ix = indexes.get(features);
  if (!ix) {
    ix = new LayerIndex(features);
    indexes.set(features, ix);
  }
  return ix;
}
