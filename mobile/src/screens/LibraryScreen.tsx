import React, { useMemo, useState } from 'react';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BookOpen, SearchX } from 'lucide-react-native';
import { BookCard } from '../components/BookCard';
import { BookCardContinue } from '../components/BookCardContinue';
import { BookListModal } from '../components/BookListModal';
import { KrumerLogo } from '../components/KrumerLogo';
import { SearchSortBar, type SortKey } from '../components/SearchSortBar';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { fuzzyMatch } from '../services/fuzzySearch';
import { BOOK_GRID_MAX_CARD_WIDTH, CONTENT_MAX_WIDTH, getBookGridLayout, radii, serifFont, spacing } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function LibraryScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const { books, isScanning, preferences, rescanLibrary, theme, t } = useApp();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [longPressBook, setLongPressBook] = useState<Book | null>(null);

  const { numColumns } = getBookGridLayout(width, preferences.booksPerRow ?? 3);
  const gridWidth = Math.min(Math.max(width - spacing.sm * 2, 1), numColumns * BOOK_GRID_MAX_CARD_WIDTH);
  const cardWidth = gridWidth / numColumns;

  const continueReading = useMemo(
    () =>
      flattenBooks(books).filter((book) => {
        const isChildOrStandalone = !book.children?.length;
        const prog = book.progressPct ?? 0;
        return isChildOrStandalone && prog > 0 && prog < 100;
      }).sort((a, b) => {
        // Most recently opened books stay at the left. Older library entries
        // without this timestamp fall back to their original scan order.
        const aLastRead = a.lastReadAt ?? a.addedAt;
        const bLastRead = b.lastReadAt ?? b.addedAt;
        return bLastRead - aLastRead || b.addedAt - a.addedAt;
      }),
    [books],
  );

  const filteredBooks = useMemo(() => {
    const term = query.trim();

    // Main grid displays root-level items (standalone books + parent series)
    let result = [...books];

    if (term) {
      result = result.filter((book) => {
        const matchTitle = fuzzyMatch(book.title, term);
        const matchAuthor = fuzzyMatch(book.author ?? '', term);
        const matchChildren = Boolean(
          book.children?.some(
            (child) =>
              fuzzyMatch(child.title, term) ||
              fuzzyMatch(child.author ?? '', term),
          ),
        );
        return matchTitle || matchAuthor || matchChildren;
      });
    }

    // sort
    switch (sort) {
      case 'name':
        result.sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }),
        );
        break;
      case 'rating':
        result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'progress':
        result.sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0));
        break;
      case 'recent':
      default:
        result.sort((a, b) => b.addedAt - a.addedAt);
        break;
    }

    return result;
  }, [books, query, sort]);

  const openBookDetails = (book: Book) => navigation.navigate('BookDetail', { bookId: book.id });

  // When searching, don't show the "continue reading" strip
  const isSearching = query.trim().length > 0;

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <FlatList
        ListEmptyComponent={
          isSearching ? <NoResults /> : <EmptyLibrary />
        }
        ListHeaderComponent={
          <LibraryHeader
            books={books}
            continueReading={continueReading}
            filteredCount={filteredBooks.length}
            isSearching={isSearching}
            onPressBook={openBookDetails}
            onLongPressBook={setLongPressBook}
            query={query}
            sort={sort}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onRescan={() => void rescanLibrary()}
            rescanDisabled={!preferences.libraryFolder}
            isScanning={isScanning}
          />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 96 }}
        data={filteredBooks}
        key={numColumns}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { alignSelf: 'center', justifyContent: 'flex-start', width: gridWidth } : undefined}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            width={cardWidth}
            onPress={() => openBookDetails(item)}
            onLongPress={() => setLongPressBook(item)}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
      <BookListModal
        book={longPressBook}
        visible={longPressBook !== null}
        onClose={() => setLongPressBook(null)}
      />
    </SafeAreaView>
  );
}

