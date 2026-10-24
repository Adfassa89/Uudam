import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CoordFormat } from '../geo/format';
import i18n, { type Language } from '../i18n';
import { BASEMAPS, DEFAULT_BASEMAP_ID, type Basemap } from '../maps/basemaps';

export interface Settings {
  language: Language;
  coordFormat: CoordFormat;
  basemapId: string;
  customBasemaps: Basemap[];
  /** Minimum distance between recorded route points, in metres. */
  recordDistanceM: number;
  /** Camera view: manual compass correction in degrees (+ turns the overlay right). */
  arHeadingOffset: number;
  /** Camera view: vertical field of view of the camera preview in degrees. */
  arFov: number;
  /** Camera view: show objects within this distance, metres. */
  arRadiusM: number;
  /** Camera view: your height from GPS, or from the terrain model + eye height. */
  arHeight: 'terrain' | 'gps';
}

const DEFAULTS: Settings = {
  language: 'mn',
  coordFormat: 'utm',
  basemapId: DEFAULT_BASEMAP_ID,
  customBasemaps: [],
  recordDistanceM: 5,
  arHeadingOffset: 0,
  arFov: 65,
  arRadiusM: 1000,
  arHeight: 'terrain',
};

const STORAGE_KEY = 'uudam.settings.v1';

interface SettingsCtx {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  allBasemaps: Basemap[];
  basemap: Basemap;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (i18n.language !== settings.language) i18n.changeLanguage(settings.language);
  }, [settings.language]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => {
    const allBasemaps = [...BASEMAPS, ...settings.customBasemaps];
    const basemap =
      allBasemaps.find((b) => b.id === settings.basemapId) ?? BASEMAPS.find((b) => b.id === DEFAULT_BASEMAP_ID)!;
    return { settings, loaded, update, allBasemaps, basemap };
  }, [settings, loaded, update]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
