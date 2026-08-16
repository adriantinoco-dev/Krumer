import React from 'react';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BookOpen } from 'lucide-react-native';
import { BookCard } from '../components/BookCard';
import { KrumerLogo } from '../components/KrumerLogo';
import { useApp } from '../context/AppContext';
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

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      <View style={{ alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
        <KrumerLogo useFullLogo />
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 26 }}>{t('library.title')}</Text>
      </View>
      <FlatList
        ListEmptyComponent={<EmptyLibrary />}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl, paddingTop: spacing.md }}
        data={books}
        key={numColumns}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        renderItem={({ item }) => (
          <BookCard book={item} width={cardWidth} onPress={() => navigation.navigate('Reader', { book: item })} />
        )}
      />
    </SafeAreaView>
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
