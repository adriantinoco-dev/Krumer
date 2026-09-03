// The React Native WebView runtime injects PDF.js and its worker as local
// module/blob sources. Keep the path helper for the upstream APIs that expose
// resource URLs, but do not depend on a filesystem URL inside the WebView.
const pdfjsPath = path => `/vendor/pdfjs/${path}`

let pdfjsLib
let pdfjsLibPromise
const loadPDFJS = async () => {
    if (!pdfjsLibPromise) {
        pdfjsLibPromise = Promise.resolve().then(() => {
            pdfjsLib = globalThis.pdfjsLib
            if (!pdfjsLib) throw new Error('PDF.js global was not initialized')
            const workerSrc = globalThis.__KRUMER_PDF_WORKER_URL__
            if (workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
            return pdfjsLib
        })
    }
    return pdfjsLibPromise
}

const DC_NS = 'http://purl.org/dc/elements/1.1/'
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const CALIBRE_NS = 'http://calibre-ebook.com/xmp-namespace'
const CALIBRE_SI_NS = 'http://calibre-ebook.com/xmp-namespace-series-index'

/** @typedef {string | number[] | Uint8Array | null | undefined} PDFMetadataValue */
/** @typedef {Record<string, PDFMetadataValue>} PDFInfo */

// PDF 32000-1, Table D.2. This mirrors pdf.js's stringToPDFString so Info
// dictionary values read natively have the same Unicode representation as
// values returned by PDFDocumentProxy.getMetadata().
const PDF_STRING_TRANSLATE_TABLE = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0x2d8, 0x2c7, 0x2c6, 0x2d9, 0x2dd, 0x2db, 0x2da, 0x2dc,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x192, 0x2044,
    0x2039, 0x203a, 0x2212, 0x2030, 0x201e, 0x201c, 0x201d, 0x2018,
    0x2019, 0x201a, 0x2122, 0xfb01, 0xfb02, 0x141, 0x152, 0x160,
    0x178, 0x17d, 0x131, 0x142, 0x153, 0x161, 0x17e, 0, 0x20ac,
]

/** @param {number[] | Uint8Array} value */
const toUint8Array = value => value instanceof Uint8Array ? value : new Uint8Array(value)

const removeEscapeSequences = value => {
    let result = ''
    let escaping = false
    for (const char of value) {
        if (char.charCodeAt(0) === 0x1b) {
            escaping = !escaping
        } else if (!escaping) {
            result += char
        }
    }
    return result
}

/** @param {PDFMetadataValue} value */
export const decodePDFString = value => {
    if (value == null || typeof value === 'string') return value
    let bytes = toUint8Array(value)
    let encoding
    if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be'
    else if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le'
    else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) encoding = 'utf-8'
    if (encoding) {
        if (encoding.startsWith('utf-16') && bytes.length % 2 === 1) bytes = bytes.slice(0, -1)
        try {
            return removeEscapeSequences(new TextDecoder(encoding, { fatal: true }).decode(bytes))
        } catch {
            // Match pdf.js: fall through to PDFDocEncoding when BOM decoding fails.
        }
    }
    const chars = []
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i]
        if (byte === 0x1b) {
            while (++i < bytes.length && bytes[i] !== 0x1b) {
                // Skip the escape sequence.
            }
            continue
        }
        const code = PDF_STRING_TRANSLATE_TABLE[byte]
        chars.push(String.fromCharCode(code || byte))
    }
    return chars.join('')
}

/** @param {PDFMetadataValue} value */
const decodeXMP = value => {
    if (!value) return null
    const raw = typeof value === 'string'
        ? value
        : new TextDecoder('utf-8').decode(toUint8Array(value))
    return raw.replace(/^[^<]+/, '').replaceAll(/>\\376\\377([^<]+)/g, (all, codes) => {
        const bytes = codes.replaceAll(/\\([0-3])([0-7])([0-7])/g,
            (code, d1, d2, d3) => String.fromCharCode(d1 * 64 + d2 * 8 + d3))
            .replaceAll(/&(amp|apos|gt|lt|quot);/g, (str, name) => ({
                amp: '&', apos: "'", gt: '>', lt: '<', quot: '"',
            })[name])
        const chars = ['>']
        for (let i = 0; i < bytes.length; i += 2) {
            const code = bytes.charCodeAt(i) * 256 + bytes.charCodeAt(i + 1)
            chars.push(code >= 32 && code < 127 && code !== 60 && code !== 62 && code !== 38
                ? String.fromCharCode(code)
                : `&#x${(0x10000 + code).toString(16).substring(1)};`)
        }
        return chars.join('')
    })
}

