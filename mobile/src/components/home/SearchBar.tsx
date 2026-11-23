import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

export function SearchBar({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const submit = () => {
    const term = q.trim();
    if (term) router.push({ pathname: '/products', params: { q: term, title: term } });
  };
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={18} color={colors.inkMuted} />
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={submit}
        returnKeyType="search"
        placeholder={ar.home.searchPlaceholder}
        placeholderTextColor={colors.inkMuted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.ink, paddingVertical: 0 },
});
