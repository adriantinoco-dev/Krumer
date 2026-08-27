import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, Text, View } from 'react-native';
import { FavoriteBadge } from './FavoriteBadge';
import { VolumeBadge } from './VolumeBadge';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { coverShadow, serifFont, spacing } from '../theme';

const COVER_RADIUS = 10;
const CARD_WIDTH = 140;
const COVER_HEIGHT = Math.round(CARD_WIDTH / (193 / 264)); // 191px

export function BookCardContinue({
  book,
  onPress,
  onLongPress,
}: {
  book: Book;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { lists, theme, t } = useApp();
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.coverPath && !coverFailed);
  const progressPct = Math.max(0, Math.min(100, book.isRead ? 100 : (book.progressPct ?? 0)));

  const animatedProgress = useRef(new Animated.Value(0)).current;
  const prevProgressPctRef = useRef<number | null>(null);

  useEffect(() => {
    const isFirst = prevProgressPctRef.current === null;
    const prev = isFirst ? 0 : prevProgressPctRef.current;
    prevProgressPctRef.current = progressPct;

    animatedProgress.setValue(prev ?? 0);
    Animated.timing(animatedProgress, {
      toValue: progressPct,
      duration: isFirst ? 600 : 500,
      useNativeDriver: false,
    }).start();
  }, [progressPct]);

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
      delayLongPress={200}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ width: CARD_WIDTH }}
    >
      <View style={{ marginBottom: spacing.sm }}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: placeholderBackground,
            borderRadius: COVER_RADIUS,
            boxShadow: coverShadow(theme.name),
            height: COVER_HEIGHT,
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
            width: CARD_WIDTH,
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
          {progressPct > 1 && progressPct <= 100 && (
            <View
              style={{
                borderRadius: 4,
                bottom: 0,
                height: 6,
                left: 0,
                overflow: 'hidden',
                position: 'absolute',
                right: 0,
              }}
            >
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