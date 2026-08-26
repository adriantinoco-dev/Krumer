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
        var sectionPageTotals = {};
        var visualTheme = {
          backgroundColor: '#ffffff',
          linkColor: '#c2570a',
          textColor: '#171717'
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
          var totalProgression = typeof start.percentage === 'number'
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
          var displayed = start.displayed || {};
          var spineLength = book && book.spine ? Math.max(1, Number(book.spine.length) || 1) : 1;
          var spineIndex = Math.max(0, Math.min(spineLength - 1, Number(start.index) || 0));
          var displayedTotal = Math.max(1, Number(displayed.total) || 1);
          sectionPageTotals[spineIndex] = displayedTotal;

          var measuredPages = 0;
          var measuredSections = 0;
          Object.keys(sectionPageTotals).forEach(function (key) {
            measuredPages += sectionPageTotals[key];
            measuredSections += 1;
          });
          var averagePages = measuredSections ? measuredPages / measuredSections : displayedTotal;
          var totalPages = Math.max(1, Math.round(averagePages * spineLength));
          var totalProgression = locator && typeof locator.totalProgression === 'number'
            ? locator.totalProgression
            : (spineIndex + clampProgression((Number(displayed.page) - 1) / displayedTotal)) / spineLength;
          var currentPage = Math.max(1, Math.min(totalPages, Math.round(totalProgression * Math.max(0, totalPages - 1)) + 1));
          if (location && location.atEnd) currentPage = totalPages;

          return {
            chapterTitle: tocLabelForHref(start.href),
            currentPage: currentPage,
            totalPages: totalPages
          };
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
            await displayLocator(locator);
          } catch (error) {
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
            'html, body { background: ' + visualTheme.backgroundColor + ' !important; color: ' + visualTheme.textColor + ' !important; }',
            'body { font-family: Georgia, "Times New Roman", serif !important; font-size: 18px !important; line-height: 1.6 !important; margin: 0 !important; padding: 0 !important; }',
            'a { color: ' + visualTheme.linkColor + ' !important; }',
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

        async function closeBook() {
          generation += 1;
          var oldRendition = rendition;
          var oldBook = book;
          rendition = null;
          book = null;
          turnInFlight = false;
          if (turnUnlockTimer) clearTimeout(turnUnlockTimer);
          turnUnlockTimer = null;
          sectionPageTotals = {};
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
            applyVisualTheme(payload.visualTheme);
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
            nextRendition.on('relocated', function (location) {
              if (nextBook !== book || nextRendition !== rendition) return;
              var locator = locatorFromLocation(location);
              if (locator) {
                post('RELOCATE', { locator: locator });
                post('VIEW_STATUS', viewStatusFromLocation(location, locator));
              }
            });

            await nextBook.ready;
            if (payload.initialLocator && isEpubLocator(payload.initialLocator)) {
              try {
                await displayLocator(payload.initialLocator);
              } catch (_) {
                await nextRendition.display();
              }
            } else {
              await nextRendition.display();
            }
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
          else if (message.type === 'GO_TO_LOCATOR') goToLocator(message);
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