const parseXMP = raw => {
    if (!raw) return { doc: null, values: new Map() }
    let doc
    try {
        doc = new DOMParser().parseFromString(raw, 'application/xml')
    } catch {
        return { doc: null, values: new Map() }
    }
    if (doc.getElementsByTagName('parsererror').length) {
        return { doc: null, values: new Map() }
    }
    const values = new Map()
    for (const description of doc.getElementsByTagNameNS(RDF_NS, 'Description')) {
        for (const entry of description.children) {
            if (entry.namespaceURI !== DC_NS) continue
            const name = `dc:${entry.localName.toLowerCase()}`
            if (name === 'dc:creator' || name === 'dc:subject') {
                const container = entry.firstElementChild
                const items = container
                    ? Array.from(container.children)
                        .filter(item => item.namespaceURI === RDF_NS && item.localName === 'li')
                        .map(item => item.textContent.trim())
                    : []
                values.set(name, items)
            } else {
                values.set(name, entry.textContent.trim())
            }
        }
    }
    return { doc, values }
}

const getInfo = (info, name) =>
    decodePDFString(info?.[name] ?? info?.[name.toLowerCase()]) ?? undefined

const getCalibreSeries = doc => {
    const series = doc?.getElementsByTagNameNS(CALIBRE_NS, 'series').item(0)
    const name = series?.getElementsByTagNameNS(RDF_NS, 'value').item(0)?.textContent?.trim()
    if (!name) return null
    const position = series.getElementsByTagNameNS(CALIBRE_SI_NS, 'series_index')
        .item(0)?.textContent?.trim()
    return position ? { name, position } : { name }
}

/**
 * Normalize PDF Info/XMP into the metadata shape used by the full reader.
 * @param {{ info?: PDFInfo, xmp?: PDFMetadataValue }} [input]
 */
export const parsePDFMetadata = ({ info = {}, xmp = null } = {}) => {
    const raw = decodeXMP(xmp)
    const { doc, values } = parseXMP(raw)
    const metadata = {
        title: values.get('dc:title') ?? getInfo(info, 'Title'),
        author: values.get('dc:creator') ?? getInfo(info, 'Author'),
        contributor: values.get('dc:contributor'),
        description: values.get('dc:description') ?? getInfo(info, 'Subject'),
        language: values.get('dc:language'),
        publisher: values.get('dc:publisher'),
        subject: values.get('dc:subject'),
        identifier: values.get('dc:identifier'),
        source: values.get('dc:source'),
        rights: values.get('dc:rights'),
    }
    const series = getCalibreSeries(doc)
    if (series) metadata.belongsTo = { series }
    return metadata
}

const fetchText = async url => await (await fetch(url)).text()

// The OS accessibility "font size" setting scales every piece of WebView-rendered
// text (including this transparent selection/highlight text layer) but leaves the
// page's canvas bitmap untouched. Only the glyph *size* (a font-size) is scaled;
// the text layer's positions are percentages of the `--total-scale-factor`-sized
// container and are not. Left uncorrected the glyphs render `fontScale`x larger
// than the ones baked into the canvas, so selection and highlight rectangles
// overshoot the text into the blank margins and sit too low (readest #4480).
// Measure the scale here so render() can divide it back out of the glyph-size
// lever only. offsetHeight of a 100px/line-height-1 box reflects the OS font
// scaling but not devicePixelRatio or CSS transforms, so it isolates it.
const getFontScale = doc => {
    const probe = doc.createElement('div')
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'
        + 'font-size:100px;line-height:1;text-size-adjust:none;-webkit-text-size-adjust:none'
    probe.textContent = 'x'
    doc.body.append(probe)
    const fontScale = probe.offsetHeight / 100
    probe.remove()
    return fontScale > 0 ? fontScale : 1
}

let textLayerBuilderCSS = null
let annotationLayerBuilderCSS = null

// Track active render tasks per iframe document to cancel superseded renders
const activeRenderTasks = new WeakMap()
// Generation counter per document to detect stale renders after async gaps
const renderGenerations = new WeakMap()
const layerGenerations = new WeakMap()
const renderedStates = new WeakMap()
const layerStates = new WeakMap()
const layerWorkByDocument = new WeakMap()
const renderWorkByDocument = new WeakMap()
const textContentCache = new WeakMap()
const annotationsCache = new WeakMap()
// Keep PDF.js raster work bounded across every iframe in the WebView. A scale
// commit can touch a visible page, its neighbours and a detached preload in the
// same tick; letting each iframe render independently stalls gestures and
// multiplies peak canvas memory. The queue always serves visible pages first.
const MAX_CONCURRENT_PAGE_RENDERS = 2
const renderQueue = []
const queuedRenderByDocument = new WeakMap()
const visualScales = new WeakMap()
let activePageRenders = 0
let nextRenderRequestId = 0

