import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/QueryState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ar } from '@/i18n/ar';
import { colors, spacing } from '@/theme';

/** Any unknown link (deleted product, old shared link…): a branded Arabic page instead of Expo's default. */
export default function NotFoundScreen() {
  return (
    <View style={styles.screen}>
      <ScreenHeader title={ar.notFound.title} />
      <EmptyState
        icon="compass-outline"
        title={ar.notFound.title}
        hint={ar.notFound.hint}
        action={
          <View style={styles.actions}>
            <Button title={ar.notFound.home} onPress={() => router.replace('/')} />
            <Button title={ar.notFound.categories} variant="outline" onPress={() => router.replace('/categories')} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.lg },
});
