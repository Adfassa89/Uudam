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
| **Import** | **KML, KMZ, GPX** (already lat/lon). **DXF** with a coordinate-system dialog: WGS84, UTM 45N–50N (MONREF97), Pulkovo-1942 Gauss–Krüger zones 15–21 (with or without zone prefix), automatic guess, X/Y swap, CAD-layer filter, line simplification, arcs/bulges/circles/text/blocks. **DWG** is explained to the user (convert to DXF first — see below). |
| **Position** | Live coordinates in UTM, decimal degrees or DMS; GPS elevation, accuracy, speed. Long-press any point → its coordinates, distance and bearing from you. |
| **Route timeline** | Record routes (point every 1/5/10/25 m, poor GPS fixes filtered). Saved with timestamps, elevation, speed and accuracy, grouped by day. Detail page: map, distance, duration, ascent/descent, min/max elevation, speeds, **elevation profile**, full point log. Export **GPX** or **KML** (time-stamped, replays in Google Earth). **Keeps recording with the screen off** or the app in the background (Android shows a notification while recording). Every point is written to the phone immediately, so a crash or dead battery doesn't lose the route. |
| **Offline** | On Android, every map tile you view is cached on the phone and works later without signal. Imported layers and routes are always stored on the phone. |

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
