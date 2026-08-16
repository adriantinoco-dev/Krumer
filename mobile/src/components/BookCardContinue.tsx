import React, { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { serifFont, spacing } from '../theme';

const COVER_RADIUS = 16;
const CARD_WIDTH = 140;
const COVER_HEIGHT = 187;

export function BookCardContinue({ book, onPress }: { book: Book; onPress: () => void }) {
  const { theme, t } = useApp();
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.coverPath && !coverFailed);
  const placeholderBackground = {
    dark: '#2d2d2d',
    light: '#ececec',
    sepia: '#e8dccb',
  }[theme.name];

  useEffect(() => {
    setCoverFailed(false);
  }, [book.coverPath]);

  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH }}>
      <View style={{ marginBottom: spacing.sm }}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: placeholderBackground,
            borderRadius: COVER_RADIUS,
            height: COVER_HEIGHT,
            justifyContent: 'center',
            overflow: 'hidden',
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
        </View>
        {Boolean(book.childrenCount && book.childrenCount > 1) && (
          <View
            style={{
              backgroundColor: theme.accent,
              borderRadius: 12,
              left: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
              position: 'absolute',
              top: 8,
            }}
          >
            <Text style={{ color: '#ffffff', fontFamily: serifFont, fontSize: 10, fontWeight: '700' }}>
              {book.childrenCount} vol(s)
            </Text>
          </View>
        )}
      </View>
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={{
          color: theme.textPrimary,
          fontFamily: serifFont,
          fontSize: 12,
          fontWeight: '600',
          textAlign: 'left',
        }}
      >
        {book.title}
      </Text>
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
        {book.author || t('library.unknownAuthor')}
      </Text>
    </Pressable>
  );
}