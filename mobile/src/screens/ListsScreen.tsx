import React, { useEffect, useMemo, useState } from 'react';
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
import { BookListModal } from '../components/BookListModal';
import { ListCard } from '../components/ListCard';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { fuzzyMatch } from '../services/fuzzySearch';
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
  const [longPressBook, setLongPressBook] = useState<Book | null>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      setActiveCollectionKey(null);
      setCreating(false);
      setRenaming(false);
      setDeleting(false);
      setManagingBooks(false);
    });

    return unsubscribe;
  }, [navigation]);

  const collections = useMemo<CollectionItem[]>(() => {
    const favoriteList = lists.find((l) => l.isDefault || l.name === 'Favoritos');

    const result: CollectionItem[] = [
      {
        key: favoriteList?.id || 'favorites',
        listId: favoriteList?.id || 'favorites',
        title: t('lists.favorites'),
        books: favoriteList
          ? books.filter((book) => {
              if (favoriteList.bookFingerprints.includes(book.fingerprint)) return true;
              if (book.children?.some((c) => favoriteList.bookFingerprints.includes(c.fingerprint))) return true;
              return false;
            })
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
        books: books.filter((book) => (book.progressPct ?? 0) >= 100 || book.isRead),
        isFixed: true,
      },
      {
        key: 'unread',
        title: t('lists.unread'),
        books: books.filter((book) => (book.progressPct ?? 0) < 100 && !book.isRead),
        isFixed: true,
      },
    ];

    const custom = lists
      .filter((l) => !l.isDefault && l.name !== 'Favoritos')
      .map((l) => ({
        key: l.id,
        listId: l.id,
        title: l.name,
        books: books.filter((book) => {
          if (l.bookFingerprints.includes(book.fingerprint)) return true;
          if (book.children?.some((c) => l.bookFingerprints.includes(c.fingerprint))) return true;
          return false;
        }),
        isFixed: false,
      }));

    return [...result, ...custom];
  }, [books, lists, t]);

  const activeCollection = useMemo(() => {
    if (!activeCollectionKey) return null;
    return collections.find((c) => c.key === activeCollectionKey) ?? null;
  }, [activeCollectionKey, collections]);

  const numColumns = width >= TABLET_BREAKPOINT ? 5 : 3;
  const listNumColumns = width >= TABLET_BREAKPOINT ? 4 : 2;
  const cardWidth = width / numColumns;

  const handleOpenBookDetail = (book: Book) => {
    navigation.navigate('BookDetail', { bookId: book.id });
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
    const term = bookSearchQuery.trim();
    if (!term) return books;
    return books.filter(
      (b) =>
        fuzzyMatch(b.title, term) ||
        fuzzyMatch(b.author ?? '', term) ||
        Boolean(
          b.children?.some(
            (c) =>
              fuzzyMatch(c.title, term) ||
              fuzzyMatch(c.author ?? '', term),
          ),
        ),
    );
  }, [books, bookSearchQuery]);

  const formattedCollections = useMemo(() => {
    if (collections.length % listNumColumns === 0) return collections;
    const copy = [...collections];
    const remainder = collections.length % listNumColumns;
    for (let i = 0; i < listNumColumns - remainder; i++) {
      copy.push({
        key: `__spacer_${i}__`,
        title: '',
        books: [],
        isFixed: true,
        isSpacer: true,
      } as any);
    }
    return copy;
  }, [collections, listNumColumns]);

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      {activeCollection ? (
        /* Active Collection View */
        <View style={{ flex: 1 }}>
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
              <ArrowLeft color={theme.accent} size={24} />
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
                  <Edit2 color={theme.accent} size={20} />
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
              contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 96 }}
              data={activeCollection.books}
              key={numColumns}
              keyExtractor={(item) => item.id}
              numColumns={numColumns}
              renderItem={({ item }) => (
                <BookCard
                  book={item}
                  width={cardWidth}
                  onPress={() => handleOpenBookDetail(item)}
                  onLongPress={() => setLongPressBook(item)}
                />
              )}
            />
          )}
        </View>
      ) : (
        /* Main Lists Overview */
        <View style={{ flex: 1 }}>
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

          {/* Main List Cards Grid */}
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
            <FlatList
              columnWrapperStyle={{ gap: spacing.md }}
              contentContainerStyle={{ gap: spacing.md, padding: spacing.md, paddingBottom: 96 }}
              data={formattedCollections}
              key={listNumColumns}
              keyExtractor={(item) => item.key}
              numColumns={listNumColumns}
              renderItem={({ item }) => {
                if ((item as any).isSpacer) {
                  return <View style={{ flex: 1 }} />;
                }
                return (
                  <View style={{ flex: 1 }}>
                    <ListCard
                      title={item.title}
                      books={item.books}
                      onPress={() => setActiveCollectionKey(item.key)}
                    />
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

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
      <BookListModal
        book={longPressBook}
        visible={longPressBook !== null}
        onClose={() => setLongPressBook(null)}
      />
    </SafeAreaView>
  );
}
