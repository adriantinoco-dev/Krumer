import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { List as ListIcon, Plus } from 'lucide-react-native';
import { ListCard } from '../components/ListCard';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { serifFont, spacing, TABLET_BREAKPOINT } from '../theme';

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
  const { books, createList, lists, t, theme } = useApp();

  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      closeCreateModal();
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

  const listNumColumns = width >= TABLET_BREAKPOINT ? 4 : 2;

  const handleCreateList = async () => {
    if (!createName.trim()) return;
    await createList(createName.trim());
    setCreateName('');
    setCreating(false);
  };

  const closeCreateModal = useCallback(() => {
    setCreateName('');
    setCreating(false);
  }, []);

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
          <Text
            style={{
              color: theme.textSecondary,
              fontFamily: serifFont,
              fontSize: 13,
              marginTop: spacing.sm,
              textAlign: 'center',
            }}
          >
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
                  books={item.books}
                  onPress={() =>
                    navigation.navigate('ListDetail', {
                      collectionKey: item.key,
                      listId: item.listId,
                      title: item.title,
                    })
                  }
                  title={item.title}
                />
              </View>
            );
          }}
        />
      )}

      {/* Modal: Create List */}
      <Modal animationType="fade" onRequestClose={closeCreateModal} transparent visible={creating}>
        <Pressable
          onPress={closeCreateModal}
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
              <Pressable onPress={closeCreateModal} style={{ padding: spacing.sm }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateList}
                style={{ backgroundColor: theme.accent, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
              >
                <Text style={{ color: '#ffffff', fontFamily: serifFont, fontWeight: '600' }}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
