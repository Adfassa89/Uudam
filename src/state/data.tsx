import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { featuresBBox } from '../geo/measure';
import type { BBox, MapFeature } from '../geo/types';
import * as store from '../storage/files';
import type { LayerMeta, TrackMeta } from '../storage/files';

const LAYER_COLORS = ['#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4', '#f032e6'];

interface DataCtx {
  layers: LayerMeta[];
  /** Features of visible layers, loaded from disk on demand. */
  layerFeatures: Record<string, MapFeature[]>;
  addLayer: (input: { name: string; source: LayerMeta['source']; features: MapFeature[]; crsId?: string }) => LayerMeta;
  updateLayer: (id: string, patch: Partial<Pick<LayerMeta, 'visible' | 'color' | 'name'>>) => void;
  removeLayer: (id: string) => void;

  tracks: TrackMeta[];
  addTrack: (meta: TrackMeta) => void;
  removeTrack: (id: string) => void;
  renameTrack: (id: string, name: string) => void;

  /** The map screen watches this and zooms to the box when it changes. */
  focus: { bbox: BBox; nonce: number } | null;
  focusOn: (bbox: BBox | null) => void;
}

const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<LayerMeta[]>(() => store.loadLayerIndex());
  const [tracks, setTracks] = useState<TrackMeta[]>(() => store.loadTrackIndex());
  const [layerFeatures, setLayerFeatures] = useState<Record<string, MapFeature[]>>({});
  const [focus, setFocus] = useState<DataCtx['focus']>(null);

  // Keep features in memory only for visible layers.
  useEffect(() => {
    setLayerFeatures((prev) => {
      const next: Record<string, MapFeature[]> = {};
      for (const l of layers) if (l.visible) next[l.id] = prev[l.id] ?? store.loadLayerFeatures(l.id);
      return next;
    });
  }, [layers]);

  const saveLayers = useCallback((fn: (prev: LayerMeta[]) => LayerMeta[]) => {
    setLayers((prev) => {
      const next = fn(prev);
      store.saveLayerIndex(next);
      return next;
    });
  }, []);

  const saveTracks = useCallback((fn: (prev: TrackMeta[]) => TrackMeta[]) => {
    setTracks((prev) => {
      const next = fn(prev);
      store.saveTrackIndex(next);
      return next;
    });
  }, []);

  const focusOn = useCallback((bbox: BBox | null) => {
    if (bbox) setFocus({ bbox, nonce: Date.now() });
  }, []);

  const addLayer: DataCtx['addLayer'] = useCallback(
    ({ name, source, features, crsId }) => {
      const id = store.newId();
      store.saveLayerFeatures(id, features);
      const meta: LayerMeta = {
        id,
        name,
        source,
        crsId,
        color: LAYER_COLORS[Math.floor(Math.random() * LAYER_COLORS.length)],
        visible: true,
        featureCount: features.length,
        bbox: featuresBBox(features),
        createdAt: Date.now(),
      };
      saveLayers((prev) => [meta, ...prev]);
      return meta;
    },
    [saveLayers],
  );

  const updateLayer: DataCtx['updateLayer'] = useCallback(
    (id, patch) => saveLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))),
    [saveLayers],
  );

  const removeLayer = useCallback(
    (id: string) => {
      store.deleteLayerFiles(id);
      saveLayers((prev) => prev.filter((l) => l.id !== id));
    },
    [saveLayers],
  );

  const addTrack = useCallback((meta: TrackMeta) => saveTracks((prev) => [meta, ...prev]), [saveTracks]);
  const removeTrack = useCallback(
    (id: string) => {
      store.deleteTrackFiles(id);
      saveTracks((prev) => prev.filter((t) => t.id !== id));
    },
    [saveTracks],
  );
  const renameTrack = useCallback(
    (id: string, name: string) => saveTracks((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t))),
    [saveTracks],
  );

  const value = useMemo(
    () => ({ layers, layerFeatures, addLayer, updateLayer, removeLayer, tracks, addTrack, removeTrack, renameTrack, focus, focusOn }),
    [layers, layerFeatures, addLayer, updateLayer, removeLayer, tracks, addTrack, removeTrack, renameTrack, focus, focusOn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
