import type { ConfigContext, ExpoConfig } from 'expo/config';

// Most settings live in app.json. This file only adds the Google Maps key,
// which is read from an environment variable so it is never committed to git.
// Android production builds need it (Expo Go works without it).
// See docs/PUBLISHING.md → step 2.
const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
if (!mapsKey && process.env.EAS_BUILD_PLATFORM === 'android') {
  // Without the key the map stays blank in Android builds. See docs/PUBLISHING.md, step 2.
  console.warn('GOOGLE_MAPS_ANDROID_API_KEY is not set: maps will not show in this Android build.');
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    [
      'react-native-maps',
      { androidGoogleMapsApiKey: mapsKey },
    ],
  ],
});
