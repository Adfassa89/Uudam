import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { terrainElevation } from '../elevation/dem';
import { formatCoord } from '../geo/format';
import { parseCoordinate } from '../geo/parse';
import { useData } from '../state/data';
import { useLocation } from '../state/location';
import { useSettings } from '../state/settings';
import { colors, ui } from './theme';

export interface WaypointDraft {
  /** Set when editing an existing waypoint. */
  id?: string;
  name?: string;
  lat?: number;
  lon?: number;
  alt?: number | null;
  note?: string;
}

interface Props {
  draft: WaypointDraft | null;
  onClose: () => void;
}

/** Create or edit a waypoint: name, coordinates (typed in any common format), elevation, note. */
export function WaypointDialog({ draft, onClose }: Props) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { addWaypoint, updateWaypoint, waypoints } = useData();
  const { current } = useLocation();
  const [name, setName] = useState('');
  const [coordText, setCoordText] = useState('');
  const [altText, setAltText] = useState('');
  const [note, setNote] = useState('');
  // The text first shown is rounded (e.g. UTM to whole metres); while it is
  // untouched, keep the exact original position instead of re-reading the text.
  const [initialText, setInitialText] = useState('');

  useEffect(() => {
    if (!draft) return;
    setName(draft.name ?? t('waypoints.defaultName', { n: waypoints.length + 1 }));
    const text = draft.lat != null && draft.lon != null ? formatCoord(draft.lat, draft.lon, settings.coordFormat) : '';
    setCoordText(text);
    setInitialText(text);
    setAltText(draft.alt != null ? draft.alt.toFixed(1) : '');
    setNote(draft.note ?? '');
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => {
    if (coordText === initialText && draft?.lat != null && draft.lon != null) {
      return { lat: draft.lat, lon: draft.lon, system: 'WGS84' };
    }
    return parseCoordinate(coordText, current?.lon);
  }, [coordText, initialText, draft, current?.lon]);
  const alt = altText.trim() === '' ? null : Number(altText.replace(',', '.'));
  const altValid = alt === null || Number.isFinite(alt);

  const [terrainBusy, setTerrainBusy] = useState(false);
  const fillFromTerrain = async () => {
    if (!parsed) return;
    setTerrainBusy(true);
    const v = await terrainElevation(parsed.lat, parsed.lon);
    setTerrainBusy(false);
    if (v != null) setAltText(v.toFixed(1));
  };

  const fillMyPosition = () => {
    if (!current) return;
    setCoordText(formatCoord(current.lat, current.lon, settings.coordFormat));
    if (current.alt != null) setAltText(current.alt.toFixed(1));
  };

  const save = () => {
    if (!parsed || !altValid) return;
    const data = { name: name.trim() || t('waypoints.defaultName', { n: waypoints.length + 1 }), lat: parsed.lat, lon: parsed.lon, alt, note: note.trim() || undefined };
    if (draft?.id) updateWaypoint(draft.id, data);
    else addWaypoint(data);
    onClose();
  };

  return (
    <Modal visible={draft != null} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={ui.h2}>{draft?.id ? t('waypoints.edit') : t('waypoints.add')}</Text>

            <Text style={styles.label}>{t('settings.name')}</Text>
            <TextInput style={ui.input} value={name} onChangeText={setName} />

            <Text style={styles.label}>{t('waypoints.coords')}</Text>
            <TextInput
              style={ui.input}
              value={coordText}
              onChangeText={setCoordText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="48N 650123 4829456"
            />
            <Text style={[styles.hint, !parsed && coordText.trim() !== '' && { color: colors.danger }]}>
              {coordText.trim() === ''
                ? t('waypoints.coordsHelp')
                : parsed
                  ? `${t('waypoints.readAs', { system: parsed.system })}: ${formatCoord(parsed.lat, parsed.lon, 'dd')}`
                  : t('waypoints.invalid')}
            </Text>
            <Pressable onPress={fillMyPosition} disabled={!current} style={{ marginTop: 6 }}>
              <Text style={{ color: current ? colors.primary : colors.muted }}>{t('waypoints.useMyPosition')}</Text>
            </Pressable>

            <Text style={styles.label}>{t('waypoints.elevation')}</Text>
            <TextInput
              style={[ui.input, !altValid && { borderColor: colors.danger }]}
              value={altText}
              onChangeText={setAltText}
              keyboardType="numbers-and-punctuation"
            />
            <Pressable onPress={fillFromTerrain} disabled={!parsed || terrainBusy} style={{ marginTop: 6 }}>
              <Text style={{ color: parsed && !terrainBusy ? colors.primary : colors.muted }}>{t('waypoints.fromTerrain')}</Text>
            </Pressable>

            <Text style={styles.label}>{t('waypoints.note')}</Text>
            <TextInput style={[ui.input, { minHeight: 60 }]} value={note} onChangeText={setNote} multiline />

            <View style={[ui.row, { gap: 12, marginTop: 16 }]}>
              <Pressable style={[ui.outlineButton, { flex: 1 }]} onPress={onClose}>
                <Text style={ui.outlineButtonText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[ui.button, { flex: 1 }, (!parsed || !altValid) && { opacity: 0.5 }]}
                disabled={!parsed || !altValid}
                onPress={save}
              >
                <Text style={ui.buttonText}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '85%',
  },
  label: { fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
