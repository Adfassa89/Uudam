import Constants from 'expo-constants';
import { Directory, Paths } from 'expo-file-system';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { formatBytes } from '../../components/DownloadAreaSheet';
import { colors, ui } from '../../components/theme';
import { DEM_ATTRIBUTION } from '../../elevation/dem';
import type { CoordFormat } from '../../geo/format';
import { LANGUAGES } from '../../i18n';
import type { Basemap } from '../../maps/basemaps';
import { cancelDownload, deleteArea, forgetAllAreas, resumeDownload, type OfflineArea } from '../../offline/downloader';
import { useOfflineAreas } from '../../offline/useOfflineAreas';
import { useSettings } from '../../state/settings';
import { newId } from '../../storage/files';

const COORD_FORMATS: CoordFormat[] = ['utm', 'dd', 'dms'];
const RECORD_DISTANCES = [1, 5, 10, 25];

function Chips<T extends string | number>({
  options,
  value,
  label,
  onChange,
}: {
  options: T[];
  value: T;
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Pressable key={String(o)} onPress={() => onChange(o)} style={[ui.chip, o === value && ui.chipActive]}>
          <Text style={[ui.chipText, o === value && ui.chipTextActive]}>{label(o)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { settings, update, allBasemaps } = useSettings();
  const offline = useOfflineAreas();
  const basemapOf = (a: OfflineArea) => allBasemaps.find((b) => b.id === a.basemapId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [tms, setTms] = useState(false);
  const [maxZoom, setMaxZoom] = useState('18');

  const addCustom = () => {
    const u = url.trim();
    if (!/^https?:\/\//.test(u) || !u.includes('{z}') || !u.includes('{x}') || !u.includes('{y}')) {
      Alert.alert(t('common.error'), t('settings.invalidUrl'));
      return;
    }
    const b: Basemap = {
      id: `custom-${newId()}`,
      name: name.trim() || u,
      category: 'custom',
      tiles: u,
      tms,
      maxZoom: parseInt(maxZoom, 10) || 18,
      attribution: name.trim() || u,
    };
    update({ customBasemaps: [...settings.customBasemaps, b], basemapId: b.id });
    setName('');
    setUrl('');
    setTms(false);
  };

  const removeCustom = (id: string) =>
    update({ customBasemaps: settings.customBasemaps.filter((b) => b.id !== id) });

  const clearCache = () =>
    Alert.alert(t('settings.clearCache'), t('offline.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          forgetAllAreas();
          const dir = new Directory(Paths.document, 'tiles');
          if (dir.exists) dir.delete();
          Alert.alert(t('settings.offline'), t('settings.cacheCleared'));
        },
      },
    ]);

  const confirmDeleteArea = (a: OfflineArea) =>
    Alert.alert(t('offline.deleteConfirm', { name: a.name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void deleteArea(a.id, basemapOf(a)) },
    ]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={ui.card}>
        <Text style={ui.h2}>{t('settings.language')}</Text>
        <Chips
          options={LANGUAGES.map((l) => l.code)}
          value={settings.language}
          label={(c) => LANGUAGES.find((l) => l.code === c)!.label}
          onChange={(language) => update({ language })}
        />
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>{t('settings.coordFormat')}</Text>
        <Chips options={COORD_FORMATS} value={settings.coordFormat} label={(f) => t(`settings.${f}`)} onChange={(coordFormat) => update({ coordFormat })} />
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>{t('settings.gps')}</Text>
        <Text style={[ui.muted, { marginBottom: 6 }]}>{t('settings.gpsDistance')}</Text>
        <Chips
          options={RECORD_DISTANCES}
          value={settings.recordDistanceM}
          label={(d) => `${d} m`}
          onChange={(recordDistanceM) => update({ recordDistanceM })}
        />
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>{t('settings.customMaps')}</Text>
        <Text style={[ui.muted, { marginBottom: 8 }]}>{t('settings.customHelp')}</Text>
        {settings.customBasemaps.map((b) => (
          <View key={b.id} style={[ui.row, { justifyContent: 'space-between', paddingVertical: 6 }]}>
            <Text style={[ui.text, { flex: 1 }]} numberOfLines={1}>
              {b.name}
            </Text>
            <Pressable onPress={() => removeCustom(b.id)}>
              <Text style={{ color: colors.danger }}>{t('common.delete')}</Text>
            </Pressable>
          </View>
        ))}
        <TextInput style={[ui.input, { marginTop: 6 }]} placeholder={t('settings.name')} value={name} onChangeText={setName} />
        <TextInput
          style={[ui.input, { marginTop: 6 }]}
          placeholder="https://server/{z}/{x}/{y}.png"
          autoCapitalize="none"
          autoCorrect={false}
          value={url}
          onChangeText={setUrl}
        />
        <View style={[ui.row, { justifyContent: 'space-between', marginTop: 6 }]}>
          <Text style={ui.text}>{t('settings.tms')}</Text>
          <Switch value={tms} onValueChange={setTms} />
        </View>
        <View style={[ui.row, { justifyContent: 'space-between', marginTop: 6 }]}>
          <Text style={ui.text}>{t('settings.maxZoom')}</Text>
          <TextInput style={[ui.input, { width: 70 }]} keyboardType="number-pad" value={maxZoom} onChangeText={setMaxZoom} />
        </View>
        <Pressable style={[ui.button, { marginTop: 10 }]} onPress={addCustom}>
          <Text style={ui.buttonText}>{t('settings.addCustom')}</Text>
        </Pressable>
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>{t('settings.offline')}</Text>
        <Text style={[ui.muted, { marginBottom: 8 }]}>{t('settings.offlineHelp')}</Text>
        {offline.areas.length === 0 && <Text style={[ui.muted, { marginBottom: 8 }]}>{t('offline.empty')}</Text>}
        {offline.areas.map((a) => {
          const b = basemapOf(a);
          const isActive = offline.activeId === a.id;
          const percent = Math.floor(((a.doneCount + a.failedCount) / Math.max(1, a.tileCount)) * 100);
          return (
            <View key={a.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={[ui.text, { fontWeight: '600' }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={ui.muted}>
                {b ? (b.name ?? t(`basemaps.${b.nameKey}`)) : '—'} · z{a.minZoom}–{a.maxZoom} · {formatBytes(a.bytes)}
              </Text>
              <Text style={[ui.muted, a.status !== 'done' && !isActive && { color: colors.danger }]}>
                {isActive
                  ? t('offline.statusDownloading', { percent })
                  : a.status === 'done'
                    ? t('offline.statusDone', { count: a.doneCount })
                    : t('offline.statusPartial', { done: a.doneCount, total: a.tileCount, failed: a.failedCount })}
              </Text>
              <View style={[ui.row, { gap: 16, marginTop: 4 }]}>
                {isActive ? (
                  <Pressable onPress={cancelDownload}>
                    <Text style={{ color: colors.danger }}>{t('common.cancel')}</Text>
                  </Pressable>
                ) : (
                  <>
                    {a.status !== 'done' && b && !offline.activeId && (
                      <Pressable onPress={() => resumeDownload(a.id, b)}>
                        <Text style={{ color: colors.primary }}>{t('offline.resume')}</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => confirmDeleteArea(a)}>
                      <Text style={{ color: colors.danger }}>{t('common.delete')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          );
        })}
        <Pressable style={[ui.outlineButton, { marginTop: 10 }]} onPress={clearCache}>
          <Text style={ui.outlineButtonText}>{t('settings.clearCache')}</Text>
        </Pressable>
      </View>

      <View style={ui.card}>
        <Text style={ui.h2}>{t('settings.about')}</Text>
        <Text style={ui.muted}>Uudam {Constants.expoConfig?.version ?? ''}</Text>
        <Text style={[ui.muted, { marginTop: 6, fontSize: 12 }]}>{DEM_ATTRIBUTION}</Text>
      </View>
    </ScrollView>
  );
}
