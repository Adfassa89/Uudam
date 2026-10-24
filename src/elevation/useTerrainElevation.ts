import { useEffect, useRef, useState } from 'react';
import { haversine } from '../geo/measure';
import { terrainElevation } from './dem';

/** Moving less than this doesn't trigger a new lookup (the model is ~30 m resolution anyway). */
const MIN_MOVE_M = 5;

/** Terrain-model elevation at a position, updated as the position changes. */
export function useTerrainElevation(lat: number | undefined, lon: number | undefined): number | null {
  const [value, setValue] = useState<number | null>(null);
  const last = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    if (last.current && haversine(last.current.lat, last.current.lon, lat, lon) < MIN_MOVE_M) return;
    last.current = { lat, lon };
    let cancelled = false;
    terrainElevation(lat, lon).then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return lat == null || lon == null ? null : value;
}
