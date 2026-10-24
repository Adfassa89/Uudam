import { memo } from 'react';
import { Marker, Polygon, Polyline, UrlTile } from 'react-native-maps';
import { indexFor, type View } from '../geo/lod';
import type { Geometry, LonLat, MapFeature } from '../geo/types';
import type { Basemap } from '../maps/basemaps';
import type { LayerMeta, Waypoint } from '../storage/files';
import { tileCacheDir } from '../storage/files';
import { colors } from './theme';

/**
 * Phones slow down badly with many thousands of map shapes, so at most this many
 * are drawn at once — chosen from what is on screen (see geo/lod.ts).
 */
export const MAX_DRAWN_FEATURES = 3000;
/** Pins are much heavier to draw than lines, so they get a smaller budget. */
const MAX_DRAWN_POINTS = 300;

const toLatLng = ([lon, lat]: LonLat) => ({ latitude: lat, longitude: lon });

/** Raster tiles of the selected base map (+ optional label overlay). */
export const BasemapTiles = memo(function BasemapTiles({ basemap }: { basemap: Basemap }) {
  if (!basemap.tiles) return null;
  const common = {
    maximumZ: 22,
    maximumNativeZ: basemap.maxZoom ?? 19,
    flipY: basemap.tms ?? false,
    shouldReplaceMapContent: true,
    // Viewed and downloaded tiles are kept on disk so they also show without internet.
    tileCachePath: tileCacheDir(basemap.id),
    tileCacheMaxAge: 60 * 60 * 24 * 30,
  };
  return (
    <>
      <UrlTile key={basemap.id} urlTemplate={basemap.tiles} zIndex={-2} {...common} />
      {basemap.overlay ? (
        <UrlTile
          key={`${basemap.id}-overlay`}
          urlTemplate={basemap.overlay}
          zIndex={-1}
          {...common}
          tileCachePath={tileCacheDir(`${basemap.id}-overlay`)}
        />
      ) : null}
    </>
  );
});

function FeatureShape({ f, geom, color }: { f: MapFeature; geom: Geometry; color: string }) {
  const c = f.color ?? color;
  switch (geom.kind) {
    case 'point':
      return (
        <Marker
          coordinate={toLatLng(geom.coord)}
          title={f.name}
          description={f.elevation != null ? `${f.elevation.toFixed(1)} m` : f.description}
          pinColor={c}
          tracksViewChanges={false}
        />
      );
    case 'line':
      return <Polyline coordinates={geom.coords.map(toLatLng)} strokeColor={c} strokeWidth={2} tappable={false} />;
    case 'polygon':
      return (
        <Polygon
          coordinates={geom.rings[0].map(toLatLng)}
          holes={geom.rings.slice(1).map((r) => r.map(toLatLng))}
          strokeColor={c}
          fillColor={`${c}33`}
          strokeWidth={2}
        />
      );
  }
}

/**
 * All visible imported layers (KML, DXF…), limited to what is on screen and
 * simplified for the zoom level. Re-queried only when the map stops moving.
 */
export const ImportedLayers = memo(function ImportedLayers({
  layers,
  features,
  view,
}: {
  layers: LayerMeta[];
  features: Record<string, MapFeature[]>;
  view: View;
}) {
  let budget = MAX_DRAWN_FEATURES;
  let pointBudget = MAX_DRAWN_POINTS;
  const out = [];
  for (const layer of layers) {
    const list = layer.visible ? features[layer.id] : undefined;
    if (!list || budget <= 0) continue;
    const { items } = indexFor(list).query(view, budget, pointBudget);
    for (const it of items) {
      if (it.geom.kind === 'point') pointBudget--;
      else budget--;
      out.push(<FeatureShape key={`${layer.id}-${it.index}`} f={it.feature} geom={it.geom} color={layer.color} />);
    }
  }
  return <>{out}</>;
});

/** Saved waypoints; tapping a pin's label starts navigation to it. */
export const WaypointMarkers = memo(function WaypointMarkers({
  waypoints,
  hint,
  onNavigate,
}: {
  waypoints: Waypoint[];
  /** Text under the name in the pin's label, e.g. "Tap to navigate". */
  hint: string;
  onNavigate: (w: Waypoint) => void;
}) {
  return (
    <>
      {waypoints.map((w) => (
        <Marker
          key={w.id}
          coordinate={{ latitude: w.lat, longitude: w.lon }}
          title={w.name}
          description={hint}
          pinColor={colors.nav}
          tracksViewChanges={false}
          onCalloutPress={() => onNavigate(w)}
        />
      ))}
    </>
  );
});
