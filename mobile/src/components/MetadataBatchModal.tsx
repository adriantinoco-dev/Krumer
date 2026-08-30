import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Search, Sparkles, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import type { Book } from '../models/item';
import type { MetadataSearchResult } from '../models/metadata';
import { isMetadataComplete, MAX_METADATA_BATCH, runMetadataBatch, toBookMetadata } from '../services/metadataService';
import { radii, serifFont, spacing, TABLET_BREAKPOINT } from '../theme';

type Stage = 'selection' | 'loading' | 'results' | 'preview';

export function MetadataBatchModal({
  books,
  visible,
  onClose,
  onApplied,
}: {
  books: Book[];
  visible: boolean;
  onClose: () => void;
  onApplied?: (count: number) => void;
}) {
  const { preferences, theme, t, updateBookMetadata } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [stage, setStage] = useState<Stage>('selection');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MetadataSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<MetadataSearchResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, bookId: '' });
  const [isApplying, setIsApplying] = useState(false);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const singleProgressSweep = useRef(new Animated.Value(0)).current;
  const selectionProgress = useRef(new Animated.Value(0)).current;

  const eligibleBooks = useMemo(
    () => books.filter((book) => !book.parentId && !isMetadataComplete(book)),
    [books],
  );
  const filteredBooks = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return eligibleBooks;
    return eligibleBooks.filter((book) => `${book.title} ${book.author || ''}`.toLocaleLowerCase().includes(term));
  }, [eligibleBooks, query]);
  const selectedBooks = useMemo(
    () => selectedIds
      .map((id) => books.find((book) => book.id === id))
      .filter((book): book is Book => {
        if (!book) return false;
        return !book.parentId && !isMetadataComplete(book);
      }),
    [books, selectedIds],
  );
  const processingBook = selectedBooks.find((book) => book.id === progress.bookId);
  const columns = Math.max(2, Math.min(6, preferences.booksPerRow ?? 3));
  const batchContentMaxWidth = width >= TABLET_BREAKPOINT ? 720 : 560;
  const previewMaxWidth = width >= TABLET_BREAKPOINT ? 560 : 420;
  const previewContentWidth = Math.max(1, Math.min(previewMaxWidth, width - insets.left - insets.right - spacing.lg * 2));

  useEffect(() => {
    if (!visible) return;
    setStage('selection');
    setSelectedIds([]);
    setQuery('');
    setResults([]);
    setSelectedResult(null);
    setProgress({ current: 0, total: 0, bookId: '' });
    setIsApplying(false);
  }, [visible]);

  // A detail edit or a sync can complete a book while this modal is open.
  // Prune it from the selection immediately so starting the batch can never
  // issue a request for an item that is no longer eligible.
  useEffect(() => {
    const eligibleIds = new Set(eligibleBooks.map((book) => book.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => eligibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [eligibleBooks]);

  useEffect(() => {
    const isSingleBookLoading = stage === 'loading' && progress.total === 1;
    singleProgressSweep.stopAnimation();

    if (!isSingleBookLoading) {
      singleProgressSweep.setValue(0);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.timing(singleProgressSweep, {
        duration: 1100,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: false,
      }),
    );
    animation.start();

    return () => {
      animation.stop();
      singleProgressSweep.stopAnimation();
    };
  }, [progress.total, singleProgressSweep, stage]);

  useEffect(() => {
    const animation = Animated.timing(selectionProgress, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: selectedIds.length / MAX_METADATA_BATCH,
      useNativeDriver: false,
    });
    animation.start();

    return () => animation.stop();
  }, [selectedIds.length, selectionProgress]);

  const close = () => {
    if (stage === 'loading' || isApplying) return;
    onClose();
  };

  const toggleBook = (bookId: string) => {
    setSelectedIds((current) => {
      if (current.includes(bookId)) return current.filter((id) => id !== bookId);
      if (current.length >= MAX_METADATA_BATCH) return current;
      return [...current, bookId];
    });
  };

  const startBatch = async () => {
    // Re-check against the latest context snapshot. This protects against a
    // completion update racing with a tap on the search button.
    const batchBooks = selectedBooks.filter((book) => !isMetadataComplete(book));
    if (!batchBooks.length) return;
    setStage('loading');
    const nextResults = await runMetadataBatch(batchBooks, {
      language: preferences.language,
      onProgress: setProgress,
      delayMs: 2500,
    });
    setResults(nextResults);
    setSelectedResult(nextResults.find((result) => result.status === 'found') ?? nextResults[0] ?? null);
    setStage('results');
  };

  const applyResults = async () => {
    const applicable = results.flatMap((result) => {
      if (result.status !== 'found' || !result.candidate) return [];
      const targetBook = books.find((book) => book.id === result.bookId);
      // The item may have been edited or removed while the results were open.
      // Never apply a stale response to a now-complete or unknown book.
      if (!targetBook || isMetadataComplete(targetBook)) return [];
      const update = toBookMetadata(result.candidate, {
        preserveTitle: Boolean(targetBook?.children?.length),
      });
      // A series response can contain only a chapter title. Since the parent
      // title is intentionally preserved, that candidate has no local change
      // to apply and must not be counted as an updated book.
      return Object.keys(update).length ? [{ result, update }] : [];
    });
    if (!applicable.length) return;
    setIsApplying(true);
    try {
      for (const { result, update } of applicable) {
        await updateBookMetadata(result.bookId, update);
      }
      onApplied?.(applicable.length);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={close}>
      <View style={{ backgroundColor: theme.bg, flex: 1, paddingBottom: insets.bottom, paddingTop: insets.top }}>
        <View style={{ alignItems: 'center', borderBottomColor: theme.border, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md }}>
          {stage === 'preview' ? (
            <Pressable onPress={() => setStage('results')} hitSlop={10} style={{ padding: spacing.xs }}>
              <ArrowLeft color={theme.textPrimary} size={22} />
            </Pressable>
          ) : <View style={{ width: 30 }} />}
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' }}>
            {stage === 'selection' ? t('metadata.selectTitle') : stage === 'loading' ? t('metadata.processingTitle') : stage === 'preview' ? t('metadata.previewTitle') : t('metadata.resultsTitle')}
          </Text>
          <Pressable disabled={stage === 'loading' || isApplying} onPress={close} hitSlop={10} style={{ padding: spacing.xs, opacity: stage === 'loading' || isApplying ? 0.35 : 1 }}>
            <X color={theme.textSecondary} size={22} />
          </Pressable>
        </View>

        {stage === 'selection' ? (
          <SelectionStage
            books={filteredBooks}
            columns={columns}
            query={query}
            selectedIds={selectedIds}
            onQueryChange={setQuery}
            onToggle={toggleBook}
            emptyLabel={eligibleBooks.length ? t('metadata.noSearchResults') : t('metadata.noEligible')}
            theme={theme}
            t={t}
            maxWidth={batchContentMaxWidth}
          />
        ) : null}

        {stage === 'loading' ? (
          <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 17, fontWeight: '700', marginTop: spacing.lg }}>{t('metadata.processingTitle')}</Text>
            <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' }}>
              {progress.current} / {progress.total}
            </Text>
            {processingBook ? <Text numberOfLines={2} style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 13, marginTop: spacing.xs, textAlign: 'center' }}>{processingBook.title}</Text> : null}
            <View
              onLayout={({ nativeEvent }) => setProgressTrackWidth(nativeEvent.layout.width)}
              style={{ backgroundColor: theme.border, borderRadius: 99, height: 8, marginTop: spacing.lg, maxWidth: 360, overflow: 'hidden', width: '100%' }}
            >
              {progress.total === 1 ? (
                <Animated.View
                  style={{
                    backgroundColor: theme.accent,
                    borderRadius: 99,
                    height: '100%',
                    transform: [{
                      translateX: singleProgressSweep.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-(progressTrackWidth * 0.32 || 80), progressTrackWidth || 360],
                      }),
                    }],
                    width: progressTrackWidth ? progressTrackWidth * 0.32 : 80,
                  }}
                />
              ) : (
                <View style={{ backgroundColor: theme.accent, height: '100%', width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} />
              )}
            </View>
            <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, marginTop: spacing.sm }}>{t('metadata.processingHint')}</Text>
          </View>
        ) : null}

        {stage === 'results' ? (
          <ResultsStage
            results={results}
            selectedResult={selectedResult}
            theme={theme}
            t={t}
            onSelect={(result) => { setSelectedResult(result); setStage('preview'); }}
            onApply={applyResults}
            isApplying={isApplying}
            maxWidth={batchContentMaxWidth}
          />
        ) : null}

        {stage === 'preview' && selectedResult ? (
          <PreviewStage result={selectedResult} book={books.find((item) => item.id === selectedResult.bookId)} maxWidth={previewContentWidth} theme={theme} t={t} />
        ) : null}

        {stage === 'selection' ? (
          <View style={{ alignSelf: 'center', borderTopColor: theme.border, borderTopWidth: 1, maxWidth: batchContentMaxWidth, padding: spacing.md, width: '100%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13 }}>{t('metadata.selectionCounter').replace('{0}', String(selectedIds.length)).replace('{1}', String(MAX_METADATA_BATCH))}</Text>
              <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12 }}>{eligibleBooks.length} {t('metadata.available')}</Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ max: MAX_METADATA_BATCH, min: 0, now: selectedIds.length }}
              style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 99, borderWidth: 1, height: 10, marginBottom: spacing.sm, overflow: 'hidden', width: '100%' }}
            >
              <Animated.View
                style={{
                  backgroundColor: theme.accent,
                  borderRadius: 99,
                  height: '100%',
                  width: selectionProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                }}
              />
            </View>
            <Pressable disabled={!selectedIds.length} onPress={() => { void startBatch(); }} style={{ backgroundColor: selectedIds.length ? theme.accent : theme.accentMuted, borderRadius: radii.md, paddingVertical: spacing.md }}>
              <Text style={{ color: selectedIds.length ? theme.bg : theme.textMuted, fontFamily: serifFont, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{t('metadata.fetchButton')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function SelectionStage({
  books,
  columns,
  query,
  selectedIds,
  onQueryChange,
  onToggle,
  emptyLabel,
  theme,
  t,
  maxWidth,
}: {
  books: Book[];
  columns: number;
  query: string;
  selectedIds: string[];
  onQueryChange: (value: string) => void;
  onToggle: (bookId: string) => void;
  emptyLabel: string;
  theme: ReturnType<typeof useApp>['theme'];
  t: ReturnType<typeof useApp>['t'];
  maxWidth: number;
}) {
  return (
    <View style={{ alignSelf: 'center', flex: 1, maxWidth, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.card, borderColor: theme.border, borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, margin: spacing.md, paddingHorizontal: spacing.md }}>
        <Search color={theme.textMuted} size={18} />
        <TextInput value={query} onChangeText={onQueryChange} placeholder={t('metadata.searchPlaceholder')} placeholderTextColor={theme.textMuted} style={{ color: theme.textPrimary, flex: 1, fontFamily: serifFont, fontSize: 14, paddingVertical: spacing.sm + 2 }} />
      </View>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: spacing.sm, paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
        {books.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {books.map((book) => {
              const selected = selectedIds.includes(book.id);
              const disabled = !selected && selectedIds.length >= MAX_METADATA_BATCH;
              return (
                <View key={book.id} style={{ padding: spacing.xs, width: `${100 / columns}%` }}>
                  <Pressable disabled={disabled} onPress={() => onToggle(book.id)} style={{ opacity: disabled ? 0.4 : 1 }}>
                    <View style={{ aspectRatio: 193 / 264, backgroundColor: theme.card, borderColor: selected ? theme.accent : theme.border, borderRadius: radii.sm, borderWidth: selected ? 2 : 1, overflow: 'hidden' }}>
                      {book.coverPath ? <Image source={{ uri: book.coverPath }} style={{ height: '100%', width: '100%' }} resizeMode="cover" /> : <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xs }}><Sparkles color={theme.textMuted} size={20} /><Text numberOfLines={3} style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 11, marginTop: spacing.xs, textAlign: 'center' }}>{book.title}</Text></View>}
                      {selected ? <View style={{ alignItems: 'center', backgroundColor: theme.accent, borderRadius: 999, height: 24, justifyContent: 'center', position: 'absolute', right: 6, top: 6, width: 24 }}><Check color={theme.bg} size={15} strokeWidth={3} /></View> : null}
                    </View>
                    <Text numberOfLines={2} style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 12, marginTop: spacing.xs, textAlign: 'center' }}>{book.title}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl, width: '100%' }}><Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 15, textAlign: 'center' }}>{emptyLabel}</Text></View>}
      </ScrollView>
    </View>
  );
}

