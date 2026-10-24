import '../i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider } from '../state/data';
import { LocationProvider } from '../state/location';
import { SettingsProvider, useSettings } from '../state/settings';

function Gate() {
  // Wait for saved settings (language etc.) so the UI doesn't flash in the wrong language.
  const { loaded } = useSettings();
  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <DataProvider>
      <LocationProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="track/[id]" options={{ title: '' }} />
        </Stack>
      </LocationProvider>
    </DataProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar style="dark" />
        <Gate />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
