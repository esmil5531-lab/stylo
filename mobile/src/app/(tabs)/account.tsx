import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { useMe } from '@/api/hooks';
import { Button } from '@/components/Button';
import { SignInPrompt } from '@/components/SignInPrompt';
import { QueryState } from '@/components/QueryState';
import { addressLine } from '@/components/address/AddressCard';
import { BRAND } from '@/constants/brand';
import { ar } from '@/i18n/ar';
import { directionalIcons } from '@/i18n/rtl';
import { setSession, useSession } from '@/lib/session';
import { appVersion, supportWhatsAppUrl } from '@/lib/support';
import { colors, fonts, radius, spacing } from '@/theme';

function formatPhone(p: string | null): string {
  const m = /^\+218(\d{2})(\d{3})(\d{4})$/.exec(p ?? '');
  return m ? `+218 ${m[1]} ${m[2]} ${m[3]}` : (p ?? '');
}

export default function AccountScreen() {
  const me = useMe();
  const { signedIn } = useSession();
  const support = supportWhatsAppUrl();
  const signOut = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    await setSession(null);
  };
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{ar.account.title}</Text>
      <ScrollView contentContainerStyle={styles.content}>
        {!signedIn ? (
          <SignInPrompt />
        ) : (
        <QueryState query={me}>
          {(user) => (
            <>
              <View style={styles.profile}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.fullName.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{user.fullName}</Text>
                  {/* +218 91 234 5678 — keep the number left-to-right */}
                  <Text style={[styles.muted, { writingDirection: 'ltr' }]}>{formatPhone(user.phone)}</Text>
                </View>
              </View>

              <View style={styles.list}>
                {user.role === 'driver' && (
                  <Row
                    icon="bicycle-outline"
                    label={ar.account.driverPanel}
                    value={ar.account.driverPanelHint}
                    onPress={() => router.push('/driver' as Href)}
                  />
                )}
                <Row icon="receipt-outline" label={ar.account.orders} onPress={() => router.push('/orders')} />
                <Row
                  icon="location-outline"
                  label={ar.account.address}
                  value={
                    user.defaultAddress
                      ? `${ar.account.addressesCount(user.addressesCount)} · ${addressLine(user.defaultAddress)}`
                      : ar.account.noAddress
                  }
                  onPress={() => router.push('/addresses' as Href)}
                />
                <Row
                  icon="person-outline"
                  label={ar.account.editName}
                  value={user.fullName}
                  onPress={() => router.push('/profile' as Href)}
                />
              </View>
              <Button title={ar.auth.signOut} variant="outline" onPress={() => void signOut()} />
            </>
          )}
        </QueryState>
        )}

        {/* For everyone (guests too): help and the legal pages. */}
        <Text style={styles.section}>{ar.account.help}</Text>
        <View style={styles.list}>
          {support && (
            <Row
              icon="logo-whatsapp"
              label={ar.account.contact}
              value={ar.account.contactHint}
              onPress={() => void Linking.openURL(support)}
            />
          )}
          <Row icon="document-text-outline" label={ar.account.terms} onPress={() => router.push('/legal/terms' as Href)} />
          <Row
            icon="shield-checkmark-outline"
            label={ar.account.privacy}
            onPress={() => router.push('/legal/privacy' as Href)}
          />
          <Row
            icon="swap-horizontal-outline"
            label={ar.account.returns}
            onPress={() => router.push('/legal/returns' as Href)}
          />
        </View>
        {signedIn && (
          <Pressable style={styles.delete} onPress={() => router.push('/delete-account' as Href)} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.deleteText}>{ar.account.deleteAccount}</Text>
          </Pressable>
        )}
        <Text style={styles.tagline}>
          {BRAND.nameAr} — {BRAND.taglineAr}
          {appVersion ? `\n${ar.account.version(appVersion)}` : ''}
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
  section: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 24, color: colors.inkSecondary, marginBottom: -spacing.sm },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 44 },
  deleteText: { fontFamily: fonts.semiBold, fontSize: 14, lineHeight: 22, color: colors.danger },
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
  tagline: { fontFamily: fonts.regular, fontSize: 12, color: colors.inkMuted, textAlign: 'center' },
});
