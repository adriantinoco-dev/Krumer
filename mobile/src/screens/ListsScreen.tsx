import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Check,
  Edit2,
  List as ListIcon,
  Plus,
  PlusCircle,
  Search,
  Trash2,
} from 'lucide-react-native';
import { BookCard } from '../components/BookCard';
import { ListCard } from '../components/ListCard';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { radii, serifFont, spacing, TABLET_BREAKPOINT } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Lists'>,
  NativeStackScreenProps<RootStackParamList>
>;

type CollectionItem = {
  key: string;
  listId?: string;
  title: string;
  books: Book[];
  isFixed: boolean;
  isFavorite?: boolean;
};

export function ListsScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const {
    books,
    createList,
    deleteList,
    lists,
    renameList,
    t,
    theme,
    toggleBookInList,
  } = useApp();

  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');

  const [activeCollectionKey, setActiveCollectionKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [managingBooks, setManagingBooks] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState('');

  const allBooks = useMemo(() => flattenBooks(books), [books]);

  const collections = useMemo<CollectionItem[]>(() => {
    const favoriteList = lists.find((l) => l.isDefault || l.name === 'Favoritos');

    const result: CollectionItem[] = [
      {
        key: favoriteList?.id || 'favorites',
        listId: favoriteList?.id || 'favorites',
        title: t('lists.favorites'),
        books: favoriteList
          ? allBooks.filter((book) => favoriteList.bookFingerprints.includes(book.fingerprint))
          : [],
        isFixed: true,
        isFavorite: true,
      },
      {
        key: 'series',
        title: t('lists.series'),
        books: books.filter((book) => Boolean(book.children?.length)),
        isFixed: true,
      },
      {
        key: 'read',
        title: t('lists.read'),
        books: allBooks.filter((book) => (book.progressPct ?? 0) >= 100 || book.isRead),
        isFixed: true,
      },
      {
        key: 'unread',
        title: t('lists.unread'),
        books: allBooks.filter((book) => (book.progressPct ?? 0) === 0 && !book.isRead),
        isFixed: true,
      },
    ];

    const custom = lists
      .filter((l) => !l.isDefault && l.name !== 'Favoritos')
      .map((l) => ({
        key: l.id,
        listId: l.id,
        title: l.name,
        books: allBooks.filter((book) => l.bookFingerprints.includes(book.fingerprint)),
        isFixed: false,
      }));

    return [...result, ...custom];
  }, [allBooks, books, lists, t]);

  const activeCollection = useMemo(() => {
    if (!activeCollectionKey) return null;
    return collections.find((c) => c.key === activeCollectionKey) ?? null;
  }, [activeCollectionKey, collections]);

  const numColumns = width >= TABLET_BREAKPOINT ? 5 : 3;
  const cardWidth = width / numColumns;

  const handleOpenReader = (book: Book) => {
    navigation.navigate('Reader', { book });
  };

  const handleCreateList = async () => {
    if (!createName.trim()) return;
    await createList(createName);
    setCreateName('');
    setCreating(false);
  };

  const handleRenameList = async () => {
    if (!activeCollection?.listId || !renameName.trim()) return;
    await renameList(activeCollection.listId, renameName);
    setRenaming(false);
  };

  const handleDeleteList = async () => {
    if (!activeCollection?.listId || activeCollection.isFixed) return;
    const idToDelete = activeCollection.listId;
    setActiveCollectionKey(null);
    setDeleting(false);
    await deleteList(idToDelete);
  };

  const searchableBooks = useMemo(() => {
    const term = bookSearchQuery.trim().toLowerCase();
    if (!term) return allBooks;
    return allBooks.filter(
      (b) =>
        b.title.toLowerCase().includes(term) ||
        (b.author ?? '').toLowerCase().includes(term),
    );
  }, [allBooks, bookSearchQuery]);

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      {/* Top Bar / Header */}
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'space-between',
          padding: spacing.md,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>
          {t('lists.title')}
        </Text>
        <Pressable hitSlop={10} onPress={() => setCreating(true)}>
          <Plus color={theme.accent} size={24} />
        </Pressable>
      </View>

      {/* Main List Cards Grid / ScrollView */}
      {collections.every((collection) => collection.books.length === 0 && collection.isFixed && collections.length === 4) ? (
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
          <ListIcon color={theme.textSecondary} size={56} strokeWidth={1.2} />
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, marginTop: spacing.md }}>
            {t('lists.empty')}
          </Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' }}>
            {t('lists.emptyHint')}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl }}>
          {collections.map((collection) => (
            <ListCard
              key={collection.key}
              title={collection.title}
              books={collection.books}
              onPress={() => setActiveCollectionKey(collection.key)}
            />
          ))}
        </ScrollView>
      )}

      {/* Modal: Create List */}
      <Modal transparent animationType="fade" visible={creating} onRequestClose={() => setCreating(false)}>
        <Pressable
          onPress={() => setCreating(false)}
          style={{ alignItems: 'center', backgroundColor: '#00000088', flex: 1, justifyContent: 'center', padding: spacing.lg }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: 12,
              borderWidth: 1,
              gap: spacing.md,
              padding: spacing.lg,
              width: '100%',
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18 }}>{t('lists.create')}</Text>
            <TextInput
              autoFocus
              onChangeText={setCreateName}
              onSubmitEditing={handleCreateList}
              placeholder={t('lists.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              style={{ borderColor: theme.border, borderRadius: 8, borderWidth: 1, color: theme.textPrimary, padding: spacing.md }}
              value={createName}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.sm }}>
              <Pressable onPress={() => setCreating(false)} style={{ padding: spacing.sm }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleCreateList} style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: '#ffffff', fontFamily: serifFont, fontWeight: '600' }}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Detail Modal / Screen for Active Collection */}
      <Modal visible={Boolean(activeCollection)} animationType="slide" onRequestClose={() => setActiveCollectionKey(null)}>
        {activeCollection && (
          <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
            {/* Header of Detail */}
            <View
              style={{
                alignItems: 'center',
                borderBottomColor: theme.border,
                borderBottomWidth: 1,
                flexDirection: 'row',
                gap: spacing.md,
                padding: spacing.md,
              }}
            >
              <Pressable hitSlop={10} onPress={() => setActiveCollectionKey(null)}>
                <ArrowLeft color={theme.textPrimary} size={24} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700' }} numberOfLines={1}>
                  {activeCollection.title}
                </Text>
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
                  {activeCollection.books.length} {t('lists.books')}
                </Text>
              </View>

              {/* Options for Custom Lists or Favorites */}
              {(!activeCollection.isFixed || activeCollection.isFavorite) && (
                <Pressable
                  hitSlop={10}
                  onPress={() => {
                    setBookSearchQuery('');
                    setManagingBooks(true);
                  }}
                  style={{ padding: 4 }}
                >
                  <PlusCircle color={theme.accent} size={22} />
                </Pressable>
              )}

              {!activeCollection.isFixed && (
                <>
                  <Pressable
                    hitSlop={10}
                    onPress={() => {
                      setRenameName(activeCollection.title);
                      setRenaming(true);
                    }}
                    style={{ padding: 4 }}
                  >
                    <Edit2 color={theme.textSecondary} size={20} />
                  </Pressable>
                  <Pressable hitSlop={10} onPress={() => setDeleting(true)} style={{ padding: 4 }}>
                    <Trash2 color="#ef4444" size={20} />
                  </Pressable>
                </>
              )}
            </View>

            {/* Book list inside detail */}
            {activeCollection.books.length === 0 ? (
              <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
                <ListIcon color={theme.textSecondary} size={48} strokeWidth={1.2} />
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, marginTop: spacing.md }}>
                  {t('lists.emptyList')}
                </Text>
                {(!activeCollection.isFixed || activeCollection.isFavorite) && (
                  <Pressable
                    onPress={() => {
                      setBookSearchQuery('');
                      setManagingBooks(true);
                    }}
                    style={{ backgroundColor: theme.card, borderColor: theme.border, borderRadius: 8, borderWidth: 1, marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}
                  >
                    <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 14, fontWeight: '600' }}>
                      {t('lists.manageBooks')}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <FlatList
                contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}
                data={activeCollection.books}
                key={numColumns}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                renderItem={({ item }) => (
                  <BookCard
                    book={item}
                    width={cardWidth}
                    onPress={() => handleOpenReader(item)}
                    onLongPress={() => {
                      if (activeCollection.listId) {
                        void toggleBookInList(activeCollection.listId, item.fingerprint);
                      }
                    }}
                  />
                )}
              />
            )}
          </SafeAreaView>
        )}
      </Modal>

      {/* Modal: Rename List */}
      <Modal transparent animationType="fade" visible={renaming} onRequestClose={() => setRenaming(false)}>
        <Pressable
          onPress={() => setRenaming(false)}
          style={{ alignItems: 'center', backgroundColor: '#00000088', flex: 1, justifyContent: 'center', padding: spacing.lg }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: 12,
              borderWidth: 1,
              gap: spacing.md,
              padding: spacing.lg,
              width: '100%',
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18 }}>{t('lists.rename')}</Text>
            <TextInput
              autoFocus
              onChangeText={setRenameName}
              onSubmitEditing={handleRenameList}
              placeholder={t('lists.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              style={{ borderColor: theme.border, borderRadius: 8, borderWidth: 1, color: theme.textPrimary, padding: spacing.md }}
              value={renameName}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.sm }}>
              <Pressable onPress={() => setRenaming(false)} style={{ padding: spacing.sm }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleRenameList} style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: '#ffffff', fontFamily: serifFont, fontWeight: '600' }}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Delete List Confirmation */}
      <Modal transparent animationType="fade" visible={deleting} onRequestClose={() => setDeleting(false)}>
        <Pressable
          onPress={() => setDeleting(false)}
          style={{ alignItems: 'center', backgroundColor: '#00000088', flex: 1, justifyContent: 'center', padding: spacing.lg }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: 12,
              borderWidth: 1,
              gap: spacing.md,
              padding: spacing.lg,
              width: '100%',
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '600' }}>{t('lists.delete')}</Text>
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14 }}>{t('lists.deleteConfirm')}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.md }}>
              <Pressable onPress={() => setDeleting(false)} style={{ padding: spacing.sm }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleDeleteList} style={{ backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ color: '#ffffff', fontFamily: serifFont, fontWeight: '600' }}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Manage Books in List */}
      <Modal transparent animationType="slide" visible={managingBooks} onRequestClose={() => setManagingBooks(false)}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
          <View
            style={{
              alignItems: 'center',
              borderBottomColor: theme.border,
              borderBottomWidth: 1,
              flexDirection: 'row',
              justifyContent: 'space-between',
              padding: spacing.md,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
              {t('lists.manageBooks')}
            </Text>
            <Pressable onPress={() => setManagingBooks(false)} style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
              <Text style={{ color: '#ffffff', fontFamily: serifFont, fontWeight: '600' }}>{t('common.done')}</Text>
            </Pressable>
          </View>

          {/* Search bar inside manage books */}
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: radii.md,
              borderWidth: 1,
              flexDirection: 'row',
              margin: spacing.md,
              paddingHorizontal: spacing.md,
            }}
          >
            <Search color={theme.textMuted} size={18} />
            <TextInput
              onChangeText={setBookSearchQuery}
              placeholder={t('library.search')}
              placeholderTextColor={theme.textMuted}
              style={{ color: theme.textPrimary, flex: 1, fontFamily: serifFont, fontSize: 14, paddingVertical: spacing.md, paddingHorizontal: spacing.sm }}
              value={bookSearchQuery}
            />
          </View>

          {/* Book Grid selection */}
          <FlatList
            contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.xl }}
            data={searchableBooks}
            key={numColumns}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            renderItem={({ item }) => {
              if (!activeCollection?.listId) return null;
              const isSelected = activeCollection.books.some((b) => b.fingerprint === item.fingerprint);

              return (
                <View style={{ position: 'relative', width: cardWidth }}>
                  <BookCard
                    book={item}
                    width={cardWidth}
                    onPress={() => {
                      void toggleBookInList(activeCollection.listId!, item.fingerprint);
                    }}
                  />
                  <Pressable
                    onPress={() => {
                      void toggleBookInList(activeCollection.listId!, item.fingerprint);
                    }}
                    style={{
                      alignItems: 'center',
                      backgroundColor: isSelected ? theme.accent : 'rgba(0,0,0,0.4)',
                      borderColor: isSelected ? '#ffffff' : theme.border,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      elevation: 4,
                      height: 28,
                      justifyContent: 'center',
                      position: 'absolute',
                      right: spacing.sm + 6,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.25,
                      shadowRadius: 3.84,
                      top: spacing.sm + 6,
                      width: 28,
                      zIndex: 10,
                    }}
                  >
                    {isSelected && <Check color="#ffffff" size={18} strokeWidth={3} />}
                  </Pressable>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function flattenBooks(books: Book[]): Book[] {
  return books.flatMap((book) => [book, ...flattenBooks(book.children ?? [])]);
}
