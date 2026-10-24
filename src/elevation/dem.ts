import { Directory, File } from 'expo-file-system';
import UPNG from 'upng-js';
import { tileCacheDir } from '../storage/files';
import { decodeTerrarium, sampleHeights, tilePixel } from './terrarium';

/**
 * Ground elevation from a terrain model (DEM), as opposed to GPS altitude.
 *
 * Tiles come from the free AWS Terrain Tiles dataset and are kept on the phone,
 * so once an area has been viewed or downloaded (offline areas include them)
 * elevations work without internet.
 */

export const DEM_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
/** ≈ 27 m per pixel in Mongolia — about the resolution of the source data, so no point going higher. */
export const DEM_ZOOM = 12;
export const DEM_CACHE_ID = 'dem-terrarium';
export const DEM_ATTRIBUTION = 'Terrain Tiles (AWS Open Data): SRTM/NASA, GMTED2010/USGS, ETOPO1/NOAA and others';

/** Decoded tiles kept in memory (each is 256 KB). */
const MAX_MEMORY_TILES = 12;
const memory = new Map<string, Float32Array>();
const pending = new Map<string, Promise<Float32Array | null>>();
/** Tiles that failed recently (offline, no data) aren't retried for a minute. */
const failedAt = new Map<string, number>();

function remember(key: string, heights: Float32Array) {
  memory.delete(key);
  memory.set(key, heights);
  if (memory.size > MAX_MEMORY_TILES) memory.delete(memory.keys().next().value!);
}

function tileFile(x: number, y: number) {
  // Same layout as the map tile cache (<dir>/{z}/{x}/{y}) so the area downloader can fill it too.
  return new File(new Directory(tileCacheDir(DEM_CACHE_ID), `${DEM_ZOOM}/${x}`), String(y));
}

function decodeFile(bytes: Uint8Array): Float32Array {
  const png = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return decodeTerrarium(new Uint8Array(UPNG.toRGBA8(png)[0]));
}

async function loadTile(x: number, y: number): Promise<Float32Array | null> {
  const key = `${x}/${y}`;
  const hit = memory.get(key);
  if (hit) {
    remember(key, hit);
    return hit;
  }
  if (pending.has(key)) return pending.get(key)!;
  if (Date.now() - (failedAt.get(key) ?? 0) < 60_000) return null;

  const job = (async () => {
    try {
      const file = tileFile(x, y);
      if (!file.exists) {
        file.parentDirectory.create({ intermediates: true, idempotent: true });
        const url = DEM_TEMPLATE.replace('{z}', String(DEM_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y));
        await File.downloadFileAsync(url, file, { idempotent: true });
      }
      const heights = decodeFile(await file.bytes());
      remember(key, heights);
      return heights;
    } catch {
      failedAt.set(key, Date.now());
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, job);
  return job;
}

/** Terrain elevation in metres above sea level, or null if unavailable (offline and not cached). */
export async function terrainElevation(lat: number, lon: number): Promise<number | null> {
  const { x, y, px, py } = tilePixel(lat, lon, DEM_ZOOM);
  const tile = await loadTile(x, y);
  return tile ? sampleHeights(tile, px, py) : null;
}

/** Elevations for many points (e.g. a whole route); tiles are shared between points. */
export async function terrainElevations(points: { lat: number; lon: number }[]): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (const p of points) out.push(await terrainElevation(p.lat, p.lon));
  return out;
}
