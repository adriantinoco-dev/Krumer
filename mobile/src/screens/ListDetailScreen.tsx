import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Check,
  Edit2,
  List as ListIcon,
  PlusCircle,
  Search,
  Trash2,
} from 'lucide-react-native';
import { BookCard } from '../components/BookCard';
import { BookListModal } from '../components/BookListModal';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { RootStackParamList } from '../navigation/types';
import { fuzzyMatch } from '../services/fuzzySearch';
import { radii, serifFont, spacing, TABLET_BREAKPOINT } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ListDetail'>;

type CollectionData = {
  key: string;
  listId?: string;
  title: string;
  books: Book[];
  isFixed: boolean;
  isFavorite?: boolean;
};

export function ListDetailScreen({ navigation, route }: Props) {
  const { collectionKey, listId, title: initialTitle } = route.params;
  const { width } = useWindowDimensions();
  const {
    books,
    deleteList,
    lists,
    renameList,
    t,
    theme,
    toggleBookInList,
  } = useApp();

  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [managingBooks, setManagingBooks] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [longPressBook, setLongPressBook] = useState<Book | null>(null);

  const collection = useMemo<CollectionData>(() => {
    const favoriteList = lists.find((l) => l.isDefault || l.name === 'Favoritos');

    if (collectionKey === 'favorites' || collectionKey === favoriteList?.id) {
      return {
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
      };
    }

    if (collectionKey === 'series') {
      return {
        key: 'series',
        title: t('lists.series'),
        books: books.filter((book) => Boolean(book.children?.length)),
        isFixed: true,
      };
    }

    if (collectionKey === 'read') {
      return {
        key: 'read',
        title: t('lists.read'),
        books: books.filter((book) => (book.progressPct ?? 0) >= 100 || book.isRead),
        isFixed: true,
      };
    }

    if (collectionKey === 'unread') {
      return {
        key: 'unread',
        title: t('lists.unread'),
        books: books.filter((book) => (book.progressPct ?? 0) < 100 && !book.isRead),
        isFixed: true,
      };
    }

    // Custom List
    const customList = lists.find((l) => l.id === collectionKey || (listId && l.id === listId));
    if (customList) {
      return {
        key: customList.id,
        listId: customList.id,
        title: customList.name,
        books: books.filter((book) => {
          if (customList.bookFingerprints.includes(book.fingerprint)) return true;
          if (book.children?.some((c) => customList.bookFingerprints.includes(c.fingerprint))) return true;
          return false;
        }),
        isFixed: false,
      };
    }

    return {
      key: collectionKey,
      listId,
      title: initialTitle || '',
      books: [],
      isFixed: false,
    };
  }, [books, collectionKey, initialTitle, listId, lists, t]);

  const numColumns = width >= TABLET_BREAKPOINT ? 5 : 3;
  const cardWidth = width / numColumns;

  const handleOpenBookDetail = (book: Book) => {
    navigation.navigate('BookDetail', { bookId: book.id });
  };

  const handleRenameList = async () => {
    if (!collection.listId || !renameName.trim()) return;
    await renameList(collection.listId, renameName.trim());
    setRenaming(false);
  };

  const handleDeleteList = async () => {
    if (!collection.listId || collection.isFixed) return;
    const idToDelete = collection.listId;
    setDeleting(false);
    await deleteList(idToDelete);
    navigation.goBack();
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

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      {/* Header */}
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
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <ArrowLeft color={theme.accent} size={24} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700' }}
          >
            {collection.title}
          </Text>
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
            {collection.books.length} {t('lists.books')}
          </Text>
        </View>

        {/* Options for Custom Lists or Favorites */}
        {(!collection.isFixed || collection.isFavorite) && (
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

        {!collection.isFixed && (
          <>
            <Pressable
              hitSlop={10}
              onPress={() => {
                setRenameName(collection.title);
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
      {collection.books.length === 0 ? (
        <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
          <ListIcon color={theme.textSecondary} size={48} strokeWidth={1.2} />
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, marginTop: spacing.md }}>
            {t('lists.emptyList')}
          </Text>
          {(!collection.isFixed || collection.isFavorite) && (
            <Pressable
              onPress={() => {
                setBookSearchQuery('');
                setManagingBooks(true);
              }}
              style={{
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: 8,
                borderWidth: 1,
                marginTop: spacing.md,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
              }}
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
          data={collection.books}
          key={numColumns}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          renderItem={({ item }) => (
            <BookCard
              book={item}
              onLongPress={() => setLongPressBook(item)}
              onPress={() => handleOpenBookDetail(item)}
              width={cardWidth}
            />
          )}
        />
      )}

      {/* Modal: Rename List */}
      <Modal animationType="fade" onRequestClose={() => setRenaming(false)} transparent visible={renaming}>
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
              <Pressable
                onPress={handleRenameList}
                style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
              >
                <Text style={{ color: '#ffffff', fontFamily: serifFont, fontWeight: '600' }}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Delete List Confirmation */}
      <Modal animationType="fade" onRequestClose={() => setDeleting(false)} transparent visible={deleting}>
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
              <Pressable
                onPress={handleDeleteList}
                style={{ backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
              >
                <Text style={{ color: '#ffffff', fontFamily: serifFont, fontWeight: '600' }}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: Manage Books in List */}
      <Modal animationType="slide" onRequestClose={() => setManagingBooks(false)} transparent visible={managingBooks}>
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
            <Pressable
              onPress={() => setManagingBooks(false)}
              style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
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
              style={{
                color: theme.textPrimary,
                flex: 1,
                fontFamily: serifFont,
                fontSize: 14,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.md,
              }}
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
              if (!collection.listId) return null;
              const isSelected = collection.books.some((b) => b.fingerprint === item.fingerprint);

              return (
                <View style={{ position: 'relative', width: cardWidth }}>
                  <BookCard
                    book={item}
                    onPress={() => {
                      void toggleBookInList(collection.listId!, item.fingerprint);
                    }}
                    width={cardWidth}
                  />
                  <Pressable
                    onPress={() => {
                      void toggleBookInList(collection.listId!, item.fingerprint);
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
        onClose={() => setLongPressBook(null)}
        visible={longPressBook !== null}
      />
    </SafeAreaView>
  );
}
