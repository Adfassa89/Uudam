import type { ConfigContext, ExpoConfig } from 'expo/config';

// Most settings live in app.json. This file only adds the Google Maps key,
// which is read from an environment variable so it is never committed to git.
// Android production builds need it (Expo Go works without it).
// See docs/SETUP.md → "Google Maps key".
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    [
      'react-native-maps',
      { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
    ],
  ],
});
