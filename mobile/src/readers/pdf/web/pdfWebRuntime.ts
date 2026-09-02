import {
  PDF_WEB_ANNOTATION_LAYER_CSS_SOURCE,
  PDF_WEB_FOLIATE_FIXED_LAYOUT_SOURCE,
  PDF_WEB_FOLIATE_PDF_SOURCE,
  PDF_WEB_PDFJS_SOURCE,
  PDF_WEB_TEXT_LAYER_CSS_SOURCE,
  PDF_WEB_WORKER_SOURCE,
} from './generated/pdfWebVendor';
import { PDF_WEB_GESTURE_CONTROLLER_SOURCE } from './generated/pdfGestureController';

const RUNTIME_NONCE = 'krumer-pdf-runtime';

/**
 * Single owner for every pointer gesture inside the PDF WebView. It is kept as
 * a standalone function because its source is injected into the local runtime
 * and the same state machine is exercised by the Node regression validator.
 */
export function createPdfGestureController(options: any) {
  var viewer = options.viewer;
  var post = options.post;
  var clampScale = options.clampScale;
  var getScale = options.getScale;
  var commitScale = options.commitScale;
  var getCurrentPage = options.getCurrentPage;
  var now = options.now || function () { return Date.now(); };
  var requestFrame = options.requestFrame || function (callback: any) { return requestAnimationFrame(callback); };
  var cancelFrame = options.cancelFrame || function (frame: any) { cancelAnimationFrame(frame); };
  var pointers = new Map();
  var surfaces = new Set();
  var nextSurfaceId = 0;
  var mode = 'idle';
  var primaryId: any = null;
  var pinch: any = null;
  var panFrame: any = null;
  var panDx = 0;
  var panDy = 0;
  var pinchFrame: any = null;
  var pendingPinch: any = null;
  var inertiaFrame: any = null;
  var suppressTapUntil = 0;
  var suppressClickUntil = 0;
  var PAN_START_PX = 8;
  var TAP_MAX_MOVEMENT_PX = 14;
  var TAP_MAX_DURATION_MS = 280;
  var SWIPE_MIN_VELOCITY = 0.45;

  function prevent(event: any) {
    if (event && event.cancelable !== false) event.preventDefault?.();
  }

  function viewerRect() {
    return viewer?.getBoundingClientRect?.() || { left: 0, top: 0 };
  }

  function pointFor(event: any, surface: any) {
    var root = viewerRect();
    var x = Number(event?.clientX) || 0;
    var y = Number(event?.clientY) || 0;
    if (surface.frame?.getBoundingClientRect) {
      var frameRect = surface.frame.getBoundingClientRect();
      x += frameRect.left;
      y += frameRect.top;
    }
    return { x: x - root.left, y: y - root.top };
  }

  function selectionExists(surface: any) {
    try {
      var selection = surface.doc?.getSelection?.();
      return Boolean(selection && String(selection).length);
    } catch (_) {
      return false;
    }
  }

  function anchorFor(event: any) {
    return event?.target?.closest?.('a') || null;
  }

  function capture(pointer: any) {
    try { pointer.captureTarget?.setPointerCapture?.(pointer.pointerId); } catch (_) { /* no-op */ }
  }

  function release(pointer: any) {
    try { pointer.captureTarget?.releasePointerCapture?.(pointer.pointerId); } catch (_) { /* no-op */ }
  }

  function cancelInertia() {
    if (inertiaFrame != null) cancelFrame(inertiaFrame);
    inertiaFrame = null;
  }

  function flushPan() {
    panFrame = null;
    if (!panDx && !panDy) return;
    var dx = panDx;
    var dy = panDy;
    panDx = 0;
    panDy = 0;
    viewer?.pan?.(dx, dy);
  }

  function queuePan(dx: number, dy: number) {
    panDx += dx;
    panDy += dy;
    if (panFrame == null) panFrame = requestFrame(flushPan);
  }

  function flushPinch() {
    pinchFrame = null;
    if (!pendingPinch) return;
    var preview = pendingPinch;
    pendingPinch = null;
    viewer?.pinchZoom?.(preview.ratio, preview.focal);
  }

  function queuePinch(preview: any) {
    pendingPinch = preview;
    if (pinchFrame == null) pinchFrame = requestFrame(flushPinch);
  }

  function firstTwoPointers() {
    return Array.from(pointers.values()).slice(0, 2) as any[];
  }

  function midpoint(first: any, second: any) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  function distance(first: any, second: any) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function clearSelections() {
    surfaces.forEach(function (surface: any) {
      try { surface.doc?.getSelection?.()?.removeAllRanges?.(); } catch (_) { /* no-op */ }
    });
  }

  function beginPinch(event: any) {
    var pair = firstTwoPointers();
    if (pair.length < 2 || !viewer?.pinchZoom) return false;
    var initialDistance = distance(pair[0], pair[1]);
    if (!(initialDistance > 0)) return false;
    cancelInertia();
    if (panFrame != null) {
      cancelFrame(panFrame);
      panFrame = null;
      panDx = 0;
      panDy = 0;
    }
    var focal = midpoint(pair[0], pair[1]);
    mode = 'pinch';
    primaryId = null;
    pinch = {
      initialDistance: initialDistance,
      initialFocal: focal,
      currentFocal: focal,
      initialScale: getScale(),
      ratio: 1,
      startedAt: now(),
    };
    pointers.forEach(capture);
    clearSelections();
    suppressTapUntil = now() + 450;
    suppressClickUntil = now() + 450;
    viewer.pinchZoom(1, { x: focal.x, y: focal.y, deltaX: 0, deltaY: 0 });
    prevent(event);
    return true;
  }

  function updatePinch() {
    if (mode !== 'pinch' || !pinch) return;
    var pair = firstTwoPointers();
    if (pair.length < 2) return;
    var nextDistance = distance(pair[0], pair[1]);
    if (!(nextDistance > 0)) return;
    var focal = midpoint(pair[0], pair[1]);
    var nextScale = clampScale(pinch.initialScale * nextDistance / pinch.initialDistance);
    pinch.ratio = nextScale / pinch.initialScale;
    pinch.currentFocal = focal;
    queuePinch({
      ratio: pinch.ratio,
      focal: {
        x: pinch.initialFocal.x,
        y: pinch.initialFocal.y,
        deltaX: focal.x - pinch.initialFocal.x,
        deltaY: focal.y - pinch.initialFocal.y,
      },
    });
  }

  function finishPinch() {
    if (!pinch) return;
    if (pinchFrame != null) {
      cancelFrame(pinchFrame);
      pinchFrame = null;
    }
    flushPinch();
    var state = pinch;
    var focal = state.currentFocal || state.initialFocal;
    var nextScale = clampScale(state.initialScale * (state.ratio || 1));
    viewer?.pinchEnd?.({ x: focal.x, y: focal.y });
    commitScale(nextScale, Math.max(0, now() - state.startedAt));
    pinch = null;
    pendingPinch = null;
    mode = pointers.size ? 'post-pinch' : 'idle';
    suppressTapUntil = now() + 450;
    suppressClickUntil = now() + 450;
  }

  function startInertia(vx: number, vy: number) {
    if (!viewer?.scrolled || Math.hypot(vx, vy) < 0.08) return;
    var lastAt: number | null = null;
    function step(timestamp: number) {
      if (pointers.size || mode !== 'idle') {
        inertiaFrame = null;
        return;
      }
      if (lastAt == null) lastAt = timestamp;
      var elapsed = Math.max(1, Math.min(32, timestamp - lastAt));
      lastAt = timestamp;
      viewer.pan?.(vx * elapsed, vy * elapsed);
      var decay = Math.pow(0.92, elapsed / 16.67);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) < 0.02) {
        inertiaFrame = null;
        return;
      }
      inertiaFrame = requestFrame(step);
    }
    inertiaFrame = requestFrame(step);
  }

  function finishPan(pointer: any) {
    if (panFrame != null) {
      cancelFrame(panFrame);
      panFrame = null;
    }
    flushPan();
    var dx = pointer.x - pointer.startX;
    var dy = pointer.y - pointer.startY;
    var absX = Math.abs(dx);
    var absY = Math.abs(dy);
    var width = Math.max(1, Number(viewer?.clientWidth) || 360);
    var swipeDistance = Math.max(36, Math.min(96, width * 0.12));
    var fastDistance = Math.max(24, width * 0.06);
    var horizontal = absX > absY * 1.25;
    var fastEnough = Math.abs(pointer.fingerVx) >= SWIPE_MIN_VELOCITY && absX >= fastDistance;
    var canTurnPage = !viewer?.scrolled && getScale() <= 1.001;
    if (canTurnPage && horizontal && (absX >= swipeDistance || fastEnough)) {
      var forward = viewer?.rtl ? dx > 0 : dx < 0;
      if (forward) viewer?.next?.();
      else viewer?.prev?.();
    } else if (viewer?.scrolled) {
      startInertia(pointer.scrollVx, pointer.scrollVy);
    }
    suppressTapUntil = now() + 350;
    suppressClickUntil = now() + 350;
  }

  function resetPointerState() {
    pointers.forEach(release);
    pointers.clear();
    primaryId = null;
    pinch = null;
    mode = 'idle';
    panDx = 0;
    panDy = 0;
    pendingPinch = null;
    if (panFrame != null) cancelFrame(panFrame);
    if (pinchFrame != null) cancelFrame(pinchFrame);
    panFrame = null;
    pinchFrame = null;
  }

  function onPointerDown(event: any, surface: any) {
    if (event.button !== undefined && event.button !== 0) return;
    cancelInertia();
    var id = event.pointerId;
    if (id === undefined || pointers.has(id)) return;
    var point = pointFor(event, surface);
    var timestamp = now();
    var pointer = {
      pointerId: id,
      captureTarget: event.target,
      surface: surface,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      lastX: point.x,
      lastY: point.y,
      startedAt: timestamp,
      lastAt: timestamp,
      fingerVx: 0,
      fingerVy: 0,
      scrollVx: 0,
      scrollVy: 0,
      link: anchorFor(event),
    };
    pointers.set(id, pointer);
    if (pointers.size === 1) {
      mode = 'pending';
      primaryId = id;
    } else if (pointers.size >= 2) {
      beginPinch(event);
    }
  }

  function updatePointer(event: any, surface: any) {
    var pointer = pointers.get(event.pointerId);
    if (!pointer) return null;
    var point = pointFor(event, surface);
    var timestamp = now();
    var elapsed = Math.max(1, timestamp - pointer.lastAt);
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.lastAt = timestamp;
    var movedX = pointer.x - pointer.lastX;
    var movedY = pointer.y - pointer.lastY;
    if (movedX || movedY) {
      pointer.fingerVx = movedX / elapsed;
      pointer.fingerVy = movedY / elapsed;
      pointer.scrollVx = -pointer.fingerVx;
      pointer.scrollVy = -pointer.fingerVy;
    }
    return pointer;
  }

  function onPointerMove(event: any, surface: any) {
    var pointer = updatePointer(event, surface);
    if (!pointer) return;
    if (mode === 'pinch') {
      updatePinch();
      prevent(event);
      return;
    }
    if (pointers.size >= 2 && beginPinch(event)) return;
    if (mode === 'post-pinch' || mode === 'selection') {
      if (mode === 'post-pinch') prevent(event);
      return;
    }
    if (selectionExists(pointer.surface)) {
      mode = 'selection';
      return;
    }
    if (pointer.pointerId !== primaryId) return;
    var totalDistance = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (mode === 'pending' && totalDistance >= PAN_START_PX) {
      mode = 'pan';
      capture(pointer);
    }
    if (mode === 'pan') {
      queuePan(pointer.lastX - pointer.x, pointer.lastY - pointer.y);
      prevent(event);
    }
  }

  function finishPointer(event: any, surface: any, cancelled: boolean) {
    var pointer = updatePointer(event, surface) || pointers.get(event.pointerId);
    if (!pointer) return;
    var activeMode = mode;
    pointers.delete(event.pointerId);
    release(pointer);
    if (activeMode === 'pinch') {
      prevent(event);
      if (pointers.size < 2) finishPinch();
      if (!pointers.size) mode = 'idle';
      return;
    }
    if (activeMode === 'post-pinch') {
      prevent(event);
      if (!pointers.size) mode = 'idle';
      return;
    }
    if (cancelled) {
      if (!pointers.size) resetPointerState();
      prevent(event);
      return;
    }
    if (activeMode === 'selection' || selectionExists(pointer.surface)) {
      if (!pointers.size) mode = 'idle';
      return;
    }
    if (activeMode === 'pan' && pointer.pointerId === primaryId) {
      finishPan(pointer);
      primaryId = null;
      mode = pointers.size ? 'post-pan' : 'idle';
      prevent(event);
      return;
    }
    if (activeMode === 'post-pan') {
      prevent(event);
      if (!pointers.size) mode = 'idle';
      return;
    }
    primaryId = null;
    mode = pointers.size ? mode : 'idle';
    var duration = now() - pointer.startedAt;
    var movement = Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
    if (pointer.link || now() < suppressTapUntil || duration > TAP_MAX_DURATION_MS || movement > TAP_MAX_MOVEMENT_PX) return;
    var width = Math.max(1, Number(viewer?.clientWidth) || 1);
    var height = Math.max(1, Number(viewer?.clientHeight) || 1);
    var page = Number.isInteger(pointer.surface.index) ? pointer.surface.index + 1 : getCurrentPage();
    post('SINGLE_TAP', {
      page: page,
      x: Math.max(0, Math.min(width, pointer.x)),
      y: Math.max(0, Math.min(height, pointer.y)),
    });
  }

  function attach(target: any, config: any) {
    if (!target || target.__krumerPdfGestureSurface) return target?.__krumerPdfGestureSurface?.detach;
    var surface: any = {
      id: ++nextSurfaceId,
      target: target,
      doc: config?.doc || (target.nodeType === 9 ? target : null),
      frame: config?.frame || (target.nodeType === 9 ? target.defaultView?.frameElement : null),
      index: config?.index,
      root: Boolean(config?.root),
    };
    var down = function (event: any) { onPointerDown(event, surface); };
    var move = function (event: any) { onPointerMove(event, surface); };
    var up = function (event: any) { finishPointer(event, surface, false); };
    var cancel = function (event: any) { finishPointer(event, surface, true); };
    var click = function (event: any) {
      if (now() < suppressClickUntil) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
      }
    };
    target.addEventListener('pointerdown', down, { passive: false });
    target.addEventListener('pointermove', move, { passive: false });
    target.addEventListener('pointerup', up, { passive: false });
    target.addEventListener('pointercancel', cancel, { passive: false });
    target.addEventListener('lostpointercapture', cancel, { passive: false });
    target.addEventListener('click', click, true);
    surface.detach = function () {
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
      target.removeEventListener('lostpointercapture', cancel);
      target.removeEventListener('click', click, true);
      surfaces.delete(surface);
      try { delete target.__krumerPdfGestureSurface; } catch (_) { /* no-op */ }
    };
    target.__krumerPdfGestureSurface = surface;
    surfaces.add(surface);
    return surface.detach;
  }

  function resetFrames() {
    cancelInertia();
    resetPointerState();
    Array.from(surfaces).forEach(function (surface: any) {
      if (!surface.root) surface.detach();
    });
  }

  function destroy() {
    resetFrames();
    Array.from(surfaces).forEach(function (surface: any) { surface.detach(); });
  }

  return { attach: attach, destroy: destroy, resetFrames: resetFrames };
}

