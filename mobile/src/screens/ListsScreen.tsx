import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { List, Plus } from 'lucide-react-native';
import { ListCard } from '../components/ListCard';
import { useApp } from '../context/AppContext';
import { serifFont, spacing } from '../theme';

export function ListsScreen() {
  const { books, theme, t } = useApp();
  const collections = [
    { key: 'series', title: t('lists.series'), books },
    { key: 'read', title: t('lists.read'), books: books.filter((book) => Number(book.progress ?? 0) >= 100) },
    { key: 'unread', title: t('lists.unread'), books: books.filter((book) => !book.progress) },
    { key: 'favorites', title: t('lists.favorites'), books: [] },
    { key: 'toRead', title: t('lists.toRead'), books },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          padding: spacing.md,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>{t('lists.title')}</Text>
        <Pressable hitSlop={10}>
          <Plus color={theme.accent} size={24} />
        </Pressable>
      </View>
      {collections.every((collection) => collection.books.length === 0) ? (
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
          <List color={theme.textSecondary} size={56} strokeWidth={1.2} />
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, marginTop: spacing.md }}>{t('lists.empty')}</Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' }}>
            {t('lists.emptyHint')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl }}>
          {collections.map((collection) => (
            <ListCard key={collection.key} title={collection.title} books={collection.books} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
