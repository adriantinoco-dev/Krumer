# Planejamento — Leitor PDF Android (paridade com `reader-pdf.js` do desktop)

> **Objetivo:** permitir que um modelo de IA replique no Android as funcionalidades do leitor PDF do Krumer desktop (`frontend/js/reader-pdf.js:1` + `frontend/styles/reader.css:1`), adaptadas para ergonomia touch, telas pequenas e `react-native-pdf`.

| Campo | Valor |
|-------|-------|
| Base desktop | `frontend/js/reader-pdf.js:1` (1016 linhas), `frontend/styles/reader.css:1`, `frontend/js/app.js:1` (`shortcutsMap`), `frontend/js/i18n.js:1` |
| Alvo mobile | `mobile/src/readers/PdfReader.tsx:1` (286 linhas), `mobile/src/screens/ReaderScreen.tsx:1` (527 linhas) |
| Stack mobile validada | `react-native-pdf@6.7.5` (nativo) — **não substituir** por PDF.js/WebView sem motivo (AGENTS.md §Mobile) · Expo SDK 57 · `expo-file-system/legacy` para SAF |
| Status atual mobile | Leitura paginada horizontal 1 página/tela funcional, com hack `singlePage` + `content://` → cache · Sem modo vertical, sem zoom, sem 2 colunas, sem input de página, sem persistência de modo/zoom/coluna |
| Versão | v0.1 rascunho — 24/08/2026 |

---

## 1. Princípios mobile (não negociar)

1. **Uma mão.** Todo controle primário alcançável com polegar: barra inferior com `Prev/Next`, indicador de página e botão de configurações. Header superior só com Voltar + título.
2. **Auto-hide 4s.** Barras com `Animated.Value` e `HIDE_DELAY=4000` já existentes em `ReaderScreen.tsx:24` — manter. Toque no centro alterna visibilidade (`onCenterTap`).
3. **Gestos > botões.** Tap zonas (25%/50%/25%), swipe horizontal/vertical, pinch-zoom, double-tap reset. Teclado físico é exceção.
4. **Sem travamento.** Renderização lazy + virtualização; nunca bloquear UI no download/geração de thumbs.
5. **Imersivo.** `StatusBar hidden` quando barras ocultas, `react-native-safe-area-context` para notch/gesto.
6. **Persistência local-first.** `AsyncStorage` para preferências (`krumer.pdf.*`) + progresso por `book.id`; `AppContext.updateBookProgress()` já enfileira `outbox` Supabase (`mobile/src/context/AppContext.tsx:196`).

---

## 2. Inventário do desktop (o que precisa ser replicado)

Fonte-canônica: `frontend/js/reader-pdf.js:1`.

