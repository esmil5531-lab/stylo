import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useProductReviews, useSaveReview } from '@/api/hooks';
import type { ProductReviews } from '@/api/types';
import { Button } from '@/components/Button';
import { ar } from '@/i18n/ar';
import { formatDate } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';

const t = ar.reviews;

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={styles.stars} accessibilityLabel={t.star(value)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= Math.round(value) ? 'star' : 'star-outline'} size={size} color={colors.star} />
      ))}
    </View>
  );
}

/** «التقييمات» on the product page: summary, her review form (product received), latest reviews. */
export function ReviewsSection({ productId }: { productId: string }) {
  const reviews = useProductReviews(productId);
  const data = reviews.data;
  if (!data) return null;
  const { summary } = data;
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t.title}</Text>
      {summary.count > 0 ? (
        <View style={styles.summary}>
          <View style={styles.avgBox}>
            <Text style={styles.avg}>{summary.average.toFixed(1)}</Text>
            <Stars value={summary.average} />
            <Text style={styles.muted}>{t.count(summary.count)}</Text>
          </View>
          <View style={styles.bars}>
            {(['5', '4', '3', '2', '1'] as const).map((k) => (
              <View key={k} style={styles.barRow}>
                <Text style={styles.barLabel}>{k}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(summary.distribution[k] / summary.count) * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.muted}>{t.none}</Text>
      )}

      {(data.canReview || data.mine) && <MyReview productId={productId} data={data} />}

      {data.items.map((r) => (
        <View key={r.id} style={styles.item}>
          <View style={styles.itemHead}>
            <Stars value={r.rating} size={12} />
            <Text style={[styles.muted, styles.rtl]}>
              {r.author} · {formatDate(r.createdAt)}
              {r.edited ? ` · ${t.edited}` : ''}
            </Text>
          </View>
          {r.body && <Text style={styles.body}>{r.body}</Text>}
        </View>
      ))}
    </View>
  );
}

function MyReview({ productId, data }: { productId: string; data: ProductReviews }) {
  const save = useSaveReview(productId);
  const [editing, setEditing] = useState(!data.mine);
  const [rating, setRating] = useState(data.mine?.rating ?? 0);
  const [body, setBody] = useState(data.mine?.body ?? '');

  if (!editing && data.mine) {
    return (
      <View style={styles.mine}>
        <View style={styles.itemHead}>
          <Text style={styles.mineTitle}>{t.yours}</Text>
          <Stars value={data.mine.rating} size={13} />
        </View>
        {data.mine.body && <Text style={styles.body}>{data.mine.body}</Text>}
        {data.mine.hidden && <Text style={styles.hidden}>{t.hiddenNote}</Text>}
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.link}>{t.edit}</Text>
        </Pressable>
      </View>
    );
  }
  if (!data.canReview) return null;
  return (
    <View style={styles.mine}>
      <Text style={styles.mineTitle}>{t.writeTitle}</Text>
      <Text style={styles.muted}>{t.writeHint}</Text>
      <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel={t.pickStars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            hitSlop={4}
            accessibilityRole="radio"
            accessibilityState={{ checked: rating === n }}
            accessibilityLabel={t.star(n)}
          >
            <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={30} color={colors.star} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={t.placeholder}
        placeholderTextColor={colors.inkMuted}
        multiline
        maxLength={500}
        style={styles.input}
      />
      {save.isError && <Text style={styles.error}>{errorMessage(save.error)}</Text>}
      <Button
        title={data.mine ? t.update : t.send}
        disabled={rating === 0}
        loading={save.isPending}
        onPress={() =>
          save.mutate({ rating, body: body.trim() || null }, { onSuccess: () => setEditing(false) })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.md, paddingTop: spacing.lg, gap: spacing.md },
  title: { fontFamily: fonts.semiBold, fontSize: 17, lineHeight: 26, color: colors.ink },
  muted: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  rtl: { writingDirection: 'rtl' },
  stars: { flexDirection: 'row', gap: 2 },
  summary: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  avgBox: { alignItems: 'center', gap: 2 },
  avg: { fontFamily: fonts.semiBold, fontSize: 34, lineHeight: 44, color: colors.ink },
  bars: { flex: 1, gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: colors.inkMuted, width: 10 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  item: { gap: 4, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: colors.inkSecondary },
  mine: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  mineTitle: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 24, color: colors.ink },
  hidden: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, color: colors.warning },
  link: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.secondary },
  picker: { flexDirection: 'row', gap: spacing.sm },
  input: {
    minHeight: 80,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
    padding: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.ink,
    textAlignVertical: 'top',
    writingDirection: 'rtl',
  },
  error: { fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 20, color: colors.danger },
});
