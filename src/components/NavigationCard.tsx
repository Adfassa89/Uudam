import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useTerrainElevation } from '../elevation/useTerrainElevation';
import { cardinal, formatDistance, formatDuration } from '../geo/format';
import { bearing, haversine } from '../geo/measure';
import { useData } from '../state/data';
import { useLocation } from '../state/location';
import { colors } from './theme';

/** Counts as arrived inside this radius (or the GPS accuracy, if worse). */
const ARRIVAL_RADIUS_M = 10;

/** Phone compass heading in degrees, or null if the phone has no compass. */
function useCompass(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchHeadingAsync((h) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      // Skip tiny changes so the card doesn't redraw dozens of times a second.
      setHeading((prev) => (prev == null || Math.abs(((deg - prev + 540) % 360) - 180) >= 2 ? deg : prev));
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => setHeading(null));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
  return heading;
}

/** Distance, direction and arrow to the navigation target. */
export function NavigationCard() {
  const { t } = useTranslation();
  const { navTarget, setNavTarget } = useData();
  const { current, course } = useLocation();
  const compass = useCompass(navTarget != null);
  // Height difference: stored elevation of the point if known, else the terrain model,
  // compared with the terrain model at your position (or GPS when the model is unavailable).
  const targetTerrain = useTerrainElevation(navTarget?.lat, navTarget?.lon);
  const myTerrain = useTerrainElevation(current?.lat, current?.lon);
  const arrivedFor = useRef<string | null>(null);

  const key = navTarget ? `${navTarget.lat},${navTarget.lon}` : null;
  const dist = navTarget && current ? haversine(current.lat, current.lon, navTarget.lat, navTarget.lon) : null;
  const arrived = dist != null && dist <= Math.max(ARRIVAL_RADIUS_M, current?.acc ?? 0);

  useEffect(() => {
    if (arrived && key && arrivedFor.current !== key) {
      arrivedFor.current = key;
      Vibration.vibrate([0, 300, 150, 300]);
    }
    if (!arrived && dist != null && dist > ARRIVAL_RADIUS_M * 3) arrivedFor.current = null;
  }, [arrived, key, dist]);

  if (!navTarget) return null;

  const brg = current ? bearing(current.lat, current.lon, navTarget.lat, navTarget.lon) : null;
  // Moving: use GPS direction of travel (a compass is unreliable in a vehicle). Standing: compass.
  const facing = course ?? compass;
  const arrowRotation = brg == null ? 0 : facing == null ? brg : brg - facing;
  const targetAlt = navTarget.alt ?? targetTerrain;
  const myAlt = myTerrain ?? current?.alt ?? null;
  const climb = targetAlt != null && myAlt != null ? targetAlt - myAlt : null;
  const eta = dist != null && current?.speed != null && current.speed > 0.5 ? dist / current.speed : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.nav} />
        <Text style={styles.title} numberOfLines={1}>
          {navTarget.name}
        </Text>
        <Pressable onPress={() => setNavTarget(null)} hitSlop={10} accessibilityLabel={t('nav.stop')}>
          <Text style={styles.stop}>{t('nav.stop')}</Text>
        </Pressable>
      </View>

      {arrived ? (
        <Text style={styles.arrived}>{t('nav.arrived')}</Text>
      ) : (
        <View style={styles.body}>
          <View style={[styles.arrow, { transform: [{ rotate: `${arrowRotation}deg` }] }]}>
            <MaterialCommunityIcons name="navigation" size={40} color={colors.nav} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.big}>{dist != null ? formatDistance(dist) : t('map.waitingGps')}</Text>
            {brg != null && (
              <Text style={styles.small}>
                {t('map.bearing')}: {brg.toFixed(0)}° {cardinal(brg)}
                {climb != null ? ` · ${t('nav.climb')}: ${climb >= 0 ? '+' : ''}${climb.toFixed(0)} m` : ''}
                {eta != null ? ` · ${formatDuration(eta)}` : ''}
              </Text>
            )}
            {facing == null && brg != null && <Text style={styles.small}>{t('nav.noHeading')}</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    borderLeftWidth: 4,
    borderLeftColor: colors.nav,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontWeight: '700', color: colors.text },
  stop: { color: colors.danger, fontWeight: '600' },
  body: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 22, fontWeight: '700', color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  arrived: { marginTop: 6, fontSize: 16, fontWeight: '700', color: '#2e7d32' },
});