| # | Funcionalidade desktop | Onde vive | Comportamento exato |
|---|------------------------|-----------|---------------------|
| **D1** | **Abrir documento** | `openPdf():28` | `pdfjsLib.getDocument({url, cMapUrl, cMapPacked})` → `pdfDoc`, `numPages`; mede `page1.getViewport({scale:1})` → `baseAspectWidth/Height`; busca `LibraryAPI.getProgress(item.id)` e escolhe `progress.file_path === currentFilePath` ou `[0]`; clamp `1..total`; cria placeholders; chama `setupPdfControls()`; `irParaPaginaPdf(savedPage,{instant:true})`; registra `keydown/keyup`. |
| **D2** | **Placeholders para scroll nativo** | `criarPlaceholdersTodasPaginas():129` | Cria 1 `div.pdf-canvas-wrap[data-page=i]` por página com `width = baseW*scale`, `minHeight = baseH*scale`. `has-canvas` quando renderizado; `::before` mostra “Página N” enquanto não renderizado. |
| **D3** | **Renderização lazy HiDPI** | `renderizarPaginaPdf():382` | Skip se `dataset.renderedScale === scale` + `canvas` existe ou `renderingPages.has(n)`. `page.getViewport({scale})`; canvas `width/height = viewport*devicePixelRatio`, `style.width/height = viewport`; `page.render({canvasContext, transform:[dpr,...], viewport})`. Seta `renderedScale`, `has-canvas`, `marcarPaginaAtual()` se horizontal. |
| **D4** | **Modo horizontal (página única)** | `pdfMode='horizontal'` + CSS `#reader-container.horizontal:412` | Só `.current-page` (e `.current-page-second` se double) tem `display:inline-block`; demais `display:none`. `marcarPaginaAtual():278` aplica classes. |
| **D5** | **Modo vertical (rolagem contínua) virtualizado** | `pdfMode='vertical'` + `initVirtualScrollObserver():197` | Observer `root=viewer, rootMargin=400px 0px, threshold=[0.1,0.5]`. Em cada `entry.isIntersecting` → `renderizarPaginaPdf(n)`. Elege `mostVisiblePage` (maior `intersectionRatio>0.3`) → `pdfCurrentPage=mostVisible; updatePdfControlsState(); savePdfProgress()` se `!pdfZooming`. `criarPlaceholdersTodasPaginas` mantém scroll total desde o início. |
| **D6** | **Navegação** | `irParaPaginaPdf():252` + `setupPdfControls():526` | `prev/next` com `step=2` se `double&&horizontal`; `pageInput` type=number com `focus→select`, `change` valida `1..total` senão reverte, `Enter→blur`; `scrollIntoView({behavior:instant?'auto':'smooth', block:'start'})` se vertical. |
| **D7** | **Troca de modo** | `trocarModoPdf():293` | Persiste `localStorage.krumer_pdf_view_mode`; toggle classes `horizontal/vertical/double`; `init/stop VirtualObserver`; re-render página atual (+ `+1` se double); `updateModeToggleButton()`, `updatePdfColumnButton()`, `irParaPaginaPdf(current,instant:true)`. |
| **D8** | **Duas colunas (Plano B)** | `_applyPdfColumns():326` + `_togglePdfColumns():351` | Só ativo se `horizontal`. Persiste `krumer_pdf_column`; `viewer.classList.toggle('double', ...)`. Se vertical e usuário pede double, força `horizontal+double` antes. Render `page` e `page+1`; `marcarPaginaAtual()` marca `current-page-second`. Botão `.active` quando double. CSS `@media(max-width:768px)` esconde segunda coluna. Toast `showReaderZoomToast(2,'Colunas')`. |
| **D9** | **Zoom 50–200% com âncora** | `aplicarZoomPdf():726` + helpers `capturarAncoraScroll():176` | `pdfCurrentScale 0.5..2.0 step 0.1 (teclado) ou 0.05 (slider)`. Atualiza badge, toast, slider, presets, `pdfZooming=true`, captura `diff = viewer.scrollTop - wrap.offsetTop`, seta `overflowAnchor=none, scrollBehavior=auto`, `atualizarDimensoesPlaceholders():155` (atualiza `style.width/minHeight` de todos wraps + canvas, deleta `renderedScale`), `restaurarAncoraScroll()`. Debounce: `renderNow? render+200ms end : 150ms debounced render`. Durante zoom suprime troca de página via observer (`!pdfZooming`). |
| **D10** | **Stretch durante hold** | `aplicarZoomStretch():788` + `finalizarZoomPdfImediato():822` | `Ctrl +/-` em `keydown` chama `stretch` (só CSS, sem render) a 0ms por repetição; `keyup` chama `finalizarZoomPdfImediato()` que `renderizarPaginaPdf(current)` + `setTimeout 200ms` limpa `pdfZooming`. Evita piscada por `clear canvas` durante hold. |
| **D11** | **Controles toolbar** | `setupPdfControls():446` | Grupo prev/next + input + total + botão modo + botão coluna + botão fullscreen + engrenagem zoom (popover 240px com slider + badges + 4 presets). Estados: `btnPrev.disabled = current<=1`; `btnNext.disabled = isDouble ? current+1>=total : current>=total`. |
| **D12** | **Progresso** | `savePdfProgress():703` | `pct = min(100, round(page/total*100*10)/10)`; `LibraryAPI.saveProgress(item.id,{file_path, progress_pct, current_page, total_pages})` — `file_path` para series. |
| **D13** | **Fullscreen** | `pdfIsFullscreen` + `#reader-fullscreen-bar:529` | `body.reader-fullscreen #reader-header display:none`; barra absoluta top 0 com `btn-back-fullscreen` (fecha leitor) + `btn-exit-fullscreen` + `fullscreen-progress-label` (`{pct}% — Pág. {c}/{t}`) via `_syncPdfFullscreenProgressLabel():683`. Toggle por botão ou tecla `f`. |
| **D14** | **Atalhos** | `pdfKeyHandler():874` + `app.js:16` | `Ctrl/Meta +/=/NumpadAdd → +0.1`, `Ctrl-/- → -0.1`, `Ctrl0 → 1.0`; `ArrowLeft/PageUp → prev`, `ArrowRight/PageDown/Space → next` (step 2 se double); `Esc` fecha popover ou `closeReader()`; `f` fullscreen; `m` toggle modo; `c` toggle colunas; ignora quando `INPUT/TEXTAREA/SELECT` focado. |
| **D15** | **Loading/Erro** | `showReaderLoading():981`, `showReaderError():998` | Overlay spinner + `I18N.t('reader.pdf.loading')` / `reader.pdf.open_error`. |
| **D16** | **Cleanup** | `closePdf():949` | `removeEventListener keydown/keyup`, `stopVirtualScrollObserver()`, clear debounce, `pdfDoc.destroy()`, reset vars, `container.innerHTML=''` e remove classes. |

> Cálculo de `overall_progress` no backend (`backend/main.py:722` `_enrich_item`) só conta `progress.current_page>1` para “Continuar lendo”.

---

## 3. Estado atual mobile e gaps

### 3.1 O que já funciona (`PdfReader.tsx:34`, `ReaderScreen.tsx:42`)

