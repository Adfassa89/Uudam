# Setup guide (for non-programmers)

This guide takes you from zero to the app running on your own phone. You do **not** need Android
Studio or a Mac for the first steps.

## 1. Install the tools on your computer (once)

1. **Node.js** (the engine that runs the developer tools): download the "LTS" version from
   <https://nodejs.org> and install it with the default options.
2. **Git** (to download and save the code): <https://git-scm.com/downloads>.
3. A code editor — **Visual Studio Code** is free and easy: <https://code.visualstudio.com>.

## 2. Install "Expo Go" on your phone (once)

- Android: Google Play → search **Expo Go**
- iPhone: App Store → search **Expo Go**

Expo Go lets you run the app on your phone instantly while developing, without building it.

## 3. Download the code and start it

Open a terminal (Windows: "Command Prompt" or "PowerShell"; Mac: "Terminal") and type:

```bash
git clone https://github.com/adfassa89/uudam.git
cd uudam
git checkout claude/zen-dirac-315wd6     # the branch with the app (until it is merged)
npm install                              # downloads the libraries, takes a few minutes the first time
npx expo start
```

A **QR code** appears in the terminal.

- **Android:** open Expo Go → "Scan QR code".
- **iPhone:** open the normal Camera app and point it at the QR code.

The phone and the computer must be on the **same Wi-Fi**. If that is not possible (e.g. office
network blocks it), run `npx expo start --tunnel` instead.

The app opens in Mongolian. Allow location access when asked.

## 4. Try it out

1. **Map tab:** wait for GPS, then tap the layers button (top right) to switch base maps.
2. **Layers tab → Файл оруулах:** pick a KML/KMZ/DXF file from your phone (send it to yourself by
   e-mail/Telegram and save it to "Files" first). For DXF, choose the coordinate system — the app
   suggests one and shows where the drawing will land. If it is not in Mongolia, the choice is wrong.
3. **Map tab → Бичих:** walk/drive, then press **Зогсоох** and save. See it in the **Түүх** tab.

## 5. Making changes

Edit files in `src/` with VS Code and save — the app on your phone reloads automatically.
Before committing, run:

```bash
npm test
npm run typecheck
```

## 6. Building a real app for the stores (later)

Expo Go is for development. To install the app without Expo Go, or publish it:

1. Create a free account at <https://expo.dev>.
2. `npx eas-cli@latest login`
3. `npx eas-cli@latest build --platform android` (gives you an `.apk`/`.aab`)
   and `--platform ios` (needs an Apple Developer account, 99 USD/year).

### Google Maps key (Android builds only)

On Android the map engine is Google Maps, which needs a free API key in real builds
(Expo Go doesn't need one):

1. <https://console.cloud.google.com> → create a project → enable **Maps SDK for Android**.
2. Create an API key (restrict it to Android apps with package `mn.uudam.app`).
3. Give it to the build as an environment variable named `GOOGLE_MAPS_ANDROID_API_KEY`
   (on expo.dev: Project → Environment variables). Never commit the key into git.

The Maps SDK for mobile apps is free to use (no per-map-load charge).
