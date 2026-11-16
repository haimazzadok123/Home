import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// App settings, kept on the device with AsyncStorage and shared by every screen.

export type City = { name: string; lat: number; lon: number };

export type Settings = {
  city: City;
  finnhubKey: string;
  symbols: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  city: { name: 'תל אביב', lat: 32.0853, lon: 34.7818 },
  finnhubKey: '',
  symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TEVA'],
};

const KEY = 'home.settings.v1';

type SettingsContextValue = {
  settings: Settings;
  loaded: boolean;
  update: (changes: Partial<Settings>) => void;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  update: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, loaded, update }), [settings, loaded, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
