# Planejamento — Leitor EPUB Android (paridade com `reader-epub.js` do desktop)

> **Objetivo:** definir a arquitetura e o plano de refatoração para que o leitor EPUB do Krumer Android alcance paridade funcional completa com o leitor EPUB desktop (`frontend/js/reader-epub.js:1` + `frontend/styles/reader-epub.css:1`), com UX adaptada para dispositivos móveis, gestos touch, telas pequenas e ponte `WebView` (Expo / React Native).

| Campo | Valor |
|-------|-------|
| Base desktop | `frontend/js/reader-epub.js:1` (1390 linhas), `frontend/styles/reader-epub.css:1`, `frontend/js/app.js:1`, `frontend/js/i18n.js:1` |
| Alvo mobile | `mobile/src/readers/EpubReader.tsx:1` (505 linhas), `mobile/src/screens/ReaderScreen.tsx:1` |
| Stack mobile validada | `react-native-webview@13.12.5` + `epub.js` vendorizado (`EPUB_VENDOR_SCRIPT`) — **manter** WebView (AGENTS.md §Mobile) · Expo SDK 57 · `expo-file-system/legacy` |
| Status atual mobile | Leitura paginada funcional com `epub.js` embutido em WebView; temas (`dark`, `light`, `sepia`); `fontSize` e `lineHeight` básicos; tap zonas; Safe Area Insets dinamicos. **Gaps:** sem destaques (highlights), sem sumário (TOC), sem localizações reais (`Pág. X de Y`), sem menu de seleção de texto, sem 2 colunas, sem scroll contínuo, sem persistência de preferências de leitura. |
| Versão | v1.0 — 24/08/2026 |

---

## 1. Princípios mobile (não negociar)

1. **Ergonomia com uma mão (Thumb Zone).** Todos os controles frequentes (avançar/voltar, barra de progresso, botão de capítulos e menu de leitura) devem ser facilmente acessíveis com o polegar na barra inferior. O cabeçalho superior contém apenas navegação de retorno e título.
2. **Auto-hide automático 4s.** As barras superior e inferior utilizam animações suaves (`Animated.Value`) e somem após 4 segundos de inatividade. O toque na zona central da tela (`onCenterTap`) alterna a visibilidade.
3. **Gestos Touch & Seleção Fluida.** Suporte a swipe de página, tap zonas configuráveis e captura nativa de seleção de texto na WebView com menu suspenso amigável para aplicar destaques sem obstruir a leitura.
4. **Imersividade Total.** Quando as barras estão ocultas, ativa-se o modo imersivo no Android (`StatusBar hidden` e oculta a barra de navegação do sistema via `react-native-safe-area-context`).
5. **Persistência Local-First.** Todas as preferências (`krumer.epub.*`) e progresso por livro (CFI, porcentagem e página) são salvos em `AsyncStorage` e sincronizados via `AppContext` / API REST. Destaques também são armazenados localmente e sincronizados.
6. **Ponte de Comunicação Assíncrona Não-Bloqueante.** A ponte `MessageEvent` entre a `WebView` e o React Native não deve travar a UI durante operações pesadas, como o carregamento do livro, geração de localizações ou renderização de destaques.

---

## 2. Inventário do desktop (o que precisa ser replicado)

Fonte-canônica: `frontend/js/reader-epub.js:1` (1390 linhas).

