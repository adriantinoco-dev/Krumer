import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
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

  // Cores do fundo escuro adaptado a cada tema
  const containerBg =
    theme.name === 'dark'
      ? '#1c1c1e'
      : theme.name === 'sepia'
      ? '#382a1a'
      : '#1e242b';

  // Cores das estrelas
  const starEmptyColor = container
    ? theme.name === 'sepia'
      ? '#8c775a'
      : '#71717a'
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
            <Pressable
              key={star}
              hitSlop={6}
              onPress={() => {
                const nextRating = allowClear && normalizedRating === star ? 0 : star;
                onRate(nextRating);
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                transform: pressed ? [{ scale: 1.15 }] : [{ scale: 1 }],
              })}
            >
              <Star
                color={color}
                fill={color}
                size={size}
                strokeWidth={0}
              />
            </Pressable>
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
