import { distanceM } from '../geo/measure';
import { indexFor } from '../geo/lod';
import type { LonLat, MapFeature } from '../geo/types';
import { enuOffset, type Vec3 } from './projection';

/**
 * Turns map data near the user into 3D positions (East, North, Up metres from
 * the phone) for the camera view. Rebuilt only when the user moves a few metres
 * or the data changes; the per-frame work is just rotating these into view.
 */

export interface Observer {
  lat: number;
  lon: number;
  /** Height of the phone (eye level), metres above sea level. */
  alt: number;
  /** Ground height under the user, used for drawings without heights. */
  groundAlt: number;
}

export interface SceneLine {
  key: string;
  color: string;
  pts: Vec3[];
}

export interface ScenePoint {
  key: string;
  label: string;
  color: string;
  v: Vec3;
  distance: number;
  kind: 'waypoint' | 'feature' | 'target';
}

export interface Scene {
  lines: SceneLine[];
  points: ScenePoint[];
}

export interface SceneLayer {
  id: string;
  color: string;
  features: MapFeature[];
}

export interface SceneWaypoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Stored height, else the terrain model, else null (→ the user's ground level). */
  alt: number | null;
}

/** Caps so the camera view stays smooth (everything is redrawn ~15 times a second). */
export const MAX_LINES = 250;
export const MAX_POINTS = 60;

export function buildScene(
  obs: Observer,
  radiusM: number,
  layers: SceneLayer[],
  waypoints: SceneWaypoint[],
  target: SceneWaypoint | null,
): Scene {
  const at = (c: LonLat, alt: number) => enuOffset(obs, { lon: c[0], lat: c[1], alt });
  const dLat = radiusM / 111_000;
  const dLon = radiusM / (111_000 * Math.cos((obs.lat * Math.PI) / 180));
  const bbox = { minLat: obs.lat - dLat, maxLat: obs.lat + dLat, minLon: obs.lon - dLon, maxLon: obs.lon + dLon };

  const lines: SceneLine[] = [];
  const points: ScenePoint[] = [];
  let lineBudget = MAX_LINES;

  for (const layer of layers) {
    if (lineBudget <= 0) break;
    // Zoom 16 detail (~2 m) is plenty for what the camera can resolve at these distances.
    const { items } = indexFor(layer.features).query({ bbox, zoom: 16 }, lineBudget, MAX_POINTS);
    for (const it of items) {
      // Drawings with heights (DXF Z, KML altitude) are placed in 3D; flat drawings sit at your ground level.
      const alt = it.feature.elevation ?? obs.groundAlt;
      const color = it.feature.color ?? layer.color;
      const g = it.geom;
      if (g.kind === 'point') {
        const d = distanceM(obs.lat, obs.lon, g.coord[1], g.coord[0]);
        if (d <= radiusM)
          points.push({ key: `${layer.id}-${it.index}`, label: it.feature.name ?? '', color, v: at(g.coord, alt), distance: d, kind: 'feature' });
      } else {
        const ring = g.kind === 'line' ? g.coords : g.rings[0];
        lines.push({ key: `${layer.id}-${it.index}`, color, pts: ring.map((c) => at(c, alt)) });
        lineBudget--;
      }
    }
  }

  for (const w of waypoints) {
    const d = distanceM(obs.lat, obs.lon, w.lat, w.lon);
    if (d > radiusM || w.id === target?.id) continue;
    points.push({ key: `wp-${w.id}`, label: w.name, color: '#7b1fa2', v: at([w.lon, w.lat], w.alt ?? obs.groundAlt), distance: d, kind: 'waypoint' });
  }
  // The navigation target is always shown, however far away.
  if (target) {
    const d = distanceM(obs.lat, obs.lon, target.lat, target.lon);
    points.push({ key: 'target', label: target.name, color: '#7b1fa2', v: at([target.lon, target.lat], target.alt ?? obs.groundAlt), distance: d, kind: 'target' });
  }

  points.sort((a, b) => a.distance - b.distance);
  const targetPt = points.find((p) => p.kind === 'target');
  const kept = points.filter((p) => p.kind !== 'target').slice(0, MAX_POINTS - (targetPt ? 1 : 0));
  return { lines, points: targetPt ? [...kept, targetPt] : kept };
}