function inlineScript(source: string) {
  // Prevent an upstream string/comment from terminating the containing script
  // element before the browser hands it to the JavaScript parser.
  return source.replace(/<\/script/gi, '<\\/script');
}

const compatibilityBootstrap = `
  if (typeof window !== 'undefined' && !window.__KRUMER_PDF_ERROR_HOOK__) {
    window.__KRUMER_PDF_ERROR_HOOK__ = true;
    var reportRuntimeError = function (code, error, details) {
      try {
        var bridge = window.ReactNativeWebView;
        if (!bridge || typeof bridge.postMessage !== 'function') return;
        var message = error && error.stack
          ? error.stack
          : error && error.message ? error.message : String(error || 'Unknown PDF runtime error');
        var location = details && details.filename
          ? ' @' + details.filename + ':' + (details.lineno || 0) + ':' + (details.colno || 0)
          : '';
        bridge.postMessage(JSON.stringify({
          version: 1,
          id: 'pdf-web-error-' + Date.now(),
          type: 'ERROR',
          payload: { code: code, message: (String(message) + location).slice(0, 1000) },
        }));
      } catch (_) { /* no-op */ }
    };
    window.addEventListener('error', function (event) {
      reportRuntimeError('RUNTIME_SCRIPT_ERROR', event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
    window.addEventListener('unhandledrejection', function (event) {
      reportRuntimeError('RUNTIME_UNHANDLED_REJECTION', event.reason);
    });
  }
  if (typeof Promise.withResolvers !== 'function') {
    Promise.withResolvers = function () {
      var resolve;
      var reject;
      var promise = new Promise(function (nextResolve, nextReject) {
        resolve = nextResolve;
        reject = nextReject;
      });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }
  if (typeof Map.prototype.getOrInsertComputed !== 'function') {
    Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
      configurable: true,
      value: function (key, callback) {
        if (this.has(key)) return this.get(key);
        var value = callback(key, this);
        this.set(key, value);
        return value;
      },
    });
  }
  if (typeof URL.parse !== 'function') {
    URL.parse = function (input, base) {
      try { return new URL(input, base); } catch (_) { return null; }
    };
  }
`;

