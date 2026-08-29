import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Edit3, Sparkles } from 'lucide-react-native';
import { SettingsModal } from './SettingsModal';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export function MetadataActionModal({
  visible,
  onClose,
  onSearch,
  onEdit,
}: {
  visible: boolean;
  onClose: () => void;
  onSearch: () => void;
  onEdit: () => void;
}) {
  const { theme, t } = useApp();
  return (
    <SettingsModal visible={visible} onClose={onClose} title={t('metadata.actionsTitle')}>
      <View style={{ gap: spacing.sm }}>
        <ActionButton icon={Sparkles} label={t('metadata.searchAction')} onPress={onSearch} theme={theme} />
        <ActionButton icon={Edit3} label={t('metadata.editAction')} onPress={onEdit} theme={theme} />
      </View>
    </SettingsModal>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onPress,
  theme,
}: {
  icon: typeof Sparkles;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useApp>['theme'];
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', backgroundColor: pressed ? theme.cardHover : theme.card, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md })}>
      <Icon color={theme.accent} size={20} />
      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

