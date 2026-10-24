import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';
import { colors } from '../../components/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <MaterialCommunityIcons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.map'), headerShown: false, tabBarIcon: icon('map-outline') }} />
      <Tabs.Screen name="tracks" options={{ title: t('tabs.tracks'), tabBarIcon: icon('timeline-clock-outline') }} />
      <Tabs.Screen name="waypoints" options={{ title: t('tabs.waypoints'), tabBarIcon: icon('map-marker-multiple-outline') }} />
      <Tabs.Screen name="layers" options={{ title: t('tabs.layers'), tabBarIcon: icon('layers-triple-outline') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}
