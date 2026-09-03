import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import type { AppUpdate, UpdateStatus } from '../types/update';
import { radii, serifFont, spacing, TABLET_BREAKPOINT } from '../theme';

const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 180;

// ── Markdown inline parser ──────────────────────────────────────────

type Inline =
  | { t: 'text'; text: string }
  | { t: 'bold'; text: string }
  | { t: 'italic'; text: string }
  | { t: 'bold_italic'; text: string }
  | { t: 'strike'; text: string }
  | { t: 'code'; text: string }
  | { t: 'link'; text: string; url: string };

type MdNode =
  | { t: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'; children: Inline[] }
  | { t: 'p'; children: Inline[] }
  | { t: 'li'; ordered: boolean; number?: number; indent?: boolean; children: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'blockquote'; children: Inline[] }
  | { t: 'table'; headers: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' }
  | { t: 'empty' };

function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    // Markdown link: [text](url)
    const mLink = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (mLink) {
      result.push({ t: 'link', text: mLink[1].replace(/`/g, ''), url: mLink[2] });
      rest = rest.slice(mLink[0].length);
      continue;
    }

    // HTML link: <a href="url">text</a>
    const mHtmlA = rest.match(/^<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/i);
    if (mHtmlA) {
      result.push({ t: 'link', text: mHtmlA[2].replace(/<[^>]+>/g, ''), url: mHtmlA[1] });
      rest = rest.slice(mHtmlA[0].length);
      continue;
    }

    // Bold + italic: ***text*** or ___text___
    const m3 = rest.match(/^\*\*\*(.+?)\*\*\*/) || rest.match(/^___(.+?)___/);
    if (m3) {
      result.push({ t: 'bold_italic', text: m3[1] });
      rest = rest.slice(m3[0].length);
      continue;
    }

    // Bold: **text** or __text__
    const m2 = rest.match(/^\*\*(.+?)\*\*/) || rest.match(/^__(.+?)__/);
    if (m2) {
      result.push({ t: 'bold', text: m2[1] });
      rest = rest.slice(m2[0].length);
      continue;
    }

    // HTML bold: <strong>text</strong> or <b>text</b>
    const mHtmlB = rest.match(/^<(?:strong|b)>(.+?)<\/(?:strong|b)>/i);
    if (mHtmlB) {
      result.push({ t: 'bold', text: mHtmlB[1] });
      rest = rest.slice(mHtmlB[0].length);
      continue;
    }

    // Italic: *text* or _text_
    const mi = rest.match(/^\*([^*]+)\*/) || rest.match(/^_([^_]+)_/);
    if (mi) {
      result.push({ t: 'italic', text: mi[1] });
      rest = rest.slice(mi[0].length);
      continue;
    }

    // HTML italic: <em>text</em> or <i>text</i>
    const mHtmlI = rest.match(/^<(?:em|i)>(.+?)<\/(?:em|i)>/i);
    if (mHtmlI) {
      result.push({ t: 'italic', text: mHtmlI[1] });
      rest = rest.slice(mHtmlI[0].length);
      continue;
    }

    // Strikethrough: ~~text~~
    const ms = rest.match(/^~~(.+?)~~/);
    if (ms) {
      result.push({ t: 'strike', text: ms[1] });
      rest = rest.slice(ms[0].length);
      continue;
    }

    // Inline code: `text`
    const mc = rest.match(/^`([^`]+)`/);
    if (mc) {
      result.push({ t: 'code', text: mc[1] });
      rest = rest.slice(mc[0].length);
      continue;
    }

    // HTML code: <code>text</code>
    const mHtmlCode = rest.match(/^<code>(.+?)<\/code>/i);
    if (mHtmlCode) {
      result.push({ t: 'code', text: mHtmlCode[1] });
      rest = rest.slice(mHtmlCode[0].length);
      continue;
    }

    // HTML line break: <br> or <br/>
    const mBr = rest.match(/^<br\s*\/?>/i);
    if (mBr) {
      result.push({ t: 'text', text: '\n' });
      rest = rest.slice(mBr[0].length);
      continue;
    }

    // Plain text up to next special syntax character
    const next = rest.search(/[*`_~<\[]/);
    if (next === -1) {
      result.push({ t: 'text', text: rest });
      break;
    }
    if (next === 0) {
      result.push({ t: 'text', text: rest[0] });
      rest = rest.slice(1);
      continue;
    }
    result.push({ t: 'text', text: rest.slice(0, next) });
    rest = rest.slice(next);
  }

  return result.length ? result : [{ t: 'text', text }];
}

function parseMarkdown(md: string): MdNode[] {
  const lines = md.split(/\r?\n/);
  const nodes: MdNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Blank line
    if (!trimmed) {
      i++;
      continue;
    }

    // HTML container tags that don't need rendering
    if (/^<\/?(?:html|body|div|ul|ol|section|article)(?:\s+[^>]*)?>$/i.test(trimmed)) {
      i++;
      continue;
    }

    // Horizontal rule: ---, ***, ___, - - -, * * *, _ _ _, or <hr>, <hr/>, <hr />
    if (/^(?:[-*_]\s*){3,}$/.test(trimmed) || /^<hr\s*\/?>$/i.test(trimmed)) {
      nodes.push({ t: 'hr' });
      i++;
      continue;
    }

    // Code block ```
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

    // Markdown Table: header | header followed by |--|--|
    if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(lines[i + 1].trim())) {
      const splitCells = (row: string) => row.split('|').map(c => c.trim()).filter((c, idx, arr) => (idx > 0 || c !== '') && (idx < arr.length - 1 || c !== ''));
      const headers = splitCells(trimmed).map(c => parseInline(c));
      i += 2; // skip header and separator
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        const cells = splitCells(lines[i].trim());
        if (cells.length) {
          rows.push(cells.map(c => parseInline(c)));
        }
        i++;
      }
      nodes.push({ t: 'table', headers, rows });
      continue;
    }

    // HTML Headings: <h1> to <h6>
    const htmlHMatch = trimmed.match(/^<h([1-6])>(.*?)<\/h\1>/i);
    if (htmlHMatch) {
      const level = parseInt(htmlHMatch[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
      const tag = (`h${level}`) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      nodes.push({ t: tag, children: parseInline(htmlHMatch[2].trim()) });
      i++;
      continue;
    }

    // Markdown Headings: # to ######
    const hMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (hMatch) {
      const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
      const tag = tags[hMatch[1].length - 1];
      nodes.push({ t: tag, children: parseInline(hMatch[2]) });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      nodes.push({ t: 'blockquote', children: parseInline(quoteLines.join(' ')) });
      continue;
    }

    // HTML Blockquote: <blockquote>...</blockquote>
    const htmlBqMatch = trimmed.match(/^<blockquote>(.*?)<\/blockquote>/i);
    if (htmlBqMatch) {
      nodes.push({ t: 'blockquote', children: parseInline(htmlBqMatch[1].replace(/<[^>]+>/g, '').trim()) });
      i++;
      continue;
    }

    // HTML list item: <li>...</li>
    const htmlLiMatch = trimmed.match(/^<li>(.*?)<\/li>/i);
    if (htmlLiMatch) {
      nodes.push({ t: 'li', ordered: false, children: parseInline(htmlLiMatch[1].trim()) });
      i++;
      continue;
    }

    // Unordered list item: -, *, +
    const liMatch = trimmed.match(/^[-*+]\s+(.*)/);
    if (liMatch) {
      const indent = rawLine.search(/\S/);
      nodes.push({ t: 'li', ordered: false, indent: indent >= 2, children: parseInline(liMatch[1]) });
      i++;
      continue;
    }

    // Ordered list item: 1. , 2.
    const oliMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (oliMatch) {
      const indent = rawLine.search(/\S/);
      nodes.push({
        t: 'li',
        ordered: true,
        number: parseInt(oliMatch[1], 10),
        indent: indent >= 2,
        children: parseInline(oliMatch[2]),
      });
      i++;
      continue;
    }

    // Paragraph (default)
    const cleanText = trimmed.replace(/^<p>(.*?)<\/p>$/i, '$1');
    nodes.push({ t: 'p', children: parseInline(cleanText) });
    i++;
  }

  return nodes;
}

// ── Inline renderer ─────────────────────────────────────────────────

function InlineText({ segments, baseStyle, theme }: { segments: Inline[]; baseStyle: any; theme: any }) {
  return (
    <Text style={baseStyle}>
      {segments.map((seg, i) => {
        if (seg.t === 'bold') {
          return <Text key={i} style={{ fontWeight: '700', color: theme.textPrimary }}>{seg.text}</Text>;
        }
        if (seg.t === 'italic') {
          return <Text key={i} style={{ fontStyle: 'italic' }}>{seg.text}</Text>;
        }
        if (seg.t === 'bold_italic') {
          return <Text key={i} style={{ fontWeight: '700', fontStyle: 'italic', color: theme.textPrimary }}>{seg.text}</Text>;
        }
        if (seg.t === 'strike') {
          return <Text key={i} style={{ textDecorationLine: 'line-through', opacity: 0.7 }}>{seg.text}</Text>;
        }
        if (seg.t === 'link') {
          return (
            <Text
              key={i}
              onPress={() => {
                if (seg.url) {
                  Linking.openURL(seg.url).catch(() => {});
                }
              }}
              style={{
                color: theme.accent,
                textDecorationLine: 'underline',
              }}
            >
              {seg.text}
            </Text>
          );
        }
        if (seg.t === 'code') {
          return (
            <Text
              key={i}
              style={{
                backgroundColor: baseStyle.codeBg ?? (theme.name === 'dark' ? '#ffffff15' : '#00000010'),
                borderRadius: 4,
                color: theme.accent,
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
  const bqStyle = { color: theme.textMuted, fontFamily: serifFont, fontSize: 13, fontStyle: 'italic', lineHeight: 18, codeBg: theme.name === 'dark' ? '#ffffff15' : '#00000010' };
  const codeBlockStyle = { color: theme.textPrimary, fontFamily: 'Courier', fontSize: 12, backgroundColor: theme.name === 'dark' ? '#ffffff0a' : '#00000008', borderRadius: radii.sm, padding: spacing.sm, marginBottom: 6 };

  return (
    <View style={{ gap: 2 }}>
      {nodes.map((node, i) => {
        switch (node.t) {
          case 'h1': return <InlineText key={i} segments={node.children} baseStyle={h1Style} theme={theme} />;
          case 'h2': return <InlineText key={i} segments={node.children} baseStyle={h2Style} theme={theme} />;
          case 'h3': return <InlineText key={i} segments={node.children} baseStyle={h3Style} theme={theme} />;
          case 'h4': case 'h5': case 'h6': return <InlineText key={i} segments={node.children} baseStyle={h4Style} theme={theme} />;
          case 'p': return <InlineText key={i} segments={node.children} baseStyle={pStyle} theme={theme} />;
          case 'li': {
            const bulletSymbol = node.ordered
              ? `${node.number ?? 1}.`
              : (node.indent ? '◦' : '•');
            return (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  marginBottom: 3,
                  paddingLeft: node.indent ? 18 : 4,
                }}
              >
                <Text
                  style={{
                    color: theme.accent,
                    fontFamily: serifFont,
                    fontSize: node.ordered ? 13 : 15,
                    fontWeight: '700',
                    lineHeight: 18,
                    minWidth: node.ordered ? 18 : 10,
                  }}
                >
                  {bulletSymbol}
                </Text>
                <InlineText segments={node.children} baseStyle={{ ...liStyle, flex: 1, marginBottom: 0 }} theme={theme} />
              </View>
            );
          }
          case 'blockquote':
            return (
              <View
                key={i}
                style={{
                  borderLeftColor: theme.accent,
                  borderLeftWidth: 3,
                  marginBottom: 6,
                  marginLeft: 4,
                  paddingLeft: 10,
                  paddingVertical: 2,
                }}
              >
                <InlineText segments={node.children} baseStyle={bqStyle} theme={theme} />
              </View>
            );
          case 'code':
            return (
              <ScrollView
                key={i}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginVertical: 4 }}
              >
                <Text style={codeBlockStyle}>{node.text}</Text>
              </ScrollView>
            );
          case 'hr':
            return (
              <View
                key={i}
                style={{
                  alignSelf: 'stretch',
                  backgroundColor: theme.name === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
                  borderBottomColor: theme.border,
                  borderBottomWidth: 1,
                  height: 1,
                  marginVertical: 10,
                  width: '100%',
                }}
              />
            );
          case 'table':
            return (
              <View
                key={i}
                style={{
                  backgroundColor: theme.name === 'dark' ? '#ffffff04' : '#00000003',
                  borderColor: theme.border,
                  borderRadius: radii.sm,
                  borderWidth: 1,
                  marginVertical: 6,
                  overflow: 'hidden',
                }}
              >
                {node.headers.length > 0 && (
                  <View
                    style={{
                      backgroundColor: theme.name === 'dark' ? '#ffffff0c' : '#0000000a',
                      borderBottomColor: theme.border,
                      borderBottomWidth: 1,
                      flexDirection: 'row',
                      paddingVertical: 6,
                    }}
                  >
                    {node.headers.map((hdr, hIdx) => (
                      <View key={hIdx} style={{ flex: 1, paddingHorizontal: 6 }}>
                        <InlineText segments={hdr} baseStyle={{ ...liStyle, color: theme.textPrimary, fontWeight: '700' }} theme={theme} />
                      </View>
                    ))}
                  </View>
                )}
                {node.rows.map((row, rIdx) => (
                  <View
                    key={rIdx}
                    style={{
                      borderBottomColor: rIdx < node.rows.length - 1 ? theme.border : 'transparent',
                      borderBottomWidth: rIdx < node.rows.length - 1 ? 1 : 0,
                      flexDirection: 'row',
                      paddingVertical: 5,
                    }}
                  >
                    {row.map((cell, cIdx) => (
                      <View key={cIdx} style={{ flex: 1, paddingHorizontal: 6 }}>
                        <InlineText segments={cell} baseStyle={liStyle} theme={theme} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          default:
            return null;
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
  const { height, width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const isSmallDevice = width < 360;

  // Responsive margins/paddings adapting to device resolution and safe areas
  const horizontalPadding = isTablet
    ? spacing.xl
    : isSmallDevice
      ? spacing.sm
      : spacing.md;

  const cardPadding = isTablet ? spacing.lg : spacing.md;

  const verticalPaddingTop = Math.max(spacing.md, insets.top + spacing.xs);
  const verticalPaddingBottom = Math.max(spacing.md, insets.bottom + spacing.xs);

  // Responsive modal dimensions
  const cardMaxWidth = isTablet
    ? Math.min(560, width - (insets.left + insets.right + spacing.xl * 2))
    : Math.min(460, width - (insets.left + insets.right + horizontalPadding * 2));

  const availableHeight = height - verticalPaddingTop - verticalPaddingBottom;
  const cardMaxHeight = Math.min(Math.round(height * 0.88), availableHeight);

  // Responsive max heights for inner scroll areas
  const bodyMaxHeight = Math.max(180, cardMaxHeight - 140);
  const changelogMaxHeight = Math.max(140, Math.min(360, cardMaxHeight - 230));

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
          paddingBottom: verticalPaddingBottom,
          paddingLeft: Math.max(horizontalPadding, insets.left + spacing.xs),
          paddingRight: Math.max(horizontalPadding, insets.right + spacing.xs),
          paddingTop: verticalPaddingTop,
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
            maxHeight: cardMaxHeight,
            maxWidth: cardMaxWidth,
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
              paddingHorizontal: cardPadding,
              paddingTop: cardPadding,
              paddingBottom: spacing.sm + 4,
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
            contentContainerStyle={{ paddingHorizontal: cardPadding, paddingTop: spacing.md }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: bodyMaxHeight }}
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
                      maxHeight: changelogMaxHeight + 40,
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
                      style={{ maxHeight: changelogMaxHeight }}
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
              flexWrap: 'wrap',
              gap: spacing.sm,
              justifyContent: 'flex-end',
              paddingHorizontal: cardPadding,
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
