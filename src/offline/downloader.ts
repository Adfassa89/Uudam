import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { DEM_CACHE_ID, DEM_TEMPLATE, DEM_ZOOM } from '../elevation/dem';
import type { BBox } from '../geo/types';
import type { Basemap } from '../maps/basemaps';
import { newId, tileCacheDir } from '../storage/files';
import { cacheRow, countTiles, iterateTiles, tileInArea, tileUrl } from './tiles';

/**
 * Downloads every tile of a map area into the same folder the map reads its
 * tile cache from (<cache>/{z}/{x}/{y}), so the area works without internet.
 * Runs one area at a time; progress is shared with any screen via `subscribe`.
 */

export type AreaStatus = 'downloading' | 'partial' | 'done';

export interface OfflineArea {
  id: string;
  name: string;
  basemapId: string;
  bbox: BBox;
  minZoom: number;
  maxZoom: number;
  /** Tiles to fetch, counting the label overlay layer if the map has one. */
  tileCount: number;
  doneCount: number;
  failedCount: number;
  bytes: number;
  createdAt: number;
  status: AreaStatus;
}

/** Low zoom levels cost only a few tiles and make the area findable when zoomed out. */
export const OFFLINE_MIN_ZOOM = 3;
/** Hard limit per area (≈ 0.5–1 GB of satellite imagery). */
export const MAX_AREA_TILES = 30_000;
/** Rough average tile size, used only for the size estimate shown before downloading. */
export const AVG_TILE_BYTES = 20_000;
/** Parallel requests — kept low to be polite to the free tile servers. */
const CONCURRENCY = 4;

export const canDownload = (b: Basemap) => !!b.tiles && !b.noBulkDownload;

interface TileLayer {
  template: string;
  /** Cache folder; must match MapContent / elevation/dem.ts. */
  cacheId: string;
  tms: boolean;
  /** Download only this zoom level (elevation data) instead of the area's range. */
  fixedZoom?: number;
  /** Shared by every map, so deleting one area must not remove it. */
  shared?: boolean;
}

/** Everything an offline area needs: the map's tile layers plus terrain elevation tiles. */
export function tileLayers(b: Basemap): TileLayer[] {
  const layers: TileLayer[] = b.tiles ? [{ template: b.tiles, cacheId: b.id, tms: !!b.tms }] : [];
  if (b.overlay) layers.push({ template: b.overlay, cacheId: `${b.id}-overlay`, tms: !!b.tms });
  layers.push({ template: DEM_TEMPLATE, cacheId: DEM_CACHE_ID, tms: false, fixedZoom: DEM_ZOOM, shared: true });
  return layers;
}

const zoomRange = (l: TileLayer, minZoom: number, maxZoom: number): [number, number] =>
  l.fixedZoom != null ? [l.fixedZoom, l.fixedZoom] : [minZoom, maxZoom];

export function estimateTiles(b: Basemap, bbox: BBox, maxZoom: number) {
  return tileLayers(b).reduce((n, l) => n + countTiles(bbox, ...zoomRange(l, OFFLINE_MIN_ZOOM, maxZoom)), 0);
}

// ---------- persistence ----------

function areasFile() {
  const dir = new Directory(Paths.document, 'offline');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, 'areas.json');
}

let areas: OfflineArea[] = (() => {
  try {
    const f = areasFile();
    const list = f.exists ? (JSON.parse(f.textSync()) as OfflineArea[]) : [];
    // A download that was running when the app closed can be resumed later.
    return list.map((a) => (a.status === 'downloading' ? { ...a, status: 'partial' as const } : a));
  } catch {
    return [];
  }
})();

function save() {
  areasFile().writeSync(JSON.stringify(areas));
}

// ---------- change notifications (for useSyncExternalStore) ----------

const listeners = new Set<() => void>();
let snapshot = { areas, activeId: null as string | null };