// iOS kills the WKWebView content process when it exceeds a per-process memory
// high-water limit (~2 GB). A device crash log for readest #5118 shows the
// foreground WebContent process reaching 2.1 GB while paging a PDF, right before
// the reader "closed". Both a page's canvas bitmap and its WebKit backing layer
// are allocated at the render scale, so their memory grows with the SQUARE of the
// device pixel ratio. Phones report dpr 3, which is the tipping factor.
// Rendering at 2x instead of 3x is still retina-sharp but uses ~2.25x less memory
// per page (the crisp, selectable text layer is a separate DOM layer, unaffected).
const MAX_RENDER_DPR = 2
const MAX_VISIBLE_RENDER_DPR = 2.5
// A visible Android page gets a larger bitmap budget after a committed zoom so
// text remains legible at 200–400%. Neighbours and detached preloads stay cheaper;
// only two bitmaps can be built concurrently (see the queue above), keeping the
// larger visible budget from becoming a multiplicative memory spike.
const MAX_VISIBLE_CANVAS_PIXELS = 4096 * 2048
const MAX_NEAR_CANVAS_PIXELS = 2048 * 2048
// While the virtualised scroll window is moving, use the same nominal bitmap
// budget as Readest. The committed idle render keeps the larger visible budget
// above, so this is a temporary frame-time guard rather than a quality change.
const MAX_SCROLL_CANVAS_PIXELS = 2048 * 1536
const MAX_BACKGROUND_CANVAS_PIXELS = 2048 * 1536

