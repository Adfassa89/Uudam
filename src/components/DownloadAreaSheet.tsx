import { Paths } from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { BBox } from '../geo/types';
import { AVG_TILE_BYTES, canDownload, estimateTiles, MAX_AREA_TILES, startDownload } from '../offline/downloader';
import { metresPerPixel } from '../offline/tiles';
import { useOfflineAreas } from '../offline/useOfflineAreas';
import { useSettings } from '../state/settings';
import { basemapName } from './BasemapPicker';
import { colors, ui } from './theme';

export const formatBytes = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;

/** Lowest detail level offered; anything coarser is pointless to download for field work. */
const OFFER_MIN = 10;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The area currently shown on the map. */
  bbox: BBox | null;
  /** Current map zoom level (fractional). */
  zoom: number;
}

/** "Download this map area for offline use" — pick the detail level, see the size, start. */
export function DownloadAreaSheet({ visible, onClose, bbox, zoom }: Props) {
  const { t } = useTranslation();
  const { basemap } = useSettings();
  const { activeId } = useOfflineAreas();
  const top = basemap.maxZoom ?? 19;
  const [maxZoom, setMaxZoom] = useState(17);
  const [name, setName] = useState('');

  // Offer detail levels from the current view up to what the server provides.
  const options = useMemo(() => {
    const from = Math.min(top, Math.max(OFFER_MIN, Math.floor(zoom)));
    return Array.from({ length: top - from + 1 }, (_, i) => from + i);
  }, [zoom, top]);

  useEffect(() => {
    if (!visible) return;
    setName(t('offline.defaultName', { date: new Date().toLocaleDateString() }));
    // Default: about 3 levels more detail than the current view, at most z17.
    setMaxZoom(Math.min(top, Math.max(options[0] ?? top, Math.min(17, Math.floor(zoom) + 3))));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = bbox ? estimateTiles(basemap, bbox, maxZoom) : 0;
  const size = count * AVG_TILE_BYTES;
  const free = Paths.availableDiskSpace;
  const tooBig = count > MAX_AREA_TILES;
  const noSpace = size > free * 0.9;
  const lat = bbox ? (bbox.minLat + bbox.maxLat) / 2 : 45;
  const blocked = !canDownload(basemap);

  const start = () => {
    if (!bbox) return;
    startDownload(basemap, name.trim() || t('offline.defaultName', { date: new Date().toLocaleDateString() }), bbox, maxZoom);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <ScrollView>
          <Text style={ui.h2}>{t('offline.title')}</Text>
          <Text style={[ui.muted, { marginBottom: 10 }]}>
            {t('offline.map')}: {basemapName(basemap, t)}
          </Text>

          {blocked ? (
            <Text style={ui.text}>{basemap.tiles ? t('offline.notAllowed') : t('offline.nativeMap')}</Text>
          ) : (
            <>
              <Text style={ui.muted}>{t('offline.hint')}</Text>
              <Text style={[ui.text, { fontWeight: '600', marginTop: 12, marginBottom: 6 }]}>{t('offline.detail')}</Text>
              <View style={styles.wrap}>
                {options.map((z) => (
                  <Pressable key={z} onPress={() => setMaxZoom(z)} style={[ui.chip, z === maxZoom && ui.chipActive]}>
                    <Text style={[ui.chipText, z === maxZoom && ui.chipTextActive]}>
                      {`z${z} · ${formatScale(metresPerPixel(z, lat))}`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.summary}>
                <Text style={ui.text}>{t('offline.tiles', { count, size: formatBytes(size) })}</Text>
                <Text style={ui.muted}>{t('offline.freeSpace', { size: formatBytes(free) })}</Text>
                {tooBig && <Text style={styles.warn}>{t('offline.tooBig', { max: MAX_AREA_TILES })}</Text>}
                {!tooBig && noSpace && <Text style={styles.warn}>{t('offline.noSpace')}</Text>}
              </View>

              <TextInput style={[ui.input, { marginTop: 10 }]} value={name} onChangeText={setName} placeholder={t('settings.name')} />
              {activeId && <Text style={[styles.warn, { marginTop: 8 }]}>{t('offline.busy')}</Text>}
            </>
          )}

          <View style={[ui.row, { gap: 12, marginTop: 14 }]}>
            <Pressable style={[ui.outlineButton, { flex: 1 }]} onPress={onClose}>
              <Text style={ui.outlineButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            {!blocked && (
              <Pressable
                style={[ui.button, { flex: 1 }, (tooBig || noSpace || !!activeId || !bbox) && { opacity: 0.5 }]}
                disabled={tooBig || noSpace || !!activeId || !bbox}
                onPress={start}
              >
                <Text style={ui.buttonText}>{t('offline.download')}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const formatScale = (mpp: number) => (mpp >= 10 ? `${mpp.toFixed(0)} m/px` : `${mpp.toFixed(1)} m/px`);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: colors.card,
    padding: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  summary: { backgroundColor: colors.bg, borderRadius: 8, padding: 10, marginTop: 4, gap: 2 },
  warn: { color: colors.danger },
});
