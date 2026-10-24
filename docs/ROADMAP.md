# Roadmap

## Done — v0.1

- Satellite / street / topographic / military / custom base maps
- KML, KMZ, GPX, DXF import (DXF with UTM, Gauss–Krüger, WGS84; CRS auto-guess)
- Live coordinates (UTM / DD / DMS), elevation, accuracy, speed, point measuring
- Route recording with timeline, statistics, elevation profile, GPX/KML export
- Waypoints (typed coordinates in DD/DMS/UTM/Gauss–Krüger) and navigation to a point
- Background route recording with the screen off (development / store builds)
- Large DXF layers: on-screen-only drawing with zoom-dependent detail; chunked import with progress
- Elevation: Android geoid correction (EGM96), terrain model (AWS Terrain Tiles) incl. offline
- Measuring tool: distance, area, bearing, elevation profile and gradients; save as layer
- Camera view (AR) of layers, waypoints and the navigation target
- Mongolian (default) and English interface
- Offline maps: automatic tile cache and "download this area" (Android and iOS)

## Next

1. **Test on real phones** in the field: GPS behaviour, tile URLs, large DXF files.
2. **DWG support** — a small conversion server (LibreDWG or ODA SDK) the app uploads DWG files to,
   receiving DXF/GeoJSON back.
3. **Local mine grids** — custom CRS by entering a proj4 string or a 2-point/3-point transformation.
4. Share layers and routes between phones; sync with a company server.
5. **Elevation from mine survey data** — interpolate heights from imported DXF contours / survey
   points (TIN), which reflect the current pit and dumps unlike the satellite terrain model.
6. **MapLibre map engine** — if layers grow beyond what on-screen drawing can handle (vector tiles, MBTiles).
9. **Camera view with ARCore/ARKit tracking** — steadier overlays at close range (< 20 m) using the
   phone's visual tracking; needs a development build and native AR libraries.