// Only mobile WebViews get that budget. Desktop browsers have no per-process
// memory ceiling, and a page fitted to a desktop window is several times the
// budget on its own, so clamping there bought nothing and cost sharpness: the
// raster ended up coarser than the screen, the browser upscaled it into the CSS
// box, and PDF text looked blurry (readest #5251). iPadOS reports a desktop
// ("Macintosh") user agent, so touch points are what give a tablet away.
const isMobileWebView = () => {
    const ua = navigator.userAgent
    return /Android|iPhone|iPad|iPod/i.test(ua)
        || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

// The device pixel ratio to rasterise this page at: the real dpr on desktop, or
// on mobile the dpr clamped by both MAX_RENDER_DPR and the per-canvas pixel
// budget. Never below 1 (CSS resolution).
export const getRenderDpr = (page, zoom, priority = 0, scrolling = false) => {
    let dpr = devicePixelRatio || 1
    if (isMobileWebView()) {
        const android = /Android/i.test(navigator.userAgent)
        const dprLimit = priority === 0 && android && !scrolling ? MAX_VISIBLE_RENDER_DPR : MAX_RENDER_DPR
        const pixelBudget = scrolling
            ? MAX_SCROLL_CANVAS_PIXELS
            : priority === 0
            ? android ? MAX_VISIBLE_CANVAS_PIXELS : MAX_NEAR_CANVAS_PIXELS
            : priority === 1 ? MAX_NEAR_CANVAS_PIXELS : MAX_BACKGROUND_CANVAS_PIXELS
        dpr = Math.min(dpr, dprLimit)
        const { width, height } = page.getViewport({ scale: zoom || 1 })
        const area = width * height * dpr * dpr
        if (area > pixelBudget) dpr *= Math.sqrt(pixelBudget / area)
    }
    return Math.max(1, dpr)
}

export const planProgressiveRender = ({
    color, desiredDpr, previewDpr, priority, rendered, scale, work,
}) => {
    const renderedMatches = rendered
        && rendered.color === color
        && Math.abs(rendered.scale - scale) <= 0.001
    if (renderedMatches && (rendered.dpr + 0.001 >= desiredDpr || priority === 0)) {
        return { action: 'reuse', upgrade: rendered.dpr + 0.001 < desiredDpr }
    }
    const workMatches = work
        && work.color === color
        && Math.abs(work.zoom - scale) <= 0.001
    if (workMatches && priority === 0) {
        return { action: 'promote', upgrade: work.dpr + 0.001 < desiredDpr }
    }
    if (workMatches && work.dpr + 0.001 >= desiredDpr) {
        return { action: 'reuse-work', upgrade: false }
    }
    if (priority === 0 && previewDpr + 0.001 < desiredDpr) {
        return { action: 'preview', upgrade: true }
    }
    return { action: 'render', upgrade: false }
}

const setLayerScale = (element, zoom) => {
    element.style.setProperty('--total-scale-factor', zoom)
    element.style.setProperty('--user-unit', '1')
    element.style.setProperty('--scale-round-x', '1px')
    element.style.setProperty('--scale-round-y', '1px')
}

const applyVisualScale = (doc, rasterScale) => {
    const ratio = (visualScales.get(doc) ?? rasterScale) / rasterScale
    doc.body.style.transformOrigin = 'top left'
    doc.body.style.transform = `scale(${ratio})`
}

const isDocumentAttached = doc => {
    const view = doc?.defaultView
    const frame = view?.frameElement
    return Boolean(view && (!frame || frame.isConnected))
}

const getCachedTextContent = page => {
    let pending = textContentCache.get(page)
    if (!pending) {
        pending = page.getTextContent()
        textContentCache.set(page, pending)
    }
    return pending
}

const getCachedAnnotations = page => {
    let pending = annotationsCache.get(page)
    if (!pending) {
        pending = page.getAnnotations().then(items =>
            items.filter(annotation => annotation?.subtype !== 'Link'))
        annotationsCache.set(page, pending)
    }
    return pending
}

const scheduleInteractionLayers = (page, doc, zoom) => {
    if (!doc || !isDocumentAttached(doc)) return Promise.resolve(false)
    const current = layerStates.get(doc)
    if (current && Math.abs(current.scale - zoom) <= 0.001) return Promise.resolve(true)
    const existing = layerWorkByDocument.get(doc)
    if (existing && Math.abs(existing.scale - zoom) <= 0.001) return existing.promise

    const generation = (layerGenerations.get(doc) || 0) + 1
    layerGenerations.set(doc, generation)
    const promise = new Promise(resolve => setTimeout(async () => {
        const container = doc.querySelector('.textLayer')
        const div = doc.querySelector('.annotationLayer')
        if (!container || !div || !isDocumentAttached(doc)) return resolve(false)
        const viewport = page.getViewport({ scale: zoom })
        const stagedText = doc.createElement('div')
        const stagedAnnotations = doc.createElement('div')
        stagedText.className = 'textLayer'
        stagedAnnotations.className = 'annotationLayer'
        setLayerScale(stagedText, zoom)
        setLayerScale(stagedAnnotations, zoom)
        try {
            const textLayer = new pdfjsLib.TextLayer({
                textContentSource: await getCachedTextContent(page),
                container: stagedText,
                viewport,
            })
            await textLayer.render()
            const fontScale = getFontScale(doc)
            if (fontScale !== 1) stagedText.style.setProperty('--text-scale-factor',
                `calc(var(--total-scale-factor) * var(--min-font-size) / ${fontScale})`)
            for (const hiddenCanvas of doc.querySelectorAll('.hiddenCanvasElement'))
                Object.assign(hiddenCanvas.style, {
                    position: 'absolute', top: '0', left: '0', width: '0', height: '0', display: 'none',
                })
            const endOfContent = doc.createElement('div')
            endOfContent.className = 'endOfContent'
            stagedText.append(endOfContent)
            const linkService = {
                goToDestination: destination => globalThis.__KRUMER_PDF_GO_TO__?.(destination),
                getDestinationHash: dest => `#krumer-pdf-dest=${encodeURIComponent(JSON.stringify(dest))}`,
                getAnchorUrl: () => '',
                addLinkAttributes: link => {
                    link.removeAttribute?.('href')
                    link.removeAttribute?.('target')
                    link.style.pointerEvents = 'none'
                },
            }
            await new pdfjsLib.AnnotationLayer({
                page, viewport, div: stagedAnnotations, linkService,
            }).render({ annotations: await getCachedAnnotations(page) })
        } catch {
            return resolve(false)
        }
        const visual = renderedStates.get(doc)
        if (layerGenerations.get(doc) !== generation
            || !visual || Math.abs(visual.scale - zoom) > 0.001
            || !isDocumentAttached(doc)) return resolve(false)
        container.style.cssText = stagedText.style.cssText
        div.style.cssText = stagedAnnotations.style.cssText
        container.replaceChildren(...stagedText.childNodes)
        div.replaceChildren(...stagedAnnotations.childNodes)
        container.style.removeProperty('visibility')
        container.style.removeProperty('pointer-events')
        div.style.removeProperty('visibility')
        div.style.removeProperty('pointer-events')
        layerStates.set(doc, { scale: zoom })
        const index = Number(doc.defaultView?.frameElement?.dataset.sectionIndex)
        globalThis.__KRUMER_PDF_RENDER_EVENT__?.({ index, phase: 'layers', scale: zoom })
        doc.dispatchEvent(new CustomEvent('krumer-pdf-layers-ready'))
        resolve(true)
    }, 0)).finally(() => {
        if (layerWorkByDocument.get(doc)?.generation === generation) {
            layerWorkByDocument.delete(doc)
        }
    })
    layerWorkByDocument.set(doc, { generation, promise, scale: zoom })
    return promise
}

const render = async (page, doc, zoom, pageColors, priority = 0, scrolling = false) => {
    if (!doc || !isDocumentAttached(doc)) return false
    const generation = (renderGenerations.get(doc) || 0) + 1
    renderGenerations.set(doc, generation)
    const existingTask = activeRenderTasks.get(doc)
    if (existingTask) {
        existingTask.cancel()
        activeRenderTasks.delete(doc)
    }

    const renderDpr = getRenderDpr(page, zoom, priority, scrolling)
    const renderViewport = page.getViewport({ scale: zoom * renderDpr })
    const displayViewport = page.getViewport({ scale: zoom })
    const canvas = doc.createElement('canvas')
    canvas.height = renderViewport.height
    canvas.width = renderViewport.width
    canvas.style.width = `${displayViewport.width}px`
    canvas.style.height = `${displayViewport.height}px`
    const renderTask = page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: renderViewport,
        pageColors,
    })
    activeRenderTasks.set(doc, renderTask)
    try {
        await renderTask.promise
    } catch {
        canvas.width = 0
        canvas.height = 0
        return false
    } finally {
        if (activeRenderTasks.get(doc) === renderTask) activeRenderTasks.delete(doc)
    }
    if (renderGenerations.get(doc) !== generation || !isDocumentAttached(doc)) {
        canvas.width = 0
        canvas.height = 0
        return false
    }
    const canvasElement = doc.querySelector('#canvas')
    const container = doc.querySelector('.textLayer')
    const div = doc.querySelector('.annotationLayer')
    if (!canvasElement || !container || !div) {
        canvas.width = 0
        canvas.height = 0
        return false
    }
    const oldCanvas = canvasElement.querySelector('canvas')
    const existingLayers = layerStates.get(doc)
    if (!existingLayers || Math.abs(existingLayers.scale - zoom) > 0.001) {
        container.style.visibility = 'hidden'
        container.style.pointerEvents = 'none'
        div.style.visibility = 'hidden'
        div.style.pointerEvents = 'none'
    }
    setLayerScale(doc.documentElement, zoom)
    canvasElement.replaceChildren(canvas)
    renderedStates.set(doc, {
        color: JSON.stringify(pageColors ?? null),
        dpr: renderDpr,
        generation,
        scale: zoom,
    })
    applyVisualScale(doc, zoom)
    if (oldCanvas) {
        oldCanvas.width = 0
        oldCanvas.height = 0
    }
    globalThis.__KRUMER_PDF_RENDER_EVENT__?.({
        dpr: renderDpr,
        index: Number(doc.defaultView?.frameElement?.dataset.sectionIndex),
        phase: priority === 0 ? 'final' : 'preview',
        scale: zoom,
    })
    return true
}

