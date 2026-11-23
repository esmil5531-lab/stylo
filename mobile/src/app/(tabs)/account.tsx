import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMe } from '@/api/hooks';
import { QueryState } from '@/components/QueryState';
import { BRAND } from '@/constants/brand';
import { ar } from '@/i18n/ar';
import { directionalIcons } from '@/i18n/rtl';
import { colors, fonts, radius, spacing } from '@/theme';

export default function AccountScreen() {
  const me = useMe();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{ar.account.title}</Text>
      <ScrollView contentContainerStyle={styles.content}>
        <QueryState query={me}>
          {(user) => (
            <>
              <View style={styles.profile}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.fullName.charAt(0)}</Text>
                </View>
                <View>
                  <Text style={styles.name}>{user.fullName}</Text>
                  <Text style={styles.muted}>{user.email ?? user.phone}</Text>
                </View>
              </View>

              <View style={styles.list}>
                <Row icon="receipt-outline" label={ar.account.orders} onPress={() => router.push('/orders')} />
                <Row
                  icon="location-outline"
                  label={ar.account.address}
                  value={
                    user.defaultAddress
                      ? `${user.defaultAddress.city} · ${user.defaultAddress.district ?? user.defaultAddress.street}`
                      : ar.account.noAddress
                  }
                />
              </View>
            </>
          )}
        </QueryState>
        <Text style={styles.tagline}>
          {BRAND.nameAr} — {BRAND.taglineAr}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value && <Text style={styles.muted}>{value}</Text>}
      </View>
      {onPress && <Ionicons name={directionalIcons.next} size={18} color={colors.inkFaint} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  content: { padding: spacing.md, gap: spacing.lg },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 24, color: colors.white },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkMuted },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontFamily: fonts.semiBold, fontSize: 15, color: colors.ink },
  tagline: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkFaint, textAlign: 'center' },
});
