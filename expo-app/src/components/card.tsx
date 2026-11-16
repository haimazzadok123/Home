import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/constants/palette';

// A rounded card with a coloured title on the right and optional text on the left.
export function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const c = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.accent }]}>{title}</Text>
        {typeof aside === 'string' ? <Text style={[styles.aside, { color: c.muted }]}>{aside}</Text> : aside}
      </View>
      {children}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={[styles.aside, { color: c.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 18, gap: 8 },
  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 8, minHeight: 28 },
  title: { fontSize: 14, fontWeight: '700' },
  aside: { fontSize: 14, textAlign: 'right' },
});