const drainRenderQueue = () => {
    renderQueue.sort((a, b) => a.queuePriority - b.queuePriority || a.id - b.id)
    while (activePageRenders < MAX_CONCURRENT_PAGE_RENDERS && renderQueue.length) {
        const request = renderQueue.shift()
        if (!request || request.cancelled) continue
        if (!isDocumentAttached(request.doc)) {
            request.resolve(false)
            continue
        }
        request.started = true
        if (queuedRenderByDocument.get(request.doc) === request) {
            queuedRenderByDocument.delete(request.doc)
        }
        activePageRenders++
        Promise.resolve(render(
            request.page,
            request.doc,
            request.zoom,
            request.pageColors,
            request.priority,
            request.scrolling,
        )).then(rendered => request.resolve(rendered === true))
            .catch(() => request.resolve(false))
            .finally(() => {
                if (renderWorkByDocument.get(request.doc) === request) {
                    renderWorkByDocument.delete(request.doc)
                }
                activePageRenders = Math.max(0, activePageRenders - 1)
                drainRenderQueue()
            })
    }
}

const queueRaster = (page, doc, zoom, pageColors, priority, scrolling = false) => {
    let resolveRequest
    const promise = new Promise(resolve => { resolveRequest = resolve })
    const request = {
        cancelled: false,
        color: JSON.stringify(pageColors ?? null),
        doc,
        dpr: getRenderDpr(page, zoom, priority, scrolling),
        id: ++nextRenderRequestId,
        page,
        pageColors,
        priority,
        promise,
        queuePriority: priority,
        resolve: resolveRequest,
        scrolling,
        started: false,
        zoom,
    }
    queuedRenderByDocument.set(doc, request)
    renderWorkByDocument.set(doc, request)
    renderQueue.push(request)
    drainRenderQueue()
    return promise
}

