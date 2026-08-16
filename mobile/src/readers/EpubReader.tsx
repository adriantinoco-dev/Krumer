import React, { useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import type { ThemeName } from '../theme';

const EPUB_HTML_BASE = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; overflow: hidden; }
    #viewer { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="viewer"></div>
  <script>
    let rendition = null;
    let book = null;
    window.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'OPEN_BOOK') openBook(msg.path, msg.cfi);
      if (msg.type === 'NEXT_PAGE') rendition && rendition.next();
      if (msg.type === 'PREV_PAGE') rendition && rendition.prev();
      if (msg.type === 'SET_THEME') applyTheme(msg.theme);
      if (msg.type === 'SET_FONT_SIZE') rendition && rendition.themes.fontSize(msg.size + 'px');
    });
    function openBook(path, savedCfi) {
      book = ePub(path);
      rendition = book.renderTo('viewer', {
        width: window.innerWidth,
        height: window.innerHeight,
        flow: 'paginated'
      });
      rendition.themes.default({
        body: { 'font-family': 'Georgia, serif' }
      });
      rendition.display(savedCfi || undefined);
      rendition.on('relocated', (location) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'LOCATION_CHANGED',
          cfi: location.start.cfi,
          percentage: location.start.percentage || 0
        }));
      });
    }
    function applyTheme(theme) {
      const themes = {
        dark: { body: { background: '#1a1a1a', color: '#e8e8e8' } },
        light: { body: { background: '#f5f5f5', color: '#1a1a1a' } },
        sepia: { body: { background: '#f4ede3', color: '#2c1e0f' } }
      };
      if (!rendition) return;
      rendition.themes.register('active', themes[theme]);
      rendition.themes.select('active');
    }
  </script>
</body>
</html>`;

export function EpubReader({
  filePath,
  savedCfi,
  themeName,
  onLocationChange,
}: {
  filePath: string;
  savedCfi?: string | null;
  themeName: ThemeName;
  onLocationChange?: (cfi: string, percentage: number) => void;
}) {
  const webviewRef = useRef<WebViewType>(null);
  const html = useMemo(() => EPUB_HTML_BASE, []);

  function sendMessage(message: object) {
    const data = JSON.stringify(message).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webviewRef.current?.injectJavaScript(
      `window.dispatchEvent(new MessageEvent('message', { data: '${data}' })); true;`
    );
  }

  function handleLoad() {
    sendMessage({ type: 'OPEN_BOOK', path: filePath, cfi: savedCfi });
    sendMessage({ type: 'SET_THEME', theme: themeName });
  }

  return (
    <WebView
      ref={webviewRef}
      source={{ html }}
      onLoad={handleLoad}
      onMessage={(event) => {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === 'LOCATION_CHANGED') {
          onLocationChange?.(message.cfi, message.percentage);
        }
      }}
      originWhitelist={['*']}
      allowFileAccess
      allowUniversalAccessFromFileURLs
      javaScriptEnabled
      scrollEnabled={false}
      style={{ flex: 1 }}
    />
  );
}