const workerBootstrap = `
  ${compatibilityBootstrap}
  globalThis.__KRUMER_PDF_WORKER_URL__ = URL.createObjectURL(
    new Blob([${JSON.stringify(compatibilityBootstrap)}, ${JSON.stringify(PDF_WEB_WORKER_SOURCE)}], { type: 'text/javascript' }),
  );
  globalThis.__KRUMER_PDF_TEXT_LAYER_CSS__ = ${JSON.stringify(PDF_WEB_TEXT_LAYER_CSS_SOURCE)};
  globalThis.__KRUMER_PDF_ANNOTATION_LAYER_CSS__ = ${JSON.stringify(PDF_WEB_ANNOTATION_LAYER_CSS_SOURCE)};
`;

const styleSheetPolyfill = `
  (function () {
    if (typeof ShadowRoot === 'undefined' || 'adoptedStyleSheets' in ShadowRoot.prototype) return;
    var OriginalStyleSheet = globalThis.CSSStyleSheet;
    if (!OriginalStyleSheet) {
      OriginalStyleSheet = function () { this.__krumerText = ''; };
      OriginalStyleSheet.prototype.replaceSync = function (text) { this.__krumerText = text; };
      globalThis.CSSStyleSheet = OriginalStyleSheet;
    } else if (!OriginalStyleSheet.prototype.replaceSync) {
      OriginalStyleSheet.prototype.replaceSync = function (text) { this.__krumerText = text; };
    }
    Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
      configurable: true,
      get: function () { return this.__krumerSheets || []; },
      set: function (sheets) {
        this.__krumerSheets = sheets;
        var root = this;
        Array.prototype.slice.call(root.querySelectorAll('style[data-krumer-sheet]')).forEach(function (style) { style.remove(); });
        sheets.forEach(function (sheet) {
          var style = document.createElement('style');
          style.dataset.krumerSheet = 'true';
          style.textContent = sheet.__krumerText || '';
          root.appendChild(style);
        });
      },
    });
  }());
`;