const queueFinalUpgrade = (page, doc, zoom, pageColors) => {
    setTimeout(() => {
        if (!isDocumentAttached(doc)) return
        const desiredDpr = getRenderDpr(page, zoom, 0)
        const current = renderedStates.get(doc)
        if (current
            && current.color === JSON.stringify(pageColors ?? null)
            && Math.abs(current.scale - zoom) <= 0.001
            && current.dpr + 0.001 >= desiredDpr) return
        const work = renderWorkByDocument.get(doc)
        if (work && Math.abs(work.zoom - zoom) <= 0.001 && work.dpr + 0.001 >= desiredDpr) return
        queueRaster(page, doc, zoom, pageColors, 0)
    }, 0)
}

export const scheduleRender = (page, doc, zoom, pageColors, priority = 0, deferQuality = false) => {
    if (!doc || !isDocumentAttached(doc)) return Promise.resolve(false)
    priority = Math.max(0, Number(priority) || 0)
    deferQuality = Boolean(deferQuality)
    visualScales.set(doc, zoom)
    const rendered = renderedStates.get(doc)
    const work = renderWorkByDocument.get(doc)
    // Keep this page's canvas and text at their original raster scale. Zoom
    // only transforms the existing content, including while its first render
    // is pending; it must not rebuild the page after each pinch.
    zoom = rendered?.scale ?? work?.zoom ?? zoom
    if (rendered) applyVisualScale(doc, rendered.scale)
    const color = JSON.stringify(pageColors ?? null)
    const desiredDpr = getRenderDpr(page, zoom, priority, deferQuality)
    const previewDpr = getRenderDpr(page, zoom, 1, deferQuality)
    const plan = planProgressiveRender({
        color, desiredDpr, previewDpr, priority, rendered, scale: zoom, work,
    })
    if (plan.action === 'reuse') {
        if (priority === 0 && !deferQuality) {
            scheduleInteractionLayers(page, doc, zoom)
            if (plan.upgrade) queueFinalUpgrade(page, doc, zoom, pageColors)
        }
        return Promise.resolve(true)
    }

    if (work && (plan.action === 'promote' || plan.action === 'reuse-work')) {
        if (plan.action === 'promote') {
            // A detached/nearby preload becomes the visible preview. Its
            // promise is reused; only the eventual higher-DPR upgrade is new.
            work.queuePriority = 0
            const promoted = work.promise.then(ready => {
                if (ready && !deferQuality) {
                    scheduleInteractionLayers(page, doc, zoom)
                    if (plan.upgrade) queueFinalUpgrade(page, doc, zoom, pageColors)
                }
                return ready
            })
            renderQueue.sort((a, b) => a.queuePriority - b.queuePriority || a.id - b.id)
            return promoted
        }
        return work.promise
    }

    if (work) {
        if (!work.started) {
            work.cancelled = true
            work.resolve(false)
            if (queuedRenderByDocument.get(doc) === work) queuedRenderByDocument.delete(doc)
        } else {
            activeRenderTasks.get(doc)?.cancel()
        }
    }

    if (priority !== 0) return queueRaster(page, doc, zoom, pageColors, priority, deferQuality)
    const previewPriority = plan.action === 'preview' ? 1 : 0
    const preview = queueRaster(page, doc, zoom, pageColors, previewPriority, deferQuality)
    return preview.then(ready => {
        if (ready && !deferQuality) {
            scheduleInteractionLayers(page, doc, zoom)
            if (previewPriority !== 0) queueFinalUpgrade(page, doc, zoom, pageColors)
        }
        return ready
    })
}

const renderPage = async (page, getImageBlob) => {
    const viewport = page.getViewport({ scale: 1 })
    if (getImageBlob) {
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width
        const canvasContext = canvas.getContext('2d')
        await page.render({ canvasContext, viewport }).promise
        return new Promise(resolve => canvas.toBlob(blob => {
            // Release canvas bitmap memory after extracting the blob
            canvas.width = 0
            canvas.height = 0
            resolve(blob)
        }))
    }
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/text_layer_builder.css
    if (textLayerBuilderCSS == null) {
        textLayerBuilderCSS = globalThis.__KRUMER_PDF_TEXT_LAYER_CSS__ || ''
    }
    // https://github.com/mozilla/pdf.js/blob/642b9a5ae67ef642b9a8808fd9efd447e8c350e2/web/annotation_layer_builder.css
    if (annotationLayerBuilderCSS == null) {
        annotationLayerBuilderCSS = globalThis.__KRUMER_PDF_ANNOTATION_LAYER_CSS__ || ''
    }
    const data = `
        <!DOCTYPE html>
        <html lang="en">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
        html, body {
            margin: 0;
            padding: 0;
            touch-action: none;
            overscroll-behavior: none;
        }
        ${textLayerBuilderCSS}
        ${annotationLayerBuilderCSS}
        </style>
        <div id="canvas"></div>
        <div class="textLayer"></div>
        <div class="annotationLayer"></div>
    `
    const src = URL.createObjectURL(new Blob([data], { type: 'text/html' }))
    const onZoom = ({ doc, scale, pageColors, priority = 0, deferQuality = false }) =>
        scheduleRender(page, doc, scale, pageColors, priority, deferQuality)
    return { src, data, onZoom }
}

