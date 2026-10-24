import type { MapType } from 'react-native-maps';

export type BasemapCategory = 'satellite' | 'street' | 'topo' | 'military' | 'custom';

export interface Basemap {
  id: string;
  /** Translation key under "basemaps." — or a literal name for user-added maps. */
  nameKey?: string;
  name?: string;
  category: BasemapCategory;
  /**
   * Either a raster tile URL template ({z}/{x}/{y}) drawn on top of an empty map,
   * or a built-in map type supplied by the phone (Google Maps on Android, Apple Maps on iOS).
   */
  tiles?: string;
  nativeType?: MapType;
  /** A second tile layer drawn on top (e.g. place names over satellite imagery). */
  overlay?: string;
  maxZoom?: number;
  /** Tile servers using TMS numbering (y axis flipped). */
  tms?: boolean;
  attribution: string;
  /** Only works on this platform. */
  platform?: 'android' | 'ios';
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/**
 * Built-in base maps.
 *
 * IMPORTANT before publishing the app: every tile provider has its own terms of
 * use. The free Esri / OpenStreetMap / OpenTopoMap servers are fine for
 * development and light personal use, but a published app with many users must
 * use a paid plan or its own tile server. See docs/MAPS.md.
 */
export const BASEMAPS: Basemap[] = [
  // ---- Satellite ----
  {
    id: 'esri-imagery',
    nameKey: 'esriImagery',
    category: 'satellite',
    tiles: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    maxZoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'esri-hybrid',
    nameKey: 'esriHybrid',
    category: 'satellite',
    tiles: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    overlay: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    maxZoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'native-satellite',
    nameKey: 'nativeSatellite',
    category: 'satellite',
    nativeType: 'satellite',
    attribution: 'Google / Apple',
  },
  {
    id: 'native-hybrid',
    nameKey: 'nativeHybrid',
    category: 'satellite',
    nativeType: 'hybrid',
    attribution: 'Google / Apple',
  },
  {
    id: 's2cloudless',
    nameKey: 'sentinel2',
    category: 'satellite',
    tiles: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
    maxZoom: 15,
    attribution: 'Sentinel-2 cloudless by EOX (Copernicus Sentinel data 2016)',
  },

  // ---- Street ----
  {
    id: 'osm',
    nameKey: 'osm',
    category: 'street',
    tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'carto-voyager',
    nameKey: 'cartoVoyager',
    category: 'street',
    tiles: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors, © CARTO',
  },
  {
    id: 'esri-street',
    nameKey: 'esriStreet',
    category: 'street',
    tiles: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    maxZoom: 19,
    attribution: 'Esri, HERE, Garmin, OpenStreetMap contributors',
  },
  {
    id: 'native-standard',
    nameKey: 'nativeStandard',
    category: 'street',
    nativeType: 'standard',
    attribution: 'Google / Apple',
  },

  // ---- Topographic / landscape ----
  {
    id: 'opentopomap',
    nameKey: 'openTopoMap',
    category: 'topo',
    tiles: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
    attribution: '© OpenStreetMap contributors, SRTM, © OpenTopoMap (CC-BY-SA)',
  },
  {
    id: 'esri-topo',
    nameKey: 'esriTopo',
    category: 'topo',
    tiles: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    maxZoom: 19,
    attribution: 'Esri, HERE, Garmin, USGS, NGA',
  },
  {
    id: 'esri-relief',
    nameKey: 'esriRelief',
    category: 'topo',
    tiles: `${ESRI}/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}`,
    maxZoom: 13,
    attribution: 'Esri, USGS, NASA',
  },
  {
    id: 'esri-natgeo',
    nameKey: 'esriNatGeo',
    category: 'topo',
    tiles: `${ESRI}/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}`,
    maxZoom: 16,
    attribution: 'National Geographic, Esri, Garmin, HERE, UNEP-WCMC, USGS, NASA',
  },
  {
    id: 'native-terrain',
    nameKey: 'nativeTerrain',
    category: 'topo',
    nativeType: 'terrain',
    platform: 'android',
    attribution: 'Google',
  },

  // ---- Military (Soviet General Staff topographic maps) ----
  // Hosted by the nakarte.me project. These are scans of the 1:1 000 000 – 1:250 000
  // Soviet military maps, which cover Mongolia well. Check their terms before
  // publishing; for production, host your own copy (see docs/MAPS.md).
  {
    id: 'ggc-2km',
    nameKey: 'ggc2km',
    category: 'military',
    tiles: 'https://a.tiles.nakarte.me/ggc2000/{z}/{x}/{y}',
    tms: true,
    maxZoom: 12,
    attribution: 'Soviet General Staff maps, tiles by nakarte.me',
  },
  {
    id: 'ggc-1km',
    nameKey: 'ggc1km',
    category: 'military',
    tiles: 'https://a.tiles.nakarte.me/ggc1000/{z}/{x}/{y}',
    tms: true,
    maxZoom: 13,
    attribution: 'Soviet General Staff maps, tiles by nakarte.me',
  },
  {
    id: 'ggc-500m',
    nameKey: 'ggc500m',
    category: 'military',
    tiles: 'https://a.tiles.nakarte.me/ggc500/{z}/{x}/{y}',
    tms: true,
    maxZoom: 14,
    attribution: 'Soviet General Staff maps, tiles by nakarte.me',
  },
  {
    id: 'ggc-250m',
    nameKey: 'ggc250m',
    category: 'military',
    tiles: 'https://a.tiles.nakarte.me/ggc250/{z}/{x}/{y}',
    tms: true,
    maxZoom: 15,
    attribution: 'Soviet General Staff maps, tiles by nakarte.me',
  },
];

export const DEFAULT_BASEMAP_ID = 'esri-hybrid';

export const CATEGORY_ORDER: BasemapCategory[] = ['satellite', 'street', 'topo', 'military', 'custom'];