const bridgeRuntime = `
  (function () {
    'use strict';
    var BRIDGE_VERSION = 1;
    var viewer = document.getElementById('viewer');
    var book = null;
    var bookId = null;
    var generation = 0;
    var currentPage = 1;
    var totalPages = 0;
    var nextEventId = 0;
    var nextRangeId = 0;
    var pendingRanges = new Map();
    var pendingPage = null;
    var pendingDisplayMode = null;
    var currentScale = 1;
    var scaleCommitId = 0;
    var runtimeOpenedAt = 0;
    var runtimeRangeRequests = 0;
    var runtimeRangeBytes = 0;
    var runtimeRangeTimeouts = 0;
    var runtimeRangeRejected = 0;
    var runtimePagesLoaded = 0;
    var readyAttempts = 0;
    var readyPosts = 0;
    var rangeRequestTimeoutMs = 10000;
    var maxPendingRanges = 24;
    var viewportScrollFrame = null;
    var viewportScrollTarget = null;

    function eventId() {
      nextEventId += 1;
      return 'pdf-web-' + Date.now() + '-' + nextEventId;
    }

    function post(type, payload) {
      if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        version: BRIDGE_VERSION,
        id: eventId(),
        type: type,
        payload: payload || {},
      }));
    }

    function safeMessage(error) {
      var message = error && error.stack
        ? error.stack
        : error && error.message ? error.message : String(error || 'Unknown PDF error');
      return String(message).slice(0, 1000);
    }

    function reportError(code, error) {
      post('ERROR', { code: code, message: safeMessage(error) });
    }

    function postRuntimeMetrics() {
      post('RUNTIME_METRICS', {
        openMs: runtimeOpenedAt ? Math.max(0, Date.now() - runtimeOpenedAt) : 0,
        pagesLoaded: runtimePagesLoaded,
        rangeBytes: runtimeRangeBytes,
        rangeRejected: runtimeRangeRejected,
        rangeRequests: runtimeRangeRequests,
        rangeTimeouts: runtimeRangeTimeouts,
        scale: currentScale,
      });
    }

    function clampPage(page) {
      var value = Number(page);
      if (!Number.isFinite(value)) value = 1;
      return Math.max(1, Math.min(totalPages || 1, Math.round(value)));
    }

    function clampScale(scale) {
      var value = Number(scale);
      if (!Number.isFinite(value)) value = 1;
      return Math.max(0.5, Math.min(4, value));
    }

    function commitScale(nextScale, gestureMs) {
      currentScale = clampScale(nextScale);
      var commitId = ++scaleCommitId;
      viewer.setAttribute('scale-factor', String(currentScale * 100));
      // The native UI reflects the scale only after the visible render window
      // has settled. Superseded commits never report stale percentages.
      Promise.resolve(viewer.renderComplete).then(function () {
        if (!book || commitId !== scaleCommitId) return;
        post('SCALE_CHANGED', { gestureMs: gestureMs, scale: currentScale });
      });
    }

    var gestureController = (${PDF_WEB_GESTURE_CONTROLLER_SOURCE})({
      viewer: viewer,
      post: post,
      clampScale: clampScale,
      getScale: function () { return currentScale; },
      getCurrentPage: function () { return currentPage; },
      commitScale: function (nextScale, gestureMs) {
        commitScale(nextScale, gestureMs);
      },
    });
    gestureController.attach(viewer, { root: true });

    function base64ToArrayBuffer(base64) {
      var binary = globalThis.atob(base64);
      var bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes.buffer;
    }

    function requestRange(begin, end) {
      if (!bookId) return Promise.reject(new Error('PDF book is not open.'));
      if (pendingRanges.size >= maxPendingRanges) {
        runtimeRangeRejected += 1;
        return Promise.reject(new Error('PDF byte range queue is full.'));
      }
      var requestId = 'range-' + Date.now() + '-' + (++nextRangeId);
      var requestedBookId = bookId;
      runtimeRangeRequests += 1;
      runtimeRangeBytes += Math.max(0, end - begin);
      return new Promise(function (resolve, reject) {
        var timeout = setTimeout(function () {
          var pending = pendingRanges.get(requestId);
          if (!pending) return;
          pendingRanges.delete(requestId);
          runtimeRangeTimeouts += 1;
          pending.reject(new Error('PDF byte range read timed out.'));
        }, rangeRequestTimeoutMs);
        pendingRanges.set(requestId, {
          bookId: requestedBookId,
          reject: reject,
          resolve: resolve,
          timeout: timeout,
        });
        post('READ_RANGE', {
          begin: begin,
          bookId: requestedBookId,
          end: end,
          requestId: requestId,
        });
      });
    }

    function cancelViewportScroll() {
      if (viewportScrollFrame != null) cancelAnimationFrame(viewportScrollFrame);
      viewportScrollFrame = null;
      viewportScrollTarget = null;
    }

    function queueViewportScroll(fraction) {
      if (!viewer.scrolled || !Number.isFinite(fraction)) return;
      var maxTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
      var start = viewportScrollTarget == null ? viewer.scrollTop : viewportScrollTarget;
      viewportScrollTarget = Math.max(0, Math.min(
        maxTop,
        start + viewer.clientHeight * fraction,
      ));
      if (viewportScrollFrame != null) return;

      var animate = function () {
        if (!viewer.scrolled || viewportScrollTarget == null) {
          cancelViewportScroll();
          return;
        }
        var currentMaxTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);
        viewportScrollTarget = Math.max(0, Math.min(currentMaxTop, viewportScrollTarget));
        var delta = viewportScrollTarget - viewer.scrollTop;
        if (Math.abs(delta) <= 0.75) {
          viewer.scrollTop = viewportScrollTarget;
          viewportScrollFrame = null;
          viewportScrollTarget = null;
          return;
        }
        viewer.scrollTop += delta * 0.32;
        viewportScrollFrame = requestAnimationFrame(animate);
      };
      viewportScrollFrame = requestAnimationFrame(animate);
    }

    function bridgeFile(byteLength) {
      return {
        size: byteLength,
        slice: function (begin, end) {
          return { arrayBuffer: function () { return requestRange(begin, end); } };
        },
      };
    }

    function attachFrameEvents(doc, index) {
      if (!doc || doc.__krumerPdfEvents) return;
      doc.__krumerPdfEvents = true;
      gestureController.attach(doc, {
        doc: doc,
        frame: doc.defaultView && doc.defaultView.frameElement,
        index: index,
      });
      doc.addEventListener('pointerdown', cancelViewportScroll, true);
    }

    viewer.addEventListener('load', function (event) {
      var detail = event.detail || {};
      if (Number.isInteger(detail.index) && detail.index >= 0) {
        runtimePagesLoaded = Math.max(runtimePagesLoaded, detail.index + 1);
      }
      attachFrameEvents(detail.doc, detail.index || 0);
    });
    viewer.addEventListener('pointerdown', cancelViewportScroll, true);
    viewer.addEventListener('relocate', function (event) {
      var detail = event.detail || {};
      if (!Number.isInteger(detail.index) || detail.index < 0 || detail.index >= totalPages) return;
      currentPage = detail.index + 1;
      post('PAGE_CHANGED', {
        page: currentPage,
        reason: detail.reason === 'page' || detail.reason === 'scroll' || detail.reason === 'restore'
          ? detail.reason : 'unknown',
        totalPages: totalPages,
      });
    });

    function destroyCurrentBook() {
      cancelViewportScroll();
      pendingRanges.forEach(function (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('PDF book closed.'));
      });
      pendingRanges.clear();
      if (book && book.destroy) book.destroy();
      book = null;
      bookId = null;
      pendingPage = null;
      pendingDisplayMode = null;
      currentScale = 1;
      scaleCommitId += 1;
      runtimeOpenedAt = 0;
      runtimeRangeRequests = 0;
      runtimeRangeBytes = 0;
      runtimeRangeTimeouts = 0;
      runtimeRangeRejected = 0;
      runtimePagesLoaded = 0;
      gestureController.resetFrames();
      if (viewer.destroy) viewer.destroy();
      if (viewer.shadowRoot) {
        while (viewer.shadowRoot.firstChild) viewer.shadowRoot.firstChild.remove();
      }
      viewer.removeAttribute('flow');
      viewer.removeAttribute('scale-factor');
      viewer.removeAttribute('zoom');
    }

    globalThis.__KRUMER_PDF_GO_TO__ = function (destination) {
      if (!book || !book.resolveHref) return;
      Promise.resolve(book.resolveHref(JSON.stringify(destination)))
        .then(function (target) {
          if (book && target) return viewer.goTo(Promise.resolve(target));
          return null;
        })
        .catch(function (error) { reportError('LINK_FAILED', error); });
    };

    async function openBook(payload) {
      var myGeneration = ++generation;
      var openStage = 'validate';
      destroyCurrentBook();
      if (!payload || !payload.bookId || !Number.isInteger(payload.byteLength) || payload.byteLength < 1) {
        reportError('INVALID_BOOK', new Error('PDF byte length is unavailable.'));
        return;
      }
      runtimeOpenedAt = Date.now();
      bookId = payload.bookId;
      try {
        globalThis.__KRUMER_PDF_PROGRESS__ = function (info) {
          if (myGeneration !== generation || !info || !info.total) return;
          post('LOAD_PROGRESS', { progress: Math.max(0, Math.min(1, info.loaded / info.total)) });
        };
        openStage = 'make-pdf';
        var nextBook = await globalThis.__KRUMER_MAKE_PDF__(bridgeFile(payload.byteLength));
        if (myGeneration !== generation) {
          if (nextBook && nextBook.destroy) nextBook.destroy();
          return;
        }
        book = nextBook;
        totalPages = book.sections.length;
        currentPage = clampPage(pendingPage == null ? payload.initialPage : pendingPage);
        currentScale = clampScale(payload.scale);
        viewer.setAttribute('spread', 'none');
        openStage = 'open-viewer';
        viewer.open(book);
        var nextDisplayMode = pendingDisplayMode || payload.displayMode;
        if (nextDisplayMode === 'scroll') {
          viewer.setAttribute('flow', 'scrolled');
          viewer.setAttribute('zoom', 'fit-width');
        } else {
          viewer.removeAttribute('flow');
          viewer.setAttribute('zoom', 'fit-page');
        }
        viewer.setAttribute('scale-factor', String(currentScale * 100));
        openStage = 'position-page';
        await viewer.goTo(Promise.resolve({ index: currentPage - 1 }));
        post('BOOK_OPENED', {
          bookId: bookId,
          height: Math.max(1, Math.round(book.rendition.viewport.height)),
          page: currentPage,
          totalPages: totalPages,
          width: Math.max(1, Math.round(book.rendition.viewport.width)),
        });
        postRuntimeMetrics();
      } catch (error) {
        if (myGeneration === generation) {
          destroyCurrentBook();
          reportError('OPEN_FAILED', new Error(openStage + ': ' + safeMessage(error)));
        }
      }
    }

    async function receive(raw) {
      var command;
      try { command = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return; }
      if (!command || command.version !== BRIDGE_VERSION || !command.payload) return;
      var payload = command.payload;
      try {
        if (command.type === 'OPEN_BOOK') return openBook(payload);
        if (command.type === 'CLOSE_BOOK') { generation += 1; destroyCurrentBook(); return; }
        if (command.type === 'READ_RANGE_RESULT') {
          var pending = pendingRanges.get(payload.requestId);
          if (!pending || payload.bookId !== pending.bookId) return;
          pendingRanges.delete(payload.requestId);
          clearTimeout(pending.timeout);
          if (payload.error) pending.reject(new Error(payload.error));
          else if (typeof payload.dataBase64 === 'string') pending.resolve(base64ToArrayBuffer(payload.dataBase64));
          else pending.reject(new Error('Empty PDF byte range.'));
          return;
        }
        if (!book) {
          if (command.type === 'SET_PAGE') pendingPage = payload.page;
          if (command.type === 'SET_DISPLAY_MODE') pendingDisplayMode = payload.displayMode;
          return;
        }
        if (command.type === 'SET_PAGE') {
          cancelViewportScroll();
          currentPage = clampPage(payload.page);
          await viewer.goTo(Promise.resolve({ index: currentPage - 1 }));
          return;
        }
        if (command.type === 'SET_SCALE') {
          commitScale(payload.scale);
          return;
        }
        if (command.type === 'SET_DISPLAY_MODE') {
          cancelViewportScroll();
          if (payload.displayMode === 'scroll') {
            viewer.setAttribute('flow', 'scrolled');
            viewer.setAttribute('zoom', 'fit-width');
          } else {
            viewer.removeAttribute('flow');
            viewer.setAttribute('zoom', 'fit-page');
          }
          return;
        }
        if (command.type === 'SCROLL_BY_VIEWPORT') {
          queueViewportScroll(Number(payload.fraction));
        }
      } catch (error) {
        reportError('COMMAND_FAILED', error);
      }
    }

    globalThis.KrumerPdfBridge = { receive: receive };
    function announceReady() {
      if (readyPosts >= 3 || readyAttempts >= 100) return;
      readyAttempts += 1;
      var bridge = window.ReactNativeWebView;
      if (bridge && typeof bridge.postMessage === 'function') {
        try {
          post('READY', { engine: 'pdf.js', engineVersion: '5.5.207' });
          readyPosts += 1;
        } catch (_) {
          setTimeout(announceReady, 50);
          return;
        }
        setTimeout(announceReady, 250);
        return;
      }
      setTimeout(announceReady, 50);
    }
    setTimeout(announceReady, 0);
  }());
`;

