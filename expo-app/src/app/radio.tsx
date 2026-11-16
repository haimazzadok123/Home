import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Muted } from '@/components/card';
import { topInset, usePalette } from '@/constants/palette';
import { BottomTabInset, MaxContentWidth } from '@/constants/theme';
import { STATIONS } from '@/lib/data';
import { useRadio } from '@/state/radio';

// Israeli radio stations from their official web streams. Volume: the phone's own buttons.
export default function RadioScreen() {
  const c = usePalette();
  const radio = useRadio();
  const station = radio.current >= 0 ? STATIONS[radio.current] : null;

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.player, { backgroundColor: c.accent }]}>
            <Text style={styles.playerLabel}>{station ? (radio.buffering ? 'טוען…' : 'מתנגן עכשיו') : 'רדיו'}</Text>
            <Text style={styles.playerName}>{station ? station.name : 'בחרו תחנה'}</Text>
            <Pressable
              onPress={radio.stop}
              disabled={!station}
              accessibilityRole="button"
              accessibilityLabel="עצירה"
              style={({ pressed }) => [styles.stop, { opacity: !station ? 0.4 : pressed ? 0.7 : 1 }]}>
              <View style={[styles.stopSquare, { backgroundColor: c.accent }]} />
            </Pressable>
          </View>

          <Card title="תחנות" aside="העוצמה בכפתורי הטלפון">
            <View style={styles.grid}>
              {STATIONS.map((s, i) => {
                const active = radio.current === i;
                return (
                  <Pressable
                    key={s.url}
                    onPress={() => (active ? radio.stop() : radio.play(i))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.station,
                      { backgroundColor: active ? c.accent : c.soft, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <Text style={[styles.stationText, { color: active ? '#FFFFFF' : c.text }]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Muted>הרדיו ממשיך לנגן כשעוברים ללשונית אחרת.</Muted>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

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
  player: { borderRadius: 28, paddingVertical: 28, alignItems: 'center', gap: 4 },
  playerLabel: { color: '#E0F2FE', fontSize: 15, fontWeight: '500' },
  playerName: { color: '#FFFFFF', fontSize: 40, fontWeight: '700' },
  stop: { marginTop: 14, width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 22, height: 22, borderRadius: 5 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  station: { flexGrow: 1, flexBasis: '45%', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  stationText: { fontSize: 17, fontWeight: '600' },
});