| # | Funcionalidade desktop | Onde vive no desktop | Comportamento exato no desktop |
|---|------------------------|----------------------|--------------------------------|
| **D1** | **Abertura do EPUB** | `openEpub():46` | Carrega o arquivo como `ArrayBuffer` via `fetch()`, instancia `ePub(arrayBuffer)`, renderiza na div `#epub-render-area` com `flow: 'paginated'`, restaura preferências de tema, fonte e colunas, e escuta o evento `relocated`. |
| **D2** | **Cálculo de Localizações** | `openEpub():123` | Executa `epubBook.locations.generate(1500)` em segundo plano sem bloquear a abertura do livro; calcula `epubTotalLocations` e atualiza o indicador de posição (`Pág. X / Y · Z%`). |
| **D3** | **Restauração e Salvamento de Progresso** | `openEpub():138` e `saveEpubProgress():1221` | Busca o CFI salvo via `LibraryAPI.getProgress()`. Se `progress_pct > 0`, restaura a posição por CFI (`display(startCfi)`). A cada `relocated`, atualiza o CFI atual e envia para a API. |
| **D4** | **Navegação (Avançar / Voltar)** | `epubNext():199` e `epubPrev():206` | Executa `rendition.next()` e `rendition.prev()`. Oculta popovers de destaques ao navegar. |
| **D5** | **Navegação por Capítulo (TOC)** | `epubGoToChapter():218` e `_openTocPanel():942` | Carrega o sumário (`epubBook.loaded.navigation`). Exibe painel lateral com lista hierárquica (suporte a subitens com recuo dinâmico por `depth`). Ao clicar em um capítulo, navega via `rendition.display(href)`. |
| **D6** | **Troca de Temas Instantânea** | `_applyEpubTheme():310` e `_injectThemeToRendered():293` | Suporta 3 temas: `dark` (#111111), `light` (#fafafa) e `sepia` (#f4ede0). Injeta CSS diretamente nos `iframes` (`#krumer-theme`) para alteração imediata de cores de fundo, texto e links sem re-renderizar o livro. |
| **D7** | **Ajuste de Tamanho de Fonte** | `_applyEpubFontSize():338` | Fonte de 60% a 200%. Oferece slider continuo e botões de preset (80%, 100%, 120%, 150%). Aplica via `rendition.themes.fontSize()` e exibe toast de confirmação. |
| **D8** | **Duas Colunas / Spread (Plano B)** | `_applyEpubColumns():362` | Alterna entre `single` (uma coluna) e `double` (duas colunas) via `rendition.spread('auto' | 'none')`. Atualiza botão de alternância e exibe toast. |
| **D9** | **Seleção de Texto e Popover de Destaque** | `_setupHighlightListeners():530` | Escuta o evento `selected` de `epub.js` (ou `mouseup` no iframe). Captura o `cfiRange` e o texto selecionado (mínimo 2 caracteres). Exibe popover ancorado acima/abaixo do texto para seleção de cor. |
| **D10** | **Criação e Estilização de Destaques** | `_createHighlight():782` | 4 cores: Amarelo (`#facc15`), Verde (`#4ade80`), Azul (`#60a5fa`) e Rosa (`#f472b6`). Aplica renderização otimista via `annotations.highlight()`, detecta e substitui sobreposições (`_findOverlappingHighlights`), injeta estilos SVG nos rects do iframe e persiste via `LibraryAPI.createHighlight()`. |
| **D11** | **Edição e Exclusão de Destaques** | `_showHighlightActionsPopover():715` e `_deleteHighlight():913` | Ao clicar em um destaque existente, abre popover de ações para alterar a cor ou excluir. Atualiza o visual otimisticamente e executa `LibraryAPI.deleteHighlight()`. |
| **D12** | **Carregamento Inicial de Destaques** | `_fetchAndRenderHighlights():447` | Busca a lista de destaques salvos do livro (`LibraryAPI.getHighlights(itemId)`) e reaplica em cada novo capítulo renderizado no evento `rendered`. |
| **D13** | **Menu de Configurações Toolbar** | `setupEpubControls():1004` | Popover contendo opções de tema, slider e presets de fonte, além do botão de alternância de colunas. |
| **D14** | **Modo Fullscreen Imersivo** | `setupEpubControls():1100` | Oculta cabeçalho, expande área de leitura e ativa a barra flutuante de progresso (`#reader-fullscreen-bar`). |
| **D15** | **Atalhos de Teclado** | `epubKeyHandler():1245` | Atalhos: `Left`/`Right`/`Space` (navegação), `Ctrl +/-/0` (fonte), `m` (ciclo de temas), `c` (colunas), `f` (fullscreen) e `Esc` (fechar popovers ou leitor). |
| **D16** | **Encerramento e Cleanup** | `closeEpub():1333` | Remove event listeners, destrói a instância do `rendition` e do `book`, limpa o container DOM e reseta variáveis de estado. |

---

## 3. Estado atual mobile e gaps

### 3.1 O que já funciona (`EpubReader.tsx:1`, `ReaderScreen.tsx:1`)

- Resolução de URIs `content://` enviadas via SAF para cache local em `FileSystem.cacheDirectory/epub-reader/` (`resolveEpubUri():11`).
- Instanciação de `epub.js` dentro da WebView através de `EPUB_VENDOR_SCRIPT` e leitura via ArrayBuffer Base64 ou caminho de arquivo (`openBook():155`).
- Navegação básica via tap zonas (esquerda 25% volta página, direita 75% avança página, centro 50% alterna barras de controle).
- Redimensionamento e alinhamento de margens simétricas (`#viewer`) considerando `useSafeAreaInsets` do dispositivo.
- Suporte inicial a temas (`dark`, `light`, `sepia`), `fontSize` e `lineHeight` via `postMessage`.
- Captura de alteração de posição (`LOCATION_CHANGED`) enviando o CFI e a porcentagem de leitura para persistência em `AsyncStorage` (`progress_<id>`) e enfileiramento no `AppContext`.

### 3.2 Gaps críticos (paridade < 35%)

| Gap | Impacto | Severidade |
|-----|---------|------------|
| **Ausência total de Destaques (Highlights)** | Usuário não consegue selecionar trechos de texto, aplicar cores (Amarelo, Verde, Azul, Rosa) nem gerenciar citações salvas. | **CRÍTICO** |
| **Sem Sumário (TOC / Capítulos)** | Impossível visualizar a estrutura do livro ou saltar diretamente para um capítulo específico. | **CRÍTICO** |
| **Falta de Indicador de Localizações/Páginas Reais** | Exibe apenas porcentagem estimada `Z%` ou CFI cru; não gera localizações em background (`locations.generate`). | **ALTO** |
| **Sem Slider de Navegação por Progresso / Scrubber** | Impossível arrastar rapidamente para determinada parte do livro. | **ALTO** |
| **Sem Painel de Ajustes Completo (Bottom Sheet)** | Menu de configurações atual é limitado; falta presets de fonte, controle fino de linha, tema e modo de exibição. | **MÉDIO** |
| **Sem Suporte a Duas Colunas (Landscape/Tablets)** | Em celulares na horizontal ou tablets, não aproveita a largura da tela com o modo spread de 2 colunas. | **MÉDIO** |
| **Sem Modo de Leitura Contínua (Scroll Vertical)** | Suporta apenas modo paginado (`flow: 'paginated'`); falta suporte a scroll contínuo de capítulos (`flow: 'scrolled-doc'`). | **MÉDIO** |
| **Sem Persistência Local Completa de Preferências** | As escolhas de tema, fonte e layout do EPUB não ficam salvas de forma consistente em `AsyncStorage` entre sessões. | **MÉDIO** |
| **Sem Gestos Touch Avançados (Swipe / Pinch)** | Navegação depende apenas de toque nas zonas laterais; deslizar o dedo (swipe) não vira a página. | **BAIXO** |

---

## 4. Decisões de arquitetura mobile

### 4.1 Stack e dependências

- **Manter** `react-native-webview@13.12.5` com `epub.js` vendorizado via `EPUB_VENDOR_SCRIPT`. Não trocar por parsers nativos de EPUB sem motivo claro (preserva a fidelidade e o motor de layout do browser).
- **Utilizar** `@gorhom/bottom-sheet` ou `Modal` customizado do React Native para o painel de configurações e para a lista de capítulos/destaques.
- **Utilizar** `AsyncStorage` para armazenamento offline local de preferências e cache de destaques antes da sincronização.
- Build nativo exigido: `npx expo prebuild && npx expo run:android` (dev build).

### 4.2 Arquitetura da ponte bidirecional WebView ↔ React Native

A comunicação é centralizada no manipulador de mensagens `window.addEventListener('message')` dentro do HTML da WebView e pela prop `onMessage` do React Native.

#### Mensagens React Native → WebView (Comandos):

| Tipo | Payload | Descrição |
|------|---------|-----------|
| `OPEN_BOOK` | `{ path, cfi, base64, insets }` | Inicializa e exibe o livro na posição salva. |
| `SET_THEME` | `{ theme: 'dark' | 'light' | 'sepia' }` | Injeta CSS de tema dinamicamente nos document contents. |
| `SET_FONT_SIZE` | `{ size: number }` | Ajusta o tamanho da fonte (60% a 200%). |
| `SET_LINE_HEIGHT` | `{ value: number }` | Ajusta a altura da linha (1.2 a 2.0). |
| `SET_COLUMN_MODE` | `{ mode: 'single' | 'double' }` | Altera a quantidade de colunas (`spread`). |
| `SET_FLOW_MODE` | `{ flow: 'paginated' | 'scrolled-doc' }` | Alterna entre paginação horizontal e scroll contínuo. |
| `GO_TO_CFI` | `{ cfi: string }` | Navega para um CFI específico. |
| `GO_TO_HREF` | `{ href: string }` | Navega para um capítulo do TOC. |
| `GO_TO_LOCATION` | `{ location: number }` | Navega para um número de localização real. |
| `CREATE_HIGHLIGHT` | `{ cfiRange, text, color }` | Aplica e estiliza um novo destaque. |
| `DELETE_HIGHLIGHT` | `{ cfiRange }` | Remove um destaque da exibição e do modelo DOM. |
| `SET_HIGHLIGHTS` | `{ highlights: Array }` | Injeta a lista de destaques salvos ao abrir o livro. |

#### Mensagens WebView → React Native (Eventos):

| Tipo | Payload | Descrição |
|------|---------|-----------|
| `READY` | `{}` | Livro renderizado e pronto para interação. |
| `ERROR` | `{ message: string }` | Erro durante abertura ou renderização do arquivo. |
| `LOCATION_CHANGED` | `{ cfi, percentage, locationIndex, totalLocations }` | Notifica mudança de página/posição. |
| `TOC_LOADED` | `{ toc: Array<{ label, href, subitems }> }` | Envia a árvore do sumário extraída do EPUB. |
| `LOCATIONS_READY` | `{ total: number }` | Notifica que o cálculo em background de localizações foi concluído. |
| `TEXT_SELECTED` | `{ cfiRange, text, rect: { top, left, width, height } }` | Notifica seleção de texto para abrir o popup de cores. |
| `HIGHLIGHT_CLICKED` | `{ highlight: Object, rect: Object }` | Notifica clique em um destaque existente. |
| `TAP_CENTER` | `{}` | Toque no centro da tela para alternar visibilidade das barras. |

---

### 4.3 Estrutura de arquivos proposta

```
mobile/src/readers/
├── EpubReader.tsx                  # Componente orquestrador principal (mantém contrato da interface)
├── EpubReader.types.ts             # Definição de interfaces (EpubState, Highlight, TocItem, etc.)
└── epub/
    ├── epubHtmlBase.ts             # HTML + JavaScript da WebView (contém ePub.js e os handlers de ponte)
    ├── EpubTocModal.tsx            # Modal / Drawer com a lista hierárquica do Sumário (TOC)
    ├── EpubHighlightsModal.tsx     # Modal com a lista e busca de todos os destaques do livro
    ├── EpubSettingsSheet.tsx       # BottomSheet / Modal de ajustes (Tema, Fonte, Linha, Colunas, Flow)
    ├── EpubSelectionMenu.tsx       # Popover flutuante para criação de novos destaques (4 cores)
    ├── EpubHighlightActionMenu.tsx # Popover flutuante para editar/excluir destaque selecionado
    ├── useEpubProgress.ts          # Hook para debounce de progresso e sincronização
    ├── useEpubPrefs.ts             # Hook para leitura e persistência em AsyncStorage das preferências
    └── epubUri.ts                  # Utilitário isolado para resolução de arquivos SAF / content://
```

---

### 4.4 Persistência local (`AsyncStorage`)

Para garantir alinhamento com as chaves do desktop (adaptadas para o mobile):

```ts
// Chaves de preferência de leitura EPUB no AsyncStorage
KRUMER_EPUB_THEME       = 'krumer.epub.theme'        // 'dark' | 'light' | 'sepia' (default: 'dark')
KRUMER_EPUB_FONT_SIZE   = 'krumer.epub.font_size'    // number: 60..200 (default: 100)
KRUMER_EPUB_LINE_HEIGHT = 'krumer.epub.line_height'  // number: 1.2..2.0 (default: 1.6)
KRUMER_EPUB_COLUMN      = 'krumer.epub.column'       // 'single' | 'double' (default: 'single')
KRUMER_EPUB_FLOW        = 'krumer.epub.flow'         // 'paginated' | 'scrolled-doc' (default: 'paginated')

// Progresso e Destaques por Livro
KRUMER_PROGRESS_PREFIX  = 'progress_'                // progress_<book_id> (contém cfi, percentage, locationIndex)
KRUMER_HIGHLIGHTS_PREFIX= 'highlights_'              // highlights_<book_id> (Array de objetos Highlight)
```

---

## 5. Especificação detalhada das funcionalidades (UX Mobile Touch)

### 5.1 Destaques e Marcação de Texto (Highlights)

A funcionalidade de destaques é adaptada para telas touch mantendo 100% da paridade com o desktop.

1. **Seleção de Texto e Popover de Cores:**
   - Na WebView, quando o usuário seleciona um trecho de texto no iframe do `epub.js`, a ponte intercepta o evento `selected` ou `mouseup`/`touchend` e calcula a caixa delimitadora (`rect`) do texto selecionado.
   - A WebView envia a mensagem `TEXT_SELECTED` com o `cfiRange`, o texto extraído e as coordenadas na tela.
   - O React Native renderiza um menu flutuante (`EpubSelectionMenu`) posicionado estrategicamente acima ou abaixo da seleção contendo as 4 cores de destaque:
     - 🟡 **Amarelo:** `#facc15` (rgba(250, 204, 21, 0.75))
     - 🟢 **Verde:** `#4ade80` (rgba(74, 222, 128, 0.75))
     - 🔵 **Azul:** `#60a5fa` (rgba(96, 165, 250, 0.75))
     - 🌸 **Rosa:** `#f472b6` (rgba(244, 114, 182, 0.75))
   - Ao selecionar uma cor, o React Native envia a instrução `CREATE_HIGHLIGHT` para a WebView, aplica a alteração otimista no visual do livro, salva em `AsyncStorage` local e faz o dispatch da requisição à API REST (`POST /api/items/{id}/highlights`).

2. **Gestão de Destaques Existentes (Alterar Cor / Remover):**
   - Ao tocar em um texto previamente destacado, o `rendition.annotations` dispara a mensagem `HIGHLIGHT_CLICKED`.
   - É exibido o `EpubHighlightActionMenu` permitindo trocar a cor atual do destaque ou excluí-lo (botão "Remover Destaque").
   - A remoção executa a exclusão na WebView via `annotations.remove()`, atualiza a lista local em `AsyncStorage` e chama a API (`DELETE /api/items/{id}/highlights/{highlight_id}`).

3. **Lista Geral de Destaques do Livro:**
   - No menu do leitor, um ícone de marca-página/lápis abre a tela `EpubHighlightsModal`.
   - Exibe a lista de todos os destaques do livro atual, ordenados por capítulo, com preview da frase em destaque, data de criação e indicador da cor.
   - O toque em qualquer item fecha o modal e navega imediatamente para o trecho correspondente no livro via `GO_TO_CFI`.

---

### 5.2 Sumário de Capítulos (TOC - Table of Contents)

1. **Extração de Navegação:**
   - Durante o carregamento do livro, a WebView processa `epubBook.loaded.navigation` e transmite a estrutura completa de capítulos (incluindo rótulo, `href` e subitens aninhados) via evento `TOC_LOADED`.

2. **Modal / Drawer de Sumário (`EpubTocModal`):**
   - Acessível pelo ícone de lista/sumário na barra superior ou inferior.
   - Apresenta a árvore de capítulos em uma lista rolável com indentação visual para subcapítulos (níveis de profundidade).
   - O capítulo ativo no momento de leitura é destacado na lista.
   - O toque em qualquer capítulo envia a mensagem `GO_TO_HREF` para a WebView, que executa `rendition.display(href)` e fecha o modal.

---

### 5.3 Indicador de Localização Real e Barra de Progresso (Scrubber)

1. **Geração Assíncrona de Localizações:**
   - Assim que o livro é aberto, a WebView dispara `epubBook.locations.generate(1500)` sem bloquear a experiência do usuário.
   - Ao finalizar, notifica o React Native com `LOCATIONS_READY` e o número total de localizações (`totalLocations`).

2. **Indicador de Páginas na Barra Inferior:**
   - Exibe o status formatado no padrão Krumer: `Pág. X / Y · Z%` (ex.: `Pág. 42 / 350 · 12%`).

3. **Navegação Rápida por Slider/Scrubber:**
   - Na barra inferior ou no painel estendido, inclui um slider interativo permitindo que o usuário deslize para navegar rapidamente por qualquer percentual ou número de localização real do livro.

---

### 5.4 Painel de Configurações de Leitura (`EpubSettingsSheet`)

Exibido via BottomSheet ao tocar no ícone de engrenagem/configurações na barra de controles:

1. **Seleção de Tema:**
   - Botões visuais com preview de cor para alternar instantaneamente entre **Escuro** (`#111111`), **Claro** (`#ffffff`) e **Sépia** (`#f4ecd8`).
2. **Tamanho da Fonte:**
   - Controles discretos `-` e `+`, badge visual exibindo a porcentagem atual (`100%`) e botões de atalho rápido (`80%`, `100%`, `120%`, `150%`).
3. **Altura de Linha (Line Height):**
   - Seleção entre opções pré-definidas de espaçamento: `1.2` (Compacto), `1.5` (Padrão), `1.8` (Confortável) e `2.0` (Expandido).
4. **Modo de Colunas (Spread):**
   - Toggle entre **1 Coluna** (Padrão para telas verticais) e **2 Colunas** (Ideal para modo Paisagem/Landscape e Tablets).
5. **Modo de Fluxo de Leitura (Flow):**
   - Alternância entre **Paginado** (virada de páginas horizontal) e **Scroll Contínuo** (rolagem vertical de capítulos).

---

### 5.5 Suporte a Gestos Touch

1. **Tap Zonas Mantidas:**
   - 25% da borda esquerda: página anterior (`rendition.prev()`).
   - 25% da borda direita: próxima página (`rendition.next()`).
   - 50% central: alterna a visibilidade das barras de controle superior e inferior.
2. **Swipe Horizontal (Deslizar o Dedo):**
   - Captura de eventos de toque `touchstart` e `touchend` dentro dos `iframes` renderizados pela WebView. Se a distância do deslizamento horizontal for superior a 50px e a inclinação for horizontal, aciona automaticamente `rendition.next()` ou `rendition.prev()`.

---

## 6. Plano de execução & checklist de implementação

### Fase 1: Refatoração da Ponte WebView e Estrutura de Arquivos
- [ ] Criar a pasta `mobile/src/readers/epub/` e isolar os utilitários (`epubUri.ts`, `useEpubPrefs.ts`, `useEpubProgress.ts`).
- [ ] Atualizar `epubHtmlBase.ts` com suporte robusto a todos os eventos da ponte bidirecional (`SET_THEME`, `SET_FONT_SIZE`, `SET_LINE_HEIGHT`, `SET_COLUMN_MODE`, `SET_FLOW_MODE`).
- [ ] Garantir o tratamento correto de margens e Safe Area Insets dinamicos.

### Fase 2: Sumário (TOC) e Gerador de Localizações
- [ ] Implementar a captura de navegação (`TOC_LOADED`) e criar o componente `EpubTocModal.tsx` com renderização hierárquica de capítulos.
- [ ] Adicionar geração de localizações em segundo plano (`locations.generate`) e atualizar o indicador de posição `Pág. X / Y · Z%`.
- [ ] Conectar botão de sumário no cabeçalho de `ReaderScreen.tsx`.

### Fase 3: Destaques (Highlights) — Paridade Feature A
- [ ] Injetar o listener de seleção de texto (`TEXT_SELECTED`) no JavaScript da WebView.
- [ ] Criar o componente `EpubSelectionMenu.tsx` para exibição do popover de seleção das 4 cores.
- [ ] Criar o componente `EpubHighlightActionMenu.tsx` para edição e remoção de destaques ao tocar em um trecho marcado.
- [ ] Implementar o modal `EpubHighlightsModal.tsx` com a listagem completa de destaques do livro.
- [ ] Conectar os endpoints REST do backend (`/api/items/{id}/highlights`) com fallback e suporte a salvamento local offline em `AsyncStorage`.

### Fase 4: Painel de Configurações (Bottom Sheet) & Preferências
- [ ] Criar o componente `EpubSettingsSheet.tsx` unificando os ajustes de Tema, Fonte, Linha, Colunas e Flow.
- [ ] Integrar a persistência contínua de preferências através do hook `useEpubPrefs.ts` em `AsyncStorage`.
- [ ] Adicionar suporte a orientações de tela (ajuste automático para 2 colunas quando em landscape).

### Fase 5: Gestos Touch & Polimento
- [ ] Implementar captura de gestos `swipe` (deslizar) dentro da WebView para navegação de páginas.
- [ ] Polir transições, feedbacks visuais (toasts de alteração de tamanho de fonte/tema) e telas de erro/carregamento.
- [ ] Validar compatibilidade no Android com build de desenvolvimento (`npx expo run:android`).

---

## 7. Verificação e Critérios de Aceite

1. **Paridade de Recursos:** Todas as 16 funcionalidades catalogadas do desktop (`D1` a `D16`) possuem representação direta no leitor mobile refatorado.
2. **Destaques Funcionais:** É possível selecionar qualquer frase no livro, aplicar uma das 4 cores, visualizar a frase na lista de destaques, trocar a cor ou remover o destaque a qualquer momento.
3. **Navegação de Capítulos:** O sumário exibe corretamente todos os capítulos e subcapítulos, permitindo saltar diretamente para a posição desejada.
4. **Indicador de Páginas:** O leitor exibe a posição no formato `Pág. X / Y · Z%` assim que o cálculo de localizações é concluído.
5. **Ergonomia e Desempenho:** A alteração de tema e tamanho de fonte ocorre sem congelar a WebView; as barras ocultam automaticamente após 4s e respondem imediatamente ao toque central.