function ResultsStage({
  results,
  selectedResult,
  theme,
  t,
  onSelect,
  onApply,
  isApplying,
  maxWidth,
}: {
  results: MetadataSearchResult[];
  selectedResult: MetadataSearchResult | null;
  theme: ReturnType<typeof useApp>['theme'];
  t: ReturnType<typeof useApp>['t'];
  onSelect: (result: MetadataSearchResult) => void;
  onApply: () => void;
  isApplying: boolean;
  maxWidth: number;
}) {
  const found = results.filter((result) => result.status === 'found').length;
  return (
    <View style={{ alignSelf: 'center', flex: 1, maxWidth, padding: spacing.md, width: '100%' }}>
      <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, marginBottom: spacing.sm }}>{t('metadata.foundCount').replace('{0}', String(found)).replace('{1}', String(results.length))}</Text>
      <FlatList
        data={results}
        keyExtractor={(item) => item.bookId}
        renderItem={({ item }) => {
          const active = selectedResult?.bookId === item.bookId;
          const ok = item.status === 'found';
          return <Pressable onPress={() => onSelect(item)} style={{ alignItems: 'center', backgroundColor: active ? theme.accentMuted : theme.card, borderColor: active ? theme.accent : theme.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.md }}><View style={{ alignItems: 'center', backgroundColor: ok ? '#22c55e22' : '#ef444422', borderRadius: 999, height: 28, justifyContent: 'center', width: 28 }}><Text style={{ color: ok ? '#22c55e' : '#ef4444', fontSize: 16, fontWeight: '700' }}>{ok ? '✓' : '×'}</Text></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, fontWeight: '600' }}>{item.query}</Text><Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, marginTop: 2 }}>{ok ? t('metadata.found') : item.errorMessage || t('metadata.notFound')}</Text></View></Pressable>;
        }}
        showsVerticalScrollIndicator={false}
      />
      <Pressable disabled={!found || isApplying} onPress={() => { void onApply(); }} style={{ backgroundColor: found && !isApplying ? theme.accent : theme.accentMuted, borderRadius: radii.md, marginTop: spacing.sm, paddingVertical: spacing.md }}>
        {isApplying ? <ActivityIndicator color={theme.bg} /> : <Text style={{ color: found ? theme.bg : theme.textMuted, fontFamily: serifFont, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{t('metadata.applyButton')}</Text>}
      </Pressable>
    </View>
  );
}

