import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { VolumeBadge } from './VolumeBadge';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { coverShadow, serifFont, spacing } from '../theme';

const STAR_FILLED = '#ffda4d';
const COVER_RADIUS = 20;
const STAR_SIZE = 14;

export function BookCard({
  book,
  width,
  onPress,
  onLongPress,
}: {
  book: Book;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme, t } = useApp();
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.coverPath && !coverFailed);
  const rating = Math.max(0, Math.min(5, Math.round(book.rating ?? 0)));
  const coverWidth = Math.max(0, width - spacing.sm * 2);
  const placeholderBackground = {
    dark: '#2d2d2d',
    light: '#ececec',
    sepia: '#e8dccb',
  }[theme.name];

  useEffect(() => {
    setCoverFailed(false);
  }, [book.coverPath]);

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, width }}>
      <View style={{ alignItems: 'center', marginBottom: 12, width: coverWidth }}>
<View
          style={{
            alignItems: 'center',
            aspectRatio: 5 / 7,
            backgroundColor: placeholderBackground,
            borderRadius: COVER_RADIUS,
            boxShadow: coverShadow(theme.name),
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
          fontWeight: '600',
          marginTop: 8,
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
          fontWeight: '600',
          marginTop: 2,
          textAlign: 'left',
        }}
      >
        {book.author || t('library.unknownAuthor')}
      </Text>
      <View style={{ alignItems: 'center', flexDirection: 'row', marginTop: 4 }}>
        {(() => {
          const starEmptyColor = theme.name === 'dark' ? '#414141' : theme.name === 'sepia' ? '#bfae88' : '#a8acb5';
          return [1, 2, 3, 4, 5].map((star) => (
            <Star
              color={star <= rating ? STAR_FILLED : starEmptyColor}
              fill={star <= rating ? STAR_FILLED : starEmptyColor}
              key={star}
              size={STAR_SIZE}
              strokeWidth={1.4}
              style={{ marginHorizontal: 1 }}
            />
          ));
        })()}
      </View>
    </Pressable>
  );
}
