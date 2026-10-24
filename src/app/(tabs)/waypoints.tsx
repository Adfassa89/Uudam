import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { colors, ui } from '../../components/theme';
import { WaypointDialog, type WaypointDraft } from '../../components/WaypointDialog';
import { cardinal, formatAlt, formatCoord, formatDistance } from '../../geo/format';
import { bearing, haversine } from '../../geo/measure';
import { useData } from '../../state/data';
import { useLocation } from '../../state/location';
import { useSettings } from '../../state/settings';
import { writeExportFile, type Waypoint } from '../../storage/files';
import { waypointsToGpx, waypointsToKml } from '../../tracking/export';

/** Saved points, nearest first, with navigate / show / edit / delete. */
export default function WaypointsScreen() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { waypoints, removeWaypoint, setNavTarget, navTarget, focusOn } = useData();
  const { current } = useLocation();
  const [draft, setDraft] = useState<WaypointDraft | null>(null);

  const dist = (w: Waypoint) => (current ? haversine(current.lat, current.lon, w.lat, w.lon) : null);
  const sorted = current ? [...waypoints].sort((a, b) => dist(a)! - dist(b)!) : waypoints;

  const navigate = (w: Waypoint) => {
    setNavTarget({ name: w.name, lat: w.lat, lon: w.lon, alt: w.alt, waypointId: w.id });
    showOnMap(w);
  };

  const showOnMap = (w: Waypoint) => {
    const d = 0.002; // ≈ 200 m around the point
    focusOn({ minLat: w.lat - d, maxLat: w.lat + d, minLon: w.lon - d, maxLon: w.lon + d });
    router.navigate('/');
  };

  const confirmDelete = (w: Waypoint) =>
    Alert.alert(t('waypoints.deleteConfirm', { name: w.name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeWaypoint(w.id) },
    ]);

  const exportAll = () =>
    Alert.alert(t('waypoints.export'), undefined, [
      { text: 'GPX', onPress: () => share('gpx') },
      { text: 'KML', onPress: () => share('kml') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const share = async (format: 'gpx' | 'kml') => {
    const name = t('tabs.waypoints');
    const content = format === 'gpx' ? waypointsToGpx(waypoints) : waypointsToKml(name, waypoints);
    const uri = writeExportFile(`uudam-waypoints.${format}`, content);
    await Sharing.shareAsync(uri, {
      mimeType: format === 'gpx' ? 'application/gpx+xml' : 'application/vnd.google-earth.kml+xml',
      dialogTitle: name,
    });
  };

  return (
    <View style={ui.screen}>
      <View style={[ui.card, ui.row, { gap: 10 }]}>
        <Pressable
          style={[ui.button, { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}
          onPress={() => setDraft({})}
        >
          <MaterialCommunityIcons name="map-marker-plus-outline" size={20} color="#fff" />
          <Text style={ui.buttonText}>{t('waypoints.add')}</Text>
        </Pressable>
        <Pressable
          style={[ui.outlineButton, waypoints.length === 0 && { opacity: 0.4 }]}
          disabled={waypoints.length === 0}
          onPress={exportAll}
        >
          <Text style={ui.outlineButtonText}>{t('waypoints.export')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Text style={[ui.muted, { margin: 16 }]}>{t('waypoints.empty')}</Text>}
        renderItem={({ item }) => {
          const d = dist(item);
          const isTarget = navTarget?.waypointId === item.id;
          return (
            <View style={[ui.card, isTarget && { borderLeftWidth: 4, borderLeftColor: colors.nav }]}>
              <Text style={[ui.text, { fontWeight: '600' }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={ui.muted}>
                {formatCoord(item.lat, item.lon, settings.coordFormat)}
                {item.alt != null ? ` · ${formatAlt(item.alt)}` : ''}
              </Text>
              {d != null && current && (
                <Text style={ui.text}>
                  {formatDistance(d)} · {bearing(current.lat, current.lon, item.lat, item.lon).toFixed(0)}°{' '}
                  {cardinal(bearing(current.lat, current.lon, item.lat, item.lon))}
                </Text>
              )}
              {item.note ? <Text style={[ui.muted, { marginTop: 2 }]}>{item.note}</Text> : null}
              <View style={[ui.row, { gap: 16, marginTop: 8, flexWrap: 'wrap' }]}>
                <Pressable onPress={() => navigate(item)}>
                  <Text style={{ color: colors.nav, fontWeight: '600' }}>{t('nav.navigate')}</Text>
                </Pressable>
                <Pressable onPress={() => showOnMap(item)}>
                  <Text style={{ color: colors.primary }}>{t('layers.zoomTo')}</Text>
                </Pressable>
                <Pressable onPress={() => setDraft(item)}>
                  <Text style={{ color: colors.primary }}>{t('waypoints.edit')}</Text>
                </Pressable>
                <Pressable onPress={() => confirmDelete(item)}>
                  <Text style={{ color: colors.danger }}>{t('common.delete')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <WaypointDialog draft={draft} onClose={() => setDraft(null)} />
    </View>
  );
}
