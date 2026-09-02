import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { PDF_DEFAULTS, type PdfDisplayMode } from '../readers/PdfReader.types';
import { radii, serifFont, spacing } from '../theme';

type Props = {
  displayMode: PdfDisplayMode;
  onChange: (scale: number) => void;
  onClose: () => void;
  onReset: () => void;
  scale: number;
  visible: boolean;
};

export function PdfZoomModal({ displayMode, onChange, onClose, onReset, scale, visible }: Props) {
  const { theme, t } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(280, width - Math.max(insets.left + insets.right, 0) - 24);
  const percentage = Math.round(scale * 100);
  const [requestedScale, setRequestedScale] = useState(scale);
  const canDecrease = requestedScale > PDF_DEFAULTS.minScale;
  const canIncrease = requestedScale < PDF_DEFAULTS.maxScale;

  useEffect(() => {
    if (visible) setRequestedScale(scale);
    // Reset the button baseline once per opening. Confirmed scale updates keep
    // flowing into the displayed percentage without undoing rapid queued taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  if (!visible) return null;

  const changeBy = (delta: number) => {
    const steppedScale = Math.round((requestedScale + delta) * 100) / 100;
    const nextScale = Math.max(PDF_DEFAULTS.minScale, Math.min(PDF_DEFAULTS.maxScale, steppedScale));
    setRequestedScale(nextScale);
    onChange(nextScale);
  };

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { elevation: 120, zIndex: 500 }]}>
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
            gap: spacing.md,
            padding: spacing.md,
            position: 'absolute',
            right: Math.max(insets.right, 8),
            shadowColor: '#000000',
            shadowOffset: { height: 6, width: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 14,
            top: Math.max(insets.top + 42, 50),
            width: panelWidth,
          }}
        >
          <Text
            style={{
              color: theme.textMuted,
              fontFamily: serifFont,
              fontSize: 11,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {t('reader.zoomSettings')}
          </Text>

          <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
            <ZoomAction
              accessibilityLabel={t('reader.zoomOut')}
              disabled={!canDecrease}
              onPress={() => changeBy(-PDF_DEFAULTS.scaleStep)}
            >
              <Minus color={theme.textPrimary} size={22} strokeWidth={2} />
            </ZoomAction>
            <Text
              accessibilityLabel={`${t('reader.zoomCurrent')} ${percentage}%`}
              style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700', minWidth: 88, textAlign: 'center' }}
            >
              {percentage}%
            </Text>
            <ZoomAction
              accessibilityLabel={t('reader.zoomIn')}
              disabled={!canIncrease}
              onPress={() => changeBy(PDF_DEFAULTS.scaleStep)}
            >
              <Plus color={theme.textPrimary} size={22} strokeWidth={2} />
            </ZoomAction>
          </View>

          <Text
            style={{
              color: theme.textMuted,
              fontFamily: serifFont,
              fontSize: 11,
              lineHeight: 16,
              textAlign: 'center',
            }}
          >
            {t(displayMode === 'scroll' ? 'reader.zoomFitWidthHint' : 'reader.zoomFitPageHint')}
          </Text>

          <View style={{ backgroundColor: theme.border, height: 1 }} />

          <Pressable
            accessibilityLabel={t('reader.zoomReset')}
            accessibilityRole="button"
            disabled={Math.abs(requestedScale - PDF_DEFAULTS.scale) < 0.001}
            onPress={() => {
              setRequestedScale(PDF_DEFAULTS.scale);
              onReset();
            }}
            style={({ pressed }) => ({
              alignItems: 'center',
              alignSelf: 'center',
              opacity: Math.abs(requestedScale - PDF_DEFAULTS.scale) < 0.001 ? 0.4 : pressed ? 0.55 : 1,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
            })}
          >
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>
              {t('reader.zoomReset')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </View>
  );
}

function ZoomAction({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: {
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: theme.cardHover,
        borderRadius: radii.lg,
        height: 48,
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.55 : 1,
        width: 48,
      })}
    >
      {children}
    </Pressable>
  );
}