export const PDF_WEB_RUNTIME_HTML = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; base-uri \'none\'; form-action \'none\'; object-src \'none\'; script-src \'nonce-krumer-pdf-runtime\' \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data: blob:; frame-src blob:; child-src blob:; worker-src blob:">',
  '<style nonce="krumer-pdf-runtime">html,body,#viewer{height:100%;margin:0;width:100%;overflow:hidden}html,body{background:#000}#viewer{display:block;position:absolute;inset:0;background:#000}</style>',
  `<script nonce="${RUNTIME_NONCE}">${inlineScript(workerBootstrap)}${inlineScript(styleSheetPolyfill)}</script>`,
  `<script type="module" nonce="${RUNTIME_NONCE}">${inlineScript(PDF_WEB_PDFJS_SOURCE)}</script>`,
  `<script type="module" nonce="${RUNTIME_NONCE}">${inlineScript(PDF_WEB_FOLIATE_PDF_SOURCE)}\nglobalThis.__KRUMER_MAKE_PDF__ = makePDF;</script>`,
  `<script type="module" nonce="${RUNTIME_NONCE}">${inlineScript(PDF_WEB_FOLIATE_FIXED_LAYOUT_SOURCE)}</script>`,
  '</head><body><foliate-fxl id="viewer"></foliate-fxl>',
  `<script type="module" nonce="${RUNTIME_NONCE}">${inlineScript(bridgeRuntime)}</script>`,
  '</body></html>',
].join('');