const makeTOCItem = async (item, pdf) => {
    let pageIndex = undefined

    if (item.dest) {
        try {
            const dest = typeof item.dest === 'string'
                ? await pdf.getDestination(item.dest)
                : item.dest
            if (dest?.[0]) {
                pageIndex = await pdf.getPageIndex(dest[0])
            }
        } catch (e) {
            console.warn('Failed to get page index for TOC item:', item.title, e)
        }
    }

    return {
        label: item.title,
        href: item.dest ? JSON.stringify(item.dest) : '',
        index: pageIndex,
        subitems: item.items?.length
            ? await Promise.all(item.items.map(i => makeTOCItem(i, pdf)))
            : null,
    }
}

// Cache of decoded pdf.js page objects and their rendered HTML blobs. These are
// cheap (page metadata + a small blob URL, not the large canvas bitmap, which
// lives in the visible iframe) so this can comfortably exceed the live-canvas
// cap in fixed-layout's scroll mode, sparing a re-parse when the reader scrolls
// back over a recently seen page.
const MAX_CACHED_PAGES = 16

// Maximum number of range reads to keep in flight at once. While parsing a
// large PDF's cross-reference and object streams, pdf.js can request hundreds
// of byte ranges in a single burst. A real HTTP transport is implicitly
// throttled by the browser's per-host connection limit (~6); the custom file
// schemes readest serves these reads through (Android's `rangefile` /
// `shouldInterceptRequest`, iOS' native file bridge) have no such limit. Keep
// the same browser-like bound explicitly: six 1 MiB reads improve startup for
// non-linearized PDFs without flooding the native handler or the WebView heap.
const MAX_CONCURRENT_RANGES = 6

