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

### Expo Go limitation: no recording with the screen off

Expo Go cannot record routes in the background. In Expo Go the app keeps the screen on while
recording and shows a note under the Record button. For real field use, install a
**development build** (step 6) — then recording continues with the screen off or the phone in
your pocket.

## 5. Making changes

Edit files in `src/` with VS Code and save — the app on your phone reloads automatically.
Before committing, run:

```bash
npm test
npm run typecheck
```

## 6. Building the app (needed for background recording)

Builds are made in Expo's cloud — you don't need Android Studio or a Mac.

1. Create a free account at <https://expo.dev>.
2. `npx eas-cli@latest login`
3. Pick a build type (profiles are defined in `eas.json`):
   - **Development build** — like Expo Go but with all of this app's features; code changes still
     reload instantly: `npx eas-cli@latest build --profile development --platform android`.
     Install it on the phone from the link EAS gives you, then run `npx expo start` as usual.
   - **Test build to share with colleagues** (Android `.apk`, no computer needed):
     `npx eas-cli@latest build --profile preview --platform android`
   - **Store build:** `npx eas-cli@latest build --profile production --platform android`
     (and `--platform ios`, which needs an Apple Developer account, 99 USD/year).

### Background recording — what the user sees

- **Android:** a notification "Uudam таны замыг бичиж байна" stays while recording. Recording
  keeps going even if the app is swiped away; open the app and press Зогсоох to stop. On some
  phones (Xiaomi, Huawei, Samsung "battery optimisation") set Uudam's battery setting to
  "No restrictions", otherwise the phone may stop it after a while.
- **iPhone:** a blue location indicator shows in the status bar while recording.
- Only the normal "While using the app" location permission is needed, because recording is always
  started from the open app.

### Google Maps key (Android builds only)

On Android the map engine is Google Maps, which needs a free API key in real builds
(Expo Go doesn't need one):

1. <https://console.cloud.google.com> → create a project → enable **Maps SDK for Android**.
2. Create an API key (restrict it to Android apps with package `mn.uudam.app`).
3. Give it to the build as an environment variable named `GOOGLE_MAPS_ANDROID_API_KEY`
   (on expo.dev: Project → Environment variables). Never commit the key into git.

The Maps SDK for mobile apps is free to use (no per-map-load charge).
