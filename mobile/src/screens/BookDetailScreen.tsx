import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  Heart,
  Image as ImageIcon,
  MoreVertical,
  RotateCcw,
  Star,
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { RootStackParamList } from '../navigation/types';
import { coverShadow, radii, serifFont, spacing, TABLET_BREAKPOINT } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BookDetail'>;

const STAR_FILLED = '#ffda4d';
const STAR_EMPTY = '#414141';
const ORANGE_ACCENT = '#ff6500';

export function BookDetailScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const { width } = useWindowDimensions();
  const {
    books,
    lists,
    t,
    theme,
    toggleFavorite,
    updateBookMetadata,
    updateBookProgress,
  } = useApp();

  const book = useMemo(() => findBookById(books, bookId), [books, bookId]);

  const [coverFailed, setCoverFailed] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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
          Book not found.
        </Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: spacing.md, padding: spacing.sm }}>
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 14 }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const showCover = Boolean(book.coverPath && !coverFailed);
  const isSeries = Boolean(book.children && book.children.length > 0);
  const coverCardWidth = width >= TABLET_BREAKPOINT ? 220 : 180;
  const rating = Math.max(0, Math.min(5, Math.round(book.rating ?? 0)));
  const accentColor = theme.name === 'dark' ? ORANGE_ACCENT : theme.accent;
  // Hero text colors: white on dark, theme-aware on light/sepia
  const heroTextColor = theme.name === 'dark' ? '#ffffff' : theme.textPrimary;
  const heroSubtextColor = theme.name === 'dark' ? 'rgba(255, 255, 255, 0.7)' : theme.textSecondary;
  const heroMutedColor = theme.name === 'dark' ? 'rgba(255, 255, 255, 0.55)' : theme.textSecondary;
  const heroIconColor = theme.name === 'dark' ? '#ffffff' : theme.textPrimary;
  const starEmptyColor = theme.name === 'dark' ? '#414141' : theme.border;

  const handleToggleRead = async () => {
    const nextIsRead = !book.isRead;
    const nextProgressPct = nextIsRead ? 100 : 0;
    await updateBookProgress(book.id, {
      isRead: nextIsRead,
      progressPct: nextProgressPct,
    });
  };

  const handleRatingPress = async (newRating: number) => {
    await updateBookMetadata(book.id, { rating: newRating });
  };

  const handleOpenReader = (targetBook: Book = book) => {
    if (targetBook.children && targetBook.children.length > 0) {
      const firstUnread = targetBook.children.find((c) => !c.isRead && (c.progressPct ?? 0) < 100) ?? targetBook.children[0];
      navigation.navigate('Reader', { book: firstUnread });
    } else {
      navigation.navigate('Reader', { book: targetBook });
    }
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
              style={{ height: 720, width: '100%', opacity: theme.name === 'dark' ? 0.7 : 0.3, transform: [{ scale: 1.35 }] }}
            />
            {/* Subtle top tint */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 720,
                backgroundColor: theme.name === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
              }}
            />
            {/* Full-screen SVG Linear Gradient for 100% seamless procedural fade into theme.bg */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <Svg height="100%" width="100%">
                <Defs>
                  <LinearGradient id="smoothHeroFade" x1="0%" y1="0%" x2="0%" y2="100%">
                    <Stop offset="0%" stopColor={theme.bg} stopOpacity="0" />
                    <Stop offset="12%" stopColor={theme.bg} stopOpacity="0.2" />
                    <Stop offset="28%" stopColor={theme.bg} stopOpacity="0.6" />
                    <Stop offset="42%" stopColor={theme.bg} stopOpacity="1" />
                    <Stop offset="100%" stopColor={theme.bg} stopOpacity="1" />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#smoothHeroFade)" />
              </Svg>
            </View>
          </View>
        )}

        {/* Floating Top Navigation Header */}
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
          <Pressable hitSlop={12} onPress={() => navigation.goBack()}>
            <ArrowLeft color={heroIconColor} size={24} />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Pressable hitSlop={12} onPress={() => { void toggleFavorite(book); }}>
              <Heart
                color={isFavorite ? accentColor : heroIconColor}
                fill={isFavorite ? accentColor : 'transparent'}
                size={22}
              />
            </Pressable>
            <Pressable hitSlop={12} onPress={handleOpenEditModal}>
              <MoreVertical color={heroIconColor} size={22} />
            </Pressable>
          </View>
        </View>

        {/* Main Scroll Content */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover Hero & Header Info */}
          <View style={{ alignItems: 'center', marginTop: spacing.xs, marginBottom: spacing.lg }}>
            <View
              style={{
                alignItems: 'center',
                aspectRatio: 5 / 7,
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

            {/* Pagination Dots (as in screenshot) */}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: spacing.md, marginBottom: spacing.xs }}>
              <View style={{ backgroundColor: heroTextColor, borderRadius: 4, height: 6, width: 6, opacity: 1 }} />
              <View style={{ backgroundColor: heroTextColor, borderRadius: 4, height: 6, width: 6, opacity: 0.3 }} />
              <View style={{ backgroundColor: heroTextColor, borderRadius: 4, height: 6, width: 6, opacity: 0.3 }} />
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

            {/* Series / Format Subtitle */}
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
              {isSeries ? `Série de ${book.title}` : (book.publisher ? `Editora: ${book.publisher}` : (book.format ? book.format.toUpperCase() : 'Livro'))}
            </Text>

            {/* Author */}
            <Text
              style={{
                color: heroMutedColor,
                fontFamily: serifFont,
                fontSize: 14,
                fontWeight: '500',
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              {book.author || t('library.unknownAuthor')}
            </Text>

            {/* 5-Star Rating */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: 4 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} hitSlop={6} onPress={() => { void handleRatingPress(star); }}>
                  <Star
                    color={star <= rating ? STAR_FILLED : starEmptyColor}
                    fill={star <= rating ? STAR_FILLED : starEmptyColor}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Pressable>
              ))}
            </View>
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

            {/* Mark as Read Secondary Button */}
            <Pressable
              onPress={() => { void handleToggleRead(); }}
              style={{
                alignItems: 'center',
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderRadius: 14,
                borderWidth: 1,
                flexDirection: 'row',
                height: 52,
                justifyContent: 'center',
                width: '100%',
                gap: spacing.xs,
              }}
            >
              <Check color={book.isRead ? accentColor : theme.textPrimary} size={20} strokeWidth={2.5} />
              <Text
                style={{
                  color: book.isRead ? accentColor : theme.textPrimary,
                  fontFamily: serifFont,
                  fontSize: 15,
                  fontWeight: '600',
                }}
              >
                {book.isRead ? t('details.markAsUnread') : t('details.markAsRead')}
              </Text>
            </Pressable>
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
                  {book.format ? book.format.toUpperCase() : 'PDF'}
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
                Progresso
              </Text>
              <Text style={{ color: accentColor, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>
                {Math.round(book.progressPct ?? 0)}%
              </Text>
            </View>
            {/* Progress track */}
            <View
              style={{
                backgroundColor: theme.bg,
                borderRadius: 4,
                height: 4,
                overflow: 'hidden',
                width: '100%',
                marginTop: 4,
              }}
            >
              <View
                style={{
                  backgroundColor: accentColor,
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, book.progressPct ?? 0))}%`,
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

                    {chapter.isRead ? (
                      <Check color={accentColor} size={18} strokeWidth={2.5} />
                    ) : (
                      <BookOpen color={theme.textMuted} size={18} />
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Metadata Edit Modal */}
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
                placeholder="Ex: 2024"
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
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable key={star} hitSlop={6} onPress={() => setEditRating(star)}>
                    <Star
                      color={star <= editRating ? STAR_FILLED : starEmptyColor}
                      fill={star <= editRating ? STAR_FILLED : starEmptyColor}
                      size={26}
                      strokeWidth={1.5}
                    />
                  </Pressable>
                ))}
              </View>
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
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
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
