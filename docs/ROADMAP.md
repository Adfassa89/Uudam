# Roadmap

## Done — v0.1

- Satellite / street / topographic / military / custom base maps
- KML, KMZ, GPX, DXF import (DXF with UTM, Gauss–Krüger, WGS84; CRS auto-guess)
- Live coordinates (UTM / DD / DMS), elevation, accuracy, speed, point measuring
- Route recording with timeline, statistics, elevation profile, GPX/KML export
- Waypoints (typed coordinates in DD/DMS/UTM/Gauss–Krüger) and navigation to a point
- Background route recording with the screen off (development / store builds)
- Mongolian (default) and English interface
- Offline maps: automatic tile cache and "download this area" (Android and iOS)

## Next

1. **Test on real phones** in the field: GPS behaviour, tile URLs, large DXF files.
2. **DWG support** — a small conversion server (LibreDWG or ODA SDK) the app uploads DWG files to,
   receiving DXF/GeoJSON back.
3. **Faster drawing of very large CAD files** — switch the map engine to MapLibre
   (`@maplibre/maplibre-react-native`) which draws vector data on the GPU and supports MBTiles.
4. **Local mine grids** — custom CRS by entering a proj4 string or a 2-point/3-point transformation.
5. **Elevation from a DEM** instead of raw GPS altitude (GPS altitude is typically ±10–20 m).
6. Share layers and routes between phones; sync with a company server.
