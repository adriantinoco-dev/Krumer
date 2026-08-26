import React, { useEffect } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  Check,
  Columns2,
  GalleryHorizontal,
  RectangleHorizontal,
  RectangleVertical,
  RotateCw,
  Rows3,
  type LucideIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import type { ReadingPreferences } from '../models/readingPreferences';
import { radii, serifFont, spacing } from '../theme';

type Props = {
  isLandscape: boolean;
  preferences: ReadingPreferences;
  visible: boolean;
  onClose: () => void;
  onUpdatePreferences: (patch: Partial<ReadingPreferences>) => void;
};

type OptionProps = {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  selected: boolean;
  onPress: () => void;
};

function IconOption({ disabled = false, icon: Icon, label, selected, onPress }: OptionProps) {
  const { theme } = useApp();
  const iconColor = disabled ? theme.textMuted : selected ? theme.textPrimary : theme.textSecondary;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        flex: 1,
        gap: 5,
        minWidth: 52,
        opacity: disabled ? 0.3 : pressed ? 0.55 : 1,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: selected ? theme.cardHover : 'transparent',
          borderRadius: 24,
          height: 46,
          justifyContent: 'center',
          width: 46,
        }}
      >
        <Icon color={iconColor} size={22} strokeWidth={1.8} />
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: disabled ? theme.textMuted : selected ? theme.textPrimary : theme.textSecondary,
          fontFamily: serifFont,
          fontSize: 10,
          fontWeight: selected ? '700' : '400',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useApp();
  return (
    <Text
      style={{
        color: theme.textMuted,
        fontFamily: serifFont,
        fontSize: 11,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

export function PaginationSettingsModal({
  isLandscape,
  preferences,
  visible,
  onClose,
  onUpdatePreferences,
}: Props) {
  const { theme, t } = useApp();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const panelWidth = Math.min(360, width - Math.max(insets.left + insets.right, 0) - 24);
  const panelTop = Math.max(insets.top + 42, 50);
  const panelBottomSpace = Math.max(insets.bottom, spacing.sm) + 8;

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  if (!visible) return null;

  const changeOrientation = (orientation: ReadingPreferences['orientation']) => {
    onClose();
    requestAnimationFrame(() => onUpdatePreferences({ orientation }));
  };

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { elevation: 120, zIndex: 500 }]}
    >
      <Pressable
        accessibilityLabel={t('common.cancel')}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          accessibilityRole="menu"
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: theme.name === 'dark' ? '#2b2b2b' : theme.card,
            borderColor: theme.border,
            borderRadius: 18,
            borderWidth: 1,
            elevation: 18,
            maxHeight: Math.max(220, height - panelTop - panelBottomSpace),
            overflow: 'hidden',
            position: 'absolute',
            right: Math.max(insets.right, 8),
            shadowColor: '#000000',
            shadowOffset: { height: 6, width: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 14,
            top: panelTop,
            width: panelWidth,
          }}
        >
          <ScrollView
            contentContainerStyle={{ gap: spacing.md, padding: spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ gap: spacing.sm }}>
              <SectionLabel>{t('reader.displayMode')}</SectionLabel>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <IconOption
                  icon={Rows3}
                  label={t('reader.scrollMode')}
                  onPress={() => onUpdatePreferences({ displayMode: 'scroll' })}
                  selected={preferences.displayMode === 'scroll'}
                />
                <IconOption
                  icon={GalleryHorizontal}
                  label={t('reader.paginatedMode')}
                  onPress={() => onUpdatePreferences({ displayMode: 'paginated' })}
                  selected={preferences.displayMode === 'paginated'}
                />
                <View style={{ backgroundColor: theme.border, width: 1 }} />
                <IconOption
                  disabled={preferences.displayMode === 'scroll'}
                  icon={RectangleVertical}
                  label={t('reader.singleColumn')}
                  onPress={() => onUpdatePreferences({ doubleColumn: false })}
                  selected={!preferences.doubleColumn}
                />
                <IconOption
                  disabled={preferences.displayMode === 'scroll'}
                  icon={Columns2}
                  label={t('reader.doubleColumnShort')}
                  onPress={() => onUpdatePreferences({ doubleColumn: true })}
                  selected={preferences.doubleColumn}
                />
              </View>
              {preferences.displayMode === 'paginated' && preferences.doubleColumn && !isLandscape ? (
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, lineHeight: 16 }}>
                  {t('reader.doubleColumnPortraitHint')}
                </Text>
              ) : null}
            </View>

            <View style={{ backgroundColor: theme.border, height: 1 }} />

            <View style={{ gap: spacing.sm }}>
              <SectionLabel>{t('reader.orientation')}</SectionLabel>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <IconOption
                  icon={RotateCw}
                  label={t('reader.orientationFree')}
                  onPress={() => changeOrientation('free')}
                  selected={preferences.orientation === 'free'}
                />
                <IconOption
                  icon={RectangleHorizontal}
                  label={t('reader.orientationLandscape')}
                  onPress={() => changeOrientation('landscape')}
                  selected={preferences.orientation === 'landscape'}
                />
                <IconOption
                  icon={RectangleVertical}
                  label={t('reader.orientationPortrait')}
                  onPress={() => changeOrientation('portrait')}
                  selected={preferences.orientation === 'portrait'}
                />
              </View>
            </View>

            <View style={{ backgroundColor: theme.border, height: 1 }} />

            <Pressable
              accessibilityRole="button"
              onPress={() => onUpdatePreferences({
                displayMode: 'paginated',
                doubleColumn: false,
                orientation: 'free',
              })}
              style={({ pressed }) => ({
                alignItems: 'center',
                flexDirection: 'row',
                gap: spacing.sm,
                opacity: pressed ? 0.55 : 1,
                paddingHorizontal: spacing.xs,
                paddingVertical: spacing.xs,
              })}
            >
              <Check color={theme.textMuted} size={17} strokeWidth={1.8} />
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
                {t('reader.resetDefaults')}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </View>
  );
}
