import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Check, ChevronRight, Globe, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { languages, type LanguageCode } from '../i18n/translations';
import { radii, serifFont, spacing } from '../theme';

export function LangPickerButton() {
  const [visible, setVisible] = useState(false);
  const { preferences, theme, t } = useApp();
  const current = languages.find((language) => language.code === preferences.language) ?? languages[0];

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={{
          alignItems: 'center',
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderRadius: radii.md,
          borderWidth: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
          <Globe color={theme.accent} size={17} />
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15 }}>{current.name}</Text>
        </View>
        <ChevronRight color={theme.textSecondary} size={18} />
      </Pressable>
      <LangPickerModal visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}

export function LangPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { preferences, setLanguage, theme, t } = useApp();

  async function selectLanguage(language: LanguageCode) {
    await setLanguage(language);
    onClose();
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          alignItems: 'center',
          backgroundColor: theme.name === 'dark' ? '#00000099' : '#00000055',
          flex: 1,
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <Pressable
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderRadius: radii.lg,
            borderWidth: 1,
            maxWidth: 360,
            padding: spacing.md,
            width: '100%',
          }}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, fontWeight: '600' }}>
              {t('language.select')}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X color={theme.textSecondary} size={20} />
            </Pressable>
          </View>
          <View style={{ backgroundColor: theme.border, height: 1, marginVertical: spacing.md }} />
          {languages.map((language) => {
            const selected = preferences.language === language.code;
            return (
              <Pressable
                key={language.code}
                onPress={() => selectLanguage(language.code)}
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: spacing.sm,
                }}
              >
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}>
                  <View
                    style={{
                      alignItems: 'center',
                      borderColor: selected ? theme.accent : theme.border,
                      borderRadius: radii.sm,
                      borderWidth: 1,
                      minWidth: 34,
                      paddingHorizontal: spacing.xs,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ color: selected ? theme.accent : theme.textSecondary, fontFamily: serifFont, fontSize: 11, fontWeight: '700' }}>
                      {language.label}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15 }}>{language.name}</Text>
                </View>
                {selected ? <Check color={theme.accent} size={18} /> : <View style={{ width: 18 }} />}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