function LibraryHeader({
  books,
  continueReading,
  filteredCount,
  isSearching,
  onPressBook,
  onLongPressBook,
  query,
  sort,
  onQueryChange,
  onSortChange,
  onRescan,
  rescanDisabled,
  isScanning,
}: {
  books: Book[];
  continueReading: Book[];
  filteredCount: number;
  isSearching: boolean;
  onPressBook: (book: Book) => void;
  onLongPressBook?: (book: Book) => void;
  query: string;
  sort: SortKey;
  onQueryChange: (v: string) => void;
  onSortChange: (v: SortKey) => void;
  onRescan: () => void;
  rescanDisabled: boolean;
  isScanning: boolean;
}) {
  const { theme, t } = useApp();

  const allLeafs = useMemo(
    () => flattenBooks(books).filter((book) => !book.children?.length),
    [books],
  );
  const totalCount = useMemo(
    () => books.reduce((sum, b) => sum + (b.childrenCount || 1), 0),
    [books],
  );
  const readCount = useMemo(
    () => allLeafs.filter((book) => (book.progressPct ?? 0) >= 100 || book.isRead).length,
    [allLeafs],
  );
  const unreadCount = useMemo(
    () => allLeafs.filter((book) => (book.progressPct ?? 0) === 0 && !book.isRead).length,
    [allLeafs],
  );

  return (
    <View style={{ alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH, width: '100%' }}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: 20, paddingBottom: 10 }}>
        <KrumerLogo compact hideLabel />
      </View>

      {/* Continuar lendo — só aparece quando não está buscando */}
      {!isSearching && continueReading.length > 0 && (
        <>
          <View
            style={{
              marginBottom: spacing.sm,
              marginTop: spacing.lg,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, fontWeight: '700' }}>
              {t('library.continueReading')}
            </Text>
          </View>
          <FlatList
            contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
            data={continueReading}
            horizontal
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <BookCardContinue
                book={item}
                onPress={() => onPressBook(item)}
                onLongPress={() => onLongPressBook?.(item)}
              />
            )}
            showsHorizontalScrollIndicator={false}
          />
          <View
            style={{
              borderBottomColor: theme.border,
              borderBottomWidth: 1,
              marginBottom: spacing.md,
              marginHorizontal: spacing.md,
              marginTop: spacing.lg,
            }}
          />
        </>
      )}

      {/* Barra de busca + ordenação */}
      <SearchSortBar
        query={query}
        sort={sort}
        onQueryChange={onQueryChange}
        onSortChange={onSortChange}
        onRescan={onRescan}
        rescanDisabled={rescanDisabled}
        isScanning={isScanning}
      />

      {/* Stats em 3 colunas modernas e simples (abaixo da busca/filtro) */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderRadius: radii.md,
          borderWidth: 1,
          flexDirection: 'row',
          justifyContent: 'space-around',
          marginBottom: spacing.md,
          marginHorizontal: spacing.md,
          marginTop: spacing.sm,
          paddingVertical: spacing.sm + 2,
        }}
      >
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
            {totalCount}
          </Text>
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
            {t('library.statsTotal')}
          </Text>
        </View>

        <View style={{ backgroundColor: theme.border, height: 24, width: 1 }} />

        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
            {readCount}
          </Text>
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
            {t('lists.read')}
          </Text>
        </View>

        <View style={{ backgroundColor: theme.border, height: 24, width: 1 }} />

        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
            {unreadCount}
          </Text>
          <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
            {t('lists.unread')}
          </Text>
        </View>
      </View>
    </View>
  );
}

function EmptyLibrary() {
  const { theme, t } = useApp();

  return (
    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
      <BookOpen color={theme.textSecondary} size={56} strokeWidth={1.2} />
      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, marginTop: spacing.md }}>{t('library.empty')}</Text>
      <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, marginTop: spacing.sm, textAlign: 'center' }}>
        {t('library.emptyHint')}
      </Text>
    </View>
  );
}

function NoResults() {
  const { theme, t } = useApp();

  return (
    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
      <SearchX color={theme.textSecondary} size={48} strokeWidth={1.2} />
      <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, marginTop: spacing.md }}>{t('library.noResults')}</Text>
      <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, marginTop: spacing.sm, textAlign: 'center' }}>
        {t('library.noResultsHint')}
      </Text>
    </View>
  );
}

/** Flattens the book tree (series + their children) into a single list. */
function flattenBooks(books: Book[]): Book[] {
  return books.flatMap((book) => [book, ...flattenBooks(book.children ?? [])]);
}