- Resolução `content://` → cópia para `FileSystem.cacheDirectory/pdf-reader/` (`resolvePdfUri():11`).
- `react-native-pdf` com `page={currentPage}`, `singlePage={useSinglePage}` e `onLoadComplete` → `totalPages/size`; hack `setTimeout 50ms` para ativar `singlePage` após capturar total real (`handleLoadComplete():89`).
- Tap zonas `x/width <0.25 prev, >0.75 next, centro toggleBars` (`handleSingleTap():145`).
- `ReaderScreen` salva progresso via `onPageChange → saveProgress(String(page), page/total, ...)` em `AsyncStorage progress_<id>` + `AppContext.updateBookProgress()` (`ReaderScreen.tsx:90`).
- Barras animadas auto-hide, tema, `StatusBar hidden`, `useSafeAreaInsets`.

### 3.2 Gaps críticos (paridade < 40%)

| Gap | Impacto |
|-----|---------|
| Sem modo vertical contínuo | Quebra leitura de mangá/PDF longo no celular (scroll é natural no mobile). |
| Sem zoom (0.5–2.0) / pinch / double-tap | PDFs escaneados ilegíveis em tela de 6". |
| Sem duas colunas | Spread de HQ não funciona; desktop prevê `@media` hide em ≤768px — mobile precisa lógica `portrait vs landscape`. |
| Sem input de página / slider | Navegar para pág 200/300 impossível. |
| Sem âncora de zoom (salto de scroll) | Não se aplica ainda (singlePage), mas bloqueia vertical futuro. |
| Sem persistência de modo/coluna/zoom | Usuário re-configura a cada abertura. |
| Sem toast/feedback | Zoom/coluna/modo sem confirmação. |
| `singlePage` hack frágil | `onLoadComplete` reporta 1 quando `singlePage=true`; depende de `totalPages` em memória — perde após navegação. |
| Sem fullscreen imersivo real | `ReaderScreen` usa barras overlay translúcidas (`theme.surface+'ee'`), mas não entra em `immersive` Android (`NavigationBar hidden`). |
| Sem `renderingPages` guard | `react-native-pdf` já é nativo, porém múltiplas chamadas `setCurrentPage` rápidas disparam renders concorrentes. |

---

## 4. Decisões de arquitetura mobile

### 4.1 Dependências

- **Manter** `react-native-pdf` (validado). Não migrar para `react-native-pdf` + `pdf.js` híbrido.
- **Permitir** `react-native-gesture-handler` + `reanimated` (já transitivo via `react-native-screens`) para pinch/double-tap — se não instalado, usar `PinchGestureHandler` do RNGH puro. Checar `package.json:14` antes de adicionar.
- **Não adicionar** Firebase, `expo-pdf` web, ou `rn-fetch-blob` duplicado (`react-native-blob-util` já existe).
- Build nativo obrigatório: `npx expo prebuild && npx expo run:android` (PDF/WebView não funcionam em Expo Go).

### 4.2 Estrutura de arquivos proposta

```
mobile/src/readers/
  PdfReader.tsx              # orquestrador — mantém contrato externo ({filePath,initialPage,onPageChange,onCenterTap})
  PdfReader.types.ts         # PdfMode='horizontal'|'vertical', PdfColumn='single'|'double', PdfState
  pdf/
    PdfHorizontal.tsx        # wrapper do react-native-pdf em modo paginado (atual, mas refatorado)
    PdfVertical.tsx          # FlatList/ScrollView virtualizado para modo contínuo (novo)
    usePdfProgress.ts        # debounce save + cálculo pct (round *10/10)
    usePdfPrefs.ts           # AsyncStorage krumer.pdf.* (view_mode, column, zoom, page)
    PdfControls.tsx          # Prev/Next + PageInput + total (reutilizável)
    PdfSettingsSheet.tsx     # BottomSheet com Zoom slider+presets + toggle Modo + toggle Colunas + Tema (opcional)
    pdfUri.ts                # resolvePdfUri(filePath) extraído
```

Não criar `src/readers/__stubs__` novo; manter `PdfReader.web.tsx:1` como fallback (já existe).

### 4.3 Persistência (nomes alinhados ao desktop, mas com prefixo mobile)

```ts
// AsyncStorage keys — espelham localStorage desktop
KRUMER_PDF_VIEW_MODE = 'krumer.pdf.view_mode'   // 'horizontal'|'vertical' (default 'horizontal' no mobile; desktop default vertical)
KRUMER_PDF_COLUMN    = 'krumer.pdf.column'      // 'single'|'double' (default 'single')
KRUMER_PDF_ZOOM      = 'krumer.pdf.zoom'        // number 0.5..2.0 (default 1.0)
KRUMER_READER_BARS   = 'krumer.reader.bars_visible' // opcional
```

Progresso continua `progress_<book.id>` = `String(page)` para PDF (compatível com `ReaderScreen.tsx:60`) — **não mudar formato** para não quebrar `loadReaderSettings`/`updateBookProgress`.

