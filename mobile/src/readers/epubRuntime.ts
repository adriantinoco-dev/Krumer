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
      #viewer { opacity: 0; transition: opacity 120ms linear; }
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
        var book = null;
        var rendition = null;
        var generation = 0;
        var nextEventId = 0;
        var lastTouchEndAt = 0;
        var turnInFlight = false;
        var turnUnlockTimer = null;

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

        function base64ToArrayBuffer(base64) {
          var binary = window.atob(base64);
          var bytes = new Uint8Array(binary.length);
          for (var index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return bytes.buffer;
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

        function pointX(point) {
          return typeof point.screenX === 'number' ? point.screenX : point.clientX;
        }

        function pointY(point) {
          return typeof point.screenY === 'number' ? point.screenY : point.clientY;
        }

        function turn(type, requestId) {
          if (!rendition) {
            if (requestId) reportError('BOOK_NOT_OPEN', 'No EPUB is currently open.', requestId);
            return;
          }
          if (turnInFlight) return;

          turnInFlight = true;
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
                unlock();
                reportError('PAGE_TURN_FAILED', error, requestId);
              });
            } else {
              unlock();
            }
          } catch (error) {
            unlock();
            reportError('PAGE_TURN_FAILED', error, requestId);
          }
        }

        function bindReaderDocument(doc) {
          if (!doc || doc.__krumerF1Bound) return;
          doc.__krumerF1Bound = true;

          var style = doc.createElement('style');
          style.textContent = [
            'html, body { background: #ffffff !important; color: #171717 !important; }',
            'body { font-family: Georgia, "Times New Roman", serif !important; font-size: 18px !important; line-height: 1.6 !important; }',
            'img, svg, video { max-width: 100% !important; height: auto !important; }'
          ].join('');
          (doc.head || doc.documentElement).appendChild(style);

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

            var ratio = horizontalRatio(event, doc);
            if (ratio <= 0.3 || ratio >= 0.7) {
              event.preventDefault();
              event.stopImmediatePropagation();
              turn(ratio <= 0.3 ? 'PREVIOUS' : 'NEXT');
            }
          }, true);
        }

        async function closeBook() {
          generation += 1;
          var oldRendition = rendition;
          var oldBook = book;
          rendition = null;
          book = null;
          turnInFlight = false;
          if (turnUnlockTimer) clearTimeout(turnUnlockTimer);
          turnUnlockTimer = null;
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
            var buffer = base64ToArrayBuffer(payload.dataBase64);
            if (buffer.byteLength !== payload.byteLength || buffer.byteLength > MAX_EPUB_BYTES) {
              throw new Error('EPUB payload size does not match its envelope.');
            }
            var nextBook = window.ePub(buffer);
            var nextRendition = nextBook.renderTo('viewer', {
              flow: 'paginated',
              manager: 'default',
              spread: 'none',
              width: '100%',
              height: '100%'
            });

            book = nextBook;
            rendition = nextRendition;
            nextRendition.on('rendered', function (_section, view) {
              bindReaderDocument(view && (view.document || (view.contents && view.contents.document)));
            });

            await nextBook.ready;
            await nextRendition.display();
            if (openGeneration !== generation || nextBook !== book) return;

            setLoading(false);
            post('BOOK_OPENED', { bookId: payload.bookId }, message.id);
          } catch (error) {
            if (openGeneration !== generation) return;
            await closeBook();
            reportError('OPEN_BOOK_FAILED', error, message.id);
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
          else if (message.type === 'CLOSE_BOOK') closeBook();
          else reportError('UNKNOWN_COMMAND', 'Unsupported bridge command.', message.id);
        }

        window.KrumerEpubBridge = { receive: receive };
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