export const makePDF = async (file, options = {}) => {
    await loadPDFJS()
    const transport = new pdfjsLib.PDFDataRangeTransport(file.size, [])
    // Bound the concurrent range reads instead of dispatching them all at once.
    let active = 0
    const queue = []
    const pump = () => {
        while (active < MAX_CONCURRENT_RANGES && queue.length) {
            const [begin, end] = queue.shift()
            active++
            file.slice(begin, end).arrayBuffer()
                .then(chunk => transport.onDataRange(begin, chunk))
                .finally(() => { active--; pump() })
        }
    }
    transport.requestDataRange = (begin, end) => {
        queue.push([begin, end])
        pump()
    }
    const loadingTask = pdfjsLib.getDocument({
        range: transport,
        // Resource URLs are intentionally omitted: this runtime is fully
        // self-contained and the byte transport supplies the PDF data.
        useWorkerFetch: false,
        useWorkerStream: false,
        // Non-linearized comic PDFs may need the whole cross-reference and
        // object streams before the first page is available. A 1 MiB chunk
        // keeps that startup bounded to fewer native/WebView range requests;
        // the transport still limits in-flight reads to six.
        rangeChunkSize: 1024 * 1024,
        // Rendering into a same-origin iframe gives that document its own
        // FontFaceSet. PDF.js otherwise installs embedded @font-face rules in
        // the top-level WebView document, leaving glyphs in the iframe as tofu
        // boxes on Android. The built-in path renderer is document-independent
        // and keeps the selectable text layer intact.
        disableFontFace: true,
        // Keep a system fallback for the PDF standard-14 fonts while embedded
        // fonts use the path renderer above.
        useSystemFonts: true,
        isEvalSupported: false,
    })
    if (globalThis.__KRUMER_PDF_PROGRESS__) {
        loadingTask.onProgress = globalThis.__KRUMER_PDF_PROGRESS__
    }
    const pdf = await loadingTask.promise

    const cache = new Map()
    const pageCache = new Map()
    const getPage = async (i) => {
        const cached = pageCache.get(i)
        if (cached) {
            // Move to end for LRU ordering
            pageCache.delete(i)
            pageCache.set(i, cached)
            return cached
        }
        const page = await pdf.getPage(i + 1)
        pageCache.set(i, page)

        // Evict oldest pages when over limit, freeing internal page data
        while (pageCache.size > MAX_CACHED_PAGES) {
            const oldestKey = pageCache.keys().next().value
            const oldPage = pageCache.get(oldestKey)
            pageCache.delete(oldestKey)
            oldPage?.cleanup()
        }
        return page
    }

    // Decode the restored page immediately. The same cached PDFPageProxy is
    // then reused by the first visible section instead of always touching page
    // one and requesting the restored page afterwards.
    const initialPage = Math.max(0, Math.min(
        pdf.numPages - 1,
        Math.round(Number(options.initialPage) || 0),
    ))
    const [firstPage, viewerPreferences] = await Promise.all([
        getPage(initialPage),
        pdf.getViewerPreferences().catch(() => null),
    ])
    const firstViewport = firstPage.getViewport({ scale: 1 })
    const book = { rendition: {
        layout: 'pre-paginated',
        spread: 'none',
        viewport: { width: firstViewport.width, height: firstViewport.height },
    } }

    // PDFs bound right-to-left (Japanese photo books, manga) declare it in the
    // catalog's ViewerPreferences; surface it as book.dir so the fixed-layout
    // renderer pairs and orders two-page spreads right-to-left.
    const direction = viewerPreferences?.get?.('Direction')
        ?? viewerPreferences?.Direction
    if (direction === 'R2L') book.dir = 'rtl'

    book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
        id: i,
        load: async () => {
            const cached = cache.get(i)
            if (cached) {
                // Move to end for LRU ordering
                cache.delete(i)
                cache.set(i, cached)
                return cached
            }
            const url = await renderPage(await getPage(i))
            cache.set(i, url)

            // Evict oldest render results when over limit
            while (cache.size > MAX_CACHED_PAGES) {
                const oldestKey = cache.keys().next().value
                const oldEntry = cache.get(oldestKey)
                cache.delete(oldestKey)
                if (oldEntry?.src) URL.revokeObjectURL(oldEntry.src)
            }

            return url
        },
        createDocument: async () => {
            const page = await getPage(i)
            const doc = document.implementation.createHTMLDocument('')

            const canvas = doc.createElement('div')
            canvas.id = 'canvas'
            doc.body.appendChild(canvas)

            const textLayer = doc.createElement('div')
            textLayer.className = 'textLayer'
            doc.body.appendChild(textLayer)

            const annotationLayer = doc.createElement('div')
            annotationLayer.className = 'annotationLayer'
            doc.body.appendChild(annotationLayer)

            // TextLayer requires canvas 2d context for font metrics;
            // fall back to manual span construction when unavailable
            const probe = doc.createElement('canvas')
            if (probe.getContext?.('2d')) {
                const textLayerInstance = new pdfjsLib.TextLayer({
                    textContentSource: await page.streamTextContent(),
                    container: textLayer, viewport: page.getViewport({ scale: 1 }),
                })
                await textLayerInstance.render()
            } else {
                const content = await page.getTextContent()
                for (const item of content.items) {
                    if (item.str) {
                        const span = doc.createElement('span')
                        span.textContent = item.str
                        textLayer.appendChild(span)
                    }
                }
            }
            return doc
        },
        size: 1000,
    }))
    book.isExternal = uri => /^\w+:/i.test(uri)
    // TOC hrefs are JSON-encoded destinations (named or explicit); page-list
    // hrefs are JSON-encoded page indices.
    book.resolveHref = async href => {
        const parsed = JSON.parse(href)
        if (typeof parsed === 'number') return { index: parsed }
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        const index = await pdf.getPageIndex(dest[0])
        return { index }
    }
    book.splitTOCHref = async href => {
        if (!href) return [null, null]
        const parsed = JSON.parse(href)
        if (typeof parsed === 'number') return [parsed, null]
        const dest = typeof parsed === 'string'
            ? await pdf.getDestination(parsed) : parsed
        try {
            const index = await pdf.getPageIndex(dest[0])
            return [index, null]
        } catch (e) {
            console.warn('Error getting page index for href', href, e)
            return [null, null]
        }
    }
    book.getTOCFragment = doc => doc.documentElement
    book.getCover = async () => renderPage(await pdf.getPage(1), true)
    book.destroy = () => {
        // Clean up all cached canvases and revoke blob URLs
        for (const [, entry] of cache) {
            if (entry?.src) URL.revokeObjectURL(entry.src)
        }
        cache.clear()
        for (const [, page] of pageCache) {
            page?.cleanup()
        }
        pageCache.clear()
        loadingTask.destroy()
    }
    return book
}
