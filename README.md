# Uudam — offline-friendly navigation for mine sites

Uudam is a mobile navigation app for **Android and iOS** (one shared codebase, built with
[Expo](https://expo.dev) / React Native). The interface is **Mongolian by default**, with English
available in Settings. Code, comments and developer docs are in English.

> **Монгол товч:** Uudam нь Android болон iOS-д зориулсан навигацийн програм. Хиймэл дагуул,
> гудамж, байр зүйн болон цэргийн (ЗХУ-ын Жанжин штаб) газрын зураг; KML/KMZ/GPX/DXF файл оруулах;
> явсан зам, байршил, өндрийг цаг хугацаатай нь бичиж хадгалах боломжтой. Ажиллуулах заавар:
> [docs/SETUP.md](docs/SETUP.md).

## Features (version 0.1)

| Area | What it does |
| --- | --- |
| **Base maps** | Satellite (Esri, Esri + labels, Google/Apple satellite & hybrid, Sentinel-2), street (OpenStreetMap, CARTO, Esri, Google/Apple), topographic / landscape (OpenTopoMap with contours, Esri topo, shaded relief, NatGeo, Google terrain), military (Soviet General Staff maps 1:200k – 1:25k), plus **your own tile servers** (e.g. a mine drone orthophoto). |
| **Import** | **KML, KMZ, GPX** (already lat/lon). Large layers (100 000+ lines) stay smooth: only what is on screen is drawn, simplified to the zoom level. **DXF** with a coordinate-system dialog: WGS84, UTM 45N–50N (MONREF97), Pulkovo-1942 Gauss–Krüger zones 15–21 (with or without zone prefix), automatic guess, X/Y swap, CAD-layer filter, line simplification, arcs/bulges/circles/text/blocks. **DWG** is explained to the user (convert to DXF first — see below). |
| **Position** | Live coordinates in UTM, decimal degrees or DMS; GPS elevation, accuracy, speed. Long-press any point → its coordinates, distance and bearing from you. |
| **Waypoints & navigation** | Save points by long-pressing the map, from your GPS position, or by typing coordinates in decimal degrees, DMS, UTM (with or without zone) or Gauss–Krüger with zone prefix — the app shows how it read them. Navigate to any point: dashed line on the map, distance, bearing, height difference, time to arrive, and an arrow that points to the target (GPS direction when moving, compass when standing); the phone vibrates on arrival. Export all points as GPX/KML. |
| **Measuring** | Tap points on the map for distance or area (m², ha, km²) and perimeter, segment length and bearing; drag points to adjust. Elevation profile along the line with overall gradient, steepest 50 m gradient (e.g. haul-road ramps), climb/descent and slope length. Save a measurement as a layer. Distances and areas use the WGS84 ellipsoid (survey-grade for site-sized work). |
| **Camera view (AR)** | Point the phone's camera and see imported KML/KMZ/DXF lines and points, saved waypoints and the navigation target drawn over the live picture, with names and distances, a horizon line, and an edge arrow towards an off-screen target. Drawings with heights (DXF Z) are placed in 3D. Uses GPS + compass/gyro (no special AR hardware); in-screen calibration for direction and camera angle. |
| **Elevation** | Android GPS heights are corrected from the ellipsoid to sea level (EGM96 geoid, ~40 m in Mongolia). A terrain model (SRTM-based AWS Terrain Tiles, ~30 m) gives ground height on the map, for picked points, waypoints, navigation height difference, route profiles (GPS or terrain) and measurements; included in offline downloads. Note: the terrain model predates current pits and dumps. |
| **Route timeline** | Record routes (point every 1/5/10/25 m, poor GPS fixes filtered). Saved with timestamps, elevation, speed and accuracy, grouped by day. Detail page: map, distance, duration, ascent/descent, min/max elevation, speeds, **elevation profile**, full point log. Export **GPX** or **KML** (time-stamped, replays in Google Earth). **Keeps recording with the screen off** or the app in the background (Android shows a notification while recording). Every point is written to the phone immediately, so a crash or dead battery doesn't lose the route. |
| **Offline** | Download any map area for use without signal (choose the detail level, see tile count and size first; resume or delete in Settings). Tiles you view are also cached automatically. Imported layers and routes are always stored on the phone. |

## Quick start

See **[docs/SETUP.md](docs/SETUP.md)** — written for people who have never programmed. Short version:

```bash
npm install
npx expo start      # scan the QR code with the "Expo Go" app on your phone
```

## Project layout

```
src/
  app/                 Screens (Expo Router: each file is a screen)
    (tabs)/index.tsx     Map
    (tabs)/tracks.tsx    Route timeline
    (tabs)/waypoints.tsx Saved points
    (tabs)/layers.tsx    Imported layers + file import
    (tabs)/settings.tsx  Language, coordinate format, custom maps, cache
    track/[id].tsx       One recorded route
  components/          Reusable UI (map layers, base-map picker, DXF dialog, elevation chart)
  geo/                 Maths: distances, stats, coordinate systems (proj4), formatting
  importers/           KML/KMZ/GPX and DXF readers
  i18n/                Translations — mn.ts (default) and en.ts
  maps/basemaps.ts     The list of base maps
  state/               App state: settings, data (layers/tracks), GPS & recording
  storage/files.ts     Saving to the phone's storage
  tracking/export.ts   GPX / KML export
tests/                 Automated tests (npm test)
docs/                  Setup, maps & licensing, roadmap
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the development server (open on phone with Expo Go or the development build) |
| `npm test` | Run automated tests (coordinate maths, KML/KMZ/DXF import) |
| `npm run typecheck` | Check the code for type errors |

## Important notes

- **DWG files:** DWG is a closed Autodesk format; there is no reliable free library that reads it on a
  phone. Save as DXF in AutoCAD / Civil 3D / Micromine / Surpac exports, or use the free
  [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter). A server-side
  converter is on the [roadmap](docs/ROADMAP.md).
- **Map licences:** the free tile servers are fine for testing and light use. Before publishing to
  the App Store / Google Play, read [docs/MAPS.md](docs/MAPS.md).
- **Adding a language string:** add the key to `src/i18n/en.ts` *and* `src/i18n/mn.ts`. TypeScript
  reports an error if Mongolian is missing a key.
