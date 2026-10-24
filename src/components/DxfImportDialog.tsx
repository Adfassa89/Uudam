import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { CRS_OPTIONS, makeToWgs84 } from '../geo/crs';
import { formatCoord } from '../geo/format';
import type { DxfConvertOptions, DxfDrawing } from '../importers/dxf';
import { colors, ui } from './theme';

// Rough bounding box of Mongolia, used only to warn about a wrong CRS choice.
const MN = { minLat: 41, maxLat: 52.5, minLon: 87, maxLon: 120.5 };

interface Props {
  fileName: string;
  drawing: DxfDrawing;
  onCancel: () => void;
  onImport: (opts: DxfConvertOptions) => void;
}

/** Asks which coordinate system a DXF drawing uses, shows where it will land, then imports. */
export function DxfImportDialog({ fileName, drawing, onCancel, onImport }: Props) {
  const { t } = useTranslation();
  const [crsId, setCrsId] = useState(drawing.guessedCrs ?? 'utm48n');
  const [swapXY, setSwapXY] = useState(false);
  const [simplifyText, setSimplifyText] = useState('0.5');
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(() => new Set(drawing.layers));

  // Where the middle of the drawing ends up with the current settings.
  const preview = useMemo(() => {
    const pts = drawing.shapes.map((s) => s.pts[0]);
    if (pts.length === 0) return null;
    const xs = pts.map((p) => p.x).sort((a, b) => a - b);
    const ys = pts.map((p) => p.y).sort((a, b) => a - b);
    const mx = xs[Math.floor(xs.length / 2)];
    const my = ys[Math.floor(ys.length / 2)];
    try {
      const [lon, lat] = swapXY ? makeToWgs84(crsId)(my, mx) : makeToWgs84(crsId)(mx, my);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const inside = lat >= MN.minLat && lat <= MN.maxLat && lon >= MN.minLon && lon <= MN.maxLon;
      return { lat, lon, inside };
    } catch {
      return null;
    }
  }, [drawing, crsId, swapXY]);

  const skipped = Object.entries(drawing.skipped)
    .map(([k, v]) => `${k} ×${v}`)
    .join(', ');

  const toggleLayer = (name: string) =>
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={ui.card}>
          <Text style={ui.h2}>{t('dxf.title')}</Text>
          <Text style={ui.muted}>{fileName}</Text>
        </View>

        <View style={ui.card}>
          <Text style={ui.h2}>{t('dxf.crs')}</Text>
          <Text style={[ui.muted, { marginBottom: 8 }]}>
            {drawing.guessedCrs ? `${t('dxf.guessed')}: ${CRS_OPTIONS.find((c) => c.id === drawing.guessedCrs)?.label}` : t('dxf.noGuess')}
          </Text>
          <View style={styles.wrap}>
            {CRS_OPTIONS.map((c) => (
              <Pressable key={c.id} onPress={() => setCrsId(c.id)} style={[ui.chip, crsId === c.id && ui.chipActive]}>
                <Text style={[ui.chipText, crsId === c.id && ui.chipTextActive, { fontSize: 12 }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[ui.row, { justifyContent: 'space-between', marginTop: 8 }]}>
            <Text style={ui.text}>{t('dxf.swapXY')}</Text>
            <Switch value={swapXY} onValueChange={setSwapXY} />
          </View>
          <Text style={ui.muted}>{t('dxf.swapXYHelp')}</Text>
        </View>

        <View style={ui.card}>
          <Text style={ui.h2}>{t('dxf.preview')}</Text>
          {preview ? (
            <>
              <Text style={ui.text}>{formatCoord(preview.lat, preview.lon, 'dd')}</Text>
              {!preview.inside && <Text style={{ color: colors.danger, marginTop: 4 }}>{t('dxf.outside')}</Text>}
            </>
          ) : (
            <Text style={{ color: colors.danger }}>{t('dxf.outside')}</Text>
          )}
        </View>

        <View style={ui.card}>
          <Text style={ui.h2}>{t('dxf.simplify')}</Text>
          <TextInput style={ui.input} keyboardType="decimal-pad" value={simplifyText} onChangeText={setSimplifyText} />
          <Text style={[ui.muted, { marginTop: 4 }]}>{t('dxf.simplifyHelp')}</Text>
        </View>

        {drawing.layers.length > 1 && (
          <View style={ui.card}>
            <Text style={ui.h2}>{t('dxf.cadLayers')}</Text>
            <View style={styles.wrap}>
              {drawing.layers.map((name) => {
                const on = selectedLayers.has(name);
                return (
                  <Pressable key={name} onPress={() => toggleLayer(name)} style={[ui.chip, on && ui.chipActive]}>
                    <Text style={[ui.chipText, on && ui.chipTextActive, { fontSize: 12 }]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {skipped ? (
          <View style={ui.card}>
            <Text style={ui.muted}>{t('dxf.skipped', { list: skipped })}</Text>
          </View>
        ) : null}

        <View style={[ui.row, { gap: 12, margin: 12 }]}>
          <Pressable style={[ui.outlineButton, { flex: 1 }]} onPress={onCancel}>
            <Text style={ui.outlineButtonText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[ui.button, { flex: 1 }, selectedLayers.size === 0 && { opacity: 0.5 }]}
            disabled={selectedLayers.size === 0}
            onPress={() =>
              onImport({
                crsId,
                swapXY,
                simplifyM: Math.max(0, parseFloat(simplifyText.replace(',', '.')) || 0),
                layers: [...selectedLayers],
              })
            }
          >
            <Text style={ui.buttonText}>{t('dxf.import')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
