import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DxfImportDialog } from '../../components/DxfImportDialog';
import { MAX_DRAWN_FEATURES } from '../../components/MapContent';
import { colors, ui } from '../../components/theme';
import type { MapFeature } from '../../geo/types';
import { dxfToFeatures, parseDxf, type DxfConvertOptions, type DxfDrawing } from '../../importers/dxf';
import { detectKind, parseGeographic } from '../../importers';
import { useData } from '../../state/data';
import { useLocation } from '../../state/location';

/** Lets the spinner render before heavy parsing blocks the JS thread. */
const nextFrame = () => new Promise((r) => setTimeout(r, 50));

export default function LayersScreen() {
  const { t } = useTranslation();
  const { layers, addLayer, updateLayer, removeLayer, focusOn } = useData();
  const { current } = useLocation();
  const [busy, setBusy] = useState(false);
  const [pendingDxf, setPendingDxf] = useState<{ name: string; drawing: DxfDrawing } | null>(null);

  const finishImport = (name: string, source: 'kml' | 'kmz' | 'gpx' | 'dxf', features: MapFeature[], crsId?: string) => {
    if (features.length === 0) {
      Alert.alert(t('common.error'), t('layers.noFeatures'));
      return;
    }
    const meta = addLayer({ name, source, features, crsId });
    const msg = t('layers.imported', { count: features.length });
    const big = features.length > MAX_DRAWN_FEATURES ? `\n\n${t('layers.tooMany', { count: features.length, shown: MAX_DRAWN_FEATURES })}` : '';
    Alert.alert(name, msg + big);
    focusOn(meta.bbox);
    router.navigate('/');
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const kind = detectKind(asset.name);
    if (kind === 'dwg') {
      Alert.alert(t('layers.dwgTitle'), t('layers.dwgMessage'));
      return;
    }
    if (!kind) {
      Alert.alert(t('common.error'), t('layers.unsupported'));
      return;
    }

    setBusy(true);
    await nextFrame();
    try {
      const file = new File(asset.uri);
      const baseName = asset.name.replace(/\.[^.]+$/, '');
      if (kind === 'dxf') {
        const drawing = parseDxf(await file.text(), current?.lon);
        setPendingDxf({ name: baseName, drawing });
      } else {
        finishImport(baseName, kind, await parseGeographic(kind, file));
      }
    } catch (e) {
      const message = e instanceof Error && e.message === 'NO_KML_IN_KMZ' ? t('layers.noKmlInKmz') : String((e as Error)?.message ?? e);
      Alert.alert(t('common.error'), t('layers.importFailed', { message }));
    } finally {
      setBusy(false);
    }
  };

  const importDxf = async (opts: DxfConvertOptions) => {
    if (!pendingDxf) return;
    const { name, drawing } = pendingDxf;
    setPendingDxf(null);
    setBusy(true);
    await nextFrame();
    try {
      finishImport(name, 'dxf', dxfToFeatures(drawing, opts), opts.crsId);
    } catch (e) {
      Alert.alert(t('common.error'), t('layers.importFailed', { message: String((e as Error)?.message ?? e) }));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (id: string, name: string) =>
    Alert.alert(t('layers.deleteConfirm', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => removeLayer(id) },
    ]);

  return (
    <View style={ui.screen}>
      <View style={ui.card}>
        <Pressable style={[ui.button, { flexDirection: 'row', justifyContent: 'center', gap: 8 }]} onPress={pickFile} disabled={busy}>
          <MaterialCommunityIcons name="file-import-outline" size={20} color="#fff" />
          <Text style={ui.buttonText}>{t('layers.import')}</Text>
        </Pressable>
        <Text style={[ui.muted, { marginTop: 8 }]}>{t('layers.supported')}</Text>
      </View>

      {busy && (
        <View style={[ui.card, ui.row, { gap: 10 }]}>
          <ActivityIndicator />
          <Text style={ui.text}>{t('layers.importing')}</Text>
        </View>
      )}

      <FlatList
        data={layers}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<Text style={[ui.muted, { margin: 16 }]}>{t('layers.empty')}</Text>}
        renderItem={({ item }) => (
          <View style={ui.card}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <View style={[ui.row, { flex: 1, gap: 8 }]}>
                <View style={[styles.swatch, { backgroundColor: item.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={ui.text} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={ui.muted}>
                    {item.source.toUpperCase()} · {t('layers.features', { count: item.featureCount })}
                  </Text>
                </View>
              </View>
              <Switch value={item.visible} onValueChange={(v) => updateLayer(item.id, { visible: v })} />
            </View>
            <View style={[ui.row, { gap: 10, marginTop: 10 }]}>
              <Pressable
                style={ui.outlineButton}
                onPress={() => {
                  if (!item.visible) updateLayer(item.id, { visible: true });
                  focusOn(item.bbox);
                  router.navigate('/');
                }}
              >
                <Text style={ui.outlineButtonText}>{t('layers.zoomTo')}</Text>
              </Pressable>
              <Pressable style={[ui.outlineButton, { borderColor: colors.danger }]} onPress={() => confirmDelete(item.id, item.name)}>
                <Text style={[ui.outlineButtonText, { color: colors.danger }]}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      {pendingDxf && (
        <DxfImportDialog
          fileName={pendingDxf.name}
          drawing={pendingDxf.drawing}
          onCancel={() => setPendingDxf(null)}
          onImport={importDxf}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 16, height: 16, borderRadius: 4 },
});
