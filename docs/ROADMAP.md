# Roadmap

## Done — v0.1

- Satellite / street / topographic / military / custom base maps
- KML, KMZ, GPX, DXF import (DXF with UTM, Gauss–Krüger, WGS84; CRS auto-guess)
- Live coordinates (UTM / DD / DMS), elevation, accuracy, speed, point measuring
- Route recording with timeline, statistics, elevation profile, GPX/KML export
- Mongolian (default) and English interface
- Android tile cache for offline use

## Next

1. **Test on real phones** in the field: GPS behaviour, tile URLs, large DXF files.
2. **Background recording** — keep recording with the screen off. Needs a "development build"
   (no longer Expo Go) plus `expo-task-manager`, background location permission and an Android
   foreground-service notification.
3. **Download an area for offline use** (choose a rectangle and zoom levels) and iOS tile caching.
4. **DWG support** — a small conversion server (LibreDWG or ODA SDK) the app uploads DWG files to,
   receiving DXF/GeoJSON back.
5. **Faster drawing of very large CAD files** — switch the map engine to MapLibre
   (`@maplibre/maplibre-react-native`) which draws vector data on the GPU and supports MBTiles.
6. **Waypoints & navigation to a point** — save named points, arrow + distance to target.
7. **Local mine grids** — custom CRS by entering a proj4 string or a 2-point/3-point transformation.
8. **Elevation from a DEM** instead of raw GPS altitude (GPS altitude is typically ±10–20 m).
9. Share layers and routes between phones; sync with a company server.
