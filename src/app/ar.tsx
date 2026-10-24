import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import {
  cameraDirection,
  offscreenAngle,
  projectDevice,
  projectLine,
  toDevice,
  type Screen,
  type Vec3,
} from '../ar/projection';
import { buildScene, type SceneWaypoint } from '../ar/scene';
import { useOrientation } from '../ar/useOrientation';
import { colors, ui } from '../components/theme';
import { terrainElevation } from '../elevation/dem';
import { useTerrainElevation } from '../elevation/useTerrainElevation';
import { cardinal, formatDistance } from '../geo/format';
import { distanceM } from '../geo/measure';
import { useData } from '../state/data';
import { useLocation } from '../state/location';
import { useSettings } from '../state/settings';

/** Phone held at about eye level. */
const EYE_HEIGHT_M = 1.5;
const RADII = [250, 500, 1000, 2000];
const HORIZON_M = 2000;

/**
 * Camera view with map data drawn on top ("AR"): imported KML/KMZ/DXF lines and
 * points, saved waypoints and the navigation target, placed using GPS position
 * and the phone's compass/gyro orientation.
 */
export default function ArScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const { settings, update } = useSettings();
  const { layers, layerFeatures, waypoints, navTarget } = useData();
  const { current } = useLocation();
  const { R, available } = useOrientation(settings.arHeadingOffset);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  // ---- Your height ----
  const terrainHere = useTerrainElevation(current?.lat, current?.lon);
  const gpsAlt = current?.alt ?? null;
  const eyeAlt =
    settings.arHeight === 'gps'
      ? (gpsAlt ?? (terrainHere != null ? terrainHere + EYE_HEIGHT_M : null))
      : terrainHere != null
        ? terrainHere + EYE_HEIGHT_M
        : gpsAlt;

  // ---- Heights for waypoints that have none stored ----
  const [wpTerrain, setWpTerrain] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!current) return;
    const missing = waypoints.filter(
      (w) => w.alt == null && wpTerrain[w.id] == null && distanceM(current.lat, current.lon, w.lat, w.lon) <= settings.arRadiusM,
    );
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, number> = {};
      for (const w of missing) {
        const v = await terrainElevation(w.lat, w.lon);
        if (v != null) found[w.id] = v;
      }
      if (!cancelled && Object.keys(found).length) setWpTerrain((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
    // Re-check when you move ~100 m or the list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, settings.arRadiusM, current && Math.round(current.lat * 1000), current && Math.round(current.lon * 1000)]);

  // ---- 3D scene, rebuilt when you move ~5 m ----
  const obsKey = current ? `${Math.round(current.lat * 20000)},${Math.round(current.lon * 20000)},${Math.round(eyeAlt ?? 0)}` : null;
  const scene = useMemo(() => {
    if (!current) return null;
    const eye = eyeAlt ?? EYE_HEIGHT_M;
    const obs = { lat: current.lat, lon: current.lon, alt: eye, groundAlt: eye - EYE_HEIGHT_M };
    const sceneLayers = layers
      .filter((l) => l.visible && layerFeatures[l.id])
      .map((l) => ({ id: l.id, color: l.color, features: layerFeatures[l.id] }));
    const withAlt = (w: SceneWaypoint): SceneWaypoint => ({ ...w, alt: w.alt ?? wpTerrain[w.id] ?? null });
    const target = navTarget
      ? withAlt({ id: navTarget.waypointId ?? 'nav', name: navTarget.name, lat: navTarget.lat, lon: navTarget.lon, alt: navTarget.alt })
      : null;
    return buildScene(obs, settings.arRadiusM, sceneLayers, waypoints.map(withAlt), target);
    // obsKey stands in for the current position at ~5 m resolution
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obsKey, settings.arRadiusM, layers, layerFeatures, waypoints, wpTerrain, navTarget]);

  // Horizon ring 2 km away at eye level, as a level reference (its 0.3 m curvature dip is negligible).
  const horizon = useMemo<Vec3[]>(() => {
    const pts: Vec3[] = [];
    for (let a = 0; a <= 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      pts.push([Math.sin(rad) * HORIZON_M, Math.cos(rad) * HORIZON_M, 0]);
    }
    return pts;
  }, []);

  const screen: Screen = { width, height, vfovDeg: settings.arFov };

  if (permission && !permission.granted) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: '#000' }]}>
        <Text style={styles.white}>{t('ar.cameraPermission')}</Text>
        <Pressable style={[ui.button, { marginTop: 16 }]} onPress={requestPermission}>
          <Text style={ui.buttonText}>{t('common.ok')}</Text>
        </Pressable>
        <Pressable style={{ marginTop: 16 }} onPress={() => router.back()}>
          <Text style={styles.white}>{t('common.close')}</Text>
        </Pressable>
      </View>
    );
  }

  const dir = R ? cameraDirection(R) : null;

  // ---- Project everything for this frame ----
  const overlay: ReactNode[] = [];
  let targetArrow: ReactNode = null;
  if (R && scene) {
    for (const piece of projectLine(horizon.map((v) => toDevice(R, v)), screen)) {
      overlay.push(
        <Polyline key={`h${overlay.length}`} points={piece.map((p) => `${p.x},${p.y}`).join(' ')} stroke="rgba(255,255,255,0.5)" strokeWidth={1} strokeDasharray="6,6" fill="none" />,
      );
    }
    for (const line of scene.lines) {
      const pieces = projectLine(line.pts.map((v) => toDevice(R, v)), screen);
      pieces.forEach((piece, i) =>
        overlay.push(
          <Polyline key={`${line.key}-${i}`} points={piece.map((p) => `${p.x},${p.y}`).join(' ')} stroke={line.color} strokeWidth={3} strokeLinejoin="round" fill="none" />,
        ),
      );
    }
    // Far points first so near labels end up on top.
    for (const p of [...scene.points].reverse()) {
      const d = toDevice(R, p.v);
      const s = projectDevice(d, screen);
      const onScreen = s && s.x > -20 && s.x < width + 20 && s.y > -20 && s.y < height + 20;
      if (!onScreen) {
        if (p.kind === 'target') targetArrow = <EdgeArrow angle={offscreenAngle(d)} width={width} height={height} />;
        continue;
      }
      const size = Math.max(5, Math.min(14, 600 / Math.max(p.distance, 40)));
      const big = p.kind === 'target';
      const label = `${p.label} · ${formatDistance(p.distance)}`;
      overlay.push(
        <G key={p.key}>
          <Circle cx={s.x} cy={s.y} r={big ? size + 4 : size} fill={p.color} stroke="#fff" strokeWidth={2} />
          <SvgText x={s.x + 1} y={s.y - size - 7} fontSize={big ? 15 : 12} fontWeight="bold" fill="#000" textAnchor="middle">
            {label}
          </SvgText>
          <SvgText x={s.x} y={s.y - size - 8} fontSize={big ? 15 : 12} fontWeight="bold" fill="#fff" textAnchor="middle">
            {label}
          </SvgText>
        </G>,
      );
    }
  }

  const acc = current?.acc ?? null;

  return (
    <View style={styles.fill}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {overlay}
        {targetArrow}
        {/* centre cross-hair */}
        <Polyline points={`${width / 2 - 10},${height / 2} ${width / 2 + 10},${height / 2}`} stroke="#fff" strokeWidth={1} />
        <Polyline points={`${width / 2},${height / 2 - 10} ${width / 2},${height / 2 + 10}`} stroke="#fff" strokeWidth={1} />
      </Svg>

      {/* Top bar */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel={t('common.close')}>
          <MaterialCommunityIcons name="close" size={24} color="#fff" />
        </Pressable>
        <View style={styles.hud}>
          <Text style={styles.hudBig}>{dir ? `${cardinal(dir.azimuth)} ${dir.azimuth.toFixed(0)}°` : '—'}</Text>
          <Text style={styles.hudSmall}>
            {dir ? `${t('ar.tilt')} ${dir.elevation >= 0 ? '+' : ''}${dir.elevation.toFixed(0)}°` : ''}
            {acc != null ? ` · GPS ±${acc.toFixed(0)} m` : ''}
          </Text>
        </View>
        <Pressable onPress={() => setShowSettings((v) => !v)} style={styles.iconBtn} accessibilityLabel={t('ar.settings')}>
          <MaterialCommunityIcons name="tune-variant" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Warnings */}
      <View style={[styles.warnBox, { top: insets.top + 70 }]} pointerEvents="none">
        {available === false && <Text style={styles.warn}>{t('ar.noSensors')}</Text>}
        {!current && <Text style={styles.warn}>{t('map.waitingGps')}</Text>}
        {acc != null && acc > 10 && <Text style={styles.warn}>{t('ar.lowAccuracy', { acc: acc.toFixed(0) })}</Text>}
        {current && eyeAlt == null && <Text style={styles.warn}>{t('ar.noHeight')}</Text>}
      </View>

      {showSettings && (
        <View style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.panelTitle}>{t('ar.calibrate')}</Text>
          <Text style={styles.panelHelp}>{t('ar.calibrateHelp')}</Text>

          <Stepper
            label={t('ar.headingOffset')}
            value={`${settings.arHeadingOffset > 0 ? '+' : ''}${settings.arHeadingOffset}°`}
            onMinus={() => update({ arHeadingOffset: settings.arHeadingOffset - 1 })}
            onPlus={() => update({ arHeadingOffset: settings.arHeadingOffset + 1 })}
          />
          <Stepper
            label={t('ar.fov')}
            value={`${settings.arFov}°`}
            onMinus={() => update({ arFov: Math.max(30, settings.arFov - 1) })}
            onPlus={() => update({ arFov: Math.min(100, settings.arFov + 1) })}
          />

          <Text style={styles.panelLabel}>{t('ar.radius')}</Text>
          <View style={[ui.row, { flexWrap: 'wrap' }]}>
            {RADII.map((r) => (
              <Pressable key={r} onPress={() => update({ arRadiusM: r })} style={[ui.chip, settings.arRadiusM === r && ui.chipActive]}>
                <Text style={[ui.chipText, styles.white, settings.arRadiusM === r && ui.chipTextActive]}>{formatDistance(r)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.panelLabel}>{t('ar.heightSource')}</Text>
          <View style={[ui.row, { flexWrap: 'wrap' }]}>
            {(['terrain', 'gps'] as const).map((m) => (
              <Pressable key={m} onPress={() => update({ arHeight: m })} style={[ui.chip, settings.arHeight === m && ui.chipActive]}>
                <Text style={[ui.chipText, styles.white, settings.arHeight === m && ui.chipTextActive]}>{t(`ar.height_${m}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.panelHelp}>{t('ar.heightHelp')}</Text>

          <Pressable onPress={() => update({ arHeadingOffset: 0, arFov: 65 })} style={{ marginTop: 6 }}>
            <Text style={{ color: '#90caf9', fontWeight: '600' }}>{t('ar.reset')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={[ui.row, { justifyContent: 'space-between', marginVertical: 4 }]}>
      <Text style={styles.white}>{label}</Text>
      <View style={[ui.row, { gap: 10 }]}>
        <Pressable onPress={onMinus} style={styles.stepBtn} hitSlop={6}>
          <MaterialCommunityIcons name="minus" size={22} color="#fff" />
        </Pressable>
        <Text style={[styles.white, { minWidth: 48, textAlign: 'center', fontWeight: '700' }]}>{value}</Text>
        <Pressable onPress={onPlus} style={styles.stepBtn} hitSlop={6}>
          <MaterialCommunityIcons name="plus" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/** Arrow at the screen edge pointing towards a target that is out of view. */
function EdgeArrow({ angle, width, height }: { angle: number; width: number; height: number }) {
  const rad = (angle * Math.PI) / 180;
  const rx = width / 2 - 40;
  const ry = height / 2 - 120;
  const x = width / 2 + Math.sin(rad) * rx;
  const y = height / 2 - Math.cos(rad) * ry;
  return (
    <G transform={`translate(${x},${y}) rotate(${angle})`}>
      <Polygon points="0,-22 16,12 0,4 -16,12" fill={colors.nav} stroke="#fff" strokeWidth={2} />
    </G>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  white: { color: '#fff' },
  topBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  hud: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center' },
  hudBig: { color: '#fff', fontSize: 20, fontWeight: '700' },
  hudSmall: { color: '#ddd', fontSize: 12 },
  warnBox: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 4 },
  warn: { color: '#fff', backgroundColor: 'rgba(198,40,40,0.8)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, fontSize: 12 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', padding: 16 },
  panelTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  panelHelp: { color: '#bbb', fontSize: 12, marginVertical: 4 },
  panelLabel: { color: '#fff', marginTop: 8, marginBottom: 4, fontWeight: '600' },
  stepBtn: { width: 40, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
