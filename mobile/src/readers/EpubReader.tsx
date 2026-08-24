import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useApp } from '../context/AppContext';
import { radii, serifFont, spacing, type ThemeName } from '../theme';
import { EPUB_VENDOR_SCRIPT } from './epubVendorScript';

async function resolveEpubUri(filePath: string): Promise<string> {
  if (filePath.startsWith('file://') || filePath.startsWith('/')) {
    return filePath.startsWith('/') ? `file://${filePath}` : filePath;
  }
  if (filePath.startsWith('content://')) {
    const cacheDir = `${FileSystem.cacheDirectory}epub-reader/`;
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => undefined);
    const safeName = filePath.split('/').pop()?.split('?')[0]?.replace(/[^a-zA-Z0-9._-]/g, '_') ?? `book-${Date.now()}.epub`;
    const dest = `${cacheDir}${Date.now()}-${safeName}`;
    const destWithExt = dest.toLowerCase().endsWith('.epub') ? dest : `${dest}.epub`;
    await FileSystem.copyAsync({ from: filePath, to: destWithExt });
    return destWithExt;
  }
  return filePath;
}

/**
 * HTML base do leitor EPUB com suporte a Safe Area Insets.
 *
 * Para garantir margens simétricas e perfeitas (esquerda e direita idênticas):
 * O container `#viewer` é posicionado com `top`, `left`, `width` e `height` exatos
 * descontando os insets da tela. O `rendition` do `epub.js` é renderizado dentro
 * dessa caixa delimitada, assegurando que o texto nunca encoste nas bordas do aparelho.
 */