### 4.4 Estado (fonte única)

```ts
type PdfState = {
  mode: 'horizontal'|'vertical';
  column: 'single'|'double'; // só efetivo se mode==='horizontal'
  scale: number;            // 0.5..2.0
  currentPage: number;
  totalPages: number;
  pageSize: {width:number,height:number}|null; // de onLoadComplete
  isFullscreen: boolean;    // mapeia para barras ocultas + immersive
  loading: boolean;
  error: string|null;
}
```

Persistir `mode/column/scale` imediatamente em `AsyncStorage`; `currentPage/totalPages` via `AppContext`.

---

## 5. UX mobile adaptada (toque)

### 5.1 Layout base (`ReaderScreen.tsx:127`)

Mantém `View flex:1 bg=theme.bg` + 2 `Animated.View` absolutos (top/bottom) com `opacity` + `pointerEvents`.

**Ajustes:**

- **Header (top):** altura dinâmica `insets.top + 56`, `ArrowLeft` hitSlop 16, título `numberOfLines=1` + autor 11px. Adicionar **botão Modo** (íons `Rows2` vs `Presentation`) à direita do título quando `isPdf` — atalho para trocar sem abrir sheet.
- **Viewer:** `flex:1` com `paddingBottom` = altura bottom bar quando visível para não cobrir última página. Em `isFullscreen` (`barsVisible===false`) viewer `paddingTop/Bottom = 0` e `StatusBar hidden`.
- **Bottom bar:** manter progress bar 6px + `progressPercent%`; substituir `settings` botão único por 3 ícones: `Zoom (%)` + `Colunas` (disabled se vertical) + `Config` (abre sheet).

### 5.2 Modos

| Modo | Desktop | Mobile proposto | Detalhe |
|------|---------|-----------------|---------|
| Horizontal (página única) | `viewer.horizontal` só `.current-page` visível | **Default mobile.** `react-native-pdf singlePage=true, page={n}, scrollEnabled=false, enablePaging=false, horizontal=false`. Swipe horizontal (pan >60px) → prev/next. Tap zonas idem. | Menor memória, ideal para telefone em portrait. |
| Horizontal 2 colunas | `viewer.horizontal.double` mostra `current` + `current+1` com `gap:20px` | **Só em landscape OU tela ≥600dp** (`useWindowDimensions` → `width>height && width>=600`). Render spread: página esquerda ÍMPAR. Se `current %2===0` ajustar para `current-1` antes de mostrar. `step=2` em prev/next. Em portrait forçar `single` com toast “Duas colunas só em paisagem”. | Evita páginas 50% cortadas em celular fino. |
| Vertical contínuo | placeholders + `IntersectionObserver` | **`FlatList` virtualizada** (ou `ScrollView` + `onScroll` + `viewabilityConfig`). `data = [1..totalPages]`, `getItemLayout` usando `fittedHeight = width * (pageH/pageW) * scale`. `initialScrollIndex = currentPage-1`. Cada item = `<PdfPage page={i} scale={scale} width={width} />` que renderiza `<Pdf source={{uri}} page={i} singlePage style={...}>`. `onViewableItemsChanged` (threshold 50%) → `setCurrentPage(mostVisible) + onPageChange + saveProgress`. `maxToRenderPerBatch=3`, `windowSize=5`, `removeClippedSubviews=true`. | `react-native-pdf` com `singlePage` por item evita carregar todas páginas ao mesmo tempo (cada `<Pdf>` é uma instância; testar memória — se pesar, alternativa: `Pdf` único com `scrollEnabled=true horizontal=false` + `enablePaging=false`). Benchmark com PDF 300p. |
| Zoom | slider 50–200 step5 + presets 50/100/150/200 + `Ctrl +/-` | **Pinch (0.5–2.0), double-tap (toggle 1.0↔1.5), slider bottom sheet (50–200 step 5), presets 75/100/125/150**. `style` recalcula `fittedHeight`. Em vertical, preservar âncora: capturar `offsetY = scrollY - itemTop` antes de `setScale`, após re-render `scrollToOffset(offsetY + itemTop)` com `scrollBehavior:'auto'`. Suprimir `onViewableItemsChanged` 200ms durante pinch (`isZoomingRef`). Toast `KrmToast.show(`${pct}% — Zoom`)`. Persistir `KRUMER_PDF_ZOOM`. | `react-native-pdf` prop `scale` (0..n) existe (`PdfReader.tsx:281 scale={1}`) — usar `scale={state.scale}`. Testar `enableDoubleTapZoom=false` manter false e implementar próprio. |

### 5.3 Navegação

