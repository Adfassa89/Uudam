import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { terrainElevations } from '../elevation/dem';
import { cardinal, formatAlt, formatDistance } from '../geo/format';
import { bearing, distanceM, lineLength, polygonArea, profileStats, samplePath, type ProfileStats } from '../geo/measure';
import type { LonLat, TrackPoint } from '../geo/types';
import { ElevationChart } from './ElevationChart';
import { colors, ui } from './theme';

export type MeasureMode = 'line' | 'area';

export function formatArea(m2: number): string {
  if (m2 < 10_000) return `${m2.toFixed(0)} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${(m2 / 1_000_000).toFixed(3)} km²`;
}

const fmtGrade = (g: number) => `${g >= 0 ? '+' : ''}${g.toFixed(1)} %`;

interface Props {
  points: LonLat[];
  mode: MeasureMode;
  onMode: (m: MeasureMode) => void;
  onUndo: () => void;
  onClear: () => void;
  onSave: () => void;
  onClose: () => void;
}

/** Results of the measuring tool: length / area, bearing, and the terrain profile with gradients. */
export function MeasurePanel({ points, mode, onMode, onUndo, onClear, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState<{ chart: TrackPoint[]; stats: ProfileStats | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const closedRing = mode === 'area' && points.length >= 3 ? [...points, points[0]] : points;
  const length = lineLength(closedRing);
  const last = points.length >= 2 ? points.slice(-2) : null;

  // Terrain profile along the line: sample every ~1 % of its length (min 10 m), after a short pause.
  useEffect(() => {
    if (!showProfile || points.length < 2) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setLoading(true);
      const samples = samplePath(closedRing, Math.max(10, lineLength(closedRing) / 100));
      const alts = await terrainElevations(samples);
      if (cancelled) return;
      setLoading(false);
      const withAlt = samples.map((s, i) => ({ d: s.d, alt: alts[i] }));
      setProfile({
        // The chart draws elevation against distance travelled between the points.
        chart: samples.map((s, i) => ({ lat: s.lat, lon: s.lon, alt: alts[i], acc: null, speed: null, t: i })),
        stats: profileStats(withAlt),
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // closedRing is derived from points and mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, mode, showProfile]);

  return (
    <View style={styles.card}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <View style={ui.row}>
          {(['line', 'area'] as const).map((m) => (
            <Pressable key={m} onPress={() => onMode(m)} style={[ui.chip, styles.chip, mode === m && ui.chipActive]}>
              <Text style={[ui.chipText, mode === m && ui.chipTextActive]}>{t(`measure.${m}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={{ color: colors.danger, fontWeight: '600' }}>{t('common.close')}</Text>
        </Pressable>
      </View>

      {points.length === 0 ? (
        <Text style={ui.muted}>{t('measure.hint')}</Text>
      ) : (
        <>
          {mode === 'area' && points.length >= 3 ? (
            <Text style={styles.big}>
              {formatArea(polygonArea(points))} · {t('measure.perimeter')} {formatDistance(length)}
            </Text>
          ) : (
            <Text style={styles.big}>{formatDistance(length)}</Text>
          )}
          {last && (
            <Text style={ui.muted}>
              {t('measure.lastSegment')}: {formatDistance(distanceM(last[0][1], last[0][0], last[1][1], last[1][0]))} ·{' '}
              {bearing(last[0][1], last[0][0], last[1][1], last[1][0]).toFixed(1)}°{' '}
              {cardinal(bearing(last[0][1], last[0][0], last[1][1], last[1][0]))} · {t('measure.points', { count: points.length })}
            </Text>
          )}

          {showProfile && points.length >= 2 && (
            <View style={{ marginTop: 6 }}>
              {loading && !profile && <Text style={ui.muted}>{t('tracks.terrainLoading')}</Text>}
              {profile && !profile.stats && <Text style={ui.muted}>{t('tracks.terrainFailed')}</Text>}
              {profile?.stats && (
                <>
                  <Text style={ui.text}>
                    {t('measure.grade')}: {fmtGrade(profile.stats.overallGradePct)} · {t('measure.maxGrade')}:{' '}
                    {fmtGrade(profile.stats.maxGradePct)}
                  </Text>
                  <Text style={ui.muted}>
                    ↗ {profile.stats.ascentM.toFixed(0)} m ↘ {profile.stats.descentM.toFixed(0)} m · {formatAlt(profile.stats.minAlt)}–
                    {formatAlt(profile.stats.maxAlt)} · {t('measure.slopeLength')} {formatDistance(profile.stats.slopeLengthM)}
                  </Text>
                  <ElevationChart points={profile.chart} emptyText="" />
                  <Text style={[ui.muted, { fontSize: 11 }]}>{t('elevation.terrainNote')}</Text>
                </>
              )}
            </View>
          )}
        </>
      )}

      <View style={[ui.row, { gap: 16, marginTop: 8, flexWrap: 'wrap' }]}>
        <Pressable onPress={onUndo} disabled={points.length === 0}>
          <Text style={[styles.action, points.length === 0 && styles.disabled]}>{t('measure.undo')}</Text>
        </Pressable>
        <Pressable onPress={onClear} disabled={points.length === 0}>
          <Text style={[styles.action, points.length === 0 && styles.disabled]}>{t('measure.clear')}</Text>
        </Pressable>
        <Pressable onPress={() => setShowProfile((v) => !v)} disabled={points.length < 2}>
          <Text style={[styles.action, points.length < 2 && styles.disabled]}>
            {showProfile ? t('measure.hideProfile') : t('measure.profile')}
          </Text>
        </Pressable>
        <Pressable onPress={onSave} disabled={points.length < 2}>
          <Text style={[styles.action, points.length < 2 && styles.disabled]}>{t('measure.save')}</Text>
        </Pressable>
      </View>
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
    borderLeftColor: colors.measure,
  },
  chip: { marginBottom: 6, paddingVertical: 4 },
  big: { fontSize: 20, fontWeight: '700', color: colors.text },
  action: { color: colors.primary, fontWeight: '600' },
  disabled: { color: colors.muted },
});
