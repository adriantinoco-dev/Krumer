import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Star } from 'lucide-react-native';
import { useApp } from '../context/AppContext';

interface RatingStarsProps {
  rating: number;
  maxRating?: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  allowClear?: boolean;
  gap?: number;
  container?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RatingStars({
  rating,
  maxRating = 5,
  size = 14,
  interactive = false,
  onRate,
  allowClear = true,
  gap = 2,
  container = false,
  style,
}: RatingStarsProps) {
  const { theme } = useApp();
  const normalizedRating = Math.max(0, Math.min(maxRating, Math.round(rating ?? 0)));

  // Cores do fundo adaptado a cada tema
  const containerBg = theme.bg;

  // Cores das estrelas
  const starEmptyColor = container
    ? theme.name === 'sepia'
      ? '#9a9790ff'
      : '#9c9c9fff'
    : theme.starEmpty;

  const starFilledColor = theme.accent;

  const stars = Array.from({ length: maxRating }, (_, i) => i + 1);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap,
        },
        container && {
          backgroundColor: containerBg,
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 8,
          alignSelf: 'center',
        },
        style,
      ]}
    >
      {stars.map((star) => {
        const isFilled = star <= normalizedRating;
        const color = isFilled ? starFilledColor : starEmptyColor;

        if (interactive && onRate) {
          return (
            <AnimatedRatingStar
              key={star}
              color={color}
              isFilled={isFilled}
              onPress={() => {
                const nextRating = allowClear && normalizedRating === star ? 0 : star;
                onRate(nextRating);
              }}
              size={size}
            />
          );
        }

        return (
          <Star
            key={star}
            color={color}
            fill={color}
            size={size}
            strokeWidth={0}
          />
        );
      })}
    </View>
  );
}

function AnimatedRatingStar({
  color,
  isFilled,
  onPress,
  size,
}: {
  color: string;
  isFilled: boolean;
  onPress: () => void;
  size: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const previousFilled = useRef(isFilled);

  useEffect(() => {
    if (previousFilled.current === isFilled) return;
    previousFilled.current = isFilled;

    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, {
        duration: 90,
        easing: Easing.out(Easing.quad),
        toValue: isFilled ? 1.16 : 0.92,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        duration: 150,
        easing: Easing.inOut(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isFilled, scale]);

  return (
    <Pressable
      hitSlop={6}
      onPress={onPress}
      onPressIn={() => {
        scale.stopAnimation();
        Animated.spring(scale, {
          bounciness: 4,
          speed: 24,
          toValue: 1.1,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() => {
        scale.stopAnimation();
        Animated.timing(scale, {
          duration: 130,
          easing: Easing.out(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }).start();
      }}
      style={{ alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Star color={color} fill={color} size={size} strokeWidth={0} />
      </Animated.View>
    </Pressable>
  );
}