- **Input de página:** no bottom bar, `TextInput keyboardType=number-pad` com `value=currentPage`, `onSubmitEditing → goToPage(clamped)`. Mostrar `“/  total”`. `selectTextOnFocus`.
- **Slider scrubber (opcional P2):** `Slider` horizontal abaixo da progress bar, `minimumValue=1 maximumValue=total`, `onSlidingComplete → goToPage`.
- **Botões Prev/Next:** disabled quando `current<=1` ou `current>=total` (ou `current+1>=total` se double). `hitSlop 12`, `opacity 0.3` quando disabled.

### 5.4 Zoom — ergonomia

- Thumb do slider 28dp, track 6dp, cores `theme.accent`/`theme.border` (igual `reader.css:318`).
- Badges `ZoomValueBadge` (bg `rgba(accent,0.15)` border 12px radius) idêntico ao desktop (`reader.css:292`).
- Presets com `.active` bg `rgba(accent,0.15)` — reutilizar estilo.

### 5.5 Fullscreen / imersivo

- Toggle por botão `Maximize` na top bar OU gesto swipe-up em viewer quando barras ocultas.
- Quando `isFullscreen: barsVisible=false + StatusBar hidden + NavigationBar translucent` (Android `expo-navigation-bar` se disponível; senão só `StatusBar`).
- Barra flutuante minimal (top) com `Voltar` + `X% — Pg. c/t` + `Sair` — posição absoluta `top=insets.top` (espelha `#reader-fullscreen-bar:529`).

### 5.6 Feedback

- Toast leve `top: insets.top+68, right:16` cor `theme.accent` (igual `.reader-zoom-toast:609`). Usar `react-native` `ToastAndroid` OU componente `AppToast` já existente.

---

## 6. Mapeamento de atalhos desktop → gestos mobile (F2 Android)

`app.js:16` `shortcutsMap` deve ser espelhado em “Configurações > Atalhos” (F2 Android em `PLANNING.md:206`). Para PDF:

| Desktop (tecla) | Mobile (gesto) | Onde documentar |
|-----------------|----------------|-----------------|
| `ArrowLeft/PageUp` prev | Swipe direita ou Tap zona esquerda 25% | Geral > Navegação |
| `ArrowRight/PageDown/Space` next | Swipe esquerda ou Tap zona direita 25% |  |
| `Ctrl +/-` zoom | Pinch aberto/fechado; double-tap ciclo 100→150→100 | Leitura > Zoom |
| `Ctrl 0` reset | Double-tap longo / botão “Reset 100%” no sheet |  |
| `M` toggle modo | Botão Modo no header + toggle no sheet | Leitura > Modo |
| `C` colunas | Botão Colunas no bottom bar (só horizontal) | Leitura > Colunas |
| `F` fullscreen | Tap centro (toggle barras) + botão Fullscreen | Geral |
| `Esc` fechar | Botão Voltar / gesto back Android | Geral |

---

## 7. Plano de implementação (8 fases sequenciais — cada fase entregável isolado)

> Ordem sugerida: reproduz `PLANNING.md:215` (base → F1..F7). Para PDF, seguir P0→P7 abaixo. Cada fase ≤ 1 arquivo principal + testes manuais em device real.

### P0 — Setup e contratos (½ dia)

**Objetivo:** isolar lógica atual e preparar prefs sem quebrar build.

- Criar `mobile/src/readers/pdf/pdfUri.ts` extraindo `resolvePdfUri/withFileScheme` de `PdfReader.tsx:7`.
- Criar `mobile/src/readers/pdf/usePdfPrefs.ts`:
  ```ts
  export async function loadPdfPrefs(): Promise<{mode, column, scale}> // defaults horizontal/single/1.0
  export async function savePdfPref(key, value)
  ```
- Criar `mobile/src/readers/PdfReader.types.ts`.
- Refatorar `PdfReader.tsx` para importar `resolvePdfUri` (sem mudar comportamento). Rodar `expo run:android` e testar PDF >10MB com `content://`.

**Aceite:** `PdfReader` abre mesmo PDF que antes; `content://` continua copiado para cache; nenhuma regressão.

### P1 — Estado robusto + progresso confiável (1 dia)

**Objetivo:** corrigir hack `singlePage` e unificar `currentPage/totalPages` entre `PdfReader` e `ReaderScreen`.

- Normalizar estado em `PdfReader.tsx`: remover `useSinglePage` booleano frágil; controlar via `state.mode`:
  - `horizontal` → `singlePage=true, page=currentPage`
  - `vertical` → delegado ao `PdfVertical` (P3)
- `handleLoadComplete(numberOfPages,size)`: sempre `setTotalPages(n)`; `onPageChange(currentPage, n)` **antes** de qualquer `setTimeout`; remover condição `if(useSinglePage && n===1)` que engole total.
- `ReaderScreen.tsx:131` `onPageChange` já persiste; adicionar `useEffect` para `initialPage ← savedPosition` só na montagem.
- Adicionar guard `renderingPagesRef = useRef(new Set())` para evitar `setCurrentPage` concorrente.
- Teste: abrir PDF 1 página, 5 páginas, 300 páginas; rotacionar tela; fechar/reabrir deve voltar na página salva ±0.

