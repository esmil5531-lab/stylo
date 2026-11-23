import { StyleSheet, View } from 'react-native';

import type { ProductSummary } from '@/api/types';
import { spacing } from '@/theme';

import { ProductCard } from './ProductCard';

/** Two-column grid (rendered inside a ScrollView; lists here are short). */
export function ProductGrid({ products }: { products: ProductSummary[] }) {
  const rows: ProductSummary[][] = [];
  for (let i = 0; i < products.length; i += 2) rows.push(products.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0]!.id} style={styles.row}>
          {row.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
          {row.length === 1 && <View style={styles.spacer} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  spacer: { flex: 1 },
});
