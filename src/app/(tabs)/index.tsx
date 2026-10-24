import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BasemapPicker } from '../../components/BasemapPicker';
import { BasemapTiles, ImportedLayers } from '../../components/MapContent';
import { colors } from '../../components/theme';
import { formatAlt, formatCoord, formatDistance, formatDuration } from '../../geo/format';
import { bearing, haversine, trackStats } from '../../geo/measure';
import type { TrackPoint } from '../../geo/types';
import { useData } from '../../state/data';
import { useLocation } from '../../state/location';
import { useSettings } from '../../state/settings';

// Opens centred on Mongolia.
const INITIAL_REGION = { latitude: 46.9, longitude: 103.8, latitudeDelta: 14, longitudeDelta: 22 };

export default function MapScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { settings, basemap } = useSettings();
  const { layers, layerFeatures, focus } = useData();
  const loc = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<LatLng | null>(null);
  const [now, setNow] = useState(Date.now());
  const centeredOnce = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tick once a second while recording so the timer updates.
  useEffect(() => {
    if (!loc.recording) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [loc.recording]);

  // Zoom to an imported layer or a track when another screen asks for it.
  useEffect(() => {
    if (!focus || !mapReady) return;
    const { minLat, minLon, maxLat, maxLon } = focus.bbox;
    mapRef.current?.fitToCoordinates(
      [
        { latitude: minLat, longitude: minLon },
        { latitude: maxLat, longitude: maxLon },
      ],
      { edgePadding: { top: 80, right: 60, bottom: 220, left: 60 }, animated: true },
    );
  }, [focus, mapReady]);

  // Jump to the user's position the first time GPS gives a fix (unless a layer focus happened).
  useEffect(() => {
    if (!loc.current || !mapReady || centeredOnce.current || focus) return;
    centeredOnce.current = true;
    mapRef.current?.animateToRegion(
      { latitude: loc.current.lat, longitude: loc.current.lon, latitudeDelta: 0.05, longitudeDelta: 0.05 },
      600,
    );
  }, [loc.current, mapReady, focus]);

  const centerOnMe = () => {
    if (!loc.current) return;
    mapRef.current?.animateCamera({ center: { latitude: loc.current.lat, longitude: loc.current.lon } }, { duration: 400 });
  };

  const toggleRecording = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!loc.recording) {
        await loc.startRecording();
        return;
      }
      finishRecording(await loc.stopRecording());
    } finally {
      setBusy(false);
    }
  };

  const finishRecording = (pts: TrackPoint[]) => {
    if (pts.length < 2) {
      Alert.alert(t('map.saveTrackTitle'), t('map.tooShort'));
      loc.discardRecording();
      return;
    }
    const s = trackStats(pts);
    const name = t('tracks.untitled', { date: new Date(pts[0].t).toLocaleString() });
    Alert.alert(
      t('map.saveTrackTitle'),
      t('map.saveTrackMessage', { distance: formatDistance(s.distanceM), duration: formatDuration(s.durationS) }),
      [
        { text: t('map.discard'), style: 'destructive', onPress: loc.discardRecording },
        { text: t('common.save'), onPress: () => loc.saveRecording(name) },
      ],
    );
  };

  const cur = loc.current;
  const stats = loc.recording ? trackStats(loc.points) : null;
  const elapsed = loc.recording && loc.points.length > 0 ? (now - loc.points[0].t) / 1000 : 0;

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={styles.fill}
        initialRegion={INITIAL_REGION}
        mapType={basemap.nativeType ?? 'none'}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        showsScale
        rotateEnabled
        toolbarEnabled={false}
        onMapReady={() => setMapReady(true)}
        onLongPress={(e) => setPicked(e.nativeEvent.coordinate)}
      >
        <BasemapTiles basemap={basemap} />
        <ImportedLayers layers={layers} features={layerFeatures} />
        {loc.points.length > 1 && (
          <Polyline
            coordinates={loc.points.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
            strokeColor={colors.record}
            strokeWidth={4}
          />
        )}
        {picked && <Marker coordinate={picked} pinColor="#ff9800" onPress={() => setPicked(null)} />}
      </MapView>

      <View style={[styles.sideButtons, { top: insets.top + 12 }]}>
        <RoundButton icon="layers-outline" onPress={() => setPickerOpen(true)} label={t('map.basemaps')} />
        <RoundButton icon="crosshairs-gps" onPress={centerOnMe} label={t('map.centerMe')} />
      </View>

      {picked && (
        <View style={[styles.pickedCard, { top: insets.top + 12 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>{t('map.pointInfo')}</Text>
            <Pressable onPress={() => setPicked(null)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.mono}>{formatCoord(picked.latitude, picked.longitude, settings.coordFormat)}</Text>
          {cur && (
            <Text style={styles.small}>
              {t('map.fromMe')}: {formatDistance(haversine(cur.lat, cur.lon, picked.latitude, picked.longitude))} ·{' '}
              {t('map.bearing')}: {bearing(cur.lat, cur.lon, picked.latitude, picked.longitude).toFixed(0)}°
            </Text>
          )}
        </View>
      )}

      <View style={styles.panel}>
        {loc.permission === 'denied' ? (
          <Text style={styles.small}>{t('map.permissionDenied')}</Text>
        ) : cur ? (
          <>
            <Text style={styles.mono}>{formatCoord(cur.lat, cur.lon, settings.coordFormat)}</Text>
            <View style={styles.statsRow}>
              <Stat label={t('map.altitude')} value={formatAlt(cur.alt)} />
              <Stat label={t('map.accuracy')} value={cur.acc != null ? `±${cur.acc.toFixed(0)} m` : '—'} />
              <Stat label={t('map.speed')} value={cur.speed != null ? `${(cur.speed * 3.6).toFixed(1)} km/h` : '—'} />
            </View>
          </>
        ) : (
          <Text style={styles.small}>{t('map.waitingGps')}</Text>
        )}

        {stats && (
          <View style={styles.statsRow}>
            <Stat label={t('map.distance')} value={formatDistance(stats.distanceM)} />
            <Stat label={t('map.duration')} value={formatDuration(elapsed)} />
            <Stat label={t('tracks.ascent')} value={`${stats.ascentM.toFixed(0)} m`} />
          </View>
        )}

        <Pressable
          onPress={toggleRecording}
          disabled={loc.permission !== 'granted' || busy}
          style={[styles.recordBtn, loc.recording && { backgroundColor: colors.record }]}
        >
          <MaterialCommunityIcons name={loc.recording ? 'stop' : 'record-circle-outline'} size={20} color="#fff" />
          <Text style={styles.recordText}>{loc.recording ? t('map.stop') : t('map.record')}</Text>
        </Pressable>
        {loc.recordingMode && (
          <Text style={[styles.small, { textAlign: 'center', marginTop: 6 }]}>
            {loc.recordingMode === 'background' ? t('map.backgroundOn') : t('map.backgroundOff')}
          </Text>
        )}
        {!picked && !loc.recording && <Text style={[styles.small, { textAlign: 'center', marginTop: 6 }]}>{t('map.longPressHint')}</Text>}
      </View>

      <BasemapPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function RoundButton({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable onPress={onPress} style={styles.roundBtn} accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sideButtons: { position: 'absolute', right: 12, gap: 10 },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pickedCard: {
    position: 'absolute',
    left: 12,
    right: 70,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    elevation: 3,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '600', color: colors.text },
  panel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 12,
    padding: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 15, color: colors.text, marginBottom: 4 },
  small: { fontSize: 12, color: colors.muted },
  statsRow: { flexDirection: 'row', marginTop: 6 },
  statLabel: { fontSize: 11, color: colors.muted },
  statValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  recordBtn: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
  },
  recordText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
