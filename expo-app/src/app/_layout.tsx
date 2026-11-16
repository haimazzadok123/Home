import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { RadioProvider } from '@/state/radio';
import { SettingsProvider } from '@/state/settings';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SettingsProvider>
        <RadioProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
        </RadioProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