**Aceite:** totalPages correto em todos casos; `onPageChange` dispara 1× por página; nenhum “1/1” fantasma em PDFs multi-página.

### P2 — Navegação touch completa (1 dia)

**Objetivo:** trazer `D6` desktop para toque.

- Extrair `PdfControls.tsx` (Prev/Next + PageInput + total) usado por `ReaderScreen` bottom bar.
- `PageInput`: `TextInput` com `selectTextOnFocus`, `onSubmitEditing` validação `1..total`, `onBlur` reverte se inválido. Estilo `width:44 height:26 bg=theme.surface border` (espelha `reader.css:145`).
- Gestos: adicionar `PanResponder` OU `react-native-gesture-handler` `PanGesture` no `PdfReader`:
  - `dx > 60 && |dy|<40 → prev`, `dx < -60 → next` (considerar `step=2` se double).
  - Manter `handleSingleTap` zonas 25/50/25 já existente, mas desacoplar de `setCurrentPage(prev=>)` para usar `goToPage(page±step)`.
- `PdfHorizontal.tsx`: recebe `currentPage, totalPages, scale, column, onPageChange` e delega ao `<Pdf>`.

**Aceite:** swipe + tap + input + botões navegam; prev/next desabilitam corretamente; step 2 quando double (P5 dependente mas já calcula).

### P3 — Modo vertical contínuo virtualizado (2 dias — fase mais arriscada)

**Objetivo:** implementar `D5` no mobile.

- Criar `mobile/src/readers/pdf/PdfVertical.tsx`:
  ```tsx
  export function PdfVertical({ uri, totalPages, pageSize, scale, currentPage, onPageChange }: Props) {
    const width = useWindowDimensions().width;
    const fittedH = width * (pageSize.height/pageSize.width) * scale;
    const data = useMemo(()=> Array.from({length:totalPages}, (_,i)=> i+1), [totalPages]);
    const listRef = useRef<FlatList>(null);
    const isZooming = useRef(false);
    // getItemLayout, onViewableItemsChanged(viewabilityConfig:{itemVisiblePercentThreshold:50})
  }
  ```
- **Opção A (preferida):** `FlatList` com `renderItem = ({item}) => <Pdf source={{uri,cache:true}} page={item} singlePage style={{width, height:fittedH}} scale={scale} .../>`. Desabilitar `scrollEnabled` do Pdf interno (`scrollEnabled=false`).
- **Opção B (fallback se memória estourar):** único `<Pdf enablePaging={false} scrollEnabled={true} horizontal={false} scale={scale}>` com `enablePaging=false` e controlar via `onPageChanged` (menos controle, mas nativo já virtualiza). Testar ambas e documentar na PR qual passou em Moto G (3GB RAM) com PDF 200p.
- Persistir modo em `KRUMER_PDF_VIEW_MODE`; `ReaderScreen` sheet terá toggle `Horizontal ↔ Vertical`; toast ao trocar.
- `initScroll` → `flatListRef.current.scrollToIndex({index: initialPage-1, animated:false})` com `getItemLayout` para não piscar.

**Aceite:** PDF 100p abre vertical sem OOM; scroll fluido 60fps; `currentPage` atualiza ao passar 50% da página; `saveProgress` dispara throttle 500ms; `initialPage` scrolla instantaneamente.

### P4 — Zoom mobile com âncora (1.5 dias)

**Objetivo:** replicar `D9/D10` com gestos.

- `usePdfZoom` hook: `scale 0.5..2.0 step 0.05 (slider) ou pinch delta`. `applyZoom(newScale, {renderNow})` → `setScale` + `updateBadge/toast/slider` + `AsyncStorage KRUMER_PDF_ZOOM`.
- Em **horizontal:** apenas `setScale`; `<Pdf scale={scale}>` re-renderiza página atual com HiDPI (`enableAntialiasing` já true).
- Em **vertical:** capturar âncora: `const anchor = flatListRef.current?._listRef._getScrollMetrics().offset - itemTop;` antes de `setScale`; após layout (`requestAnimationFrame`) → `scrollToOffset(anchor + itemTop)`. Suprimir `onViewableItemsChanged` 250ms (`isZooming.current=true`).
- Slider bottom sheet: `Slider` (ou `<input type=range>` web) 50–200 step5, badges, presets `[50,100,150,200]` com `.active` (igual `reader.css:389`). Double-tap no viewer: `scale===1?1.5:1`.
- Pinch: `PinchGestureHandler` → `scale = clamp(prev * event.scale, 0.5, 2.0)` com debounce 150ms para `renderNow`.

**Aceite:** pinch + slider + presets funcionam em ambos modos; sem salto de página ao dar zoom no meio do capítulo; preset ativo destacado; toast 800ms.

### P5 — Duas colunas responsivo (1 dia)

**Objetivo:** `D8` adaptado.

