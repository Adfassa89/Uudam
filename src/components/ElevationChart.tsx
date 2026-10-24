import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { haversine } from '../geo/measure';
import type { TrackPoint } from '../geo/types';
import { colors } from './theme';

const HEIGHT = 160;
const PAD = { left: 44, right: 8, top: 10, bottom: 22 };

/** Elevation (Y) against distance travelled (X). */
export function ElevationChart({ points, emptyText }: { points: TrackPoint[]; emptyText: string }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const series: { d: number; alt: number }[] = [];
  let dist = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) dist += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    const alt = points[i].alt;
    if (alt != null) series.push({ d: dist, alt });
  }

  if (series.length < 2) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  const minA = Math.min(...series.map((s) => s.alt));
  const maxA = Math.max(...series.map((s) => s.alt));
  const span = Math.max(maxA - minA, 10);
  const maxD = Math.max(series[series.length - 1].d, 1);
  const w = Math.max(width - PAD.left - PAD.right, 1);
  const h = HEIGHT - PAD.top - PAD.bottom;
  const x = (d: number) => PAD.left + (d / maxD) * w;
  const y = (a: number) => PAD.top + h - ((a - minA) / span) * h;

  const line = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.d).toFixed(1)},${y(s.alt).toFixed(1)}`).join(' ');
  const area = `${line} L${x(maxD).toFixed(1)},${PAD.top + h} L${PAD.left},${PAD.top + h} Z`;

  return (
    <View onLayout={onLayout} style={{ height: HEIGHT }}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          <Path d={area} fill={colors.primary} fillOpacity={0.15} />
          <Path d={line} stroke={colors.primary} strokeWidth={2} fill="none" />
          <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + h} stroke={colors.border} />
          <Line x1={PAD.left} y1={PAD.top + h} x2={PAD.left + w} y2={PAD.top + h} stroke={colors.border} />
          <SvgText x={PAD.left - 4} y={PAD.top + 8} fontSize={10} fill={colors.muted} textAnchor="end">
            {`${(minA + span).toFixed(0)} m`}
          </SvgText>
          <SvgText x={PAD.left - 4} y={PAD.top + h} fontSize={10} fill={colors.muted} textAnchor="end">
            {`${minA.toFixed(0)} m`}
          </SvgText>
          <SvgText x={PAD.left + w} y={HEIGHT - 6} fontSize={10} fill={colors.muted} textAnchor="end">
            {maxD < 1000 ? `${maxD.toFixed(0)} m` : `${(maxD / 1000).toFixed(2)} km`}
          </SvgText>
          <SvgText x={PAD.left} y={HEIGHT - 6} fontSize={10} fill={colors.muted}>
            0
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, paddingVertical: 16 },
});
