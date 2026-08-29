import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, ShieldCheck, Sparkles, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export function MetadataIntroModal({
  visible,
  onClose,
  onContinue,
}: {
  visible: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const { theme, t } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ backgroundColor: theme.bg, flex: 1, paddingBottom: insets.bottom, paddingTop: insets.top }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg * 1.5, paddingVertical: spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ alignSelf: 'center', maxWidth: 560, width: '100%' }}>
            <Pressable onPress={onClose} hitSlop={12} style={{ alignSelf: 'flex-end', padding: spacing.xs }}>
              <X color={theme.textSecondary} size={22} />
            </Pressable>

            <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
              <View style={{ alignItems: 'center', backgroundColor: theme.accentMuted, borderRadius: 999, height: 76, justifyContent: 'center', width: 76 }}>
                <Sparkles color={theme.accent} size={36} />
              </View>
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26, fontWeight: '700', marginTop: spacing.lg, textAlign: 'center' }}>
                {t('metadata.introTitle')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 15, lineHeight: 22, marginTop: spacing.sm, textAlign: 'center' }}>
                {t('metadata.introSubtitle')}
              </Text>
            </View>

            <View style={{ gap: spacing.sm }}>
              <InfoCard icon={Sparkles} title={t('metadata.introHowTitle')} text={t('metadata.introHowText')} />
              <InfoCard icon={ShieldCheck} title={t('metadata.introPrivacyTitle')} text={t('metadata.introPrivacyText')} />
              <InfoCard icon={Eye} title={t('metadata.introReviewTitle')} text={t('metadata.introReviewText')} />
            </View>

            <Pressable
              onPress={onContinue}
              style={{ backgroundColor: theme.accent, borderRadius: radii.md, marginTop: spacing.xl, paddingVertical: spacing.md }}
            >
              <Text style={{ color: theme.bg, fontFamily: serifFont, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
                {t('metadata.introContinue')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Sparkles;
  title: string;
  text: string;
}) {
  const { theme } = useApp();
  return (
    <View style={{ backgroundColor: theme.card, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md }}>
      <View style={{ alignItems: 'center', backgroundColor: theme.accentMuted, borderRadius: radii.sm, height: 36, justifyContent: 'center', width: 36 }}>
        <Icon color={theme.accent} size={18} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 19 }}>{text}</Text>
      </View>
    </View>
  );
}
