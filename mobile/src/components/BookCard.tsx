import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { FavoriteBadge } from './FavoriteBadge';
import { VolumeBadge } from './VolumeBadge';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { coverShadow, serifFont, spacing } from '../theme';

const COVER_RADIUS = 10;
const COVER_ASPECT_RATIO = 193 / 264;

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

  const animatedProgress = useRef(new Animated.Value(0)).current;
  const prevProgressPctRef = useRef<number | null>(null);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, book.progressPct ?? 0));
    const isFirst = prevProgressPctRef.current === null;
    const prev = isFirst ? 0 : prevProgressPctRef.current;
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
      delayLongPress={200}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, width }}
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

          {/* Bottom Progress Bar */}
          <View
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.15)',
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
