import type { TrackPoint } from '../geo/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** GPX 1.1 — opens in Garmin BaseCamp, Google Earth, QGIS, most GPS apps. */
export function toGpx(name: string, points: TrackPoint[]): string {
  const pts = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
        (p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '') +
        `<time>${new Date(p.t).toISOString()}</time></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Uudam" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/** KML with a timestamped track (gx:Track) so Google Earth can replay the route over time. */
export function toKml(name: string, points: TrackPoint[]): string {
  const when = points.map((p) => `        <when>${new Date(p.t).toISOString()}</when>`).join('\n');
  const coords = points.map((p) => `        <gx:coord>${p.lon.toFixed(7)} ${p.lat.toFixed(7)} ${(p.alt ?? 0).toFixed(1)}</gx:coord>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>${esc(name)}</name>
    <Style id="route"><LineStyle><color>ff0000ff</color><width>4</width></LineStyle></Style>
    <Placemark>
      <name>${esc(name)}</name>
      <styleUrl>#route</styleUrl>
      <gx:Track>
        <altitudeMode>absolute</altitudeMode>
${when}
${coords}
      </gx:Track>
    </Placemark>
  </Document>
</kml>
`;
}
