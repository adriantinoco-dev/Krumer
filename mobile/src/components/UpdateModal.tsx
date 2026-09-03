import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import type { AppUpdate, UpdateStatus } from '../types/update';
import { radii, serifFont, spacing } from '../theme';

const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 180;

// ── Markdown inline parser ──────────────────────────────────────────

type MdNode =
  | { t: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; children: Inline[] }
  | { t: 'p'; children: Inline[] }
  | { t: 'li'; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'blockquote'; children: Inline[] }
  | { t: 'hr' }
  | { t: 'empty' };

type Inline =
  | { t: 'text'; text: string }
  | { t: 'bold'; text: string }
  | { t: 'italic'; text: string }
  | { t: 'code'; text: string };

function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    // bold+italic ***text***
    const m3 = rest.match(/^\*\*\*(.+?)\*\*\*/);
    if (m3) { result.push({ t: 'bold', text: m3[1] }); rest = rest.slice(m3[0].length); continue; }
    // bold **text**
    const m2 = rest.match(/^\*\*(.+?)\*\*/);
    if (m2) { result.push({ t: 'bold', text: m2[1] }); rest = rest.slice(m2[0].length); continue; }
    // italic *text*
    const mi = rest.match(/^\*(.+?)\*/);
    if (mi) { result.push({ t: 'italic', text: mi[1] }); rest = rest.slice(mi[0].length); continue; }
    // inline code `text`
    const mc = rest.match(/^`([^`]+)`/);
    if (mc) { result.push({ t: 'code', text: mc[1] }); rest = rest.slice(mc[0].length); continue; }
    // plain text up to next special char
    const next = rest.search(/[*`]/);
    if (next === -1) { result.push({ t: 'text', text: rest }); break; }
    if (next === 0) { result.push({ t: 'text', text: rest[0] }); rest = rest.slice(1); continue; }
    result.push({ t: 'text', text: rest.slice(0, next) }); rest = rest.slice(next);
  }

  return result.length ? result : [{ t: 'text', text }];
}

function parseMarkdown(md: string): MdNode[] {
  const lines = md.split('\n');
  const nodes: MdNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // blank line
    if (!trimmed) { i++; continue; }

    // horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) { nodes.push({ t: 'hr' }); i++; continue; }

    // code block ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push({ t: 'code', text: codeLines.join('\n') });
      i++; // skip closing ```
      continue;
    }

    // headings
    const hMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
      const tag = tags[hMatch[1].length - 1];
      nodes.push({ t: tag, children: parseInline(hMatch[2]) } as MdNode);
      i++; continue;
    }

    // blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      nodes.push({ t: 'blockquote', children: parseInline(quoteLines.join(' ')) });
      continue;
    }

    // list item
    const liMatch = trimmed.match(/^[-*+]\s+(.*)/);
    if (liMatch) {
      nodes.push({ t: 'li', children: parseInline(liMatch[1]) });
      i++; continue;
    }

    // ordered list item
    const oliMatch = trimmed.match(/^\d+\.\s+(.*)/);
    if (oliMatch) {
      nodes.push({ t: 'li', children: parseInline(oliMatch[1]) });
      i++; continue;
    }

    // paragraph (default)
    nodes.push({ t: 'p', children: parseInline(trimmed) });
    i++;
  }

  return nodes;
}

// ── Inline renderer ─────────────────────────────────────────────────

