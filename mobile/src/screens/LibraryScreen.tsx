import React, { useMemo, useState } from 'react';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BookOpen, SearchX } from 'lucide-react-native';
import { BookCard } from '../components/BookCard';
import { BookCardContinue } from '../components/BookCardContinue';
import { KrumerLogo } from '../components/KrumerLogo';
import { SearchSortBar, type SortKey } from '../components/SearchSortBar';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { serifFont, spacing, TABLET_BREAKPOINT } from '../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

export function LibraryScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const { books, theme, t, toggleFavorite } = useApp();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  const numColumns = width >= TABLET_BREAKPOINT ? 5 : 3;
  const cardWidth = width / numColumns;

  const continueReading = useMemo(
    () => books.filter((book) => (book.progressPct ?? 0) > 0 && (book.progressPct ?? 0) < 100),
    [books],
  );

  const filteredBooks = useMemo(() => {
    const term = query.trim().toLowerCase();

    // flatten + filter
    let result = flattenBooks(books);
    if (term) {
      result = result.filter(
        (book) =>
          book.title.toLowerCase().includes(term) ||
          (book.author ?? '').toLowerCase().includes(term),
      );
    }

    // sort
    switch (sort) {
      case 'name':
        result = [...result].sort((a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
        );
        break;
      case 'rating':
        result = [...result].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'progress':
        result = [...result].sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0));
        break;
      case 'recent':
      default:
        result = [...result].sort((a, b) => b.addedAt - a.addedAt);
        break;
    }

    return result;
  }, [books, query, sort]);

  const openReader = (book: Book) => navigation.navigate('Reader', { book });

  // When searching, flatten and don't show the "continue reading" strip
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
            onPressBook={openReader}
            query={query}
            sort={sort}
            onQueryChange={setQuery}
            onSortChange={setSort}
          />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl }}
        data={filteredBooks}
        key={numColumns}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        renderItem={({ item }) => (
          <BookCard
            book={item}
            width={cardWidth}
            onPress={() => openReader(item)}
            onLongPress={() => { void toggleFavorite(item); }}
          />
        )}
        showsVerticalScrollIndicator={false}
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
  query,
  sort,
  onQueryChange,
  onSortChange,
}: {
  books: Book[];
  continueReading: Book[];
  filteredCount: number;
  isSearching: boolean;
  onPressBook: (book: Book) => void;
  query: string;
  sort: SortKey;
  onQueryChange: (v: string) => void;
  onSortChange: (v: SortKey) => void;
}) {
  const { theme, t } = useApp();

  return (
    <>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
        <KrumerLogo compact hideLabel />
      </View>

      {/* Continuar lendo — só aparece quando não está buscando */}
      {!isSearching && continueReading.length > 0 && (
        <>
          <View
            style={{
              alignItems: 'baseline',
              flexDirection: 'row',
              marginBottom: spacing.sm,
              marginTop: spacing.lg,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, fontWeight: '700' }}>
              {t('library.continueReading')}
            </Text>
            <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
              ({continueReading.length} {t('library.items')})
            </Text>
          </View>
          <FlatList
            contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
            data={continueReading}
            horizontal
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <BookCardContinue book={item} onPress={() => onPressBook(item)} />}
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
      />

      {/* Título da seção + contagem */}
      <View
        style={{
          alignItems: 'baseline',
          flexDirection: 'row',
          marginBottom: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.xs,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700' }}>
          {t('library.title')}
        </Text>
        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
          ({isSearching ? filteredCount : books.length} {t('library.items')})
        </Text>
      </View>
    </>
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
