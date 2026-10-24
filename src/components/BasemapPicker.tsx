import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_ORDER, type Basemap } from '../maps/basemaps';
import { useSettings } from '../state/settings';
import { colors, ui } from './theme';

export function basemapName(b: Basemap, t: (k: string) => string) {
  return b.name ?? t(`basemaps.${b.nameKey}`);
}

export function BasemapPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { allBasemaps, basemap: selected, update } = useSettings();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={ui.h2}>{t('map.basemaps')}</Text>
        <ScrollView>
          {CATEGORY_ORDER.map((cat) => {
            const items = allBasemaps.filter((b) => b.category === cat);
            if (items.length === 0) return null;
            return (
              <View key={cat} style={{ marginBottom: 10 }}>
                <Text style={styles.cat}>{t(`basemaps.${cat}`)}</Text>
                <View style={styles.wrap}>
                  {items.map((b) => {
                    const disabled = b.platform != null && b.platform !== Platform.OS;
                    const active = b.id === selected.id;
                    return (
                      <Pressable
                        key={b.id}
                        disabled={disabled}
                        onPress={() => {
                          update({ basemapId: b.id });
                          onClose();
                        }}
                        style={[ui.chip, active && ui.chipActive, disabled && { opacity: 0.4 }]}
                      >
                        <Text style={[ui.chipText, active && ui.chipTextActive]}>
                          {basemapName(b, t)}
                          {disabled ? ` (${t('basemaps.androidOnly')})` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
          <Text style={ui.muted}>{selected.attribution}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: colors.card,
    padding: 16,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
  },
  cat: { fontWeight: '600', color: colors.muted, marginBottom: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
