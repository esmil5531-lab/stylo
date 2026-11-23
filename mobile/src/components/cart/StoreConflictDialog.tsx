import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import type { StoreConflict } from '@/api/types';
import { ar } from '@/i18n/ar';
import { colors, fonts, radius, spacing } from '@/theme';

import { Button } from '../Button';

/** The `details` of a 409 `cart_store_conflict`, or null for any other error. */
export function storeConflictOf(err: unknown): StoreConflict | null {
  return err instanceof ApiError && err.code === 'cart_store_conflict' && err.details
    ? (err.details as StoreConflict)
    : null;
}

interface Pending {
  conflict: StoreConflict;
  onReplace: () => void;
  onKeep?: () => void;
}

/**
 * Single-store cart guard. Usage:
 *   const guard = useStoreConflictGuard();
 *   add.mutate(vars, { onError: (e) => guard.handle(e, {
 *     onReplace: () => add.mutate({ ...vars, replaceCart: true }),
 *     onKeep: add.reset }) });
 *   …render {guard.dialog}
 * `handle` returns false for errors that are not store conflicts.
 */
export function useStoreConflictGuard(): {
  handle: (err: unknown, actions: Omit<Pending, 'conflict'>) => boolean;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);

  const handle = useCallback((err: unknown, actions: Omit<Pending, 'conflict'>) => {
    const conflict = storeConflictOf(err);
    if (!conflict) return false;
    setPending({ conflict, ...actions });
    return true;
  }, []);

  const dialog = (
    <StoreConflictDialog
      conflict={pending?.conflict ?? null}
      onReplace={() => {
        pending?.onReplace();
        setPending(null);
      }}
      onKeep={() => {
        pending?.onKeep?.();
        setPending(null);
      }}
    />
  );

  return { handle, dialog };
}

export function StoreConflictDialog({
  conflict,
  onReplace,
  onKeep,
}: {
  conflict: StoreConflict | null;
  onReplace: () => void;
  onKeep: () => void;
}) {
  return (
    <Modal visible={!!conflict} transparent animationType="fade" onRequestClose={onKeep}>
      <Pressable style={styles.backdrop} onPress={onKeep} accessibilityLabel={ar.storeConflict.keep}>
        {conflict && (
          // Inner Pressable swallows taps so they don't close the dialog.
          <Pressable style={styles.card} onPress={() => undefined} accessibilityRole="alert">
            <View style={styles.icon}>
              <Ionicons name="storefront-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.title}>{ar.storeConflict.title}</Text>
            <Text style={styles.body}>
              {ar.storeConflict.body(
                conflict.currentStore.name,
                conflict.requestedStore.name,
                conflict.itemsCount,
              )}
            </Text>
            <Text style={styles.warning}>{ar.storeConflict.warning}</Text>
            <View style={styles.actions}>
              <Button title={ar.storeConflict.startNew(conflict.requestedStore.name)} onPress={onReplace} />
              <Button title={ar.storeConflict.keep} variant="outline" onPress={onKeep} />
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,10,16,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 23, color: colors.inkSecondary, textAlign: 'center' },
  warning: { fontFamily: fonts.semiBold, fontSize: 12, color: colors.danger },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
});