function InlineText({ segments, baseStyle }: { segments: Inline[]; baseStyle: any }) {
  return (
    <Text style={baseStyle}>
      {segments.map((seg, i) => {
        if (seg.t === 'bold') {
          return <Text key={i} style={{ fontWeight: '700' }}>{seg.text}</Text>;
        }
        if (seg.t === 'italic') {
          return <Text key={i} style={{ fontStyle: 'italic' }}>{seg.text}</Text>;
        }
        if (seg.t === 'code') {
          return (
            <Text
              key={i}
              style={{
                backgroundColor: baseStyle.codeBg ?? '#00000015',
                borderRadius: 4,
                fontFamily: 'Courier',
                fontSize: (baseStyle.fontSize ?? 13) - 1,
                paddingHorizontal: 4,
              }}
            >
              {seg.text}
            </Text>
          );
        }
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  );
}

// ── Changelog renderer ──────────────────────────────────────────────

function ChangelogContent({ markdown, theme }: { markdown: string; theme: any }) {
  const nodes = useMemo(() => parseMarkdown(markdown), [markdown]);

  const h1Style = { color: theme.textPrimary, fontFamily: serifFont, fontSize: 18, fontWeight: '700' as const, marginBottom: 6, marginTop: 12 };
  const h2Style = { color: theme.textPrimary, fontFamily: serifFont, fontSize: 16, fontWeight: '700' as const, marginBottom: 4, marginTop: 10 };
  const h3Style = { color: theme.textPrimary, fontFamily: serifFont, fontSize: 14, fontWeight: '700' as const, marginBottom: 4, marginTop: 8 };
  const h4Style = { color: theme.textPrimary, fontFamily: serifFont, fontSize: 13, fontWeight: '700' as const, marginBottom: 2, marginTop: 6 };
  const pStyle = { color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, marginBottom: 4, codeBg: theme.name === 'dark' ? '#ffffff15' : '#00000010' };
  const liStyle = { color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, marginBottom: 2, codeBg: theme.name === 'dark' ? '#ffffff15' : '#00000010' };
  const bqStyle = { color: theme.textMuted, fontFamily: serifFont, fontSize: 13, fontStyle: 'italic', lineHeight: 18, borderLeftColor: theme.accent, borderLeftWidth: 3, paddingLeft: 10, marginBottom: 4, marginLeft: 4 };
  const codeBlockStyle = { color: theme.textPrimary, fontFamily: 'Courier', fontSize: 12, backgroundColor: theme.name === 'dark' ? '#ffffff0a' : '#00000008', borderRadius: radii.sm, padding: spacing.sm, marginBottom: 6 };

  let listIndex = 0;

  return (
    <View style={{ gap: 2 }}>
      {nodes.map((node, i) => {
        switch (node.t) {
          case 'h1': return <InlineText key={i} segments={node.children} baseStyle={h1Style} />;
          case 'h2': return <InlineText key={i} segments={node.children} baseStyle={h2Style} />;
          case 'h3': return <InlineText key={i} segments={node.children} baseStyle={h3Style} />;
          case 'h4': case 'h5': case 'h6': return <InlineText key={i} segments={node.children} baseStyle={h4Style} />;
          case 'p': return <InlineText key={i} segments={node.children} baseStyle={pStyle} />;
          case 'li': {
            listIndex++;
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 6, marginBottom: 2, paddingLeft: 4 }}>
                <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 13, fontWeight: '600', minWidth: 14 }}>{listIndex}.</Text>
                <InlineText segments={node.children} baseStyle={{ ...liStyle, flex: 1, marginBottom: 0 }} />
              </View>
            );
          }
          case 'blockquote': return <InlineText key={i} segments={node.children} baseStyle={bqStyle} />;
          case 'code': return <Text key={i} style={codeBlockStyle}>{node.text}</Text>;
          case 'hr': return <View key={i} style={{ backgroundColor: theme.border, height: 1, marginVertical: 6 }} />;
          default: return null;
        }
      })}
    </View>
  );
}

// ── Modal ───────────────────────────────────────────────────────────

