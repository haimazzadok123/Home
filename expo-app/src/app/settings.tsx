import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Muted } from '@/components/card';
import { topInset, usePalette, type Palette } from '@/constants/palette';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { searchCities } from '@/lib/data';
import { useSettings, type City } from '@/state/settings';


// City for the weather, the Finnhub key and the stock symbols. Saved on the device only.
export default function SettingsScreen() {
  const c = usePalette();
  const { settings, update } = useSettings();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(City & { region: string })[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [key, setKey] = useState(settings.finnhubKey);
  const [symbols, setSymbols] = useState(settings.symbols.join(', '));
  const [saved, setSaved] = useState(false);

  // the stored settings arrive after the first render
  useEffect(() => {
    setKey(settings.finnhubKey);
    setSymbols(settings.symbols.join(', '));
  }, [settings.finnhubKey, settings.symbols]);

  // search as you type, after a short pause
  useEffect(() => {
    const name = query.trim();
    if (name.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => searchCities(name).then(setResults, () => setResults([])), 350);
    return () => clearTimeout(id);
  }, [query]);

  const chooseCity = (city: City) => {
    update({ city: { name: city.name, lat: city.lat, lon: city.lon } });
    setQuery('');
    setResults([]);
  };

  const useMyLocation = async () => {
    setLocationError('');
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('לא התקבלה הרשאה למיקום.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      update({
        city: { name: 'המיקום שלי', lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3) },
      });
    } catch {
      setLocationError('לא הצלחתי לקבל את המיקום.');
    } finally {
      setLocating(false);
    }
  };

  const saveStocks = () => {
    const list = symbols
      .toUpperCase()
      .split(/[\s,]+/)
      .filter((s) => /^[A-Z0-9.^=-]{1,10}$/.test(s))
      .slice(0, 20);
    update({ finnhubKey: key.trim(), ...(list.length ? { symbols: list } : {}) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card title="עיר למזג האוויר" aside={`נבחר: ${settings.city.name}`}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="חיפוש עיר…"
              placeholderTextColor={c.muted}
              style={input(c)}
              autoCorrect={false}
              returnKeyType="search"
            />
            {results.map((r) => (
              <Pressable
                key={`${r.lat},${r.lon}`}
                onPress={() => chooseCity(r)}
                style={({ pressed }) => [styles.result, { backgroundColor: c.soft, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={[styles.resultName, { color: c.text }]}>{r.name}</Text>
                <Muted>{r.region}</Muted>
              </Pressable>
            ))}
            <Button c={c} label={locating ? 'מאתר…' : 'המיקום שלי'} onPress={useMyLocation} disabled={locating} />
            {!!locationError && <Muted>{locationError}</Muted>}
          </Card>

          <Card title="מניות">
            <Text style={[styles.label, { color: c.muted }]}>מפתח Finnhub (חינמי, מ-finnhub.io)</Text>
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder="המפתח שלך"
              placeholderTextColor={c.muted}
              style={[input(c), styles.ltr]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.label, { color: c.muted }]}>סימולים, מופרדים בפסיק</Text>
            <TextInput
              value={symbols}
              onChangeText={setSymbols}
              style={[input(c), styles.ltr]}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button c={c} label={saved ? 'נשמר ✓' : 'שמירה'} onPress={saveStocks} primary />
            <Muted>המפתח נשמר רק במכשיר הזה.</Muted>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Button({ c, label, onPress, disabled, primary }: { c: Palette; label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: primary ? c.accent : c.soft, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.buttonText, { color: primary ? '#FFFFFF' : c.accent }]}>{label}</Text>
    </Pressable>
  );
}

const input = (c: Palette) => [styles.input, { color: c.text, borderColor: c.line, backgroundColor: c.bg }];

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: 16,
    paddingTop: topInset,
    paddingBottom: BottomTabInset + 24,
    gap: 14,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, textAlign: 'right' },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  label: { fontSize: 13, textAlign: 'right', marginTop: 4 },
  result: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'flex-end' },
  resultName: { fontSize: 16, fontWeight: '600' },
  button: { borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
