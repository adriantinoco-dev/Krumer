import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { radii, serifFont, spacing } from '../theme';

export function ListCard({
  title,
  books,
  onPress,
}: {
  title: string;
  books: Book[];
  onPress?: () => void;
}) {
  const { theme, t } = useApp();
  const preview = books.slice(0, 3);
  const previewBg = theme.name === 'dark' ? '#18181b' : theme.surface;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderRadius: radii.md,
        borderWidth: 1,
        gap: spacing.sm,
        padding: spacing.sm + 2,
      }}
    >
      {/* Area de Capas [capas] */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: previewBg,
          borderColor: theme.border,
          borderRadius: radii.sm,
          borderWidth: 1,
          height: 80,
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        {preview.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 4, justifyContent: 'center' }}>
            <BookOpen color={theme.textSecondary} size={22} strokeWidth={1.4} />
          </View>
        ) : (
          <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
            {preview.map((book, index) => (
              <View
                key={book.id}
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: 4,
                  borderWidth: 1,
                  elevation: 4,
                  height: 62,
                  marginLeft: index === 0 ? 0 : -14,
                  overflow: 'hidden',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 3,
                  width: 40,
                  zIndex: 10 - index,
                }}
              >
                {book.coverPath ? (
                  <Image resizeMode="cover" source={{ uri: book.coverPath }} style={{ height: '100%', width: '100%' }} />
                ) : (
                  <View style={{ alignItems: 'center', backgroundColor: theme.surface, flex: 1, justifyContent: 'center', padding: 2 }}>
                    <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }}>
                      {book.format}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Titulo e contagem */}
      <View style={{ gap: 2, paddingHorizontal: 2 }}>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, fontWeight: '700' }}
        >
          {title}
        </Text>
        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, fontWeight: '600' }}>
          {books.length} {t('lists.books')}
        </Text>
      </View>
    </Pressable>
  );
}