- Só efetivo se `mode==='horizontal' && isLandscape && width>=600`. Senão `column` forced `single`.
- UI: botão `Colunas` no bottom bar (`active` quando double) — `disabled` (opacity 0.3) se vertical com tooltip toast “Disponível só em horizontal”.
- `PdfHorizontal` em double: render **2 `<Pdf>` lado a lado** com `gap 20` (ou 1 `<Pdf page={current} .../>` + overlay spread? Preferir 2 instâncias: `page={current}` e `page={current+1}` visíveis, ambas `scale`). Alternativa nativa: `Pdf` não suporta spread — então composição via `View flexDirection='row' gap=20`.
- Lógica ímpar: se `current %2===0` (pág par à esquerda incorreta), ajustar exibição para `current-1` e `current` (ou `current`+1?) — espelhar desktop comentário `trocarModoPdf:334`. Escolher: **spread começa em pág 1 à direita**, pág 2-3 spread. Implementar `displayStart = current %2===0 ? current-1 : current`.
- `Prev/Next step=2` quando double; `goToPage` clamp.
- Persistir `KRUMER_PDF_COLUMN`.

**Aceite:** em landscape 2 páginas lado a lado; prev/next pula 2; em portrait botão desabilitado; rotação portrait→landscape preserva página.

### P6 — Barras, fullscreen, tema e feedback (1 dia)

**Objetivo:** `D11/D13/D15`.

- `ReaderScreen.tsx` já tem barras; adicionar `isFullscreen` derivado de `!barsVisible` + `expo-navigation-bar` (se instalado) → `setVisibility('hidden')`.
- Fullscreen bar minimal top (quando `isFullscreen`): `View absolute top=insets.top flexDirection='row' justifyContent='space-between'` com `Voltar` (icon) + `Text pct + pg` + `Sair`. `fullscreen-progress-label` → `t('reader.page_progress', pct, current, total)` ou simples `${pct}% — ${current}/${total}`.
- Loading: overlay `ActivityIndicator` + `t('reader.loading')` (igual `.reader-spinner-overlay:487`).
- Erro: card central com `theme.surface` border `radii.lg`, título `theme.accent` + `errorDetail` (msg nativa) + `filePath` selectable (já existe em `PdfReader.tsx:160`).
- Tema: `theme.bg` já aplicado; PDF páginas com `backgroundColor: theme.bg` + sombra `elevation 8` + `borderRadius 4` (espelha `.pdf-canvas-wrap:450`).

**Aceite:** barras ocultam/mostram em 200ms; fullscreen sem notch overlap; loading/erro fiéis ao desktop; sombras e radius iguais.

### P7 — Polimento, i18n e testes (1 dia)

- **i18n:** adicionar keys em `mobile/src/i18n/translations.ts` (10 idiomas) espelhando `frontend/js/i18n.js:68`:
  ```
  reader.pdf.loading, reader.pdf.open_error, reader.pdf.prev/next,
  reader.pdf.horizontal/vertical, reader.pdf.mode_toggle,
  reader.pdf.two_columns/single_column, reader.pdf.settings_zoom,
  reader.page (ex: "Pág."), reader.pdfWebUnavailable*
  ```
  Fallback para `en` se faltar.

- **Performance:** testar com PDFs reais (5, 50, 300 páginas, 30MB). Medir `JS FPS` + `RAM` (Android Studio Profiler). Ajustar `FlatList windowSize` e `maxToRenderPerBatch` se jank.

- **Persistência:** validar `clear on logout` não apaga `krumer.pdf.*`.

- **Teclado físico (opcional):** `useEffect` com `Keyboard.addListener` para `ArrowLeft/Right, PageUp/Down, Space` em horizontal — útil para tablet com teclado.

- **Limpeza cache:** ao `unmount` `PdfReader`, deletar cópia `content://` em `cacheDirectory/pdf-reader/` se existir (`FileSystem.deleteAsync`).

- **Testes manuais checklist** (rodar em Moto G / Pixel emulator):

  - [ ] Abrir PDF 300p → total correto
  - [ ] Trocar horizontal↔vertical 5× sem crash
  - [ ] Pinch 50↔200 + slider + presets + double-tap
  - [ ] Duas colunas só landscape, step 2
  - [ ] PageInput 9999 (invalido) reverte; 1 e total funcionam
  - [ ] Rotacionar durante zoom não perde página
  - [ ] Fechar app na pág 150 → reabrir volta em 150
  - [ ] `content://` (SAF) abre sem “Falha ao abrir PDF”
  - [ ] Tema dark/light/sepia aplica bg/surface
  - [ ] 10 idiomas cobrem `reader.*`

**Aceite:** checklist 100% verde em device real + `expo run:android` release.

---

## 8. Detalhes técnicos críticos para a IA

### 8.1 `react-native-pdf` — props que importam

