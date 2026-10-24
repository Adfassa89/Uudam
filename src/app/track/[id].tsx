import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ElevationChart } from '../../components/ElevationChart';
import { BasemapTiles } from '../../components/MapContent';
import { colors, ui } from '../../components/theme';
import { terrainElevations } from '../../elevation/dem';
import { formatAlt, formatCoord, formatDistance, formatDuration } from '../../geo/format';
import { trackStats } from '../../geo/measure';
import type { TrackPoint } from '../../geo/types';
import { useData } from '../../state/data';
import { useSettings } from '../../state/settings';
import { loadTrackPoints, writeExportFile } from '../../storage/files';
import { toGpx, toKml } from '../../tracking/export';

/** Terrain heights are looked up for at most this many points (evenly spaced). */
const MAX_TERRAIN_POINTS = 1500;

/** Log rows are thinned to at most this many so the list stays fast on long routes. */
const MAX_LOG_ROWS = 500;

export default function TrackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { tracks, removeTrack, focusOn } = useData();
  const { settings, basemap } = useSettings();
  const mapRef = useRef<MapView>(null);
  const meta = tracks.find((tr) => tr.id === id);
  const points = useMemo(() => (id ? loadTrackPoints(id) : []), [id]);
  // Elevation source: GPS as recorded, or the terrain model along the route.
  const [source, setSource] = useState<'gps' | 'terrain'>('gps');
  const [terrainPoints, setTerrainPoints] = useState<TrackPoint[] | null>(null);
  const [terrainState, setTerrainState] = useState<'idle' | 'loading' | 'failed'>('idle');
  useEffect(() => {
    if (source !== 'terrain' || terrainPoints || points.length === 0) return;
    let cancelled = false;
    setTerrainState('loading');
    const step = Math.max(1, Math.ceil(points.length / MAX_TERRAIN_POINTS));
    const sample = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    terrainElevations(sample).then((alts) => {
      if (cancelled) return;
      if (alts.every((a) => a == null)) {
        setTerrainState('failed');
        return;
      }
      setTerrainPoints(sample.map((p, i) => ({ ...p, alt: alts[i] })));
      setTerrainState('idle');
    });
    return () => {
      cancelled = true;
    };
  }, [source, terrainPoints, points]);
  const profilePoints = source === 'terrain' && terrainPoints ? terrainPoints : points;
  const gpsStats = useMemo(() => trackStats(points), [points]);
  const profileStats = useMemo(() => trackStats(profilePoints), [profilePoints]);
  // Distance and time always come from the full GPS track; heights from the chosen source.
  const stats = { ...gpsStats, ascentM: profileStats.ascentM, descentM: profileStats.descentM, minAlt: profileStats.minAlt, maxAlt: profileStats.maxAlt };
  const coords = useMemo(() => points.map((p) => ({ latitude: p.lat, longitude: p.lon })), [points]);
  const logRows = useMemo(() => {
    const step = Math.max(1, Math.ceil(points.length / MAX_LOG_ROWS));
    return points.filter((_, i) => i % step === 0 || i === points.length - 1);
  }, [points]);

  if (!meta) return <Text style={[ui.muted, { margin: 16 }]}>—</Text>;

  const share = async (format: 'gpx' | 'kml') => {
    const safe = meta.name.replace(/[\\/:*?"<>|\s]+/g, '_');
    const uri = writeExportFile(`${safe}.${format}`, format === 'gpx' ? toGpx(meta.name, points) : toKml(meta.name, points));
    await Sharing.shareAsync(uri, {
      mimeType: format === 'gpx' ? 'application/gpx+xml' : 'application/vnd.google-earth.kml+xml',
      dialogTitle: meta.name,
    });
  };

  const del = () =>
    Alert.alert(t('tracks.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          removeTrack(meta.id);
          router.back();
        },
      },
    ]);

  const showOnMap = () => {
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    focusOn({ minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) });
    router.navigate('/');
  };

  const header = (
    <View>
      <View style={styles.mapBox}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          mapType={basemap.nativeType ?? 'none'}
          initialRegion={
            points.length
              ? { latitude: points[0].lat, longitude: points[0].lon, latitudeDelta: 0.02, longitudeDelta: 0.02 }
              : undefined
          }
          onMapReady={() => {
            if (coords.length > 1)
              mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 30, right: 30, bottom: 30, left: 30 }, animated: false });
          }}
        >
          <BasemapTiles basemap={basemap} />
          <Polyline coordinates={coords} strokeColor={colors.record} strokeWidth={4} />
          {coords.length > 0 && <Marker coordinate={coords[0]} pinColor="green" />}
          {coords.length > 1 && <Marker coordinate={coords[coords.length - 1]} pinColor="red" />}
        </MapView>
      </View>

      <View style={ui.card}>
        <Grid
          items={[
            [t('map.distance'), formatDistance(stats.distanceM)],
            [t('map.duration'), formatDuration(stats.durationS)],
            [t('tracks.ascent'), `${stats.ascentM.toFixed(0)} m`],
            [t('tracks.descent'), `${stats.descentM.toFixed(0)} m`],
            [t('tracks.minAlt'), formatAlt(stats.minAlt)],
            [t('tracks.maxAlt'), formatAlt(stats.maxAlt)],
            [t('tracks.avgSpeed'), `${stats.avgSpeedKmh.toFixed(1)} km/h`],
            [t('tracks.maxSpeed'), `${stats.maxSpeedKmh.toFixed(1)} km/h`],
            [t('tracks.startedAt'), new Date(meta.startedAt).toLocaleString()],
            [t('tracks.points'), String(points.length)],
          ]}
        />
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>{t('tracks.elevationProfile')}</Text>
        <View style={[ui.row, { marginBottom: 8 }]}>
          {(['gps', 'terrain'] as const).map((s) => (
            <Pressable key={s} onPress={() => setSource(s)} style={[ui.chip, source === s && ui.chipActive]}>
              <Text style={[ui.chipText, source === s && ui.chipTextActive]}>{t(`tracks.source_${s}`)}</Text>
            </Pressable>
          ))}
        </View>
        {source === 'terrain' && terrainState === 'loading' && <Text style={ui.muted}>{t('tracks.terrainLoading')}</Text>}
        {source === 'terrain' && terrainState === 'failed' && <Text style={ui.muted}>{t('tracks.terrainFailed')}</Text>}
        <ElevationChart points={profilePoints} emptyText={t('tracks.noElevation')} />
        {source === 'terrain' && <Text style={[ui.muted, { marginTop: 6 }]}>{t('elevation.terrainNote')}</Text>}
      </View>

      <View style={[ui.row, { gap: 8, marginHorizontal: 12, marginTop: 12, flexWrap: 'wrap' }]}>
        <Pressable style={ui.button} onPress={showOnMap}>
          <Text style={ui.buttonText}>{t('layers.zoomTo')}</Text>
        </Pressable>
        <Pressable style={ui.outlineButton} onPress={() => share('gpx')}>
          <Text style={ui.outlineButtonText}>{t('tracks.exportGpx')}</Text>
        </Pressable>
        <Pressable style={ui.outlineButton} onPress={() => share('kml')}>
          <Text style={ui.outlineButtonText}>{t('tracks.exportKml')}</Text>
        </Pressable>
        <Pressable style={[ui.outlineButton, { borderColor: colors.danger }]} onPress={del}>
          <Text style={[ui.outlineButtonText, { color: colors.danger }]}>{t('common.delete')}</Text>
        </Pressable>
      </View>

      <Text style={[ui.h2, { marginHorizontal: 16, marginTop: 16 }]}>{t('tracks.timeline')}</Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: meta.name }} />
      <FlatList
        style={ui.screen}
        data={logRows}
        keyExtractor={(p) => String(p.t)}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => <LogRow p={item} format={settings.coordFormat} />}
      />
    </>
  );
}

function LogRow({ p, format }: { p: TrackPoint; format: Parameters<typeof formatCoord>[2] }) {
  return (
    <View style={styles.logRow}>
      <Text style={styles.logTime}>{new Date(p.t).toLocaleTimeString()}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.logText}>{formatCoord(p.lat, p.lon, format)}</Text>
        <Text style={ui.muted}>
          {formatAlt(p.alt)}
          {p.speed != null ? ` · ${(p.speed * 3.6).toFixed(1)} km/h` : ''}
          {p.acc != null ? ` · ±${p.acc.toFixed(0)} m` : ''}
        </Text>
      </View>
    </View>
  );
}

function Grid({ items }: { items: [string, string][] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {items.map(([label, value]) => (
        <View key={label} style={{ width: '50%', paddingVertical: 6 }}>
          <Text style={ui.muted}>{label}</Text>
          <Text style={[ui.text, { fontWeight: '600' }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  mapBox: { height: 260, backgroundColor: '#ddd' },
  logRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  logTime: { width: 70, color: colors.muted, fontSize: 13 },
  logText: { fontSize: 13, color: colors.text },
});