const EPUB_HTML_BASE = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <script>
    ${EPUB_VENDOR_SCRIPT}
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; -webkit-tap-highlight-color: transparent; }
    body { background: #181818; position: relative; width: 100vw; height: 100vh; font-family: Georgia, "Times New Roman", serif; }
    #running-header {
      position: absolute;
      top: 14px;
      left: 20px;
      right: 20px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
      pointer-events: none;
      z-index: 10;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.3s ease;
    }
    #running-footer {
      position: absolute;
      bottom: 12px;
      right: 20px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.5px;
      color: rgba(255, 255, 255, 0.4);
      pointer-events: none;
      z-index: 10;
      transition: color 0.3s ease;
    }
    #viewer {
      position: absolute;
      top: 36px;
      left: 20px;
      width: calc(100vw - 40px);
      height: calc(100vh - 60px);
      overflow: hidden;
    }
    #loading {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    }
    #loading.hidden { display: none; }
    .spinner {
      width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.15);
      border-top-color: #f97316; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loading"><div class="spinner"></div></div>
  <div id="running-header"></div>
  <div id="running-footer"></div>
  <div id="viewer"></div>
  <script>
    var rendition = null;
    var book = null;
    var isReady = false;
    var currentInsets = { top: 36, bottom: 24, left: 20, right: 20 };
    var epubToc = [];
    var currentChapterTitle = '';
    var currentLocIdx = -1;
    var currentTotalLocs = 0;

    function post(obj) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    }

    function base64ToArrayBuffer(base64) {
      var binaryString = window.atob(base64);
      var len = binaryString.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    function applyInsets(ins) {
      if (!ins) return;
      currentInsets = ins;
      var top = ins.top || 40;
      var bottom = ins.bottom || 32;
      var left = ins.left || 20;
      var right = ins.right || 20;

      var headerEl = document.getElementById('running-header');
      if (headerEl) {
        headerEl.style.top = Math.max(12, top - 24) + 'px';
        headerEl.style.left = left + 'px';
        headerEl.style.right = right + 'px';
      }

      var footerEl = document.getElementById('running-footer');
      if (footerEl) {
        footerEl.style.bottom = Math.max(10, bottom - 22) + 'px';
        footerEl.style.right = right + 'px';
      }

      var w = Math.max(100, window.innerWidth - left - right);
      var h = Math.max(100, window.innerHeight - top - bottom);

      var viewer = document.getElementById('viewer');
      if (viewer) {
        viewer.style.position = 'absolute';
        viewer.style.top = top + 'px';
        viewer.style.left = left + 'px';
        viewer.style.width = w + 'px';
        viewer.style.height = h + 'px';
      }

      if (rendition) {
        try {
          rendition.resize(w, h);
        } catch(e) { console.log('[Krumer EPUB] rendition resize error', e); }
      }
    }

    function updateRunningHeaderFooter(chapterTitle, locIdx, totalLocs) {
      var headerEl = document.getElementById('running-header');
      if (headerEl) {
        headerEl.textContent = chapterTitle ? chapterTitle.trim().toUpperCase() : '';
      }
      var footerEl = document.getElementById('running-footer');
      if (footerEl) {
        if (locIdx >= 0 && totalLocs > 0) {
          footerEl.textContent = (locIdx + 1) + ' / ' + totalLocs;
        } else {
          footerEl.textContent = '';
        }
      }
    }

    function _injectBookTypography(doc) {
      if (!doc) return;
      var styleId = 'krumer-book-style';
      var style = doc.getElementById(styleId);
      if (!style) {
        style = doc.createElement('style');
        style.id = styleId;
        doc.head.appendChild(style);
      }
      style.textContent =
        'body {' +
          'font-family: Georgia, "Times New Roman", serif !important;' +
          'line-height: 1.75 !important;' +
          '-webkit-font-smoothing: antialiased;' +
        '}' +
        'a {' +
          'color: #f97316 !important;' +
          'text-decoration: none !important;' +
        '}';
    }

    window.addEventListener('message', function(event) {
      try {
        var msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg.type === 'SET_INSETS') applyInsets(msg.insets);
        if (msg.type === 'OPEN_BOOK') openBook(msg.path, msg.cfi, msg.base64, msg.insets);
        if (msg.type === 'NEXT_PAGE' && rendition) rendition.next();
        if (msg.type === 'PREV_PAGE' && rendition) rendition.prev();
        if (msg.type === 'SET_THEME') applyTheme(msg.theme);
        if (msg.type === 'SET_FONT_SIZE' && rendition) rendition.themes.fontSize(msg.size + 'px');
        if (msg.type === 'SET_LINE_HEIGHT' && rendition) {
          rendition.themes.override('line-height', String(msg.value));
          rendition.views().forEach(function(v) { v.pane && v.pane.render(); });
        }
      } catch (e) { console.log('[Krumer EPUB] message handler error', e && e.message ? e.message : e); }
    });

    document.body.addEventListener('click', function(e) {
      var viewer = document.getElementById('viewer');
      if (viewer && viewer.contains(e.target)) return;
      handleIframeTap(e);
    });

    setTimeout(function(){
      if (!isReady) {
        console.log('[Krumer EPUB] timeout sem READY, ePub=' + (typeof ePub) + ' book=' + !!book);
        if (typeof ePub === 'undefined') {
          post({ type: 'ERROR', message: 'epub.js não inicializou na WebView.' });
        } else if (!book) {
          post({ type: 'ERROR', message: 'EPUB não inicializou - arquivo inacessível.' });
        }
      }
    }, 15000);

    function openBook(path, savedCfi, base64, insets) {
      console.log('[Krumer EPUB] openBook called path=' + (path ? path.slice(0, 100) : 'null') + ' hasBase64=' + !!base64);
      if (typeof ePub === 'undefined') {
        post({ type: 'ERROR', message: 'epub.js não inicializou na WebView.' });
        return;
      }

      if (insets) applyInsets(insets);

      try {
        if (rendition) { rendition.destroy(); rendition = null; }
        if (book) { book.destroy(); book = null; }
      } catch(eOld) { console.log('[Krumer EPUB] erro ao destruir anterior', eOld); }

      try {
        if (base64) {
          var buffer = base64ToArrayBuffer(base64);
          book = ePub(buffer);
        } else if (path) {
          var isBase64 = typeof path === 'string' && path.length > 5000 && !path.startsWith('file://') && !path.startsWith('http') && !path.startsWith('content://') && !path.startsWith('/');
          if (isBase64) {
            var buffer = base64ToArrayBuffer(path);
            book = ePub(buffer);
          } else {
            book = ePub(path);
          }
        } else {
          post({ type: 'ERROR', message: 'Caminho do EPUB vazio' });
          return;
        }
      } catch (e) {
        post({ type: 'ERROR', message: 'Falha ao abrir arquivo EPUB: ' + (e && e.message ? e.message : String(e)) });
        return;
      }

      var topP = (currentInsets.top || 40);
      var botP = (currentInsets.bottom || 32);
      var leftP = (currentInsets.left || 20);
      var rightP = (currentInsets.right || 20);

      var viewerW = Math.max(100, window.innerWidth - leftP - rightP);
      var viewerH = Math.max(100, window.innerHeight - topP - botP);

      rendition = book.renderTo('viewer', {
        width: viewerW,
        height: viewerH,
        flow: 'paginated'
      });

      book.loaded.navigation.then(function(nav) {
        epubToc = nav.toc || [];
      });

      var displayPromise = savedCfi ? rendition.display(savedCfi).catch(function(cfiErr) {
        return rendition.display();
      }) : rendition.display();

      displayPromise.then(function() {
        isReady = true;
        document.getElementById('loading').classList.add('hidden');
        post({ type: 'READY' });
      }).catch(function(err) {
        document.getElementById('loading').classList.add('hidden');
        post({ type: 'ERROR', message: 'Falha ao renderizar conteúdo do EPUB: ' + (err && err.message ? err.message : String(err)) });
      });

      book.ready.catch(function(err){
        post({ type: 'ERROR', message: 'Carregamento do EPUB falhou: ' + (err && err.message ? err.message : String(err)) });
      });

      rendition.on('relocated', function(location) {
        var locIdx = -1;
        var totalLocs = 0;
        if (book && book.locations && book.locations.total > 0) {
          totalLocs = book.locations.total;
          var found = book.locations.locationFromCfi(location.start.cfi);
          if (found >= 0) locIdx = found;
        }
        currentLocIdx = locIdx;
        currentTotalLocs = totalLocs;

        // Tentar extrair o capítulo atual para o Running Header
        currentChapterTitle = '';
        try {
          if (location.start && location.start.href) {
            var currentHref = location.start.href.split('#')[0];
            function findChapterLabel(items) {
              if (!items) return null;
              for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item.href && item.href.split('#')[0] === currentHref) {
                  return item.label;
                }
                if (item.subitems && item.subitems.length > 0) {
                  var sub = findChapterLabel(item.subitems);
                  if (sub) return sub;
                }
              }
              return null;
            }
            currentChapterTitle = findChapterLabel(epubToc) || '';
          }
        } catch (e) {}

        updateRunningHeaderFooter(currentChapterTitle, currentLocIdx, currentTotalLocs);

        post({
          type: 'LOCATION_CHANGED',
          cfi: location.start.cfi,
          percentage: location.start.percentage || 0,
          locationIndex: locIdx,
          totalLocations: totalLocs,
          chapterTitle: currentChapterTitle
        });
      });

      /* Gerar localizações em segundo plano para contagem de páginas reais (D2) */
      book.ready.then(function() {
        book.locations.generate(1500).then(function() {
          var total = book.locations.total;
          currentTotalLocs = total;
          post({ type: 'LOCATIONS_READY', totalLocations: total });
          if (rendition && rendition.location && rendition.location.start) {
            var loc = book.locations.locationFromCfi(rendition.location.start.cfi);
            currentLocIdx = loc >= 0 ? loc : 0;
            updateRunningHeaderFooter(currentChapterTitle, currentLocIdx, currentTotalLocs);
            post({
              type: 'LOCATION_CHANGED',
              cfi: rendition.location.start.cfi,
              percentage: rendition.location.start.percentage || 0,
              locationIndex: currentLocIdx,
              totalLocations: total,
              chapterTitle: currentChapterTitle
            });
          }
        }).catch(function(locErr) {
          console.log('[Krumer EPUB] erro ao gerar localizações:', locErr);
        });
      });

      /* Captura de toques e gestos de swipe dentro dos iframes do epub.js (D4) */
      rendition.on('rendered', function(section, view) {
        try {
          var doc = view.document || (view.contents && view.contents.document);
          if (!doc) return;
          _injectBookTypography(doc);
          doc.removeEventListener('click', handleIframeTap);
          doc.addEventListener('click', handleIframeTap);

          setupSwipeGesture(doc);
        } catch (e) { /* cross-origin guard */ }
      });
    }

    var lastSwipeTime = 0;

    function setupSwipeGesture(doc) {
      if (doc.__krumerSwipeBound) return;
      doc.__krumerSwipeBound = true;

      var touchStartX = 0;
      var touchStartY = 0;
      var touchStartTime = 0;

      doc.addEventListener('touchstart', function(e) {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          touchStartTime = Date.now();
        }
      }, { passive: true });

      doc.addEventListener('touchend', function(e) {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        var deltaX = e.changedTouches[0].clientX - touchStartX;
        var deltaY = e.changedTouches[0].clientY - touchStartY;
        var deltaTime = Date.now() - touchStartTime;

        // Swipe horizontal (distância > 30px, deltaX > 1.2 * deltaY, tempo < 600ms)
        if (Math.abs(deltaX) > 30 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2 && deltaTime < 600) {
          lastSwipeTime = Date.now();
          if (deltaX < 0) {
            if (rendition) rendition.next();
          } else {
            if (rendition) rendition.prev();
          }
        }
      }, { passive: true });
    }

    function handleIframeTap(e) {
      // Se um swipe acabou de ocorrer há menos de 400ms, ignora o evento de clique sintético disparado pela WebView
      if (Date.now() - lastSwipeTime < 400) return;

      var x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
      var w = window.innerWidth;
      var zone = x / w;

      if (zone < 0.25) {
        if (rendition) rendition.prev();
      } else if (zone > 0.75) {
        if (rendition) rendition.next();
      } else {
        post({ type: 'TAP_CENTER' });
      }
    }

    function applyTheme(theme) {
      var themes = {
        dark:  { bg: '#181818', color: '#dedede', muted: 'rgba(255, 255, 255, 0.4)' },
        light: { bg: '#fafafa', color: '#1c1c1c', muted: 'rgba(0, 0, 0, 0.45)' },
        sepia: { bg: '#f4ecd8', color: '#3b2f1e', muted: 'rgba(59, 47, 30, 0.45)' }
      };
      var current = themes[theme] || themes.dark;
      if (!rendition) return;

      rendition.themes.register('active', {
        body: {
          'background': current.bg + ' !important',
          'color': current.color + ' !important'
        }
      });
      rendition.themes.select('active');

      /* Atualizar fundo do body externo e cores de rodapé/cabeçalho */
      document.body.style.background = current.bg;
      var h = document.getElementById('running-header');
      var f = document.getElementById('running-footer');
      if (h) h.style.color = current.muted;
      if (f) f.style.color = current.muted;
    }
  </script>
