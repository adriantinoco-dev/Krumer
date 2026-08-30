import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { KrumerLogo } from './KrumerLogo';

const STARTUP_PROGRESS_MS = 200;
const STARTUP_COMPLETE_MS = 100;
const STARTUP_EXIT_DELAY_MS = 500;
const STARTUP_EXIT_MS = 500;
const STARTUP_WAIT_PROGRESS = 94;

export function StartupLoadingScreen({
  ready,
  onFinished,
}: {
  ready: boolean;
  onFinished: () => void;
}) {
  const { theme } = useApp();
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const readyRef = useRef(ready);
  const [visibleProgress, setVisibleProgress] = useState(0);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    const wait = (duration: number) => new Promise<void>((resolve) => {
      setTimeout(resolve, duration);
    });
    const setProgress = (value: number) => {
      animatedProgress.setValue(value);
      setVisibleProgress(value);
    };

    async function runProgressSequence() {
      const progressStepMs = STARTUP_PROGRESS_MS / STARTUP_WAIT_PROGRESS;
      for (let value = 1; value <= STARTUP_WAIT_PROGRESS; value += 1) {
        await wait(progressStepMs);
        if (cancelled) return;
        setProgress(value);
      }

      while (!readyRef.current) {
        await wait(50);
        if (cancelled) return;
      }

      const completeStepMs = STARTUP_COMPLETE_MS / (100 - STARTUP_WAIT_PROGRESS);
      for (let value = STARTUP_WAIT_PROGRESS + 1; value <= 100; value += 1) {
        await wait(completeStepMs);
        if (cancelled) return;
        setProgress(value);
      }

      await wait(STARTUP_EXIT_DELAY_MS);
      if (cancelled) return;
      Animated.timing(opacity, {
        duration: STARTUP_EXIT_MS,
        easing: Easing.inOut(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) onFinished();
      });
    }

    void runProgressSequence();
    return () => {
      cancelled = true;
      animatedProgress.stopAnimation();
      opacity.stopAnimation();
    };
  }, [animatedProgress, onFinished, opacity, readyRef]);

  const fillWidth = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      accessibilityLabel={`Krumer ${visibleProgress}%`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: visibleProgress }}
      style={[styles.screen, { backgroundColor: theme.bg, opacity }]}
    >
      <View style={styles.content}>
        <KrumerLogo hideLabel size={88} />
        <Text style={[styles.percentage, { color: theme.textSecondary }]}>{visibleProgress}%</Text>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          <Animated.View style={[styles.fill, { backgroundColor: theme.accent, width: fillWidth }]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    width: '64%',
    maxWidth: 280,
  },
  fill: {
    borderRadius: 999,
    height: '100%',
  },
  percentage: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 12,
    marginTop: 30,
    minWidth: 48,
    textAlign: 'center',
  },
  screen: {
    alignItems: 'center',
    bottom: 0,
    elevation: 10000,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10000,
  },
  track: {
    borderRadius: 999,
    height: 4,
    overflow: 'hidden',
    width: '100%',
  },
});