export function UpdateModal({
  visible,
  status,
  updateInfo,
  downloadProgress,
  error,
  onDownload,
  onInstall,
  onOpenSettings,
  onDismiss,
}: {
  visible: boolean;
  status: UpdateStatus;
  updateInfo: AppUpdate | null;
  downloadProgress: number;
  error: string | null;
  onDownload: () => void;
  onInstall: () => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  const { theme, t } = useApp();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    backdropOpacity.stopAnimation();
    contentOpacity.stopAnimation();
    contentScale.stopAnimation();

    if (visible) {
      backdropOpacity.setValue(0);
      contentOpacity.setValue(0);
      contentScale.setValue(0.96);
      Animated.parallel([
        Animated.timing(backdropOpacity, { duration: OPEN_DURATION_MS, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
        Animated.timing(contentOpacity, { duration: OPEN_DURATION_MS, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
        Animated.timing(contentScale, { duration: OPEN_DURATION_MS, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, { duration: CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic), toValue: 0, useNativeDriver: true }),
      Animated.timing(contentOpacity, { duration: CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic), toValue: 0, useNativeDriver: true }),
      Animated.timing(contentScale, { duration: CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic), toValue: 0.96, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setMounted(false); });
  }, [backdropOpacity, contentOpacity, contentScale, mounted, visible]);

  if (!mounted || !updateInfo) return null;

  const title = status === 'error'
    ? t('update.error').replace('{0}', '')
    : t('update.title');

  return (
    <Modal animationType="none" transparent visible={mounted} onRequestClose={onDismiss}>
      <View
        pointerEvents={visible ? 'auto' : 'none'}
        style={{
          alignItems: 'center',
          flex: 1,
          justifyContent: 'center',
          paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm),
          paddingHorizontal: spacing.lg,
          paddingTop: Math.max(spacing.lg, insets.top + spacing.sm),
        }}
      >
        <Pressable onPress={onDismiss} style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}>
          <Animated.View
            style={{
              bottom: 0,
              backgroundColor: theme.name === 'dark' ? '#000000aa' : '#00000066',
              left: 0,
              opacity: backdropOpacity,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          />
        </Pressable>

        <Animated.View
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            borderRadius: radii.xl,
            borderWidth: 1,
            maxHeight: '85%',
            maxWidth: 400,
            opacity: contentOpacity,
            transform: [{ scale: contentScale }],
            width: '100%',
          }}
        >
          {/* Header */}
          <View
            style={{
              alignItems: 'center',
              borderBottomColor: theme.border,
              borderBottomWidth: 1,
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.lg,
              paddingBottom: spacing.md,
            }}
          >
            <Text
              style={{
                color: theme.textPrimary,
                fontFamily: serifFont,
                fontSize: 18,
                fontWeight: '700',
              }}
            >
              {title}
            </Text>
            <Pressable onPress={onDismiss} hitSlop={10} style={{ padding: 4 }}>
              <X color={theme.textMuted} size={20} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView
            bounces={false}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 420 }}
          >
            {status === 'downloading' ? (
              <View style={{ gap: spacing.md, paddingVertical: spacing.lg }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, textAlign: 'center' }}>
                  {t('update.downloading').replace('{0}', String(downloadProgress))}
                </Text>
                <View style={{ backgroundColor: theme.bg, borderRadius: radii.sm, height: 8, overflow: 'hidden' }}>
                  <View
                    style={{
                      backgroundColor: theme.accent,
                      borderRadius: radii.sm,
                      height: '100%',
                      width: `${downloadProgress}%`,
                    }}
                  />
                </View>
              </View>
            ) : status === 'error' ? (
              <View style={{ gap: spacing.md, paddingVertical: spacing.md }}>
                <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, textAlign: 'center' }}>
                  {error === 'INSTALL_PERMISSION_MISSING'
                    ? t('update.installPermissionMessage')
                    : t('update.error').replace('{0}', error ?? '')}
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {/* Version badge */}
                <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text
                    style={{
                      color: theme.accent,
                      fontFamily: serifFont,
                      fontSize: 22,
                      fontWeight: '700',
                    }}
                  >
                    Krumer {updateInfo.latestVersion}
                  </Text>
                  <Text
                    style={{
                      color: theme.textMuted,
                      fontFamily: serifFont,
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {t('update.currentVersion').replace('{0}', updateInfo.currentVersion)}
                  </Text>
                </View>

                {/* Changelog */}
                {updateInfo.releaseNotes ? (
                  <View
                    style={{
                      backgroundColor: theme.name === 'dark' ? '#ffffff06' : '#00000004',
                      borderColor: theme.border,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      maxHeight: 320,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        borderBottomColor: theme.border,
                        borderBottomWidth: 1,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontFamily: serifFont,
                          fontSize: 11,
                          fontWeight: '600',
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                        }}
                      >
                        {t('update.changelogTitle')}
                      </Text>
                    </View>
                    <ScrollView
                      bounces={false}
                      contentContainerStyle={{ padding: spacing.md }}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      style={{ maxHeight: 290 }}
                    >
                      <ChangelogContent markdown={updateInfo.releaseNotes} theme={theme} />
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              justifyContent: 'flex-end',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            {status === 'available' && (
              <>
                <Pressable
                  onPress={onDismiss}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    opacity: pressed ? 0.7 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + 2,
                  })}
                >
                  <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, fontWeight: '500' }}>
                    {t('update.laterButton')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onDownload}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: theme.accent,
                    borderRadius: radii.md,
                    opacity: pressed ? 0.85 : 1,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.sm + 2,
                  })}
                >
                  <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 14, fontWeight: '700' }}>
                    {t('update.downloadButton')}
                  </Text>
                </Pressable>
              </>
            )}
            {status === 'downloading' && (
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: theme.accentMuted,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm + 2,
                }}
              >
                <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 14, fontWeight: '600' }}>
                  {downloadProgress}%
                </Text>
              </View>
            )}
            {status === 'downloaded' && (
              <Pressable
                onPress={onInstall}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: theme.accent,
                  borderRadius: radii.md,
                  opacity: pressed ? 0.85 : 1,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm + 2,
                })}
              >
                <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 14, fontWeight: '700' }}>
                  {t('update.installButton')}
                </Text>
              </Pressable>
            )}
            {status === 'error' && (
              <>
                <Pressable
                  onPress={onDismiss}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    backgroundColor: theme.bg,
                    borderColor: theme.border,
                    borderRadius: radii.md,
                    borderWidth: 1,
                    opacity: pressed ? 0.7 : 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + 2,
                  })}
                >
                  <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 14, fontWeight: '500' }}>
                    {t('update.laterButton')}
                  </Text>
                </Pressable>
                {error === 'INSTALL_PERMISSION_MISSING' ? (
                  <Pressable
                    onPress={onOpenSettings}
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      backgroundColor: theme.accent,
                      borderRadius: radii.md,
                      opacity: pressed ? 0.85 : 1,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm + 2,
                    })}
                  >
                    <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 14, fontWeight: '700' }}>
                      {t('update.openSettings')}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={onDownload}
                    style={({ pressed }) => ({
                      alignItems: 'center',
                      backgroundColor: theme.accent,
                      borderRadius: radii.md,
                      opacity: pressed ? 0.85 : 1,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm + 2,
                    })}
                  >
                    <Text style={{ color: '#fff', fontFamily: serifFont, fontSize: 14, fontWeight: '700' }}>
                      {t('update.retryButton')}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