function emit() {
  snapshot = { areas, activeId: active?.areaId ?? null };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const getSnapshot = () => snapshot;

function patch(id: string, p: Partial<OfflineArea>) {
  areas = areas.map((a) => (a.id === id ? { ...a, ...p } : a));
}

// ---------- download ----------

let active: { areaId: string; cancelled: boolean } | null = null;

export function startDownload(b: Basemap, name: string, bbox: BBox, maxZoom: number): OfflineArea {
  const area: OfflineArea = {
    id: newId(),
    name,
    basemapId: b.id,
    bbox,
    minZoom: OFFLINE_MIN_ZOOM,
    maxZoom,
    tileCount: estimateTiles(b, bbox, maxZoom),
    doneCount: 0,
    failedCount: 0,
    bytes: 0,
    createdAt: Date.now(),
    status: 'downloading',
  };
  areas = [area, ...areas];
  save();
  void run(area, b);
  return area;
}

/** Continues an interrupted download; tiles already on the phone are skipped. */
export function resumeDownload(areaId: string, b: Basemap) {
  const area = areas.find((a) => a.id === areaId);
  if (!area || active) return;
  void run(area, b);
}

export function cancelDownload() {
  if (active) active.cancelled = true;
}

async function run(area: OfflineArea, b: Basemap) {
  if (active) return;
  active = { areaId: area.id, cancelled: false };
  const job = active;
  let done = 0;
  let failed = 0;
  let bytes = 0;
  patch(area.id, { status: 'downloading', doneCount: 0, failedCount: 0, bytes: 0 });
  emit();

  const createdDirs = new Set<string>();
  const layers = tileLayers(b).map((l) => ({ ...l, dir: tileCacheDir(l.cacheId) }));
  function* jobs() {
    for (const layer of layers)
      for (const t of iterateTiles(area.bbox, ...zoomRange(layer, area.minZoom, area.maxZoom))) yield { layer, ...t };
  }
  const queue = jobs();

  let lastEmit = 0;
  const progress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 400) return;
    lastEmit = now;
    patch(area.id, { doneCount: done, failedCount: failed, bytes });
    emit();
  };

  async function fetchTile(url: string, file: File) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await File.downloadFileAsync(url, file, { idempotent: true, headers: { 'User-Agent': 'Uudam/1.0 (mobile)' } });
        return true;
      } catch {
        // retry once, then count as failed
      }
    }
    return false;
  }

  async function worker() {
    for (let next = queue.next(); !next.done; next = queue.next()) {
      if (job.cancelled) return;
      const { layer, z, x, y } = next.value;
      const dirPath = `${z}/${x}`;
      const dirKey = `${layer.cacheId}/${dirPath}`;
      const dir = new Directory(layer.dir, dirPath);
      if (!createdDirs.has(dirKey)) {
        if (!dir.exists) dir.create({ intermediates: true });
        createdDirs.add(dirKey);
      }
      const file = new File(dir, String(cacheRow(y, z, layer.tms, Platform.OS)));
      if (file.exists) {
        done++;
        bytes += file.size ?? 0;
      } else if (await fetchTile(tileUrl(layer.template, z, x, y, layer.tms), file)) {
        done++;
        bytes += file.size ?? 0;
      } else {
        failed++;
      }
      progress();
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    const complete = !job.cancelled && failed === 0;
    patch(area.id, { doneCount: done, failedCount: failed, bytes, status: complete ? 'done' : 'partial' });
    active = null;
    save();
    progress(true);
  }
}

// ---------- delete ----------

/**
 * Removes an area's tiles, except tiles that another saved area of the same
 * map also needs. Tiles viewed normally are part of the cache and may be removed too.
 */
export async function deleteArea(areaId: string, b: Basemap | undefined) {
  const area = areas.find((a) => a.id === areaId);
  if (!area || active?.areaId === areaId) return;
  areas = areas.filter((a) => a.id !== areaId);
  save();
  emit();
  if (!b) return;
  const others = areas.filter((a) => a.basemapId === area.basemapId);
  let n = 0;
  for (const layer of tileLayers(b)) {
    if (layer.shared) continue;
    const root = tileCacheDir(layer.cacheId);
    for (const t of iterateTiles(area.bbox, area.minZoom, area.maxZoom)) {
      if (others.some((o) => tileInArea(t, o))) continue;
      const f = new File(root, `${t.z}/${t.x}/${cacheRow(t.y, t.z, layer.tms, Platform.OS)}`);
      if (f.exists) f.delete();
      // Yield now and then so the screen stays responsive during big deletes.
      if (++n % 500 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }
}

/** Used by "Clear cached tiles": the tiles are gone, so the area list is too. */
export function forgetAllAreas() {
  cancelDownload();
  areas = [];
  save();
  emit();
}
