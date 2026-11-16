import { Platform, useColorScheme } from 'react-native';

// The dashboard's blue / light-blue palette, in light and dark.
export const palette = {
  light: { bg: '#F0F9FF', card: '#FFFFFF', text: '#1E293B', muted: '#64748B', line: '#E2E8F0', accent: '#0284C7', soft: '#E0F2FE', up: '#15803D', upBg: '#DCFCE7', down: '#B91C1C', downBg: '#FEE2E2' },
  dark: { bg: '#060B18', card: '#111A2E', text: '#F1F5F9', muted: '#94A3B8', line: '#1E293B', accent: '#38BDF8', soft: '#0C2A4A', up: '#4ADE80', upBg: '#14321F', down: '#F87171', downBg: '#3A1717' },
};

export type Palette = (typeof palette)['light'];

export const usePalette = (): Palette => palette[useColorScheme() === 'dark' ? 'dark' : 'light'];

// The web tab bar floats over the top of the page, so web screens start lower.
export const topInset = Platform.OS === 'web' ? 88 : 16;
