# Testing on your Android phone and publishing to Google Play

Everything is built in Expo's cloud (EAS). You don't need Android Studio. Commands are typed in a
terminal inside the `uudam` folder.

## Step 1 — Expo account (free, once)

1. Sign up at <https://expo.dev>.
2. In the terminal:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
   `init` creates the project on expo.dev. If it says it cannot edit the config automatically, it
   prints a line like `"extra": { "eas": { "projectId": "…" } }` — add it inside `"expo": { … }` in
   `app.json` and save.

## Step 2 — Google Maps key (free, once) — **required, or the map is blank**

1. Go to <https://console.cloud.google.com>, sign in, create a project (e.g. "Uudam").
2. **APIs & Services → Library →** search **Maps SDK for Android → Enable**.
3. **APIs & Services → Credentials → Create credentials → API key.** Copy the key.
4. (Recommended) Click the key → **Application restrictions: Android apps** → add package
   `mn.uudam.app` and the SHA-1 fingerprints (from `npx eas-cli@latest credentials`, and later from
   Play Console → *App integrity* for the store version). **API restrictions:** Maps SDK for Android.
5. Store the key in Expo (never in git):
   ```bash
   npx eas-cli@latest env:create --name GOOGLE_MAPS_ANDROID_API_KEY --value YOUR_KEY \
     --environment development --environment preview --environment production --visibility sensitive
   ```

The Maps SDK for Android is free to use for showing maps in apps.

## Step 3 — Test build on your phone (APK)

```bash
npx eas-cli@latest build --platform android --profile preview
```

- The first time it asks to create an Android signing key — answer **Yes** (Expo keeps it safely).
- The build takes ~10–20 minutes. At the end you get a link and a QR code.
- On the phone (e.g. Samsung Galaxy S25): open the link → download the `.apk` → tap it. Android asks
  to **allow installing from this source** (your browser or "My Files") → allow → **Install**.
- Samsung may show "**Auto Blocker**" blocking unknown apps: *Settings → Security and privacy →
  Auto Blocker* → turn off temporarily, install, then turn it back on.
- You can send the same link to colleagues to test.

This build has everything, including recording with the screen off. Samsung tip: *Settings → Apps →
Uudam → Battery → Unrestricted*, otherwise Samsung may pause long recordings.

## Step 4 — Google Play developer account (25 USD, once)

1. <https://play.google.com/console> → sign up → pay the one-time 25 USD fee.
2. Choose **Personal** (just you) or **Organisation** (the company; needs a D-U-N-S number).
3. Verify your identity (passport/ID) and a phone number. This can take a few days.

> **New personal accounts must run a closed test first:** at least **12 testers** must have the app
> installed for **14 days in a row** before you can publish it publicly. Organisation accounts don't
> have this rule. Plan for it — colleagues at the mine are ideal testers.

## Step 5 — Before the first store release

| Item | Notes |
| --- | --- |
| **App icon** (512×512 PNG) and **feature graphic** (1024×500) | The app still has Expo's placeholder icon — replace `assets/icon.png` and `assets/android-icon-*.png` with your own design first. |
| **Screenshots** | At least 2 phone screenshots (take them on your S25). |
| **Store listing** | Name, short and full description — add Mongolian and English. |
| **Privacy policy URL** | Required (the app uses location and camera). A simple web page or a public Google Doc is fine: say that location, camera and files stay on the phone and are not sent to you; map tiles and elevation data are downloaded from the listed map providers. |
| **Data safety form** | Location (precise, used on device, not shared), photos/videos: none stored, files: user-selected files processed on device. |
| **Foreground service declaration** | Play Console → *App content → Foreground service permissions*: choose **Location**, explain "records the user's route while the screen is off, started by the user pressing Record", and upload a short screen recording showing that. |
| **Content rating, target audience, ads** | Questionnaires in *App content* (no ads; adults/workers). |
| **Map licences** | See [MAPS.md](MAPS.md) — before a public release, use providers that allow your use (or your own map server). |

## Step 6 — Build for the store and upload

```bash
npx eas-cli@latest build --platform android --profile production
```

This produces an **`.aab`** file (the format Google Play wants). Then:

1. Play Console → **Create app** (name "Uudam", default language Mongolian or English, App, Free).
2. **Testing → Closed testing → Create track → Create new release** → upload the `.aab` from the EAS
   build page. Add your testers' Google e-mail addresses, save, and send them the opt-in link.
3. After the 14-day test (personal accounts), **Production → Create new release** → reuse the same
   build → submit for review (usually 1–7 days).

Later updates: run the production build again (the version number increases automatically) and
upload it — or let EAS upload it with `npx eas-cli@latest submit --platform android` after setting up
a Google service account (see Expo's "Submit to Google Play" guide).

**Important:** the package name `mn.uudam.app` cannot be changed after the first upload. If you
want a different one (e.g. your company's), change `"package"` in `app.json` before Step 6.
