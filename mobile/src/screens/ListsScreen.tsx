import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { List, Plus } from 'lucide-react-native';
import { ListCard } from '../components/ListCard';
import { useApp } from '../context/AppContext';
import { serifFont, spacing } from '../theme';

export function ListsScreen() {
  const { books, createList, lists, theme, t } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const allBooks = flattenBooks(books);
  const collections = [
    { key: 'series', title: t('lists.series'), books: books.filter((book) => Boolean(book.children?.length)) },
    { key: 'read', title: t('lists.read'), books: allBooks.filter((book) => (book.progressPct ?? 0) >= 100 || book.isRead) },
    { key: 'unread', title: t('lists.unread'), books: allBooks.filter((book) => (book.progressPct ?? 0) === 0 && !book.isRead) },
    ...lists.map((list) => ({
      key: list.id,
      title: list.isDefault ? t('lists.favorites') : list.name,
      books: allBooks.filter((book) => list.bookFingerprints.includes(book.fingerprint)),
    })),
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
        <Pressable hitSlop={10} onPress={() => setCreating(true)}>
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
      <Modal transparent animationType="fade" visible={creating} onRequestClose={() => setCreating(false)}>
        <Pressable
          onPress={() => setCreating(false)}
          style={{ alignItems: 'center', backgroundColor: '#00000088', flex: 1, justifyContent: 'center', padding: spacing.lg }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ backgroundColor: theme.card, borderColor: theme.border, borderRadius: 12, borderWidth: 1, gap: spacing.md, padding: spacing.lg, width: '100%' }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18 }}>{t('lists.title')}</Text>
            <TextInput
              autoFocus
              onChangeText={setName}
              onSubmitEditing={async () => {
                await createList(name);
                setName('');
                setCreating(false);
              }}
              placeholder="Nome da lista"
              placeholderTextColor={theme.textMuted}
              style={{ borderColor: theme.border, borderRadius: 8, borderWidth: 1, color: theme.textPrimary, padding: spacing.md }}
              value={name}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function flattenBooks(books: import('../models/item').Book[]): import('../models/item').Book[] {
  return books.flatMap((book) => [book, ...flattenBooks(book.children ?? [])]);
}
