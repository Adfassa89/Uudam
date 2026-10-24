import { memo } from 'react';
import { Platform } from 'react-native';
import { Marker, Polygon, Polyline, UrlTile } from 'react-native-maps';
import type { LonLat, MapFeature } from '../geo/types';
import type { Basemap } from '../maps/basemaps';
import type { LayerMeta } from '../storage/files';
import { tileCacheDir } from '../storage/files';

/** Phones slow down badly with many thousands of map shapes, so we cap what is drawn. */
export const MAX_DRAWN_FEATURES = 4000;
/** Pins are much heavier to draw than lines, so they get a smaller budget. */
const MAX_DRAWN_POINTS = 500;

const toLatLng = ([lon, lat]: LonLat) => ({ latitude: lat, longitude: lon });

/** Raster tiles of the selected base map (+ optional label overlay). */
export const BasemapTiles = memo(function BasemapTiles({ basemap }: { basemap: Basemap }) {
  if (!basemap.tiles) return null;
  const common = {
    maximumZ: 22,
    maximumNativeZ: basemap.maxZoom ?? 19,
    flipY: basemap.tms ?? false,
    shouldReplaceMapContent: true,
    // Android keeps viewed tiles on disk so they also show without internet.
    tileCachePath: Platform.OS === 'android' ? tileCacheDir(basemap.id) : undefined,
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
          tileCachePath={Platform.OS === 'android' ? tileCacheDir(`${basemap.id}-overlay`) : undefined}
        />
      ) : null}
    </>
  );
});

function FeatureShape({ f, color }: { f: MapFeature; color: string }) {
  const c = f.color ?? color;
  switch (f.geom.kind) {
    case 'point':
      return (
        <Marker
          coordinate={toLatLng(f.geom.coord)}
          title={f.name}
          description={f.elevation != null ? `${f.elevation.toFixed(1)} m` : f.description}
          pinColor={c}
          tracksViewChanges={false}
        />
      );
    case 'line':
      return <Polyline coordinates={f.geom.coords.map(toLatLng)} strokeColor={c} strokeWidth={2} tappable={false} />;
    case 'polygon':
      return (
        <Polygon
          coordinates={f.geom.rings[0].map(toLatLng)}
          holes={f.geom.rings.slice(1).map((r) => r.map(toLatLng))}
          strokeColor={c}
          fillColor={`${c}33`}
          strokeWidth={2}
        />
      );
  }
}

/** All visible imported layers (KML, DXF…). Memoised so GPS updates don't redraw them. */
export const ImportedLayers = memo(function ImportedLayers({
  layers,
  features,
}: {
  layers: LayerMeta[];
  features: Record<string, MapFeature[]>;
}) {
  let budget = MAX_DRAWN_FEATURES;
  let pointBudget = MAX_DRAWN_POINTS;
  const out = [];
  for (const layer of layers) {
    if (!layer.visible) continue;
    const list = features[layer.id] ?? [];
    for (let i = 0; i < list.length && budget > 0; i++) {
      if (list[i].geom.kind === 'point') {
        if (pointBudget <= 0) continue;
        pointBudget--;
      }
      budget--;
      out.push(<FeatureShape key={`${layer.id}-${i}`} f={list[i]} color={layer.color} />);
    }
  }
  return <>{out}</>;
});
