import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { serifFont, spacing } from '../theme';

const STAR_FILLED = '#ffda4d';
const STAR_EMPTY = '#414141ff';
const RATING_BG = '#292929ff';
const COVER_RADIUS = 20;
const RATING_HEIGHT = 24;

export function BookCard({ book, width, onPress }: { book: Book; width: number; onPress: () => void }) {
  const { theme } = useApp();
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.coverPath && !coverFailed);
  const rating = Math.max(0, Math.min(5, Math.round(book.rating ?? 0)));
  const coverWidth = Math.max(0, width - spacing.sm * 2);
  const starSize = Math.min(14, Math.max(11, (coverWidth * 0.7 - 12) / 5));
  const placeholderBackground = {
    dark: '#2d2d2d',
    light: '#ececec',
    sepia: '#e8dccb',
  }[theme.name];

  useEffect(() => {
    setCoverFailed(false);
  }, [book.coverPath]);

  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, width }}>
      <View style={{ alignItems: 'center', marginBottom: 12, width: coverWidth }}>
        <View
          style={{
            alignItems: 'center',
            aspectRatio: 3 / 4,
            backgroundColor: placeholderBackground,
            borderRadius: COVER_RADIUS,
            justifyContent: 'center',
            overflow: 'hidden',
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
                fontSize: 16,
                fontWeight: '800',
                lineHeight: 20,
                paddingHorizontal: spacing.md,
                textAlign: 'center',
              }}
            >
              {book.title}
            </Text>
          )}
          <View
            style={{
              alignItems: 'center',
              backgroundColor: RATING_BG,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: RATING_HEIGHT / 2,
              borderTopRightRadius: RATING_HEIGHT / 2,
              bottom: 0,
              flexDirection: 'row',
              height: RATING_HEIGHT,
              justifyContent: 'center',
              position: 'absolute',
              width: '70%',
            }}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                color={star <= rating ? STAR_FILLED : STAR_EMPTY}
                fill={star <= rating ? STAR_FILLED : STAR_EMPTY}
                key={star}
                size={starSize}
                strokeWidth={1.4}
                style={{ marginHorizontal: 1 }}
              />
            ))}
          </View>
        </View>
      </View>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={{
          color: theme.textPrimary,
          fontFamily: serifFont,
          fontSize: 12,
          fontWeight: '600',
          marginTop: 8,
          textAlign: 'left',
        }}
      >
        {book.title}
      </Text>
      {Boolean(book.author) && (
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={{
            color: theme.textMuted,
            fontFamily: serifFont,
            fontSize: 11,
            fontWeight: '700',
            marginTop: 2,
            textAlign: 'left',
          }}
        >
          {book.author}
        </Text>
      )}
    </Pressable>
  );
}
