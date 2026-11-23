import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Renders loading / error-with-retry / content for a React Query result. */
export function QueryState<T>({
  query,
  children,
  minHeight = 160,
}: {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  minHeight?: number;
}) {
  if (query.isPending) {
    return (
      <View style={[styles.center, { minHeight }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (query.isError || query.data === undefined) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} minHeight={minHeight} />;
  }
  return <>{children(query.data)}</>;
}

export function ErrorState({
  message,
  onRetry,
  minHeight = 160,
}: {
  message: string;
  onRetry?: () => void;
  minHeight?: number;
}) {
  return (
    <View style={[styles.center, { minHeight }]}>
      <Ionicons name="cloud-offline-outline" size={32} color={colors.inkFaint} />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>{ar.common.retry}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <View style={[styles.center, styles.empty]}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint && <Text style={styles.message}>{hint}</Text>}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  message: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkMuted, textAlign: 'center' },
  retry: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  retryText: { fontFamily: fonts.semiBold, color: colors.primary, fontSize: 13 },
  empty: { paddingVertical: 64 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
});
