import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

type Props = {
  backdropColor?: string;
  children: React.ReactNode;
  containerStyle?: ViewStyle;
  navigationBarTranslucent?: boolean;
  onClose: () => void;
  slideDistance?: number;
  statusBarTranslucent?: boolean;
  visible: boolean;
};

export function ActionSheetModal({
  backdropColor = 'rgba(0,0,0,0.55)',
  children,
  containerStyle,
  navigationBarTranslucent,
  onClose,
  slideDistance = 450,
  statusBarTranslucent,
  visible,
}: Props) {
  const [mounted, setMounted] = useState(visible);
  const [isClosing, setIsClosing] = useState(false);
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(slideDistance)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    backdropAnim.stopAnimation();
    slideAnim.stopAnimation();

    if (visible) {
      setIsClosing(false);
      Animated.parallel([
        Animated.timing(backdropAnim, {
          duration: 180,
          easing: Easing.out(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          duration: 520,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    setIsClosing(true);
    Animated.parallel([
      Animated.timing(backdropAnim, {
        duration: 220,
        easing: Easing.in(Easing.ease),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        duration: 300,
        easing: Easing.in(Easing.cubic),
        toValue: slideDistance,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setMounted(false);
      setIsClosing(false);
    });
  }, [backdropAnim, mounted, slideAnim, slideDistance, visible]);

  if (!mounted) return null;

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent={navigationBarTranslucent}
      onRequestClose={() => onCloseRef.current()}
      statusBarTranslucent={statusBarTranslucent}
      transparent
      visible={mounted}
    >
      <View pointerEvents={isClosing ? 'none' : 'auto'} style={[styles.container, containerStyle]}>
        <Pressable onPress={() => onCloseRef.current()} style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backdropColor, opacity: backdropAnim }]} />
        </Pressable>
        <Animated.View pointerEvents="box-none" style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
