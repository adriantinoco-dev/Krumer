import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
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

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderRadius: radii.md,
        borderWidth: 1,
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: spacing.sm }}>
        <View>
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12 }}>
            {books.length} {t('lists.books')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', height: 52 }}>
          {preview.map((book, index) => (
            <View
              key={book.id}
              style={{
                backgroundColor: theme.bg,
                borderColor: theme.surface,
                borderRadius: radii.sm,
                borderWidth: 2,
                height: 52,
                marginLeft: index === 0 ? 0 : -12,
                overflow: 'hidden',
                width: 34,
              }}
            >
              {book.coverPath ? (
                <Image resizeMode="cover" source={{ uri: book.coverPath }} style={{ height: '100%', width: '100%' }} />
              ) : (
                <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 3 }}>
                  <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' }}>
                    {book.format}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
      <ChevronRight color={theme.textSecondary} size={20} />
    </Pressable>
  );
}
