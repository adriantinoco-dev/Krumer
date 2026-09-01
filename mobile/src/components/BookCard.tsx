import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { FavoriteBadge } from './FavoriteBadge';
import { VolumeBadge } from './VolumeBadge';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { coverShadow, serifFont, spacing } from '../theme';

const COVER_RADIUS = 10;
const COVER_ASPECT_RATIO = 220 / 300;

export function BookCard({
  book,
  width,
  onPress,
  onLongPress,
  selected,
}: {
  book: Book;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
}) {
  const { lists, theme, t } = useApp();
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.coverPath && !coverFailed);
  const coverWidth = Math.max(0, width - spacing.sm * 2);

  const progressPct = Math.max(0, Math.min(100, book.isRead ? 100 : (book.progressPct ?? 0)));
  const showProgressBar = progressPct > 1 && progressPct <= 100;

  const [progressVisible, setProgressVisible] = useState(showProgressBar);
  const slideAnim = useRef(new Animated.Value(showProgressBar ? 0 : 0)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const animatedProgress = useRef(new Animated.Value(0)).current;
  const prevProgressPctRef = useRef<number | null>(null);

  useEffect(() => {
    if (showProgressBar) {
      setProgressVisible(true);
      slideAnim.stopAnimation();
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();

      // Dark track fades in slower than the orange fill so it never appears ahead.
      bgOpacity.stopAnimation();
      Animated.timing(bgOpacity, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else if (progressVisible) {
      slideAnim.stopAnimation();
      Animated.timing(slideAnim, {
        toValue: -coverWidth,
        duration: 350,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setProgressVisible(false);
      });
    }
  }, [showProgressBar, progressVisible, coverWidth, slideAnim]);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, book.progressPct ?? 0));
    const isFirst = prevProgressPctRef.current === null;
    const prev = prevProgressPctRef.current ?? 0;
    prevProgressPctRef.current = target;

    const isEntrance = target >= prev;
    animatedProgress.setValue(prev);
    Animated.timing(animatedProgress, {
      toValue: target,
      duration: isFirst ? 350 : isEntrance ? 350 : 350,
      useNativeDriver: false,
    }).start();
  }, [book.id, book.progressPct]);

  const favoriteList = lists.find((l) => l.isDefault || l.name === 'Favoritos');
  const isFavorite = Boolean(
    favoriteList && (
      favoriteList.bookFingerprints.includes(book.fingerprint) ||
      book.children?.some((c) => favoriteList.bookFingerprints.includes(c.fingerprint))
    )
  );

  const placeholderBackground = {
    dark: '#2d2d2d',
    light: '#ececec',
    sepia: '#e8dccb',
  }[theme.name];

  useEffect(() => {
    setCoverFailed(false);
  }, [book.coverPath]);

  return (
    <Pressable
      accessibilityLabel={book.author ? `${book.title}, ${book.author}` : book.title}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      delayLongPress={200}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.82 : 1,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        width,
      })}
    >
      <View style={{ marginBottom: spacing.sm }}>
        <View
          style={{
            alignItems: 'center',
            aspectRatio: COVER_ASPECT_RATIO,
            backgroundColor: placeholderBackground,
            borderRadius: COVER_RADIUS,
            boxShadow: coverShadow(theme.name),
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
            width: coverWidth,
          }}
        >
          {showCover ? (
            <Image
              onError={() => setCoverFailed(true)}
              source={{ uri: book.coverPath ?? undefined }}
              style={{ height: '100%', width: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <Text
              ellipsizeMode="tail"
              numberOfLines={4}
              style={{
                color: theme.textPrimary,
                fontFamily: serifFont,
                fontSize: 14,
                fontWeight: '800',
                lineHeight: 18,
                paddingHorizontal: spacing.sm,
                textAlign: 'center',
              }}
            >
              {book.title}
            </Text>
          )}

          {/* Favorite Badge (top: 7, left: 7 with pop animation) */}
          <FavoriteBadge isFavorite={isFavorite} />

          {/* Bottom Progress Bar — only when there is real progress (1 < pct <= 100) */}
          {progressVisible && (
            <Animated.View
              style={{
                borderRadius: 4,
                bottom: 0,
                height: 6,
                left: 0,
                overflow: 'hidden',
                position: 'absolute',
                right: 0,
                transform: [{ translateX: slideAnim }],
              }}
            >
              {/* Dark track — fades in slower than the orange fill */}
              <Animated.View
                style={{
                  backgroundColor: 'transparent',
                  borderRadius: 4,
                  height: '100%',
                  opacity: bgOpacity,
                  position: 'absolute',
                  width: '100%',
                }}
              />
              {/* Orange fill */}
              <Animated.View
                style={{
                  backgroundColor: theme.accent,
                  height: '100%',
                  width: animatedProgress.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                }}
              />
            </Animated.View>
          )}

          {selected !== undefined && (
            <View pointerEvents="none" style={styles.selectionOverlay}>
              <View
                style={[
                  styles.selectionIndicator,
                  {
                    backgroundColor: selected ? theme.accent : 'rgba(0, 0, 0, 0.35)',
                    borderColor: selected ? theme.accent : 'rgba(255, 255, 255, 0.85)',
                  },
                ]}
              >
                {selected && <Check color="#ffffff" size={12} strokeWidth={3} />}
              </View>
            </View>
          )}
        </View>
        <VolumeBadge count={book.childrenCount} />
      </View>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={{
          color: theme.textPrimary,
          fontFamily: serifFont,
          fontSize: 12,
          fontWeight: '700',
          textAlign: 'left',
        }}
      >
        {book.title}
      </Text>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={{
          color: theme.textSecondary,
          fontFamily: serifFont,
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
          textAlign: 'left',
        }}
      >
        {book.author || t('library.unknownAuthor')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  selectionIndicator: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
