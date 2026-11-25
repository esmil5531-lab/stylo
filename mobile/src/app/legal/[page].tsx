import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';
import { LEGAL, type LegalPage } from '@/i18n/legal.ar';
import { colors, fonts, spacing } from '@/theme';

import NotFoundScreen from '../+not-found';

/** /legal/terms · /legal/privacy · /legal/returns — public pages (also indexed on the website). */
export default function LegalScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const doc = LEGAL[page as LegalPage];
  if (!doc) return <NotFoundScreen />;
  return (
    <View style={styles.screen}>
      <ScreenHeader title={doc.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>{doc.updated}</Text>
        <Text style={styles.intro}>{doc.intro}</Text>
        {doc.sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.h}>{s.title}</Text>
            {s.body.map((p, i) => (
              <Text key={i} style={styles.p}>
                {p}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  updated: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  intro: {
    fontFamily: fonts.semiBold,
    fontSize: 15,
    lineHeight: 26,
    color: colors.ink,
  },
  section: { gap: spacing.xs },
  h: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 26,
    color: colors.ink,
  },
  p: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 24,
    color: colors.inkSecondary,
  },
});
