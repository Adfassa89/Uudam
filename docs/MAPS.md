# Base maps, licensing and military maps

All base maps are defined in [`src/maps/basemaps.ts`](../src/maps/basemaps.ts). Two kinds exist:

- **Native maps** (`nativeType`): Google Maps on Android, Apple Maps on iOS — satellite, hybrid,
  standard, terrain (Android only). Covered by the platform SDK licence; nothing extra to arrange.
- **Tile maps** (`tiles`): images downloaded from a tile server using a `{z}/{x}/{y}` URL.

> The tile URLs were written from the providers' public documentation but could not be tested from
> the development environment. Check every one on a real phone, and remove any that don't load.

## Licences — read before publishing

| Map | Free for development? | For a published app |
| --- | --- | --- |
| Esri (imagery, streets, topo, relief, NatGeo) | Yes, with attribution | Needs an ArcGIS Location Platform account (has a free tier); switch to their authenticated URLs |
| OpenStreetMap standard | Light use only | **Not allowed** for apps with many users — use a commercial OSM host (MapTiler, Stadia, Thunderforest…) |
| CARTO Voyager | Yes | Commercial use needs a CARTO licence |
| OpenTopoMap | Light use only | Ask the project or host your own tiles |
| Sentinel-2 cloudless 2016 (EOX) | Yes (CC BY 4.0) | Same, keep the attribution |
| Soviet General Staff (nakarte.me) | Personal use | Host your own copy (see below) |

Attribution text for each map is shown at the bottom of the base-map picker.

## Military maps (Soviet General Staff / Генштаб)

The Soviet military topographic maps cover all of Mongolia at 1:200 000, 1:100 000 and, in many
places, 1:50 000. The app includes the public tile layers from the nakarte.me project (TMS tiles).

For a production app, or for maps you already have as scanned/georeferenced images:

1. Georeference the scans (QGIS → Raster → Georeferencer) if they are not already.
2. Generate tiles: QGIS → Processing Toolbox → **Generate XYZ tiles (Directory)**, or
   `gdal2tiles.py --xyz -z 8-15 map.tif tiles/`.
3. Upload the `tiles/` folder to any web server or cloud bucket (company server, AWS S3, etc.).
4. In the app: **Тохиргоо → Миний зургийн серверүүд** → paste
   `https://your-server/tiles/{z}/{x}/{y}.png`.

The same steps work for **drone orthophotos** of the pit or a mine survey base map.

## Offline use in the pit

On Android each tile is saved in the app's storage after it is viewed (`tileCachePath`) and reused
without internet for 30 days, then refreshed when online. Before going to an area without signal,
pan and zoom over it once with the chosen base map. iOS caching and "download area" are on the
[roadmap](ROADMAP.md).
