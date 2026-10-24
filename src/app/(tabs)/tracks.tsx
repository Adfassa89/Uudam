import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, Text, View } from 'react-native';
import { colors, ui } from '../../components/theme';
import { formatAlt, formatDistance, formatDuration } from '../../geo/format';
import { useData } from '../../state/data';
import type { TrackMeta } from '../../storage/files';

/** Recorded routes grouped by day, newest first. */
export default function TracksScreen() {
  const { t, i18n } = useTranslation();
  const { tracks } = useData();

  const byDay = new Map<string, TrackMeta[]>();
  for (const tr of [...tracks].sort((a, b) => b.startedAt - a.startedAt)) {
    const day = new Date(tr.startedAt).toLocaleDateString(i18n.language === 'mn' ? 'mn-MN' : 'en-GB');
    byDay.set(day, [...(byDay.get(day) ?? []), tr]);
  }
  const sections = [...byDay.entries()].map(([title, data]) => ({ title, data }));

  return (
    <SectionList
      style={ui.screen}
      sections={sections}
      keyExtractor={(tr) => tr.id}
      contentContainerStyle={{ paddingBottom: 24 }}
      ListEmptyComponent={<Text style={[ui.muted, { margin: 16 }]}>{t('tracks.empty')}</Text>}
      renderSectionHeader={({ section }) => (
        <Text style={{ marginHorizontal: 16, marginTop: 16, fontWeight: '700', color: colors.muted }}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <Pressable style={ui.card} onPress={() => router.push(`/track/${item.id}`)}>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <Text style={[ui.text, { fontWeight: '600', flex: 1 }]} numberOfLines={1}>
              {item.name}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
          </View>
          <Text style={ui.muted}>
            {new Date(item.startedAt).toLocaleTimeString()} – {new Date(item.endedAt).toLocaleTimeString()}
          </Text>
          <View style={[ui.row, { marginTop: 6, gap: 14, flexWrap: 'wrap' }]}>
            <Text style={ui.text}>📏 {formatDistance(item.distanceM)}</Text>
            <Text style={ui.text}>⏱ {formatDuration((item.endedAt - item.startedAt) / 1000)}</Text>
            <Text style={ui.text}>
              ⛰ {formatAlt(item.minAlt)} – {formatAlt(item.maxAlt)}
            </Text>
            <Text style={ui.text}>↗ {item.ascentM.toFixed(0)} m</Text>
          </View>
        </Pressable>
      )}
    />
  );
}