```tsx
<Pdf
  source={{ uri: resolvedUri, cache: true }} // file:// obrigatório; content:// já copiado
  page={currentPage}           // só horizontal
  singlePage={mode==='horizontal'} // vertical usa FlatList → cada item singlePage=true
  scale={scale}                // 0.5–2.0 (nativo suporta)
  spacing={mode==='vertical'?12:0}
  fitPolicy={0}                // 0=width
  enableAntialiasing
  enablePaging={false}
  enableDoubleTapZoom={false}  // implementar próprio
  horizontal={false}
  scrollEnabled={false}        // horizontal desliga; vertical FlatList controla
  showsHorizontalScrollIndicator={false}
  showsVerticalScrollIndicator={false}
  onLoadComplete={handleLoadComplete} // (n, path, {width,height})
  onPageChanged={handlePageChanged}   // fallback se onLoadComplete falhar
  onLoadProgress={handleLoadProgress}
  onPageSingleTap={handleSingleTap}   // (page,x,y) zonas 25/50/25
  onError={handleError}
  style={pdfStyle}
/>
```

### 8.2 Cálculo de altura encaixada (evita “1,5 páginas”)

Copiar de `PdfReader.tsx:234`:

```ts
const fittedHeight = Math.min(height * 0.92, width * (h/w) * 0.98);
```

No vertical, `fittedHeight = width * aspect * scale`.

### 8.3 Debounce de progresso (não spammar AsyncStorage/outbox)

```ts
const saveDebounced = useRef<NodeJS.Timeout|null>(null);
function onPageVisible(page:number, total:number){
  setCurrentPage(page);
  if(saveDebounced.current) clearTimeout(saveDebounced.current);
  saveDebounced.current = setTimeout(()=> saveProgress(String(page), page/total, page, total), 350);
}
```

### 8.4 Guard de memória para `content://`

`resolvePdfUri` copia para `cacheDirectory/pdf-reader/<timestamp>-<safeName>` — nome safe `replace(/[^a-z0-9._-]/gi,'_')`. Limpar em `useEffect cleanup` se `filePath.startsWith('content://')`.

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| `FlatList` com N `<Pdf>` instancia N `PdfView` nativos → OOM em PDF 500p | Começar com `windowSize=5` + `removeClippedSubviews`; fallback para único `<Pdf scrollEnabled>` se OOM. Medir `adb shell dumpsys meminfo com.adriantinoco.krumer`. |
| `singlePage` hack quebrar após `scale` mudar | Centralizar `page`/`singlePage` no estado único (P1) e nunca `setUseSinglePage` condicional por `totalPages`. |
| SAF `content://` sem permissão persistida | Usar `takePersistableUriPermission` se disponível; copiar imediatamente e não reter URI original. |
| Pinch conflita com scroll vertical | `PinchGestureHandler` com `simultaneousHandlers` + `isZooming` guard que desativa `PanGesture`. |
| `react-native-pdf` `scale` não é HiDPI | `enableAntialiasing true` + `scale` já multiplica; se pixelado em 200%, aumentar `scale` e reduzir `style.width` proporcionalmente. |

---

## 10. Critério de pronto (Definition of Done)

- [ ] `PdfReader` contrato externo inalterado (`filePath, initialPage, onPageChange, onCenterTap`).
- [ ] Modos `horizontal` (default), `vertical` contínuo e `double` (landscape) persistidos em `AsyncStorage`.
- [ ] Zoom 50–200% via pinch, double-tap, slider e presets, com âncora sem salto em vertical.
- [ ] Navegação por swipe, tap zonas, botões e input numérico, com `step=2` em double.
- [ ] Progresso `page/total → pct` com `Math.round(p/t*100*10)/10`, salvo em `AsyncStorage` + `AppContext.updateBookProgress()`; reabre na página salva.
- [ ] Fullscreen imersivo + barras auto-hide 4s + `StatusBar hidden`.
- [ ] Loading/Erro fiéis ao `i18n` desktop (pt-BR, en, es + 7 restantes fallback).
- [ ] `content://` e `file://` ambos funcionam; sem vazamento de arquivo em cache.
- [ ] Testado em device real Android 13+ em portrait e landscape com PDFs 5/50/300p.
- [ ] Nenhuma regressão em `EpubReader` / `ReaderScreen`.

---

## 11. Referências para a IA consultar durante o build

- Leitura PDF desktop: `frontend/js/reader-pdf.js:1`, `frontend/styles/reader.css:396`, `frontend/index.html:603` (`#reader-view`).
- Mobile atual: `mobile/src/readers/PdfReader.tsx:1`, `mobile/src/screens/ReaderScreen.tsx:1`, `mobile/src/context/AppContext.tsx:42`.
- Tema/tokens: `mobile/src/theme/colors.ts`, `spacing.ts`, `typography.ts`.
- I18n desktop: `frontend/js/i18n.js:68` (`reader.pdf.*`, `shortcuts.*`).
- Scanner SAF: `mobile/src/services/libraryScanner.ts`.

> **Como executar:** `cd mobile && npx expo prebuild && npx expo run:android` (não usar Expo Go). Ver logs via `adb logcat | rg Krumer`.

