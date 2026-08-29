import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export function SettingsModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { theme } = useApp();
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          alignItems: 'center',
          backgroundColor: theme.name === 'dark' ? '#00000099' : '#00000055',
          flex: 1,
          justifyContent: 'center',
          paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm),
          paddingHorizontal: spacing.lg,
          paddingTop: Math.max(spacing.lg, insets.top + spacing.sm),
        }}
      >
        <Pressable
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderRadius: radii.lg,
            borderWidth: 1,
            maxHeight: '80%',
            maxWidth: 380,
            padding: spacing.md,
            width: '100%',
          }}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, fontWeight: '600' }}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X color={theme.textSecondary} size={20} />
            </Pressable>
          </View>
          <View style={{ backgroundColor: theme.border, height: 1, marginVertical: spacing.md }} />
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