</body>
</html>`;

type EpubReaderProps = {
  filePath: string;
  savedCfi?: string | null;
  themeName: ThemeName;
  fontSize?: number;
  lineHeight?: number;
  onLocationChange?: (cfi: string, percentage: number, locationIndex?: number, totalLocations?: number) => void;
  onLocationsReady?: (totalLocations: number) => void;
  onCenterTap?: () => void;
};

export function EpubReader({
  filePath,
  savedCfi,
  themeName,
  fontSize,
  lineHeight,
  onLocationChange,
  onLocationsReady,
  onCenterTap,
}: EpubReaderProps) {
  const { theme } = useApp();
  const webviewRef = useRef<WebViewType>(null);
  const html = useMemo(() => EPUB_HTML_BASE, []);
  const prevFontSize = useRef(fontSize);
  const prevLineHeight = useRef(lineHeight);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(true);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const insets = useSafeAreaInsets();

  // Cálculo das margens dinâmicas do leitor considerando o notch/câmera/barra de gestos do aparelho
  const safeInsets = useMemo(() => {
    return {
      top: Math.max(insets.top, 20) + 30,
      bottom: Math.max(insets.bottom, 12) + 40,
      left: Math.max(insets.left, 8) + 6,
      right: Math.max(insets.right, 8) + 6,
    };
  }, [insets.top, insets.bottom, insets.left, insets.right]);

  // Resolve content:// -> file:// antes de abrir no WebView
  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setError(null);
    setLoading(true);
    resolveEpubUri(filePath)
      .then((uri) => {
        if (!cancelled) setResolvedPath(uri);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[Krumer EpubReader] falha ao resolver URI', filePath, msg);
        if (!cancelled) {
          setError(`Falha ao preparar EPUB: ${msg}`);
          setLoading(false);
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const sendMessage = useCallback((message: object) => {
    try {
      const payload = JSON.stringify(JSON.stringify(message));
      const logData = (message as any).base64
        ? `{base64 len=${(message as any).base64.length}}`
        : JSON.stringify(message).slice(0, 200);
      console.log('[Krumer EpubReader] sendMessage', (message as any).type, logData);
      webviewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: ${payload} })); true;`,
      );
    } catch (e) {
      console.warn('[Krumer EpubReader] sendMessage failed', e);
    }
  }, []);

  useEffect(() => {
    sendMessage({ type: 'SET_INSETS', insets: safeInsets });
  }, [safeInsets, sendMessage]);

  const hasOpenedRef = useRef(false);
  const initialCfiRef = useRef(savedCfi);

  // Guarda a posição inicial antes da abertura do livro
  useEffect(() => {
    if (!hasOpenedRef.current && savedCfi) {
      initialCfiRef.current = savedCfi;
    }
  }, [savedCfi]);

  // Reseta o estado de abertura quando o caminho do arquivo mudar (ex.: novo livro)
  useEffect(() => {
    hasOpenedRef.current = false;
    initialCfiRef.current = savedCfi;
  }, [filePath, savedCfi]);

  const handleLoad = useCallback(async () => {
    if (!resolvedPath || hasOpenedRef.current) {
      return;
    }
    hasOpenedRef.current = true;
    console.log('[Krumer EpubReader] OPEN_BOOK', resolvedPath.slice(0, 120));

    let base64Data: string | undefined = undefined;
    try {
      base64Data = await FileSystem.readAsStringAsync(resolvedPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log('[Krumer EpubReader] Base64 lido len=', base64Data.length);
    } catch (e) {
      console.warn('[Krumer EpubReader] Falha ao ler base64 no handleLoad', e);
    }

    sendMessage({ type: 'OPEN_BOOK', path: resolvedPath, cfi: initialCfiRef.current, base64: base64Data, insets: safeInsets });
    sendMessage({ type: 'SET_THEME', theme: themeName });
    if (fontSize) sendMessage({ type: 'SET_FONT_SIZE', size: fontSize });
    if (lineHeight) sendMessage({ type: 'SET_LINE_HEIGHT', value: lineHeight });
  }, [resolvedPath, safeInsets, themeName, fontSize, lineHeight, sendMessage]);

  // Se o path resolver após o WebView já ter carregado, força envio (apenas na primeira carga)
  useEffect(() => {
    if (resolvedPath && !resolving && !hasOpenedRef.current) {
      const t = setTimeout(() => {
        handleLoad();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [resolvedPath, resolving, handleLoad]);

  useEffect(() => {
    if (fontSize !== prevFontSize.current) {
      prevFontSize.current = fontSize;
      if (fontSize) sendMessage({ type: 'SET_FONT_SIZE', size: fontSize });
    }
  }, [fontSize, sendMessage]);

  useEffect(() => {
    if (lineHeight !== prevLineHeight.current) {
      prevLineHeight.current = lineHeight;
      if (lineHeight) sendMessage({ type: 'SET_LINE_HEIGHT', value: lineHeight });
    }
  }, [lineHeight, sendMessage]);

  useEffect(() => {
    sendMessage({ type: 'SET_THEME', theme: themeName });
  }, [themeName, sendMessage]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === 'LOCATION_CHANGED') {
          const locIdx = typeof message.locationIndex === 'number' && message.locationIndex >= 0 ? message.locationIndex : undefined;
          const totalLocs = typeof message.totalLocations === 'number' && message.totalLocations > 0 ? message.totalLocations : undefined;
          onLocationChange?.(message.cfi, message.percentage, locIdx, totalLocs);
        } else if (message.type === 'LOCATIONS_READY') {
          if (typeof message.totalLocations === 'number' && message.totalLocations > 0) {
            onLocationsReady?.(message.totalLocations);
          }
        } else if (message.type === 'TAP_CENTER') {
          onCenterTap?.();
        } else if (message.type === 'READY') {
          setLoading(false);
          setError(null);
        } else if (message.type === 'ERROR') {
          setLoading(false);
          setError(message.message || 'Erro desconhecido ao carregar EPUB');
        }
      } catch {
        /* ignore malformed messages */
      }
    },
    [onLocationChange, onLocationsReady, onCenterTap],
  );

  if (error) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, maxWidth: 360, padding: spacing.lg, width: '100%' }}>
          <Text style={{ color: theme.accent, fontFamily: serifFont, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Falha ao abrir EPUB</Text>
          <Text style={{ color: theme.textSecondary, fontFamily: serifFont, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>{error}</Text>
          <Text selectable style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 10, marginTop: spacing.xs, textAlign: 'center' }}>{filePath}</Text>
        </View>
      </View>
    );
  }

  if (resolving) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={{ color: theme.textMuted, fontFamily: serifFont, fontSize: 12, marginTop: spacing.sm }}>Preparando EPUB...</Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      {loading && !error && (
        <View
          style={{
            alignItems: 'center',
            bottom: 0,
            justifyContent: 'center',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
            zIndex: 10,
          }}
        >
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      )}
      <WebView
        ref={webviewRef}
        source={{ html }}
        onLoad={handleLoad}
        onMessage={handleMessage}
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={{ flex: 1, opacity: loading ? 0 : 1 }}
        onError={(e) => console.warn('[Krumer EpubReader] WebView onError', e.nativeEvent)}
        onHttpError={(e) => console.warn('[Krumer EpubReader] WebView onHttpError', e.nativeEvent)}
      />
    </View>
  );
}
