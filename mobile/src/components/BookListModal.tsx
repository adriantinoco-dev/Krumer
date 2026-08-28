import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BookOpen, Heart, List as ListIcon } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import { radii, serifFont, spacing } from '../theme';

type Props = {
  book: Book | null;
  visible: boolean;
  onClose: () => void;
};

/**
 * Bottom-sheet modal that appears on long press of a book card.
 * Shows Favorites + all custom user lists with toggle checkmarks.
 * Background overlay transitions with smooth fade, while the sheet slides up/down.
 * Optimized for snappy consecutive openings without touch blocking.
 */
export function BookListModal({ book, visible, onClose }: Props) {
  const { books, lists, theme, t, toggleBookInList, updateBookProgress } = useApp();

  const [mounted, setMounted] = useState(visible && book !== null);
  const [isClosing, setIsClosing] = useState(false);
  const [renderedBook, setRenderedBook] = useState<Book | null>(book);

  const backdropAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(450)).current;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible && book) {
      setRenderedBook(book);
      setMounted(true);
    }
  }, [visible, book]);

  useEffect(() => {
    if (!mounted) return;

    if (visible && renderedBook) {
      setIsClosing(false);

      backdropAnim.stopAnimation();
      slideAnim.stopAnimation();

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!visible && mounted) {
      setIsClosing(true);
      backdropAnim.stopAnimation();
      slideAnim.stopAnimation();

      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 450,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          setIsClosing(false);
          setRenderedBook(null);
        }
      });
    }
  }, [visible, mounted, renderedBook]);

  const handleDismiss = () => {
    onCloseRef.current();
  };

  if (!mounted || !renderedBook) return null;

  const activeBook = findBookByFingerprint(books, renderedBook.fingerprint) ?? renderedBook;

  const favoriteList = lists.find((l) => l.isDefault || l.name === 'Favoritos');
  const customLists = lists.filter((l) => !l.isDefault && l.name !== 'Favoritos');
  const isFavorite = favoriteList?.bookFingerprints.includes(activeBook.fingerprint) ?? false;

  const handleToggleFavorite = () => {
    void toggleBookInList('favorites', activeBook.fingerprint);
  };

  const handleToggleList = (listId: string) => {
    void toggleBookInList(listId, activeBook.fingerprint);
  };

  const progressPct = Math.max(0, Math.min(100, activeBook.progressPct ?? 0));
  const isBookRead = activeBook.isRead || progressPct >= 100;
  const hasPartialProgress = progressPct > 0 && progressPct < 100;
  const handleSetRead = (nextIsRead: boolean) => {
    onCloseRef.current();
    const id = activeBook.id;
    setTimeout(() => {
      void updateBookProgress(id, { isRead: nextIsRead, progressPct: nextIsRead ? 100 : 0 });
    }, 200);
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={handleDismiss}
      transparent
      visible={mounted}
    >
      <View
        pointerEvents={isClosing ? 'none' : 'auto'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        {/* Animated backdrop (fade in / out) */}
        <TouchableWithoutFeedback onPress={handleDismiss}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: 'rgba(0,0,0,0.55)',
                opacity: backdropAnim,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        {/* Animated bottom sheet (slide up / down) */}
        <Animated.View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: radii.lg + 4,
            borderTopRightRadius: radii.lg + 4,
            maxHeight: '60%',
            paddingBottom: spacing.xl,
            paddingTop: spacing.md,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* Handle */}
          <View
            style={{
              alignSelf: 'center',
              backgroundColor: theme.border,
              borderRadius: 99,
              height: 4,
              marginBottom: spacing.md,
              width: 36,
            }}
          />

          {/* Book title */}
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={{
              color: theme.textPrimary,
              fontFamily: serifFont,
              fontSize: 16,
              fontWeight: '700',
              marginBottom: spacing.sm,
              paddingHorizontal: spacing.md,
            }}
          >
            {activeBook.title}
          </Text>

          {/* Section label */}
          <Text
            style={{
              color: theme.textMuted,
              fontFamily: serifFont,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
              marginBottom: spacing.sm,
              paddingHorizontal: spacing.md,
              textTransform: 'uppercase',
            }}
          >
            {t('lists.bookActions')}
          </Text>

          <ScrollView bounces={false}>
            {/* Reading status actions */}
            {hasPartialProgress ? (
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginHorizontal: spacing.sm }}>
                <Pressable
                  onPress={() => handleSetRead(true)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? theme.cardHover : 'transparent',
                    borderRadius: radii.md,
                    borderColor: theme.border,
                    borderWidth: 1,
                    flex: 1,
                    justifyContent: 'center',
                    minHeight: 52,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <BookOpen color={theme.accent} size={18} />
                  <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 13, fontWeight: 'bold', textAlign: 'center' }}>
                    {t('details.markAsRead')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSetRead(false)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? theme.cardHover : 'transparent',
                    borderRadius: radii.md,
                    borderColor: theme.border,
                    borderWidth: 1,
                    flex: 1,
                    justifyContent: 'center',
                    minHeight: 52,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.sm,
                  })}
                >
                  <BookOpen color={theme.textSecondary} size={18} />
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 13, fontWeight: 'bold', textAlign: 'center' }}>
                    {t('details.markAsUnread')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => handleSetRead(!isBookRead)}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed ? theme.cardHover : 'transparent',
                  borderRadius: radii.md,
                  flexDirection: 'row',
                  gap: spacing.sm,
                  marginHorizontal: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 14,
                })}
              >
                <BookOpen color={isBookRead ? theme.textSecondary : theme.accent} size={18} />
                <Text
                  style={{
                    color: isBookRead ? theme.textPrimary : theme.accent,
                    flex: 1,
                    fontFamily: serifFont,
                    fontSize: 15,
                    fontWeight: isBookRead ? '400' : '700',
                  }}
                >
                  {isBookRead ? t('details.markAsUnread') : t('details.markAsRead')}
                </Text>
              </Pressable>
            )}

            {/* Divider */}
            <View
              style={{
                backgroundColor: theme.border,
                height: 1,
                marginHorizontal: spacing.md,
                marginVertical: spacing.xs,
              }}
            />

            {/* Favorites row */}
            <Pressable
              onPress={handleToggleFavorite}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: pressed ? theme.cardHover : 'transparent',
                borderRadius: radii.md,
                flexDirection: 'row',
                gap: spacing.sm,
                marginHorizontal: spacing.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: 14,
              })}
            >
              <Heart
                color={isFavorite ? theme.accent : theme.textSecondary}
                fill={isFavorite ? theme.accent : 'none'}
                size={18}
              />
              <Text
                style={{
                  color: isFavorite ? theme.accent : theme.textPrimary,
                  flex: 1,
                  fontFamily: serifFont,
                  fontSize: 15,
                  fontWeight: isFavorite ? '700' : '400',
                }}
              >
                {t('lists.favorites')}
              </Text>
            </Pressable>

            {/* Divider */}
            {customLists.length > 0 && (
              <View
                style={{
                  backgroundColor: theme.border,
                  height: 1,
                  marginHorizontal: spacing.md,
                  marginVertical: spacing.xs,
                }}
              />
            )}

            {/* Custom lists */}
            {customLists.map((list) => {
              const isInList = list.bookFingerprints.includes(activeBook.fingerprint);
              return (
                <Pressable
                  key={list.id}
                  onPress={() => handleToggleList(list.id)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: pressed ? theme.cardHover : 'transparent',
                    borderRadius: radii.md,
                    flexDirection: 'row',
                    gap: spacing.sm,
                    marginHorizontal: spacing.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 14,
                  })}
                >
                  <ListIcon
                    color={isInList ? theme.accent : theme.textSecondary}
                    size={18}
                  />
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={{
                      color: isInList ? theme.accent : theme.textPrimary,
                      flex: 1,
                      fontFamily: serifFont,
                      fontSize: 15,
                      fontWeight: isInList ? '700' : '400',
                    }}
                  >
                    {list.name}
                  </Text>
                </Pressable>
              );
            })}

            {/* Empty state when no custom lists */}
            {customLists.length === 0 && (
              <Text
                style={{
                  color: theme.textMuted,
                  fontFamily: serifFont,
                  fontSize: 13,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  textAlign: 'center',
                }}
              >
                {t('lists.noCustomLists')}
              </Text>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function findBookByFingerprint(books: Book[], fingerprint: string): Book | null {
  for (const book of books) {
    if (book.fingerprint === fingerprint) return book;
    if (book.children) {
      const found = findBookByFingerprint(book.children, fingerprint);
      if (found) return found;
    }
  }
  return null;
}
