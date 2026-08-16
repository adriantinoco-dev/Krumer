import React from 'react';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BookOpen } from 'lucide-react-native';
import { BookCard } from '../components/BookCard';
import { BookCardContinue } from '../components/BookCardContinue';
import { KrumerLogo } from '../components/KrumerLogo';
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
  const { books, theme, t } = useApp();
  const numColumns = width >= TABLET_BREAKPOINT ? 5 : 3;
  const cardWidth = width / numColumns;
  const continueReading = books.filter(
    (book) => book.progress && book.progress !== '0' && book.progress !== '100'
  );
  const openReader = (book: Book) => navigation.navigate('Reader', { book });

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <FlatList
        ListEmptyComponent={<EmptyLibrary />}
        ListHeaderComponent={
          <LibraryHeader books={books} continueReading={continueReading} onPressBook={openReader} />
        }
        contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl }}
        data={books}
        key={numColumns}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        renderItem={({ item }) => <BookCard book={item} width={cardWidth} onPress={() => openReader(item)} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function LibraryHeader({
  books,
  continueReading,
  onPressBook,
}: {
  books: Book[];
  continueReading: Book[];
  onPressBook: (book: Book) => void;
}) {
  const { theme, t } = useApp();

  return (
    <>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
        <KrumerLogo compact hideLabel />
      </View>
      {continueReading.length > 0 && (
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
              marginBottom: spacing.lg,
              marginHorizontal: spacing.md,
              marginTop: spacing.lg,
            }}
          />
        </>
      )}
      <View
        style={{
          alignItems: 'baseline',
          flexDirection: 'row',
          marginBottom: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
        }}
      >
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 20, fontWeight: '700' }}>
          {t('library.title')}
        </Text>
        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13, fontWeight: '700', marginLeft: 8 }}>
          ({books.length} {t('library.items')})
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