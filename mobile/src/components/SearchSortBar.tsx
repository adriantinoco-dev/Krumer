import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArrowDownAZ, ArrowUpDown, BookMarked, Clock, RefreshCw, Star, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing } from '../theme';
import { ActionSheetModal } from './ActionSheetModal';

export type SortKey = 'name' | 'recent' | 'rating' | 'progress';

type Props = {
  query: string;
  sort: SortKey;
  onQueryChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
  onRescan: () => void;
  rescanDisabled?: boolean;
  isScanning?: boolean;
};

export function SearchSortBar({
  query,
  sort,
  onQueryChange,
  onSortChange,
  onRescan,
  rescanDisabled = false,
  isScanning = false,
}: Props) {
  const { theme, t } = useApp();
  const [sortOpen, setSortOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const clearScale = useRef(new Animated.Value(0)).current;

  const hasQuery = query.length > 0;

  // animate the clear button in/out
  React.useEffect(() => {
    Animated.spring(clearScale, {
      toValue: hasQuery ? 1 : 0,
      useNativeDriver: true,
      tension: 200,
      friction: 16,
    }).start();
  }, [hasQuery, clearScale]);

  const sortOptions: { key: SortKey; label: string; icon: React.ReactNode }[] = [
    { key: 'name', label: t('library.sortName'), icon: <ArrowDownAZ color={theme.textSecondary} size={16} /> },
    { key: 'recent', label: t('library.sortRecent'), icon: <Clock color={theme.textSecondary} size={16} /> },
    { key: 'rating', label: t('library.sortRating'), icon: <Star color={theme.textSecondary} size={16} /> },
    { key: 'progress', label: t('library.sortProgress'), icon: <BookMarked color={theme.textSecondary} size={16} /> },
  ];

  const activeOption = sortOptions.find((opt) => opt.key === sort) ?? sortOptions[0];

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      {/* Search input */}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.cardHover,
          borderColor: theme.border,
          borderRadius: radii.lg,
          borderWidth: 1,
          flex: 1,
          flexDirection: 'row',
          paddingHorizontal: spacing.sm + 2,
        }}
      >
        <TextInput
          ref={inputRef}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onQueryChange}
          placeholder={t('library.search')}
          placeholderTextColor={theme.textMuted}
          returnKeyType="search"
          style={{
            color: theme.textPrimary,
            flex: 1,
            fontFamily: serifFont,
            fontSize: 14,
            paddingVertical: 10,
          }}
          value={query}
        />
        {/* Clear button */}
        <Animated.View style={{ transform: [{ scale: clearScale }] }}>
          <Pressable
            accessibilityLabel={t('library.clearSearch')}
            accessibilityRole="button"
            hitSlop={13}
            onPress={() => {
              onQueryChange('');
              inputRef.current?.focus();
            }}
          >
            <View
              style={{
                alignItems: 'center',
                backgroundColor: theme.border,
                borderRadius: 99,
                height: 18,
                justifyContent: 'center',
                marginLeft: 4,
                width: 18,
              }}
            >
              <X color={theme.textMuted} size={11} strokeWidth={2.5} />
            </View>
          </Pressable>
        </Animated.View>
      </View>

      {/* Rescan button */}
      <Pressable
        accessibilityLabel={t('scan.action')}
        accessibilityRole="button"
        accessibilityState={{ busy: isScanning, disabled: rescanDisabled || isScanning }}
        disabled={rescanDisabled || isScanning}
        onPress={onRescan}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: pressed && !isScanning ? theme.cardHover : theme.bg,
          borderColor: theme.accent,
          borderRadius: radii.lg,
          borderWidth: 1,
          height: 42,
          justifyContent: 'center',
          opacity: rescanDisabled || isScanning ? 0.55 : 1,
          width: 42,
        })}
      >
        {isScanning ? (
          <ActivityIndicator color={theme.accent} size="small" />
        ) : (
          <RefreshCw color={theme.accent} size={16} strokeWidth={2} />
        )}
      </Pressable>

      {/* Sort button */}
      <Pressable
        accessibilityLabel={t('library.sortBy')}
        accessibilityRole="button"
        onPress={() => setSortOpen(true)}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: pressed ? theme.cardHover : theme.bg,
          borderColor: theme.accent,
          borderRadius: radii.lg,
          borderWidth: 1,
          flexDirection: 'row',
          gap: 4,
          paddingHorizontal: spacing.sm + 2,
          paddingVertical: 10,
        })}
      >
        <ArrowUpDown color={theme.accent} size={15} strokeWidth={2} />
        <Text
          style={{
            color: theme.accent,
            fontFamily: serifFont,
            fontSize: 13,
            fontWeight: '600',
          }}
        >
          {activeOption.label}
        </Text>
      </Pressable>

      {/* Sort modal */}
      <ActionSheetModal backdropColor="rgba(0,0,0,0.45)" onClose={() => setSortOpen(false)} visible={sortOpen}>
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderTopLeftRadius: radii.lg + 4,
                  borderTopRightRadius: radii.lg + 4,
                  paddingBottom: spacing.xl,
                  paddingTop: spacing.md,
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
                  {t('library.sortBy')}
                </Text>
                <ScrollView bounces={false}>
                  {sortOptions.map((option) => {
                    const active = option.key === sort;
                    return (
                      <Pressable
                        accessibilityLabel={option.label}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        key={option.key}
                        onPress={() => {
                          onSortChange(option.key);
                          setSortOpen(false);
                        }}
                        style={({ pressed }) => ({
                          alignItems: 'center',
                          backgroundColor: active
                            ? theme.accentMuted
                            : pressed
                              ? theme.cardHover
                              : 'transparent',
                          borderRadius: radii.md,
                          flexDirection: 'row',
                          gap: spacing.sm,
                          marginHorizontal: spacing.sm,
                          paddingHorizontal: spacing.md,
                          paddingVertical: 14,
                        })}
                      >
                        {option.icon}
                        <Text
                          style={{
                            color: active ? theme.accent : theme.textPrimary,
                            flex: 1,
                            fontFamily: serifFont,
                            fontSize: 15,
                            fontWeight: active ? '700' : '400',
                          }}
                        >
                          {option.label}
                        </Text>
                        {active && (
                          <View
                            style={{
                              backgroundColor: theme.accent,
                              borderRadius: 99,
                              height: 8,
                              width: 8,
                            }}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
      </ActionSheetModal>
    </View>
  );
}
