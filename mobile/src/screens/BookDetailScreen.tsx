import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  Edit3,
  FileText,
  Image as ImageIcon,
  MoreVertical,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-react-native';
import { RatingStars } from '../components/RatingStars';
import { MetadataActionModal } from '../components/MetadataActionModal';
import { MetadataDialog, type MetadataDialogConfig } from '../components/MetadataDialog';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { RootStackParamList } from '../navigation/types';
import { CONTENT_MAX_WIDTH, coverShadow, radii, serifFont, spacing, TABLET_BREAKPOINT } from '../theme';
import { extractYear, searchMetadataForBook } from '../services/metadataService';
import { preloadReaderBook } from '../readers/readerStartup';
import { useReaderSessions } from '../readers/ReaderSessionHost';

type Props = NativeStackScreenProps<RootStackParamList, 'BookDetail'>;

const ORANGE_ACCENT = '#ff6500';

export function BookDetailScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {
    books,
    lists,
    preferences,
    t,
    theme,
    toggleFavorite,
    updateBookMetadata,
    updateBookProgress,
  } = useApp();
  const { openReader } = useReaderSessions();

  const book = useMemo(() => findBookById(books, bookId), [books, bookId]);

  const [coverFailed, setCoverFailed] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataDialog, setMetadataDialog] = useState<MetadataDialogConfig | null>(null);

  // Form states for Metadata Editor
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRating, setEditRating] = useState(0);
  const [editTags, setEditTags] = useState('');
  const [editCoverPath, setEditCoverPath] = useState<string | null>(null);
  const [editCoverOriginalPath, setEditCoverOriginalPath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const favoriteList = useMemo(
    () => lists.find((l) => l.isDefault || l.name === 'Favoritos'),
    [lists],
  );
  const isFavorite = Boolean(
    book && favoriteList?.bookFingerprints.includes(book.fingerprint),
  );

  if (!book) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 16 }}>
          {t('details.bookNotFound')}
        </Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing.md, padding: spacing.sm }}>
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 14 }}>{t('details.goBack')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const showCover = Boolean(book.coverPath && !coverFailed);
  const isSeries = Boolean(book.children && book.children.length > 0);
  const coverCardWidth = width >= TABLET_BREAKPOINT ? 220 : 180;
  const rating = Math.max(0, Math.min(5, Math.round(book.rating ?? 0)));
  const accentColor = theme.name === 'dark' ? ORANGE_ACCENT : theme.accent;
  // Hero text colors: high contrast guaranteed on all themes
  const heroTextColor = theme.name === 'dark' ? '#ffffff' : theme.textPrimary;
  const heroSubtextColor = theme.name === 'dark' ? 'rgba(255, 255, 255, 0.85)' : theme.textSecondary;
  const heroMutedColor = theme.name === 'dark' ? 'rgba(255, 255, 255, 0.7)' : theme.textMuted;
  const heroAuthorColor = theme.name === 'dark' ? '#ffffff' : theme.textPrimary;

  // Header circular buttons: background matches theme background without border
  const navButtonBg = theme.bg;
  const navButtonIconColor = theme.textPrimary;

  const parentBook = useMemo(
    () => (book.parentId ? findBookById(books, book.parentId) : null),
    [books, book.parentId],
  );

  const animatedProgress = useRef(new Animated.Value(0)).current;
  const prevProgressPctRef = useRef<number | null>(null);
  const metadataSweep = useRef(new Animated.Value(0)).current;
  const [metadataTrackWidth, setMetadataTrackWidth] = useState(0);
  const progressPct = Math.max(0, Math.min(100, book.progressPct ?? 0));
  const isBookRead = book.isRead || (book.progressPct ?? 0) >= 100;
  const hasPartialProgress = progressPct > 0 && progressPct < 100;
  const defaultReaderBook = useMemo(() => getReaderBook(book), [book]);

  useEffect(() => {
    void preloadReaderBook(defaultReaderBook, preferences.language);
  }, [defaultReaderBook, preferences.language]);

  useEffect(() => {
    const target = Math.max(0, Math.min(100, book.progressPct ?? 0));
    const isFirst = prevProgressPctRef.current === null;
    const prev = isFirst ? 0 : prevProgressPctRef.current;
    prevProgressPctRef.current = target;

    animatedProgress.setValue(prev ?? 0);
    Animated.timing(animatedProgress, {
      toValue: target,
      duration: isFirst ? 600 : 500,
      useNativeDriver: false,
    }).start();
  }, [book.id, book.progressPct]);

  useEffect(() => {
    if (!metadataLoading) {
      metadataSweep.stopAnimation();
      metadataSweep.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.timing(metadataSweep, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    animation.start();

    return () => {
      animation.stop();
      metadataSweep.stopAnimation();
    };
  }, [metadataLoading, metadataSweep]);

  const handleSetRead = async (nextIsRead: boolean) => {
    await updateBookProgress(book.id, {
      isRead: nextIsRead,
      progressPct: nextIsRead ? 100 : 0,
    });
  };

  const handleRatingPress = async (newRating: number) => {
    await updateBookMetadata(book.id, { rating: newRating });
  };

  const handleOpenReader = (targetBook: Book = book) => {
    const readerBook = getReaderBook(targetBook);
    void preloadReaderBook(readerBook, preferences.language);
    openReader(readerBook);
  };

  const handleOpenEditModal = () => {
    setEditTitle(book.title || '');
    setEditAuthor(book.author || '');
    setEditYear(book.year ? String(book.year) : '');
    setEditDescription(book.description || '');
    setEditRating(book.rating || 0);
    setEditTags(book.tags ? book.tags.join(', ') : '');
    setEditCoverPath(book.coverPath || null);
    setEditCoverOriginalPath(book.coverOriginalPath || book.coverPath || null);
    setIsEditing(true);
  };

  const handleSearchMetadata = async () => {
    setActionsVisible(false);
    setMetadataLoading(true);
    try {
      const result = await searchMetadataForBook(book, { language: preferences.language });
      if (!result.candidate || result.status !== 'found') {
        throw new Error(t('metadata.notFound'));
      }

      const candidate = result.candidate;
      setEditTitle(isSeries ? book.title : candidate.nome_da_obra || book.title);
      setEditAuthor(candidate.autor || book.author || '');
      const returnedYear = extractYear(candidate.data_de_lancamento);
      setEditYear(returnedYear !== null ? String(returnedYear) : (book.year ? String(book.year) : ''));
      setEditDescription(candidate.sinopse || book.description || '');
      setEditRating(book.rating || 0);
      setEditTags(book.tags ? book.tags.join(', ') : '');
      setEditCoverPath(book.coverPath || null);
      setEditCoverOriginalPath(book.coverOriginalPath || book.coverPath || null);
      setIsEditing(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('metadata.notFound');
      setMetadataDialog({
        message,
        primaryAction: { label: t('metadata.retry'), onPress: () => { void handleSearchMetadata(); } },
        secondaryAction: { kind: 'secondary', label: t('metadata.close'), onPress: () => undefined },
        title: t('metadata.searchFailedTitle'),
        variant: 'error',
      });
    } finally {
      setMetadataLoading(false);
    }
  };

  const handlePickCoverImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const sourceUri = result.assets[0].uri;
        const coversDirectory = `${FileSystem.documentDirectory}covers/`;
        await FileSystem.makeDirectoryAsync(coversDirectory, { intermediates: true }).catch(() => undefined);
        const destination = `${coversDirectory}custom_${book.id}_${Date.now()}.jpg`;

        await FileSystem.copyAsync({ from: sourceUri, to: destination });
        setEditCoverPath(destination);
      }
    } catch (err) {
      console.warn('[Krumer] Error picking cover image:', err);
    }
  };

  const handleRestoreOriginalCover = () => {
    setEditCoverPath(editCoverOriginalPath || null);
  };

  const handleSaveMetadata = async () => {
    setIsSaving(true);
    try {
      const parsedYear = editYear.trim() ? parseInt(editYear.trim(), 10) : null;
      const parsedTags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await updateBookMetadata(book.id, {
        title: editTitle.trim() || book.title,
        author: editAuthor.trim(),
        year: isNaN(parsedYear as any) ? null : parsedYear,
        description: editDescription.trim() || null,
        rating: editRating,
        tags: parsedTags,
        coverPath: editCoverPath,
        coverOriginalPath: editCoverOriginalPath,
      });

      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const clearMetadata = async () => {
    setIsSaving(true);
    try {
      await updateBookMetadata(book.id, {
        author: '',
        year: null,
        description: null,
      });
      setEditAuthor('');
      setEditYear('');
      setEditDescription('');
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearMetadata = () => {
    setMetadataDialog({
      message: t('metadata.clearMessage'),
      primaryAction: { label: t('common.delete'), onPress: () => { void clearMetadata(); }, tone: 'danger' },
      secondaryAction: { kind: 'secondary', label: t('common.cancel'), onPress: () => undefined },
      title: t('metadata.clearTitle'),
      variant: 'danger',
    });
  };

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg, flex: 1 }}>
      {/* Blurred Cover Backdrop Hero */}
      <View style={{ position: 'relative', flex: 1 }}>
        {showCover && (
          <View pointerEvents="none" style={{ position: 'absolute', top: -50, left: -50, right: -50, bottom: -50, overflow: 'hidden' }}>
            {/* Top Blurred Cover Artwork extending deep down */}
            <Image
              blurRadius={20}
              onError={() => setCoverFailed(true)}
              resizeMode="cover"
              source={{ uri: book.coverPath ?? undefined }}
              style={{
                height: 720,
                width: '100%',
                opacity: theme.name === 'dark' ? 1.0 : theme.name === 'sepia' ? 1.0 : 1.0,
                transform: [{ scale: 1.35 }],
              }}
            />
            {/* Contrast tint overlay */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 720,
                backgroundColor: theme.name === 'dark' ? 'rgba(0, 0, 0, 0.40)' : 'rgba(255, 255, 255, 0.35)',
              }}
            />
            {/* Full-screen SVG Linear Gradient for 100% seamless procedural fade into theme.bg */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <Svg height="100%" width="100%">
                <Defs>
                  <LinearGradient id="smoothHeroFade" x1="0%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor={theme.bg} stopOpacity="0" />
                    <Stop offset="15%" stopColor={theme.bg} stopOpacity="0.1" />
                    <Stop offset="32%" stopColor={theme.bg} stopOpacity="0.4" />
                    <Stop offset="55%" stopColor={theme.bg} stopOpacity="0.8" />
                    <Stop offset="75%" stopColor={theme.bg} stopOpacity="1" />
                    <Stop offset="100%" stopColor={theme.bg} stopOpacity="1" />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#smoothHeroFade)" />
              </Svg>
            </View>
          </View>
        )}

        {/* Floating Top Navigation Header without border, matching theme background */}
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            zIndex: 10,
          }}
        >
          <Pressable
            hitSlop={12}
            onPress={() => navigation.goBack()}
            style={{
              alignItems: 'center',
              backgroundColor: navButtonBg,
              borderRadius: 999,
              height: 40,
              justifyContent: 'center',
              width: 40,
              elevation: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.18,
              shadowRadius: 4,
            }}
          >
            <ArrowLeft color={navButtonIconColor} size={20} />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              hitSlop={12}
              onPress={() => { void toggleFavorite(book); }}
              style={{
                alignItems: 'center',
                backgroundColor: navButtonBg,
                borderRadius: 999,
                height: 40,
                justifyContent: 'center',
                width: 40,
                elevation: 4,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.18,
                shadowRadius: 4,
              }}
            >
              <AnimatedFavoriteStar
                active={isFavorite}
                color={isFavorite ? '#f97316' : navButtonIconColor}
                fill={isFavorite ? '#f97316' : 'transparent'}
                size={20}
              />
            </Pressable>
            <Pressable
              hitSlop={12}
              onPress={() => setActionsVisible(true)}
              style={{
                alignItems: 'center',
                backgroundColor: navButtonBg,
                borderRadius: 999,
                height: 40,
                justifyContent: 'center',
                width: 40,
                elevation: 4,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.18,
                shadowRadius: 4,
              }}
            >
              <MoreVertical color={navButtonIconColor} size={20} />
            </Pressable>
          </View>
        </View>

        {/* Main Scroll Content */}
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ maxWidth: CONTENT_MAX_WIDTH, width: '100%' }}>
          {/* Cover Hero & Header Info */}
          <View style={{ alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.lg }}>
            <View
              style={{
                alignItems: 'center',
                aspectRatio: 193 / 264,
                backgroundColor: theme.card,
                borderRadius: 18,
                boxShadow: coverShadow(theme.name),
                elevation: 12,
                justifyContent: 'center',
                overflow: 'hidden',
                width: coverCardWidth,
              }}
            >
              {showCover ? (
                <Image
                  onError={() => setCoverFailed(true)}
                  resizeMode="cover"
                  source={{ uri: book.coverPath ?? undefined }}
                  style={{ height: '100%', width: '100%' }}
                />
              ) : (
                <Text
                  ellipsizeMode="tail"
                  numberOfLines={4}
                  style={{
                    color: theme.textPrimary,
                    fontFamily: serifFont,
                    fontSize: 18,
                    fontWeight: '800',
                    paddingHorizontal: spacing.md,
                    textAlign: 'center',
                  }}
                >
                  {book.title}
                </Text>
              )}
            </View>

            {/* Title */}
            <Text
              style={{
                color: heroTextColor,
                fontFamily: serifFont,
                fontSize: 22,
                fontWeight: '800',
                marginTop: spacing.sm,
                textAlign: 'center',
                lineHeight: 28,
              }}
            >
              {book.title}
            </Text>

            {/* Series / Subtitle */}
            {(isSeries || parentBook || Boolean(book.publisher)) && (
              <Text
                style={{
                  color: heroSubtextColor,
                  fontFamily: serifFont,
                  fontSize: 14,
                  fontWeight: '500',
                  marginTop: 6,
                  textAlign: 'center',
                }}
              >
                {isSeries
                  ? `Série • ${book.children?.length ?? 0} ${t('library.volumesShort')}`
                  : parentBook
                    ? `Parte de: ${parentBook.title}`
                    : `Editora: ${book.publisher}`}
              </Text>
            )}

            {/* If chapter, button to view parent series */}
            {parentBook && (
              <Pressable
                onPress={() => navigation.navigate('BookDetail', { bookId: parentBook.id })}
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: 12,
                  borderWidth: 1,
                  marginTop: spacing.xs,
                  paddingHorizontal: spacing.sm + 4,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: accentColor, fontFamily: serifFont, fontSize: 12, fontWeight: '600' }}>
                  Ver Série Completa ({parentBook.title})
                </Text>
              </Pressable>
            )}

            {/* Author */}
            <Text
              style={{
                color: heroAuthorColor,
                fontFamily: serifFont,
                fontSize: 14,
                fontWeight: '700',
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              {book.author || t('library.unknownAuthor')}
            </Text>

            {/* 5-Star Rating */}
            <RatingStars
              rating={rating}
              size={20}
              gap={6}
              container
              interactive
              onRate={(newRating) => { void handleRatingPress(newRating); }}
              style={{ marginTop: spacing.md }}
            />
          </View>

          {/* Action Buttons (Stacked, Full Width) */}
          <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            {/* Read Now Primary Orange Button */}
            <Pressable
              onPress={() => handleOpenReader()}
              style={{
                alignItems: 'center',
                backgroundColor: accentColor,
                borderRadius: 14,
                flexDirection: 'row',
                height: 52,
                justifyContent: 'center',
                width: '100%',
                gap: spacing.sm,
              }}
            >
              <BookOpen color="#ffffff" size={20} />
              <Text style={{ color: '#ffffff', fontFamily: serifFont, fontSize: 16, fontWeight: '700' }}>
                {(book.progressPct ?? 0) > 0 ? t('library.continueReading') : t('details.readNow')}
              </Text>
            </Pressable>

            {/* Reading status actions */}
            <View style={{ flexDirection: hasPartialProgress ? 'row' : 'column', gap: spacing.sm }}>
              {hasPartialProgress || !isBookRead ? (
                <Pressable
                  onPress={() => { void handleSetRead(true); }}
                  style={{
                    alignItems: 'center',
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    flex: hasPartialProgress ? 1 : undefined,
                    flexDirection: 'row',
                    height: 52,
                    justifyContent: 'center',
                    width: hasPartialProgress ? undefined : '100%',
                    gap: spacing.xs,
                  }}
                >
                  <Check color={accentColor} size={20} strokeWidth={2.5} />
                  <Text style={{ color: accentColor, fontFamily: serifFont, fontSize: 15, fontWeight: 'bold' }}>
                    {t('details.markAsRead')}
                  </Text>
                </Pressable>
              ) : null}

              {hasPartialProgress || isBookRead ? (
                <Pressable
                  onPress={() => { void handleSetRead(false); }}
                  style={{
                    alignItems: 'center',
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    flex: hasPartialProgress ? 1 : undefined,
                    flexDirection: 'row',
                    height: 52,
                    justifyContent: 'center',
                    width: hasPartialProgress ? undefined : '100%',
                    gap: spacing.xs,
                  }}
                >
                  <Check color={theme.textPrimary} size={20} strokeWidth={2.5} />
                  <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: 'bold' }}>
                    {t('details.markAsUnread')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Metadata Info Card Grid (Publicado / Páginas or Tamanho) */}
          <View
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: 16,
              borderWidth: 1,
              flexDirection: 'row',
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            {/* Left Tile: Year / Publicado */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: theme.bg,
                  borderRadius: 12,
                  height: 44,
                  justifyContent: 'center',
                  width: 44,
                }}
              >
                <Calendar color={theme.textSecondary} size={22} />
              </View>
              <View>
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
                  Publicado
                </Text>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '700', marginTop: 2 }}>
                  {book.year ? String(book.year) : '—'}
                </Text>
              </View>
            </View>

            {/* Separator Divider */}
            <View style={{ backgroundColor: theme.border, height: 40, width: 1, marginHorizontal: spacing.sm, alignSelf: 'center' }} />

            {/* Right Tile: Format */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.xs }}>
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: theme.bg,
                  borderRadius: 12,
                  height: 44,
                  justifyContent: 'center',
                  width: 44,
                }}
              >
                <FileText color={theme.textSecondary} size={22} />
              </View>
              <View>
                <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>
                  Formato
                </Text>
                <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '700', marginTop: 2 }}>
                  {isSeries
                    ? [...new Set(book.children?.map((c) => c.format?.toUpperCase()).filter(Boolean))].join('/') || 'PDF'
                    : (book.format ? book.format.toUpperCase() : 'PDF')}
                </Text>
              </View>
            </View>
          </View>

          {/* Progress Card */}
          <View
            style={{
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: 16,
              borderWidth: 1,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>
                {isSeries ? 'Progresso da Série' : 'Progresso'}
              </Text>
              <Text style={{ color: accentColor, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>
                {Math.round(book.progressPct ?? 0)}%
              </Text>
            </View>
            {/* Progress track */}
            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: 4,
                height: 6,
                overflow: 'hidden',
                width: '100%',
                marginTop: 4,
              }}
            >
              <Animated.View
                style={{
                  backgroundColor: accentColor,
                  height: '100%',
                  width: animatedProgress.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                }}
              />
            </View>
          </View>

          {/* Tags Chips Display (if any) */}
          {book.tags && book.tags.length > 0 && (
            <View style={{ marginBottom: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {book.tags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderRadius: 12,
                    borderWidth: 1,
                    paddingHorizontal: spacing.sm + 4,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 12 }}>
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Synopsis Section (with "Ver mais" / "Ver menos" toggle) */}
          <View style={{ marginBottom: spacing.lg, marginTop: spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
                {t('details.synopsis')}
              </Text>
              {book.description && book.description.length > 120 && (
                <Pressable hitSlop={8} onPress={() => setSynopsisExpanded(!synopsisExpanded)}>
                  <Text style={{ color: accentColor, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>
                    {synopsisExpanded ? 'Ver menos' : 'Ver mais'}
                  </Text>
                </Pressable>
              )}
            </View>
            <Text
              numberOfLines={synopsisExpanded ? undefined : 4}
              style={{
                color: book.description ? theme.textSecondary : theme.textMuted,
                fontFamily: serifFont,
                fontSize: 14,
                lineHeight: 22,
              }}
            >
              {book.description || t('details.noSynopsis')}
            </Text>
          </View>

          {/* Chapters / Volumes Section (for Series/Manga) */}
          {isSeries && book.children && (
            <View style={{ marginTop: spacing.sm }}>
              <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700', marginBottom: spacing.md }}>
                {t('details.chapters')} ({book.children.length})
              </Text>
              <View style={{ gap: spacing.sm }}>
                {book.children.map((chapter) => (
                  <Pressable
                    key={chapter.id}
                    onPress={() => handleOpenReader(chapter)}
                    style={{
                      alignItems: 'center',
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      flexDirection: 'row',
                      gap: spacing.md,
                      padding: spacing.md,
                    }}
                  >
                    <View
                      style={{
                        alignItems: 'center',
                        aspectRatio: 5 / 7,
                        backgroundColor: theme.bg,
                        borderRadius: radii.sm,
                        height: 54,
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      {chapter.coverPath ? (
                        <Image source={{ uri: chapter.coverPath }} style={{ height: '100%', width: '100%' }} resizeMode="cover" />
                      ) : (
                        <FileText color={theme.textMuted} size={20} />
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 15, fontWeight: '600' }}>
                        {chapter.title}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, marginTop: 2 }}>
                        {chapter.format.toUpperCase()} · {chapter.isRead ? 'Lido' : `${Math.round(chapter.progressPct ?? 0)}%`}
                      </Text>
                    </View>

                    <Pressable
                      hitSlop={8}
                      onPress={(e) => {
                        e.stopPropagation();
                        void updateBookProgress(chapter.id, {
                          isRead: !chapter.isRead,
                          progressPct: !chapter.isRead ? 100 : 0,
                        });
                      }}
                      style={{ padding: 4 }}
                    >
                      {chapter.isRead ? (
                        <Check color={accentColor} size={20} strokeWidth={2.5} />
                      ) : (
                        <BookOpen color={theme.textMuted} size={20} />
                      )}
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          </View>
        </ScrollView>
      </View>

      {/* Metadata Edit Modal */}
      <MetadataActionModal
        visible={actionsVisible}
        onClose={() => setActionsVisible(false)}
        onSearch={() => { void handleSearchMetadata(); }}
        onEdit={() => { setActionsVisible(false); handleOpenEditModal(); }}
      />
      <MetadataDialog
        visible={Boolean(metadataDialog)}
        message={metadataDialog?.message ?? ''}
        onClose={() => setMetadataDialog(null)}
        primaryAction={metadataDialog?.primaryAction}
        secondaryAction={metadataDialog?.secondaryAction}
        title={metadataDialog?.title ?? ''}
        variant={metadataDialog?.variant ?? 'success'}
      />
      <Modal animationType="fade" transparent visible={metadataLoading} onRequestClose={() => undefined}>
        <View style={{ alignItems: 'center', backgroundColor: '#00000088', flex: 1, justifyContent: 'center', paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm), paddingHorizontal: spacing.lg, paddingTop: Math.max(spacing.lg, insets.top + spacing.sm) }}>
          <View style={{ alignItems: 'center', backgroundColor: theme.card, borderColor: theme.border, borderRadius: radii.lg, borderWidth: 1, maxWidth: 340, padding: spacing.xl, width: '100%' }}>
            <View
              onLayout={({ nativeEvent }) => setMetadataTrackWidth(nativeEvent.layout.width)}
              style={{ backgroundColor: theme.surface, borderRadius: 4, height: 5, marginTop: spacing.lg, overflow: 'hidden', width: '100%' }}
            >
              <Animated.View
                style={{
                  backgroundColor: accentColor,
                  borderRadius: 4,
                  height: '100%',
                  transform: [{
                    translateX: metadataSweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-(metadataTrackWidth * 0.32 || 80), metadataTrackWidth || 340],
                    }),
                  }],
                  width: metadataTrackWidth ? metadataTrackWidth * 0.32 : 80,
                }}
              />
            </View>
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, fontWeight: '700', marginTop: spacing.md }}>{t('metadata.processingTitle')}</Text>
            <Text numberOfLines={2} style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, marginTop: spacing.xs, textAlign: 'center' }}>{book.title}</Text>
          </View>
        </View>
      </Modal>
      <Modal animationType="slide" visible={isEditing} onRequestClose={() => setIsEditing(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={{ backgroundColor: theme.bg, flex: 1 }}>
          {/* Modal Header */}
          <View
            style={{
              alignItems: 'center',
              borderBottomColor: theme.border,
              borderBottomWidth: 1,
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
              {t('details.editMetadata')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Pressable onPress={() => setIsEditing(false)} style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14 }}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={isSaving}
                onPress={() => { void handleSaveMetadata(); }}
                style={{
                  backgroundColor: accentColor,
                  borderRadius: radii.sm,
                  paddingHorizontal: spacing.md + 4,
                  paddingVertical: spacing.xs + 2,
                }}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={{ color: '#ffffff', fontFamily: serifFont, fontSize: 14, fontWeight: '600' }}>{t('common.save')}</Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* Form Scroll Area */}
          <ScrollView
            contentContainerStyle={{
              gap: spacing.lg,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.md,
              paddingBottom: spacing.xl * 2,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Cover Picker & Restore Section */}
            <View style={{ alignItems: 'center', marginBottom: spacing.xs }}>
              <View
                style={{
                  aspectRatio: 5 / 7,
                  backgroundColor: theme.card,
                  borderRadius: radii.md,
                  height: 230,
                  overflow: 'hidden',
                  marginBottom: spacing.md,
                  boxShadow: coverShadow(theme.name),
                  elevation: 8,
                }}
              >
                {editCoverPath ? (
                  <Image source={{ uri: editCoverPath }} style={{ height: '100%', width: '100%' }} resizeMode="cover" />
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ImageIcon color={theme.textMuted} size={32} />
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }}>
                <Pressable
                  onPress={() => { void handlePickCoverImage(); }}
                  style={{
                    alignItems: 'center',
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderRadius: radii.sm,
                    borderWidth: 1,
                    flexDirection: 'row',
                    gap: spacing.xs,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <ImageIcon color={accentColor} size={15} />
                  <Text style={{ color: accentColor, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>
                    {t('details.changeCover')}
                  </Text>
                </Pressable>

                {/* Restore original cover button (F3 Feature) */}
                <Pressable
                  onPress={handleRestoreOriginalCover}
                  style={{
                    alignItems: 'center',
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    borderRadius: radii.sm,
                    borderWidth: 1,
                    flexDirection: 'row',
                    gap: spacing.xs,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  }}
                >
                  <RotateCcw color={theme.textSecondary} size={15} />
                  <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600' }}>
                    {t('details.restoreCover')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Title Input */}
            <View>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                {t('details.titleInput')}
              </Text>
              <TextInput
                onChangeText={setEditTitle}
                placeholder={t('details.titleInput')}
                placeholderTextColor={theme.textMuted}
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  color: theme.textPrimary,
                  fontFamily: serifFont,
                  fontSize: 15,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 4,
                }}
                value={editTitle}
              />
            </View>

            {/* Author Input */}
            <View>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                {t('details.authorInput')}
              </Text>
              <TextInput
                onChangeText={setEditAuthor}
                placeholder={t('details.authorInput')}
                placeholderTextColor={theme.textMuted}
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  color: theme.textPrimary,
                  fontFamily: serifFont,
                  fontSize: 15,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 4,
                }}
                value={editAuthor}
              />
            </View>

            {/* Year Input */}
            <View>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                {t('details.yearInput')}
              </Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setEditYear}
                placeholder={t('details.yearExample')}
                placeholderTextColor={theme.textMuted}
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  color: theme.textPrimary,
                  fontFamily: serifFont,
                  fontSize: 15,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 4,
                }}
                value={editYear}
              />
            </View>

            {/* Rating Stars Picker */}
            <View>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
                {t('details.rating')}
              </Text>
              <RatingStars
                rating={editRating}
                size={24}
                gap={8}
                container
                interactive
                onRate={setEditRating}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>

            {/* Tags Input */}
            <View>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                {t('details.tagsInput')}
              </Text>
              <TextInput
                onChangeText={setEditTags}
                placeholder={t('details.tagsHint')}
                placeholderTextColor={theme.textMuted}
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  color: theme.textPrimary,
                  fontFamily: serifFont,
                  fontSize: 15,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 4,
                }}
                value={editTags}
              />
            </View>

            {/* Synopsis Input */}
            <View>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
                {t('details.synopsisInput')}
              </Text>
              <TextInput
                multiline
                numberOfLines={6}
                onChangeText={setEditDescription}
                placeholder={t('details.synopsisInput')}
                placeholderTextColor={theme.textMuted}
                style={{
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  color: theme.textPrimary,
                  fontFamily: serifFont,
                  fontSize: 14,
                  lineHeight: 22,
                  minHeight: 120,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  textAlignVertical: 'top',
                }}
                value={editDescription}
              />
            </View>

            <Pressable
              disabled={isSaving}
              onPress={handleClearMetadata}
              style={({ pressed }) => ({
                alignItems: 'center',
                borderColor: '#ef4444',
                borderRadius: radii.md,
                borderWidth: 1,
                flexDirection: 'row',
                gap: spacing.sm,
                justifyContent: 'center',
                marginTop: spacing.sm,
                opacity: pressed || isSaving ? 0.55 : 1,
                paddingVertical: spacing.sm + 2,
              })}
            >
              <Trash2 color="#ef4444" size={17} />
              <Text style={{ color: '#ef4444', fontFamily: serifFont, fontSize: 14, fontWeight: '600' }}>
                {t('metadata.clearAction')}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function AnimatedFavoriteStar({
  active,
  color,
  fill,
  size,
}: {
  active: boolean;
  color: string;
  fill: string;
  size: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const previousActive = useRef(active);

  useEffect(() => {
    if (previousActive.current === active) return;
    previousActive.current = active;

    scale.stopAnimation();
    Animated.sequence([
      Animated.timing(scale, {
        duration: 90,
        easing: Easing.out(Easing.quad),
        toValue: active ? 1.16 : 0.92,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        duration: 150,
        easing: Easing.inOut(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Star color={color} fill={fill} size={size} />
    </Animated.View>
  );
}

function getReaderBook(book: Book): Book {
  if (!book.children?.length) return book;
  const inProgress = book.children.find(
    (child) => (child.progressPct ?? 0) > 0 && (child.progressPct ?? 0) < 100,
  );
  return inProgress
    ?? book.children.find((child) => !child.isRead && (child.progressPct ?? 0) < 100)
    ?? book.children[0];
}

function findBookById(books: Book[], id: string): Book | null {
  for (const book of books) {
    if (book.id === id) return book;
    if (book.children?.length) {
      const found = findBookById(book.children, id);
      if (found) return found;
    }
  }
  return null;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
