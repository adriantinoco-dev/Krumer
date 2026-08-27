import { EPUB_BRIDGE_VERSION } from './epubBridge';
import { EPUB_VENDOR_SCRIPT } from './epubVendorScript';

// The vendored payload contains two script blocks followed by trailing desktop HTML.
// Join only JSZip 3.10.1 and epub.js 0.3.93 into this isolated local runtime.
const vendorScriptBlocks = EPUB_VENDOR_SCRIPT.split('\n  </script>');
const EPUB_RUNTIME_VENDOR_SCRIPT = [
  vendorScriptBlocks[0],
  vendorScriptBlocks[1]?.replace(/^\n  <script>\n/, ''),
].filter(Boolean).join('\n');

export const EPUB_RUNTIME_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; script-src 'nonce-krumer-runtime'; style-src 'unsafe-inline' blob:; img-src data: blob:; font-src data: blob:; media-src data: blob:; frame-src data: blob:; child-src data: blob:; connect-src data: blob:; worker-src blob:">
    <style>
      * { box-sizing: border-box; }
      html, body, #viewer { height: 100%; margin: 0; width: 100%; }
      html, body { background: #ffffff; overflow: hidden; }
      #viewer { bottom: 0; opacity: 0; position: absolute; top: 0; transition: opacity 120ms linear; width: auto; }
      #viewer.ready { opacity: 1; }
      #loading {
        align-items: center;
        background: #ffffff;
        display: flex;
        inset: 0;
        justify-content: center;
        position: fixed;
        z-index: 2;
      }
      #loading.hidden { display: none; }
      #spinner {
        animation: spin 800ms linear infinite;
        border: 3px solid #e5e5e5;
        border-radius: 50%;
        border-top-color: #f97316;
        height: 32px;
        width: 32px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <script nonce="krumer-runtime">${EPUB_RUNTIME_VENDOR_SCRIPT}</script>
  </head>
  <body>
    <div id="loading"><div id="spinner"></div></div>
    <div id="viewer"></div>
    <script nonce="krumer-runtime">
      (function () {
        'use strict';

        var BRIDGE_VERSION = ${EPUB_BRIDGE_VERSION};
        var MAX_EPUB_BYTES = 16 * 1024 * 1024;
        var STABLE_LOCATION_CHARS = 1600;
        var book = null;
        var rendition = null;
        var generation = 0;
        var nextEventId = 0;
        var lastTouchEndAt = 0;
        var turnInFlight = false;
        var turnUnlockTimer = null;
        var userRelocationPending = false;
        var userRelocationTimer = null;
        var currentLocator = null;
        var renditionGeneration = 0;
        var appearanceUpdateQueue = Promise.resolve();
        var activeRelocationSource = 'user';
        var paginationState = 'loading';
        var lastViewLocation = null;
        var readingAnchorLocator = null;
        var lastAppliedDoubleColumn = false;
        var viewportUpdateFrame = null;
        var registeredFontFaces = { serif: [], sans: [], mono: [] };
        var visualTheme = {
          backgroundColor: '#ffffff',
          linkColor: '#c2570a',
          textColor: '#171717'
        };
        var typography = {
          fontSize: 18,
          fontFamily: 'serif',
          fontWeight: 'regular',
          lineHeight: 1.5
        };
        var readerLayout = {
          displayMode: 'paginated',
          doubleColumn: false,
          marginHorizontal: 20,
          useBookMargins: true
        };

        function eventId() {
          nextEventId += 1;
          return 'web-' + Date.now() + '-' + nextEventId;
        }

        function post(type, payload, id) {
          if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            version: BRIDGE_VERSION,
            id: id || eventId(),
            type: type,
            payload: payload || {}
          }));
        }

        function safeMessage(error) {
          var message = error && error.message ? error.message : String(error || 'Unknown EPUB error');
          return message.slice(0, 300);
        }

        function reportError(code, error, requestId) {
          post('ERROR', {
            code: code,
            message: safeMessage(error),
            requestId: requestId
          });
        }

        function setLoading(visible) {
          var loading = document.getElementById('loading');
          var viewer = document.getElementById('viewer');
          if (loading) loading.className = visible ? '' : 'hidden';
          if (viewer) viewer.className = visible ? '' : 'ready';
        }

        function validThemeColor(value) {
          return typeof value === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
        }

        function applyVisualTheme(theme) {
          if (!theme
            || !validThemeColor(theme.backgroundColor)
            || !validThemeColor(theme.textColor)
            || !validThemeColor(theme.linkColor)) return;
          visualTheme = {
            backgroundColor: theme.backgroundColor,
            linkColor: theme.linkColor,
            textColor: theme.textColor
          };
          var viewer = document.getElementById('viewer');
          var loading = document.getElementById('loading');
          if (document.documentElement) document.documentElement.style.backgroundColor = visualTheme.backgroundColor;
          if (document.body) document.body.style.backgroundColor = visualTheme.backgroundColor;
          if (viewer) viewer.style.backgroundColor = visualTheme.backgroundColor;
          if (loading) loading.style.backgroundColor = visualTheme.backgroundColor;
        }

        function validTypography(value) {
          return value
            && typeof value.fontSize === 'number'
            && Number.isFinite(value.fontSize)
            && value.fontSize >= 12
            && value.fontSize <= 32
            && typeof value.lineHeight === 'number'
            && Number.isFinite(value.lineHeight)
            && value.lineHeight >= 1
            && value.lineHeight <= 2.4
            && typeof value.useBookMargins === 'boolean'
            && typeof value.marginHorizontal === 'number'
            && Number.isFinite(value.marginHorizontal)
            && value.marginHorizontal >= 0
            && value.marginHorizontal <= 48
            && (value.fontFamily === 'serif' || value.fontFamily === 'sans' || value.fontFamily === 'mono')
            && (value.fontWeight === 'light' || value.fontWeight === 'regular' || value.fontWeight === 'medium' || value.fontWeight === 'bold')
            && (value.displayMode === 'scroll' || value.displayMode === 'paginated')
            && typeof value.doubleColumn === 'boolean';
        }

        function fontFamilyCss() {
          var faces = registeredFontFaces[typography.fontFamily] || [];
          if (faces.length && faces[0].fontFamily) {
            var fallback = typography.fontFamily === 'serif'
              ? 'serif'
              : typography.fontFamily === 'mono' ? 'monospace' : 'sans-serif';
            return '"' + faces[0].fontFamily + '", ' + fallback;
          }
          if (typography.fontFamily === 'sans') return 'Arial, Helvetica, sans-serif';
          if (typography.fontFamily === 'mono') return '"Courier New", Courier, monospace';
          return 'Georgia, "Times New Roman", serif';
        }

        function fontWeightCss() {
          if (typography.fontWeight === 'light') return 300;
          if (typography.fontWeight === 'medium') return 500;
          if (typography.fontWeight === 'bold') return 700;
          return 400;
        }

        function viewportIsLandscape() {
          return Number(window.innerWidth) > Number(window.innerHeight);
        }

        function usesDoubleColumn() {
          return readerLayout.displayMode === 'paginated'
            && readerLayout.doubleColumn
            && viewportIsLandscape();
        }

        function layoutAppearanceSignature() {
          return [
            readerLayout.displayMode,
            readerLayout.doubleColumn ? 'double' : 'single',
            typography.fontFamily,
            typography.fontWeight,
            typography.fontSize,
            typography.lineHeight,
            readerLayout.useBookMargins ? 'book-margins' : readerLayout.marginHorizontal
          ].join('|');
        }

        function typographyAppearanceSignature() {
          return [
            typography.fontFamily,
            typography.fontWeight,
            typography.fontSize,
            typography.lineHeight,
            readerLayout.useBookMargins ? 'book-margins' : readerLayout.marginHorizontal
          ].join('|');
        }

        function horizontalReaderMargin() {
          return readerLayout.useBookMargins ? 20 : readerLayout.marginHorizontal;
        }

        function applyReaderFrame() {
          var viewer = document.getElementById('viewer');
          if (!viewer) return;
          var margin = horizontalReaderMargin();
          viewer.style.left = margin + 'px';
          viewer.style.right = margin + 'px';
          viewer.style.top = margin + 'px';
          viewer.style.bottom = margin + 'px';
        }

        function readerViewportWidth() {
          return Math.max(1, Number(window.innerWidth) - horizontalReaderMargin() * 2);
        }

        function readerStyleText() {
          var textSelectors = 'body, p, div, span, li, blockquote, td, th, h1, h2, h3, h4, h5, h6, a, em, strong, b, i, cite, figcaption';
          var lineHeightRule = readerLayout.useBookMargins
            ? ''
            : ' line-height: ' + typography.lineHeight + ' !important;';
          return [
            'html, body { background: ' + visualTheme.backgroundColor + ' !important; color: ' + visualTheme.textColor + ' !important; }',
            textSelectors + ' { font-family: ' + fontFamilyCss() + ' !important; font-weight: ' + fontWeightCss()
              + ' !important;' + lineHeightRule + ' }',
            'body { font-size: ' + typography.fontSize + 'px !important; }',
            'a { color: ' + visualTheme.linkColor + ' !important; }',
            'p { hyphens: auto; text-align: justify; }',
            'img, svg, video { max-width: 100% !important; height: auto !important; }'
          ].join('');
        }

        function fontFaceStyleText() {
          return ['serif', 'sans', 'mono'].map(function (family) {
            var faces = registeredFontFaces[family] || [];
            return faces.map(function (face) {
              return '@font-face { font-family: "' + face.fontFamily + '"; src: url("data:'
                + face.mimeType + ';base64,' + face.dataBase64
                + '") format("truetype"); font-style: normal; font-weight: ' + face.weight + '; font-display: swap; }';
            }).join('');
          }).join('');
        }

        function waitForReaderFonts(doc) {
          if (!doc || !doc.fonts || typeof doc.fonts.load !== 'function') return Promise.resolve();
          var faces = registeredFontFaces[typography.fontFamily] || [];
          if (!faces.length) return Promise.resolve();
          var requested = String(fontWeightCss()) + ' 16px "'
            + faces[0].fontFamily + '"';
          return Promise.race([
            doc.fonts.load(requested),
            new Promise(function (resolve) { setTimeout(resolve, 1500); })
          ]).catch(function () {});
        }

        function styleReaderDocument(doc) {
          if (!doc) return;
          var fontStyle = doc.__krumerFontFaceStyle;
          if (!fontStyle) {
            fontStyle = doc.createElement('style');
            fontStyle.id = 'krumer-reader-font-faces';
            doc.__krumerFontFaceStyle = fontStyle;
            (doc.head || doc.documentElement).appendChild(fontStyle);
          }
          var nextFontStyleText = fontFaceStyleText();
          if (fontStyle.textContent !== nextFontStyleText) fontStyle.textContent = nextFontStyleText;
          var style = doc.__krumerVisualStyle;
          if (!style) {
            style = doc.createElement('style');
            style.id = 'krumer-reader-appearance';
            doc.__krumerVisualStyle = style;
            (doc.head || doc.documentElement).appendChild(style);
          }
          var nextStyleText = readerStyleText();
          if (style.textContent !== nextStyleText) style.textContent = nextStyleText;
          applyInlineReaderTypography(doc);
        }

        function setImportantStyle(style, property, value) {
          if (!style || typeof style.setProperty !== 'function') return;
          if (
            typeof style.getPropertyValue === 'function'
            && typeof style.getPropertyPriority === 'function'
            && style.getPropertyValue(property) === value
            && style.getPropertyPriority(property) === 'important'
          ) return;
          style.setProperty(property, value, 'important');
        }

        function applyInlineReaderTypography(doc) {
          if (!doc.querySelectorAll) return;
          var nodes = doc.querySelectorAll('body, p, div, span, li, blockquote, td, th, h1, h2, h3, h4, h5, h6, a, em, strong, b, i, cite, figcaption');
          for (var index = 0; index < nodes.length; index += 1) {
            var node = nodes[index];
            if (!node || !node.style || typeof node.style.setProperty !== 'function') continue;
            setImportantStyle(node.style, 'font-family', fontFamilyCss());
            setImportantStyle(node.style, 'font-weight', String(fontWeightCss()));
          }
          var body = doc.body;
          if (body && body.style && typeof body.style.setProperty === 'function') {
            setImportantStyle(body.style, 'font-size', String(typography.fontSize) + 'px');
          }
        }

        function refreshReaderAppearance() {
          if (!rendition || typeof rendition.getContents !== 'function') return;
          var contents = rendition.getContents() || [];
          for (var index = 0; index < contents.length; index += 1) {
            styleReaderDocument(contents[index] && contents[index].document);
          }
        }

        function validFontFace(face, family) {
          return face
            && face.family === family
            && typeof face.fontFamily === 'string'
            && face.fontFamily.length > 0
            && face.fontFamily.length <= 80
            && face.mimeType === 'font/ttf'
            && (face.weight === 300 || face.weight === 400 || face.weight === 500 || face.weight === 700)
            && typeof face.dataBase64 === 'string'
            && face.dataBase64.length > 0
            && face.dataBase64.length <= 4 * 1024 * 1024
            && /^[A-Za-z0-9+/=]+$/.test(face.dataBase64);
        }

        async function registerFontFaces(message) {
          var payload = message.payload || {};
          var family = payload.family;
          var faces = payload.faces;
          if ((family !== 'serif' && family !== 'sans' && family !== 'mono')
            || !Array.isArray(faces)
            || faces.length !== 4
            || !faces.every(function (face) { return validFontFace(face, family); })) {
            reportError('INVALID_FONT_FACES', 'REGISTER_FONT_FACES payload is invalid.', message.id);
            return;
          }
          var weights = faces.map(function (face) { return face.weight; }).sort().join('|');
          var fontFamily = faces[0].fontFamily;
          if (weights !== '300|400|500|700' || faces.some(function (face) { return face.fontFamily !== fontFamily; })) {
            reportError('INVALID_FONT_FACES', 'The reader requires weights 300, 400, 500 and 700.', message.id);
            return;
          }

          if (typeof window.FontFace === 'function' && document.fonts && typeof document.fonts.add === 'function') {
            await Promise.all(faces.map(function (face) {
              var loadedFace = new window.FontFace(
                face.fontFamily,
                'url(data:' + face.mimeType + ';base64,' + face.dataBase64 + ')',
                { style: 'normal', weight: String(face.weight) }
              );
              return loadedFace.load().then(function (fontFace) { document.fonts.add(fontFace); });
            }));
          }
          registeredFontFaces[family] = faces;
          refreshReaderAppearance();
          post('FONT_FACES_READY', { family: family, requestId: message.id });
        }

        function applyAppearance(appearance) {
          if (!appearance || !validTypography(appearance)) return null;
          var theme = appearance.visualTheme;
          if (!theme
            || !validThemeColor(theme.backgroundColor)
            || !validThemeColor(theme.textColor)
            || !validThemeColor(theme.linkColor)) return null;
          var previousDisplayMode = readerLayout.displayMode;
          var previousSignature = layoutAppearanceSignature();
          var previousTypographySignature = typographyAppearanceSignature();
          typography = {
            fontSize: appearance.fontSize,
            fontFamily: appearance.fontFamily,
            fontWeight: appearance.fontWeight,
            lineHeight: appearance.lineHeight
          };
          readerLayout = {
            displayMode: appearance.displayMode,
            doubleColumn: appearance.doubleColumn,
            marginHorizontal: appearance.marginHorizontal,
            useBookMargins: appearance.useBookMargins
          };
          applyVisualTheme(theme);
          return {
            requiresAnchorRestore: previousTypographySignature !== typographyAppearanceSignature(),
            requiresLayoutRefresh: previousSignature !== layoutAppearanceSignature(),
            requiresRenditionReset: previousDisplayMode !== readerLayout.displayMode
          };
        }

        function base64ToArrayBuffer(base64) {
          var binary = window.atob(base64);
          var bytes = new Uint8Array(binary.length);
          for (var index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes.buffer;
        }

        function clampProgression(value) {
          return Math.max(0, Math.min(1, Number(value) || 0));
        }

        function stableProgressionFromCfi(cfi) {
          if (paginationState !== 'ready'
            || !book
            || !book.locations
            || typeof book.locations.percentageFromCfi !== 'function'
            || typeof cfi !== 'string') return null;
          try {
            var percentage = Number(book.locations.percentageFromCfi(cfi));
            return Number.isFinite(percentage) ? clampProgression(percentage) : null;
          } catch (_) {
            return null;
          }
        }

        function isEpubLocator(locator) {
          return locator
            && locator.format === 'epub'
            && (locator.cfi === null || typeof locator.cfi === 'string')
            && typeof locator.spineHref === 'string'
            && typeof locator.progressionInSection === 'number'
            && locator.progressionInSection >= 0
            && locator.progressionInSection <= 1
            && typeof locator.excerpt === 'string'
            && locator.excerpt.length <= 240
            && (locator.totalProgression === null
              || (typeof locator.totalProgression === 'number'
                && locator.totalProgression >= 0
                && locator.totalProgression <= 1));
        }

        function firstTextNode(node) {
          if (!node) return null;
          if (node.nodeType === 3) return node;
          var walker = node.ownerDocument && node.ownerDocument.createTreeWalker
            ? node.ownerDocument.createTreeWalker(node, 4)
            : null;
          return walker ? walker.nextNode() : null;
        }

        function contextForCfi(cfi) {
          if (!rendition || !cfi || !rendition.getContents) return null;
          var contentList = rendition.getContents() || [];
          for (var contentIndex = 0; contentIndex < contentList.length; contentIndex += 1) {
            var contents = contentList[contentIndex];
            try {
              var range = contents.range(cfi);
              var doc = contents.document;
              var root = doc && (doc.body || doc.documentElement);
              if (!range || !root || !doc.createTreeWalker) continue;

              var startNode = range.startContainer;
              var startOffset = range.startOffset || 0;
              if (startNode && startNode.nodeType !== 3) {
                startNode = firstTextNode(startNode.childNodes && startNode.childNodes[startOffset])
                  || firstTextNode(startNode);
                startOffset = 0;
              }

              var walker = doc.createTreeWalker(root, 4);
              var nodes = [];
              var totalLength = 0;
              var currentLength = null;
              var node;
              while ((node = walker.nextNode())) {
                var textLength = String(node.textContent || '').length;
                if (node === startNode) {
                  currentLength = totalLength + Math.min(startOffset, textLength);
                }
                nodes.push(node);
                totalLength += textLength;
              }
              if (currentLength === null || !startNode) continue;

              var sourceText = String(startNode.textContent || '');
              var excerptStart = Math.max(0, Math.min(startOffset, sourceText.length) - 90);
              var excerpt = sourceText.slice(excerptStart, excerptStart + 180).trim();
              return {
                excerpt: excerpt.slice(0, 240),
                progression: totalLength > 0 ? clampProgression(currentLength / totalLength) : 0
              };
            } catch (_) {}
          }
          return null;
        }

        function locatorFromLocation(location) {
          if (!location || !location.start || typeof location.start.cfi !== 'string') return null;
          var start = location.start;
          var displayed = start.displayed || {};
          var displayedTotal = Number(displayed.total) || 1;
          var displayedPage = Number(displayed.page) || 1;
          var renderedContext = contextForCfi(start.cfi);
          var progressionInSection = renderedContext
            ? renderedContext.progression
            : clampProgression((displayedPage - 1) / displayedTotal);
          var spineLength = book && book.spine ? Number(book.spine.length) || 1 : 1;
          var spineIndex = Math.max(0, Number(start.index) || 0);
          var stableProgression = stableProgressionFromCfi(start.cfi);
          var totalProgression = stableProgression !== null
            ? stableProgression
            : typeof start.percentage === 'number'
              ? clampProgression(start.percentage)
              : clampProgression((spineIndex + progressionInSection) / spineLength);

          return {
            format: 'epub',
            cfi: start.cfi,
            spineHref: typeof start.href === 'string' ? start.href : '',
            progressionInSection: progressionInSection,
            excerpt: renderedContext ? renderedContext.excerpt : '',
            totalProgression: totalProgression
          };
        }

        async function locatorFromCurrentRendition() {
          if (!rendition || typeof rendition.currentLocation !== 'function') return currentLocator;
          try {
            var location = await Promise.resolve(rendition.currentLocation());
            return locatorFromLocation(location) || currentLocator;
          } catch (_) {
            return currentLocator;
          }
        }

        async function waitForStableLocator() {
          var locator = null;
          for (var attempt = 0; attempt < 8; attempt += 1) {
            locator = await locatorFromCurrentRendition();
            if (locator) return locator;
            await new Promise(function (resolve) { setTimeout(resolve, 25); });
          }
          return currentLocator;
        }

        async function sendCurrentLocator(message) {
          var locator = await locatorFromCurrentRendition();
          if (locator) currentLocator = locator;
          post('CURRENT_LOCATOR', { locator: locator || null, requestId: message.id });
        }

        function normalizedHref(value) {
          var href = String(value || '').split('#')[0].replace(/^\.\//, '');
          try { href = decodeURIComponent(href); } catch (_) {}
          return href;
        }

        function tocLabelForHref(href) {
          if (!book || !book.navigation || !book.navigation.toc) return '';
          var targetHref = normalizedHref(href);
          var firstSectionMatch = '';

          function visit(items) {
            for (var index = 0; index < (items || []).length; index += 1) {
              var item = items[index];
              var itemHref = normalizedHref(item.href);
              if (itemHref === targetHref && item.label) {
                firstSectionMatch = String(item.label).replace(/\s+/g, ' ').trim();
                return true;
              }
              if (visit(item.subitems || [])) return true;
            }
            return false;
          }

          visit(book.navigation.toc);
          return firstSectionMatch.slice(0, 200);
        }

        function viewStatusFromLocation(location, locator) {
          var start = location && location.start ? location.start : {};
          var currentPage = null;
          var totalPages = null;

          if (paginationState === 'ready' && book && book.locations) {
            try {
              totalPages = Math.max(1, Number(book.locations.length()) || 1);
              var pageCfi = locator && typeof locator.cfi === 'string' ? locator.cfi : start.cfi;
              var locationIndex = Number(book.locations.locationFromCfi(pageCfi));
              if (Number.isFinite(locationIndex) && locationIndex >= 0) {
                currentPage = Math.max(1, Math.min(totalPages, Math.floor(locationIndex) + 1));
              } else if (locator && typeof locator.totalProgression === 'number') {
                currentPage = Math.max(1, Math.min(
                  totalPages,
                  Math.round(locator.totalProgression * Math.max(0, totalPages - 1)) + 1
                ));
              }
              if (location && location.atEnd) currentPage = totalPages;
              if (currentPage === null) {
                paginationState = 'unavailable';
                totalPages = null;
              }
            } catch (_) {
              paginationState = 'unavailable';
              currentPage = null;
              totalPages = null;
            }
          }

          return {
            chapterTitle: tocLabelForHref(start.href),
            currentPage: currentPage,
            paginationState: paginationState,
            totalPages: totalPages
          };
        }

        function postViewStatus(location, locator) {
          if (location) lastViewLocation = location;
          var activeLocation = location || lastViewLocation;
          if (!activeLocation) return;
          post('VIEW_STATUS', viewStatusFromLocation(activeLocation, locator || currentLocator));
        }

        function sectionForHref(href) {
          if (!book || !book.spine || !href) return null;
          var direct = book.spine.get(href);
          if (direct) return direct;
          var decodedHref = href;
          try { decodedHref = decodeURIComponent(href); } catch (_) {}
          var sections = book.spine.spineItems || [];
          for (var index = 0; index < sections.length; index += 1) {
            var sectionHref = String(sections[index].href || '');
            var decodedSectionHref = sectionHref;
            try { decodedSectionHref = decodeURIComponent(sectionHref); } catch (_) {}
            if (sectionHref === href || decodedSectionHref === decodedHref) return sections[index];
          }
          return null;
        }

        async function cfiAtSectionProgression(section, progression) {
          if (!section || !book || !section.load || !section.cfiFromRange) return null;
          var doc;
          try {
            doc = await section.load(book.load.bind(book));
            var root = doc && (doc.body || doc.documentElement);
            if (!root || !doc.createTreeWalker || !doc.createRange) return null;
            var walker = doc.createTreeWalker(root, 4);
            var nodes = [];
            var totalLength = 0;
            var node;
            while ((node = walker.nextNode())) {
              var textLength = String(node.textContent || '').length;
              if (textLength > 0) {
                nodes.push({ node: node, start: totalLength, length: textLength });
                totalLength += textLength;
              }
            }
            if (!nodes.length) return null;

            var target = Math.floor(clampProgression(progression) * Math.max(0, totalLength - 1));
            var selected = nodes[nodes.length - 1];
            for (var index = 0; index < nodes.length; index += 1) {
              if (target < nodes[index].start + nodes[index].length) {
                selected = nodes[index];
                break;
              }
            }
            var offset = Math.max(0, Math.min(selected.length, target - selected.start));
            var range = doc.createRange();
            range.setStart(selected.node, offset);
            range.collapse(true);
            return section.cfiFromRange(range);
          } finally {
            try { section.unload(); } catch (_) {}
          }
        }

        function excerptQueries(excerpt) {
          var value = String(excerpt || '').trim();
          if (!value) return [];
          var queries = [value];
          if (value.length > 100) {
            var middle = Math.floor(value.length / 2);
            queries.push(value.slice(Math.max(0, middle - 50), middle + 50).trim());
          }
          var words = value.split(/\s+/).filter(Boolean);
          if (words.length > 6) queries.push(words.slice(1, 7).join(' '));
          return queries.filter(function (query, index, all) {
            return query.length >= 12 && all.indexOf(query) === index;
          });
        }

        async function cfiFromExcerpt(excerpt, preferredHref) {
          if (!book || !book.spine) return null;
          var preferred = sectionForHref(preferredHref);
          var sections = book.spine.spineItems || [];
          var candidates = preferred
            ? [preferred].concat(sections.filter(function (section) { return section !== preferred; }))
            : sections.slice();
          var queries = excerptQueries(excerpt);

          for (var sectionIndex = 0; sectionIndex < candidates.length; sectionIndex += 1) {
            var section = candidates[sectionIndex];
            try {
              await section.load(book.load.bind(book));
              for (var queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
                var matches = section.find(queries[queryIndex]);
                if (matches && matches[0] && matches[0].cfi) return matches[0].cfi;
              }
            } catch (_) {
              // Continue through the fallback chain and remaining spine items.
            } finally {
              try { section.unload(); } catch (_) {}
            }
          }
          return null;
        }

        async function displayLocator(locator) {
          if (!rendition || !book || !isEpubLocator(locator)) {
            throw new Error('The EPUB locator is invalid or no book is open.');
          }

          if (locator.cfi) {
            try {
              await rendition.display(locator.cfi);
              return 'cfi';
            } catch (_) {}
          }

          var section = sectionForHref(locator.spineHref);
          if (section) {
            try {
              var sectionCfi = await cfiAtSectionProgression(section, locator.progressionInSection);
              if (sectionCfi) {
                await rendition.display(sectionCfi);
                return 'spine-progression';
              }
              if (locator.progressionInSection === 0) {
                await rendition.display(section.href);
                return 'spine-start';
              }
            } catch (_) {}
          }

          var excerptCfi = await cfiFromExcerpt(locator.excerpt, locator.spineHref);
          if (excerptCfi) {
            await rendition.display(excerptCfi);
            return 'excerpt';
          }
          throw new Error('No EPUB fallback could resolve the saved locator.');
        }

        async function goToLocator(message) {
          if (!rendition) {
            reportError('BOOK_NOT_OPEN', 'No EPUB is currently open.', message.id);
            return;
          }
          var locator = message.payload && message.payload.locator;
          if (!isEpubLocator(locator)) {
            reportError('INVALID_LOCATOR', 'GO_TO_LOCATOR payload is invalid.', message.id);
            return;
          }
          try {
            expectUserRelocation();
            var resolution = await displayLocator(locator);
            if (resolution === 'cfi') alignLocatorToLeadingColumn(rendition, locator);
          } catch (error) {
            clearUserRelocationExpectation();
            reportError('LOCATOR_NOT_FOUND', error, message.id);
          }
        }

        function findAnchor(target) {
          var node = target;
          while (node && node.nodeType === 1) {
            if (String(node.tagName).toLowerCase() === 'a') return node;
            node = node.parentElement;
          }
          return null;
        }

        function externalUrl(anchor) {
          if (!anchor || !anchor.getAttribute) return null;
          var raw = String(anchor.getAttribute('href') || '').trim();
          if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
          if (/^\/\//.test(raw)) return 'https:' + raw;
          return null;
        }

        function horizontalRatio(point, doc) {
          var screenWidth = window.screen && window.screen.width;
          if (typeof point.screenX === 'number' && screenWidth > 0) {
            return point.screenX / screenWidth;
          }

          var viewportWidth = window.innerWidth || (doc.documentElement && doc.documentElement.clientWidth);
          return viewportWidth && typeof point.clientX === 'number'
            ? point.clientX / viewportWidth
            : 0.5;
        }

        function verticalRatio(point, doc) {
          var screenHeight = window.screen && window.screen.height;
          if (typeof point.screenY === 'number' && screenHeight > 0) {
            return point.screenY / screenHeight;
          }

          var viewportHeight = window.innerHeight || (doc.documentElement && doc.documentElement.clientHeight);
          return viewportHeight && typeof point.clientY === 'number'
            ? point.clientY / viewportHeight
            : 0.5;
        }

        function pointX(point) {
          return typeof point.screenX === 'number' ? point.screenX : point.clientX;
        }

        function pointY(point) {
          return typeof point.screenY === 'number' ? point.screenY : point.clientY;
        }

        function clearUserRelocationExpectation() {
          userRelocationPending = false;
          if (userRelocationTimer) clearTimeout(userRelocationTimer);
          userRelocationTimer = null;
        }

        function expectUserRelocation() {
          userRelocationPending = true;
          if (userRelocationTimer) clearTimeout(userRelocationTimer);
          userRelocationTimer = setTimeout(function () {
            userRelocationPending = false;
            userRelocationTimer = null;
          }, 2000);
        }

        function turn(type, requestId) {
          if (!rendition) {
            if (requestId) reportError('BOOK_NOT_OPEN', 'No EPUB is currently open.', requestId);
            return;
          }
          if (turnInFlight) return;

          turnInFlight = true;
          expectUserRelocation();
          if (turnUnlockTimer) clearTimeout(turnUnlockTimer);

          function unlock() {
            turnUnlockTimer = setTimeout(function () {
              turnInFlight = false;
              turnUnlockTimer = null;
            }, 100);
          }

          try {
            var operation = type === 'NEXT' ? rendition.next() : rendition.prev();
            if (operation && operation.then) {
              operation.then(unlock, function (error) {
                clearUserRelocationExpectation();
                unlock();
                reportError('PAGE_TURN_FAILED', error, requestId);
              });
            } else {
              unlock();
            }
          } catch (error) {
            clearUserRelocationExpectation();
            unlock();
            reportError('PAGE_TURN_FAILED', error, requestId);
          }
        }

        function bindReaderDocument(doc) {
          if (!doc) return;
          styleReaderDocument(doc);
          if (doc.__krumerF1Bound) return;
          doc.__krumerF1Bound = true;

          var touchStartX = 0;
          var touchStartY = 0;
          var touchStartAt = 0;

          doc.addEventListener('touchstart', function (event) {
            if (!event.touches || !event.touches[0]) return;
            touchStartX = pointX(event.touches[0]);
            touchStartY = pointY(event.touches[0]);
            touchStartAt = Date.now();
          }, { passive: true });

          doc.addEventListener('touchend', function (event) {
            if (!event.changedTouches || !event.changedTouches[0]) return;
            var touch = event.changedTouches[0];
            var now = Date.now();
            var deltaX = pointX(touch) - touchStartX;
            var deltaY = pointY(touch) - touchStartY;
            var elapsed = now - touchStartAt;
            var anchor = findAnchor(event.target);
            lastTouchEndAt = now;

            if (readerLayout.displayMode === 'scroll') {
              if (anchor || Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12 || elapsed > 500) return;
              var scrollYRatio = verticalRatio(touch, doc);
              if (scrollYRatio >= 0.2 && scrollYRatio <= 0.8) {
                event.preventDefault();
                event.stopImmediatePropagation();
                post('CENTER_TAP', {});
              }
              return;
            }

            if (Math.abs(deltaX) > 36 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25 && elapsed < 650) {
              event.preventDefault();
              event.stopImmediatePropagation();
              turn(deltaX < 0 ? 'NEXT' : 'PREVIOUS');
              return;
            }

            if (anchor || Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12 || elapsed > 500) return;

            var ratio = horizontalRatio(touch, doc);
            if (ratio <= 0.3 || ratio >= 0.7) {
              event.preventDefault();
              event.stopImmediatePropagation();
              turn(ratio <= 0.3 ? 'PREVIOUS' : 'NEXT');
              return;
            }
            var yRatio = verticalRatio(touch, doc);
            if (yRatio >= 0.2 && yRatio <= 0.8) {
              event.preventDefault();
              event.stopImmediatePropagation();
              post('CENTER_TAP', {});
            }
          }, { passive: false });

          doc.addEventListener('click', function (event) {
            var anchor = findAnchor(event.target);
            var url = externalUrl(anchor);
            if (url) {
              event.preventDefault();
              event.stopPropagation();
              post('LINK_PRESSED', { url: url });
              return;
            }
            if (anchor) return;
            if (Date.now() - lastTouchEndAt < 700) {
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }

            if (readerLayout.displayMode === 'scroll') {
              var scrollClickYRatio = verticalRatio(event, doc);
              if (scrollClickYRatio >= 0.2 && scrollClickYRatio <= 0.8) {
                event.preventDefault();
                event.stopImmediatePropagation();
                post('CENTER_TAP', {});
              }
              return;
            }

            var ratio = horizontalRatio(event, doc);
            if (ratio <= 0.3 || ratio >= 0.7) {
              event.preventDefault();
              event.stopImmediatePropagation();
              turn(ratio <= 0.3 ? 'PREVIOUS' : 'NEXT');
              return;
            }
            var yRatio = verticalRatio(event, doc);
            if (yRatio >= 0.2 && yRatio <= 0.8) {
              event.preventDefault();
              event.stopImmediatePropagation();
              post('CENTER_TAP', {});
            }
          }, true);
        }

        function waitForActiveReaderFonts() {
          if (!rendition || typeof rendition.getContents !== 'function') return Promise.resolve();
          var contents = rendition.getContents() || [];
          return Promise.all(contents.map(function (entry) {
            return waitForReaderFonts(entry && entry.document);
          }));
        }

        function locatorDrifted(anchor, candidate) {
          if (!anchor || !candidate) return false;
          if (normalizedHref(anchor.spineHref) !== normalizedHref(candidate.spineHref)) return true;
          return anchor.cfi !== candidate.cfi;
        }

        function alignLocatorToLeadingColumn(activeRendition, locator) {
          if (!activeRendition || !locator || !usesDoubleColumn()) return false;
          var manager = activeRendition.manager;
          var layout = manager && manager.layout;
          var divisor = layout ? Number(layout.divisor || (layout.props && layout.props.divisor)) : 0;
          var pageWidth = layout ? Number(layout.pageWidth || (layout.props && layout.props.pageWidth)) : 0;
          if (!manager || !manager.views || divisor < 2 || !(pageWidth > 0)) return false;

          var section = sectionForHref(locator.spineHref);
          var view = section && typeof manager.views.find === 'function'
            ? manager.views.find(section)
            : null;
          if (!view || typeof view.locationOf !== 'function' || typeof view.width !== 'function') return false;

          try {
            var point = view.locationOf(locator.cfi);
            var viewWidth = Number(view.width());
            var rawPageIndex = Math.floor(Math.max(0, Number(point && point.left) || 0) / pageWidth);
            var totalVisualPages = Math.max(1, Math.ceil(viewWidth / pageWidth));
            var direction = manager.settings && manager.settings.direction;
            var readingPageIndex = direction === 'rtl'
              ? Math.max(0, totalVisualPages - 1 - rawPageIndex)
              : rawPageIndex;
            var columnOffset = ((readingPageIndex % divisor) + divisor) % divisor;
            if (columnOffset === 0 || typeof manager.scrollBy !== 'function') return false;
            manager.scrollBy(columnOffset * pageWidth, 0, true);
            return true;
          } catch (_) {
            return false;
          }
        }

        function moveToLocatorInPlace(activeRendition, locator) {
          if (!activeRendition || !locator || !locator.cfi) return false;
          var manager = activeRendition.manager;
          var section = sectionForHref(locator.spineHref);
          var view = section && manager && manager.views && typeof manager.views.find === 'function'
            ? manager.views.find(section)
            : null;
          if (!view || typeof view.locationOf !== 'function' || typeof view.width !== 'function') return false;
          if (!manager || typeof manager.moveTo !== 'function') return false;
          try {
            var point = view.locationOf(locator.cfi);
            if (!point) return false;
            manager.moveTo(point, view.width());
            return true;
          } catch (_) {
            return false;
          }
        }

        async function applyViewportLayout(anchor, source, forceAnchorRestore) {
          if (!book || !rendition) return;
          clearUserRelocationExpectation();
          var activeBook = book;
          var activeRendition = rendition;
          var doubleColumnLayout = usesDoubleColumn();
          var enteringDoubleColumn = doubleColumnLayout && !lastAppliedDoubleColumn;
          activeRelocationSource = source === 'reflow' ? 'reflow' : 'restore';
          if (forceAnchorRestore) {
            await waitForActiveReaderFonts();
            if (activeBook !== book || activeRendition !== rendition) return;
          }
          applyReaderFrame();
          refreshReaderAppearance();

          var spread = doubleColumnLayout ? 'always' : 'none';
          if (typeof activeRendition.spread === 'function') activeRendition.spread(spread);
          if (typeof activeRendition.resize === 'function') {
            await Promise.resolve(activeRendition.resize(readerViewportWidth(), window.innerHeight));
          }
          if (activeBook !== book || activeRendition !== rendition) return;
          if (!forceAnchorRestore) {
            await waitForActiveReaderFonts();
            if (activeBook !== book || activeRendition !== rendition) return;
          }

          var stableLocator = await waitForStableLocator();
          var restoredAnchor = false;
          if (anchor && (forceAnchorRestore || locatorDrifted(anchor, stableLocator))) {
            restoredAnchor = moveToLocatorInPlace(activeRendition, anchor);
          }
          var alignedLeadingColumn = anchor && (restoredAnchor || enteringDoubleColumn)
            ? alignLocatorToLeadingColumn(activeRendition, anchor)
            : false;
          if (restoredAnchor || alignedLeadingColumn) {
            await waitForStableLocator();
            stableLocator = anchor;
          }
          if (activeBook !== book || activeRendition !== rendition) return;
          if (stableLocator) {
            currentLocator = stableLocator;
            post('POSITION_STABILIZED', {
              locator: stableLocator,
              resolution: 'cfi',
              source: activeRelocationSource
            });
          }
          postViewStatus(null, stableLocator);
          lastAppliedDoubleColumn = doubleColumnLayout;
          activeRelocationSource = 'user';
        }

        function generateStableLocations(activeBook, openGeneration) {
          paginationState = 'loading';
          postViewStatus(null, currentLocator);
          if (!activeBook.locations || typeof activeBook.locations.generate !== 'function') {
            paginationState = 'unavailable';
            postViewStatus(null, currentLocator);
            return;
          }
          Promise.resolve(activeBook.locations.generate(STABLE_LOCATION_CHARS)).then(function () {
            if (openGeneration !== generation || activeBook !== book) return;
            var total = Number(activeBook.locations.length());
            paginationState = Number.isFinite(total) && total > 0 ? 'ready' : 'unavailable';
            postViewStatus(null, currentLocator);
          }).catch(function (error) {
            if (openGeneration !== generation || activeBook !== book) return;
            paginationState = 'unavailable';
            postViewStatus(null, currentLocator);
            console.warn('[Krumer EPUB] stable locations unavailable', safeMessage(error));
          });
        }

        async function closeBook() {
          generation += 1;
          renditionGeneration += 1;
          var oldRendition = rendition;
          var oldBook = book;
          rendition = null;
          book = null;
          turnInFlight = false;
          if (turnUnlockTimer) clearTimeout(turnUnlockTimer);
          turnUnlockTimer = null;
          clearUserRelocationExpectation();
          currentLocator = null;
          lastViewLocation = null;
          readingAnchorLocator = null;
          lastAppliedDoubleColumn = false;
          paginationState = 'loading';
          activeRelocationSource = 'user';
          if (viewportUpdateFrame !== null) {
            (window.cancelAnimationFrame || clearTimeout)(viewportUpdateFrame);
            viewportUpdateFrame = null;
          }
          setLoading(true);

          try {
            if (oldRendition) oldRendition.destroy();
          } catch (_) {}
          try {
            if (oldBook) oldBook.destroy();
          } catch (_) {}

          var viewer = document.getElementById('viewer');
          if (viewer) viewer.replaceChildren();
        }

        async function renderBookAt(locator, source) {
          if (!book) throw new Error('No EPUB is currently open.');
          applyReaderFrame();
          clearUserRelocationExpectation();
          activeRelocationSource = source === 'reflow' ? 'reflow' : 'restore';
          renditionGeneration += 1;
          var renderGeneration = renditionGeneration;
          var oldRendition = rendition;
          rendition = null;
          try {
            if (oldRendition) oldRendition.destroy();
          } catch (_) {}
          var viewer = document.getElementById('viewer');
          if (viewer) viewer.replaceChildren();

          var activeBook = book;
          var nextRendition = activeBook.renderTo('viewer', {
            flow: readerLayout.displayMode === 'scroll' ? 'scrolled-doc' : 'paginated',
            manager: readerLayout.displayMode === 'scroll' ? 'continuous' : 'default',
            resizeOnOrientationChange: false,
            spread: usesDoubleColumn() ? 'always' : 'none',
            width: '100%',
            height: '100%'
          });
          rendition = nextRendition;
          if (nextRendition.hooks && nextRendition.hooks.content && typeof nextRendition.hooks.content.register === 'function') {
            nextRendition.hooks.content.register(function (contents) {
              var doc = contents && contents.document;
              styleReaderDocument(doc);
              return waitForReaderFonts(doc);
            });
          }
          nextRendition.on('rendered', function (_section, view) {
            if (nextRendition !== rendition) return;
            bindReaderDocument(view && (view.document || (view.contents && view.contents.document)));
          });
          nextRendition.on('relocated', function (location) {
            if (activeBook !== book || nextRendition !== rendition) return;
            var nextLocator = locatorFromLocation(location);
            if (nextLocator) {
              var acceptsUserRelocation = activeRelocationSource === 'user'
                && (readerLayout.displayMode === 'scroll' || userRelocationPending);
              var relocationSource = acceptsUserRelocation ? 'user' : activeRelocationSource;
              if (relocationSource === 'user' && !acceptsUserRelocation) relocationSource = 'reflow';
              var emittedLocator = acceptsUserRelocation
                ? nextLocator
                : readingAnchorLocator || nextLocator;
              currentLocator = emittedLocator;
              if (acceptsUserRelocation) {
                readingAnchorLocator = nextLocator;
                clearUserRelocationExpectation();
              }
              post('RELOCATE', { locator: emittedLocator, source: relocationSource });
              postViewStatus(location, emittedLocator);
            }
          });

          var resolution = 'start';
          if (locator && isEpubLocator(locator)) {
            try {
              resolution = await displayLocator(locator);
              if (resolution === 'cfi') alignLocatorToLeadingColumn(nextRendition, locator);
            } catch (_) {
              await nextRendition.display();
            }
          } else {
            await nextRendition.display();
          }
          if (renderGeneration !== renditionGeneration || activeBook !== book || nextRendition !== rendition) return;
          refreshReaderAppearance();
          var stableLocator = await waitForStableLocator();
          if (renderGeneration !== renditionGeneration || activeBook !== book || nextRendition !== rendition) return;
          if (stableLocator) {
            var stabilizedLocator = resolution === 'cfi' && locator ? locator : stableLocator;
            currentLocator = stabilizedLocator;
            if (activeRelocationSource === 'restore' || !readingAnchorLocator) {
              readingAnchorLocator = stabilizedLocator;
            }
            post('POSITION_STABILIZED', {
              locator: stabilizedLocator,
              resolution: resolution,
              source: activeRelocationSource
            });
          }
          lastAppliedDoubleColumn = usesDoubleColumn();
          activeRelocationSource = 'user';
        }

        async function updateAppearance(message) {
          var locator = readingAnchorLocator || await locatorFromCurrentRendition();
          var result = applyAppearance(message.payload && message.payload.appearance);
          if (!result) {
            reportError('INVALID_APPEARANCE', 'The EPUB appearance settings are invalid.', message.id);
            return;
          }
          if (!book || !rendition) return;
          if (!result.requiresLayoutRefresh) {
            refreshReaderAppearance();
            return;
          }
          try {
            if (result.requiresRenditionReset) {
              await renderBookAt(locator, 'reflow');
            } else {
              await applyViewportLayout(locator, 'reflow', result.requiresAnchorRestore);
            }
          } catch (error) {
            activeRelocationSource = 'user';
            reportError('APPEARANCE_UPDATE_FAILED', error, message.id);
          }
        }

        async function openBook(message) {
          var payload = message.payload;
          if (!payload || typeof payload.bookId !== 'string' || typeof payload.dataBase64 !== 'string' || typeof payload.byteLength !== 'number') {
            reportError('INVALID_OPEN_BOOK', 'OPEN_BOOK payload is invalid.', message.id);
            return;
          }
          if (payload.byteLength <= 0 || payload.byteLength > MAX_EPUB_BYTES || payload.dataBase64.length > Math.ceil(MAX_EPUB_BYTES / 3) * 4 + 4) {
            reportError('FILE_TOO_LARGE', 'The EPUB exceeds the in-memory reader limit.', message.id);
            return;
          }

          await closeBook();
          var openGeneration = generation;

          try {
            if (!applyAppearance(payload.appearance)) {
              throw new Error('The EPUB appearance settings are invalid.');
            }
            var buffer = base64ToArrayBuffer(payload.dataBase64);
            if (buffer.byteLength !== payload.byteLength || buffer.byteLength > MAX_EPUB_BYTES) {
              throw new Error('EPUB payload size does not match its envelope.');
            }
            var nextBook = window.ePub(buffer);
            book = nextBook;
            await nextBook.ready;
            await renderBookAt(payload.initialLocator, 'restore');
            if (openGeneration !== generation || nextBook !== book) return;

            setLoading(false);
            post('BOOK_OPENED', { bookId: payload.bookId }, message.id);
            generateStableLocations(nextBook, openGeneration);
          } catch (error) {
            if (openGeneration !== generation) return;
            await closeBook();
            reportError('OPEN_BOOK_FAILED', error, message.id);
          }
        }

        function normalizeToc(items) {
          return (items || []).map(function (item) {
            return {
              label: String(item.label || '').trim().slice(0, 200),
              href: String(item.href || '').trim().slice(0, 500),
              subitems: normalizeToc(item.subitems || [])
            };
          }).filter(function (item) { return item.label && item.href; });
        }

        async function getToc(message) {
          if (!book) {
            reportError('BOOK_NOT_OPEN', 'No EPUB is currently open.', message.id);
            return;
          }
          try {
            try { await book.loaded.navigation; } catch (_) {}
            var toc = book.navigation && book.navigation.toc ? book.navigation.toc : [];
            var normalized = normalizeToc(toc);
            post('TOC', { toc: normalized, requestId: message.id }, message.id);
          } catch (error) {
            reportError('TOC_FAILED', error, message.id);
          }
        }

        async function goToHref(message) {
          var href = message.payload && message.payload.href;
          if (!rendition || !book || typeof href !== 'string' || !href) {
            reportError('INVALID_HREF', 'GO_TO_HREF payload is invalid.', message.id);
            return;
          }
          try {
            expectUserRelocation();
            await rendition.display(href);
          } catch (error) {
            clearUserRelocationExpectation();
            reportError('NAVIGATION_FAILED', error, message.id);
          }
        }

        function receive(raw) {
          var message;
          try {
            message = typeof raw === 'string' ? JSON.parse(raw) : raw;
          } catch (error) {
            reportError('INVALID_JSON', error);
            return;
          }

          if (!message || message.version !== BRIDGE_VERSION || typeof message.id !== 'string' || !message.payload) {
            reportError('INVALID_ENVELOPE', 'Bridge envelope is invalid.');
            return;
          }

          if (message.type === 'OPEN_BOOK') openBook(message);
          else if (message.type === 'NEXT') turn('NEXT', message.id);
          else if (message.type === 'PREVIOUS') turn('PREVIOUS', message.id);
          else if (message.type === 'REGISTER_FONT_FACES') {
            registerFontFaces(message).catch(function (error) {
              reportError('FONT_REGISTRATION_FAILED', error, message.id);
            });
          }
          else if (message.type === 'SET_APPEARANCE') {
            appearanceUpdateQueue = appearanceUpdateQueue
              .catch(function () {})
              .then(function () { return updateAppearance(message); });
          }
          else if (message.type === 'GO_TO_LOCATOR') goToLocator(message);
          else if (message.type === 'GET_CURRENT_LOCATOR') sendCurrentLocator(message);
          else if (message.type === 'GET_TOC') getToc(message);
          else if (message.type === 'GO_TO_HREF') goToHref(message);
          else if (message.type === 'CLOSE_BOOK') closeBook();
          else reportError('UNKNOWN_COMMAND', 'Unsupported bridge command.', message.id);
        }

        window.KrumerEpubBridge = { receive: receive };
        window.addEventListener('resize', function () {
          var anchor = readingAnchorLocator || currentLocator;
          if (viewportUpdateFrame !== null) {
            (window.cancelAnimationFrame || clearTimeout)(viewportUpdateFrame);
          }
          var requestFrame = window.requestAnimationFrame || function (callback) {
            return setTimeout(callback, 0);
          };
          viewportUpdateFrame = requestFrame(function () {
            viewportUpdateFrame = null;
            appearanceUpdateQueue = appearanceUpdateQueue
              .catch(function () {})
              .then(function () { return applyViewportLayout(anchor, 'reflow'); });
          });
        });
        window.addEventListener('error', function (event) {
          reportError('RUNTIME_ERROR', event.error || event.message);
        });
        window.addEventListener('unhandledrejection', function (event) {
          reportError('UNHANDLED_REJECTION', event.reason);
        });

        if (typeof window.ePub !== 'function') {
          reportError('ENGINE_UNAVAILABLE', 'epub.js 0.3.93 failed to initialize.');
          return;
        }
      })();
    </script>
  </body>
</html>`;

// react-native-webview runs this after the document has loaded and after onMessage
// has installed window.ReactNativeWebView on Android.
export const EPUB_RUNTIME_HANDSHAKE_SCRIPT = `
  (function () {
    var payload;
    if (window.KrumerEpubBridge && typeof window.KrumerEpubBridge.receive === 'function' && typeof window.ePub === 'function') {
      payload = {
        version: ${EPUB_BRIDGE_VERSION},
        id: 'native-handshake-' + Date.now(),
        type: 'READY',
        payload: { engine: 'epub.js', engineVersion: '0.3.93' }
      };
    } else {
      payload = {
        version: ${EPUB_BRIDGE_VERSION},
        id: 'native-handshake-' + Date.now(),
        type: 'ERROR',
        payload: {
          code: 'ENGINE_UNAVAILABLE',
          message: window.KrumerEpubBridge
            ? 'epub.js 0.3.93 failed to initialize.'
            : 'The local EPUB bridge failed to initialize.'
        }
      };
    }
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  })();
  true;
`;
