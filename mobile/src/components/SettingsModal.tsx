import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';

const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 180;

export function SettingsModal({
  visible,
  onClose,
  title,
  centerTitle = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  centerTitle?: boolean;
  children: React.ReactNode;
}) {
  const { theme } = useApp();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    backdropOpacity.stopAnimation();
    contentOpacity.stopAnimation();
    contentScale.stopAnimation();

    if (visible) {
      backdropOpacity.setValue(0);
      contentOpacity.setValue(0);
      contentScale.setValue(0.96);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          duration: OPEN_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          duration: OPEN_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(contentScale, {
          duration: OPEN_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: CLOSE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        duration: CLOSE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        duration: CLOSE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0.96,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [backdropOpacity, contentOpacity, contentScale, mounted, visible]);

  if (!mounted) return null;

  return (
    <Modal animationType="none" transparent visible={mounted} onRequestClose={onClose}>
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
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: theme.name === 'dark' ? '#00000099' : '#00000055',
                opacity: backdropOpacity,
              },
            ]}
          />
        </Pressable>
        <Animated.View
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderRadius: radii.lg,
            borderWidth: 1,
            maxHeight: '80%',
            maxWidth: 380,
            opacity: contentOpacity,
            padding: spacing.md,
            transform: [{ scale: contentScale }],
            width: '100%',
          }}
        >
          <View
            style={centerTitle
              ? { alignItems: 'center', minHeight: 22, position: 'relative' }
              : { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text
              style={{
                color: theme.textPrimary,
                fontFamily: serifFont,
                fontSize: 17,
                fontWeight: '600',
                ...(centerTitle ? { paddingHorizontal: spacing.lg, textAlign: 'center', width: '100%' } : {}),
              }}
            >
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} style={centerTitle ? { position: 'absolute', right: 0 } : undefined}>
              <X color={theme.textSecondary} size={20} />
            </Pressable>
          </View>
          <View style={{ backgroundColor: theme.border, height: 1, marginVertical: spacing.md }} />
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
