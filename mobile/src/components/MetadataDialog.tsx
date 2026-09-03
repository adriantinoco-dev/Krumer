import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

export type MetadataDialogVariant = 'success' | 'danger' | 'warning' | 'error';

export type MetadataDialogAction = {
  kind?: 'primary' | 'secondary';
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'danger';
};

type MetadataDialogContent = {
  message: string;
  primaryAction?: MetadataDialogAction;
  secondaryAction?: MetadataDialogAction;
  title: string;
  variant: MetadataDialogVariant;
};

export type MetadataDialogConfig = MetadataDialogContent;

type Props = MetadataDialogContent & {
  onClose: () => void;
  visible: boolean;
};

const OPEN_DURATION_MS = 280;
const CLOSE_DURATION_MS = 220;
const ACTION_DELAY_MS = CLOSE_DURATION_MS + 40;

const variantIcons: Record<MetadataDialogVariant, LucideIcon> = {
  danger: Trash2,
  error: AlertCircle,
  success: CheckCircle2,
  warning: KeyRound,
};

const variantColors: Record<MetadataDialogVariant, string> = {
  danger: '#ef4444',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f97316',
};

export function MetadataDialog({
  message,
  onClose,
  primaryAction,
  secondaryAction,
  title,
  variant,
  visible,
}: Props) {
  const { theme } = useApp();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState<MetadataDialogContent>({
    message,
    primaryAction,
    secondaryAction,
    title,
    variant,
  });
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) return;
    setContent({ message, primaryAction, secondaryAction, title, variant });
  }, [message, primaryAction, secondaryAction, title, variant, visible]);

  useEffect(() => {
    opacity.stopAnimation();
    scale.stopAnimation();

    if (visible) {
      setMounted(true);
      opacity.setValue(0);
      scale.setValue(0.96);
      Animated.parallel([
        Animated.timing(opacity, {
          duration: OPEN_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          duration: OPEN_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!mounted) return;
    Animated.parallel([
      Animated.timing(opacity, {
        duration: CLOSE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        duration: CLOSE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0.98,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [opacity, scale, visible]);

  if (!mounted) return null;

  const Icon = variantIcons[content.variant];
  const semanticColor = content.variant === 'warning' ? theme.accent : variantColors[content.variant];
  const iconBackground = content.variant === 'warning' ? theme.accentMuted : `${semanticColor}22`;
  const dialogActions = [content.primaryAction, content.secondaryAction]
    .filter((action): action is MetadataDialogAction => Boolean(action));

  const invokeAction = (action: MetadataDialogAction) => {
    onCloseRef.current();
    setTimeout(action.onPress, ACTION_DELAY_MS);
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={() => onCloseRef.current()}
      statusBarTranslucent
      transparent
      visible={mounted}
    >
      <View
        pointerEvents={visible ? 'auto' : 'none'}
        style={{
          alignItems: 'center',
          flex: 1,
          justifyContent: 'center',
          paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm),
          paddingHorizontal: spacing.lg,
          paddingTop: Math.max(spacing.lg, insets.top + spacing.sm),
        }}
      >
        <Pressable onPress={() => onCloseRef.current()} style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[StyleSheet.absoluteFill, {
              backgroundColor: theme.name === 'dark' ? '#000000aa' : '#00000055',
              opacity,
            }]}
          />
        </Pressable>

        <Animated.View
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderRadius: radii.xl,
            borderWidth: 1,
            elevation: 14,
            maxHeight: '85%',
            maxWidth: 380,
            opacity,
            padding: spacing.lg,
            shadowColor: '#000000',
            shadowOffset: { height: 8, width: 0 },
            shadowOpacity: theme.name === 'dark' ? 0.4 : 0.18,
            shadowRadius: 16,
            transform: [{ scale }],
            width: '100%',
          }}
        >
          <Pressable onPress={(event) => event.stopPropagation()}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ alignItems: 'center', backgroundColor: iconBackground, borderRadius: 999, height: 58, justifyContent: 'center', width: 58 }}>
                <Icon color={semanticColor} size={28} strokeWidth={2.2} />
              </View>
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' }}>
                {content.title}
              </Text>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, lineHeight: 21, marginTop: spacing.sm, textAlign: 'center' }}>
                {content.message}
              </Text>
            </View>

            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              {dialogActions.map((action, index) => (
                <DialogButton key={`${action.kind ?? 'action'}-${index}`} action={action} onPress={invokeAction} theme={theme} />
              ))}
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DialogButton({
  action,
  onPress,
  theme,
}: {
  action: MetadataDialogAction;
  onPress: (action: MetadataDialogAction) => void;
  theme: ReturnType<typeof useApp>['theme'];
}) {
  const isSecondary = action.kind === 'secondary';
  const isDanger = action.tone === 'danger';
  const backgroundColor = action.tone === 'danger' ? '#ef4444' : theme.accent;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(action)}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: isSecondary ? (pressed ? theme.cardHover : 'transparent') : (action.tone === 'danger' ? (pressed ? '#dc2626' : backgroundColor) : (pressed ? '#ea580c' : backgroundColor)),
        borderColor: isSecondary ? theme.border : (isDanger ? '#ef4444' : theme.accent),
        borderRadius: radii.md,
        borderWidth: 1,
        justifyContent: 'center',
        minHeight: 48,
        opacity: pressed ? 0.88 : 1,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        width: '100%',
      })}
    >
      <Text style={{ color: isSecondary ? theme.textPrimary : (isDanger ? '#ffffff' : theme.bg), fontFamily: serifFont, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
        {action.label}
      </Text>
    </Pressable>
  );
}