function PreviewStage({
  result,
  book,
  maxWidth,
  theme,
  t,
}: {
  result: MetadataSearchResult;
  book?: Book;
  maxWidth: number;
  theme: ReturnType<typeof useApp>['theme'];
  t: ReturnType<typeof useApp>['t'];
}) {
  const candidate = result.candidate;
  if (!candidate) return <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl }}><Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 15, textAlign: 'center' }}>{result.errorMessage || t('metadata.notFound')}</Text></View>;
  const displayTitle = book?.children?.length ? book.title : candidate.nome_da_obra || t('metadata.unknown');
  return (
    <ScrollView contentContainerStyle={{ alignItems: 'center', flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg }} showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', maxWidth, width: '100%' }}>
        {book?.coverPath ? <Image source={{ uri: book.coverPath }} style={{ aspectRatio: 193 / 264, borderRadius: radii.md, height: 220 }} resizeMode="cover" /> : null}
        <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 22, fontWeight: '700', marginTop: spacing.lg, textAlign: 'center' }}>{displayTitle}</Text>
        <InfoLine label={t('metadata.author')} value={candidate.autor || t('metadata.unknown')} theme={theme} />
        <InfoLine label={t('metadata.release')} value={candidate.data_de_lancamento || t('metadata.unknown')} theme={theme} />
        <View style={{ alignSelf: 'stretch', backgroundColor: theme.card, borderRadius: radii.md, marginTop: spacing.md, padding: spacing.md }}>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, fontWeight: '700' }}>{t('metadata.synopsis')}</Text>
          <Text style={{ color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, lineHeight: 21, marginTop: spacing.xs }}>{candidate.sinopse || t('metadata.noSynopsis')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function InfoLine({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useApp>['theme'] }) {
  return <Text style={{ alignSelf: 'stretch', color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, marginTop: spacing.sm, textAlign: 'center' }}><Text style={{ fontWeight: '700' }}>{label} </Text>{value}</Text>;
}
