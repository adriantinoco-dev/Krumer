import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Star } from 'lucide-react-native';

/**
 * Favorite badge on book covers matching desktop .fav-badge:
 * - 22x22 orange circle (#f97316 / rgba(249, 115, 22, 0.92))
 * - Star icon (white fill)
 * - Entrance animation (fav-pop): scale 0 -> 1.25 -> 1 (overshoot spring / 350ms)
 * - Exit animation (fav-out): scale 1 -> 0, opacity 1 -> 0 (250ms cubic-bezier)
 */
export function FavoriteBadge({ isFavorite }: { isFavorite: boolean }) {
  const [mounted, setMounted] = useState(isFavorite);
  const animScale = useRef(new Animated.Value(isFavorite ? 1 : 0)).current;
  const animOpacity = useRef(new Animated.Value(isFavorite ? 1 : 0)).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (isFavorite) {
        setMounted(true);
        animScale.setValue(1);
        animOpacity.setValue(1);
      }
      return;
    }

    if (isFavorite) {
      setMounted(true);
      animOpacity.setValue(1);
      animScale.setValue(0);

      // Desktop fav-pop: cubic-bezier(0.34, 1.56, 0.64, 1) duration 350ms
      Animated.spring(animScale, {
        toValue: 1,
        bounciness: 12,
        speed: 14,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      // Desktop fav-out: cubic-bezier(0.4, 0, 0.2, 1) duration 250ms
      Animated.parallel([
        Animated.timing(animScale, {
          toValue: 0,
          duration: 250,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(animOpacity, {
          toValue: 0,
          duration: 250,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [isFavorite, mounted]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        alignItems: 'center',
        backgroundColor: 'rgba(249, 115, 22, 0.94)',
        borderRadius: 11,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
        elevation: 4,
        height: 22,
        justifyContent: 'center',
        left: 7,
        opacity: animOpacity,
        position: 'absolute',
        top: 7,
        transform: [{ scale: animScale }],
        width: 22,
        zIndex: 10,
      }}
    >
      <Star
        color="#ffffff"
        fill="#ffffff"
        size={12}
        strokeWidth={1}
      />
    </Animated.View>
  );
}
