# Krumer Mobile — Janelas e Design

> **App:** Krumer Mobile v0.1.0 (Android) — `mobile/`  
> **Stack:** React Native + Expo · React Navigation (Stack + Bottom Tabs) · `react-native-pdf` · `WebView + epub.js` · `lucide-react-native` · `AsyncStorage · SAF`  
> **Package:** `com.adriantinoco.krumer`  
> **Design base:** réplica mobile do Krumer Desktop v1.3.0 — dark/minimalista como padrão, sem visual genérico de template Expo  
> **Última atualização deste doc:** 2026-08-24 — auditado direto em `App.tsx:1`, `src/screens/*`, `src/components/*`, `src/theme/*`, `src/navigation/types.ts:1`

---

## Índice

1. [Mapa de Navegação](#1-mapa-de-navegacao)
2. [Design System — Fundacão Visual](#2-design-system--fundacao-visual)
3. [Janela 0 — Splash / Loading](#3-janela-0--splash--loading)
4. [Janela 1 — Onboarding (3 slides)](#4-janela-1--onboarding-3-slides)
5. [Janela 2 — Biblioteca (Aba Principal)](#5-janela-2--biblioteca-aba-principal)
6. [Janela 3 — Detalhes do Livro](#6-janela-3--detalhes-do-livro-bookdetail)
7. [Janela 4 — Listas (Aba)](#7-janela-4--listas-aba)
8. [Janela 5 — Configurações (Aba)](#8-janela-5--configuracoes-aba)
9. [Janela 6 — Configurações › Subtelas (SettingsGroup)](#9-janela-6--configuracoes--subtelas-settingsgroup)
10. [Janela 7 — Leitor (Reader) — PDF & EPUB](#10-janela-7--leitor-reader--pdf--epub)
11. [Componentes Reutilizáveis (Design Atômico)](#11-componentes-reutilizaveis-design-atomico)
12. [Estados Globais, Persistência e Responsividade](#12-estados-globais-persistencia-e-responsividade)
13. [Paridade com Desktop & Roadmap Visual](#13-paridade-com-desktop--roadmap-visual)
14. [Referência Rápida — Arquivos-fonte por Janela](#14-referencia-rapida--arquivos-fonte-por-janela)

---

## 1. Mapa de Navegacão

### 1.1 Hierarquia de Navegadores (`App.tsx:21`)

```
App (SafeAreaProvider > AuthProvider > AppProvider)
 └─ AppShell
     ├─ [ready == false] → Splash (ActivityIndicator)
     ├─ [hasOnboarded == false] → OnboardingScreen (stack fora da navegação)
     └─ [hasOnboarded == true] → NavigationContainer
          └─ RootStack (NativeStack)
               ├─ MainTabs (BottomTabNavigator)  ← headerShown: false
               │    ├─ Library  (tabBarIcon: BookOpen)
               │    ├─ Lists    (tabBarIcon: List)
               │    └─ Settings (tabBarIcon: Settings)
               ├─ BookDetail { bookId: string }         ← headerShown: false (header flutuante próprio)
               ├─ Reader     { book: Book }             ← headerShown: false (barras animadas)
               └─ SettingsGroup { group: general|account|theme|api|about }
```

### 1.2 Tipos de Rota (`src/navigation/types.ts:1`)

| Stack | Rota | Params | Descrição |
|-------|------|--------|-----------|
| `RootStack` | `MainTabs` | — | Container das 3 abas |
| `RootStack` | `BookDetail` | `{ bookId: string }` | Detalhes + edição |
| `RootStack` | `Reader` | `{ book: Book }` | Leitor PDF/EPUB |
| `RootStack` | `SettingsGroup` | `{ group: 'general'|'account'|'theme'|'api'|'about' }` | Subtela de configurações |
| `MainTab` | `Library` | — | Biblioteca |
| `MainTab` | `Lists` | — | Listas |
| `MainTab` | `Settings` | — | Configurações (hub) |

### 1.3 Fluxo do Usuário

```
[Primeira instalação] → Onboarding (setup → library → api) → MainTabs/Library
[Reabertura] → Splash → MainTabs/Library
Library --tap capa--> BookDetail --Ler Agora--> Reader --voltar--> BookDetail --voltar--> Library
Library --long-press capa--> toggle Favorito
Listas --tap card--> Modal Detalhe da Lista --tap capa--> BookDetail
Listas -- + --> Criar Lista / Gerenciar Livros / Renomear / Excluir
Settings --row--> SettingsGroup (general/account/theme/api/about)
Reader --tap centro--> toggle barras · --ícone engrenagem--> BottomSheet de tipografia/tema
```

---

## 2. Design System — Fundacão Visual

### 2.1 Paleta de Temas (`src/theme/colors.ts:17`)

Três temas obrigatórios, trocados em tempo real via `AppContext.setThemeName()` e refletidos em `theme.*` em todo o app. `accent` é constante nos três temas para identidade.

| Token | `dark` | `light` | `sepia` |
|-------|--------|---------|---------|
| `bg` | `#111111` | `#ffffff` | `#f4ecd8` |
| `surface` | `#161616` | `#f5f5f5` | `#ece2c8` |
| `card` | `#202020` | `#ffffff` | `#f0e6cc` |
| `cardHover` | `#262626` | `#ececec` | `#e6dab8` |
| `border` | `#2e2e2e` | `#e0e0e0` | `#d8c9a3` |
| `textPrimary` | `#f1f1f1` | `#1a1a1a` | `#3b2f1e` |
| `textSecondary` | `#cccccc` | `#4a4a4a` | `#5c4c33` |
| `textMuted` | `#888888` | `#777777` | `#8a7a5c` |
| `accent` | `#f97316` (laranja) | `#f97316` | `#f97316` |
| `accentMuted` | `#f9731622` | `#f9731622` | `#f9731622` |

**Detalhe BookDetail:** `accentColor = theme.name === 'dark' ? '#ff6500' : theme.accent` (`BookDetailScreen.tsx:97`) — laranja mais vivo no dark para contraste sobre fundo desfocado.

### 2.2 Raios, Espaçamento e Sombras

```ts
// src/theme/colors.ts:59,71
radii = { sm: 6, md: 10, lg: 16 }
spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 }

// Sombras de capa — por tema
coverShadow('light') → '0 3px 10px rgba(0,0,0,0.16)'
coverShadow('sepia') → '0 3px 10px rgba(90,60,30,0.22)'
coverShadow('dark')  → '0 2px 6px rgba(0,0,0,0.35)'
```

Breakpoints:

```ts
TABLET_BREAKPOINT = 600 // LibraryScreen.tsx:29 — >=600px = tablet
```

| Largura | Biblioteca (`LibraryScreen`) | Listas — Cards (`ListsScreen`) |
|---------|------------------------------|--------------------------------|
| `< 600` (celular) | `numColumns = 3` | `listNumColumns = 2` |
| `>= 600` (tablet) | `numColumns = 5` | `listNumColumns = 4` |

### 2.3 Tipografia (`src/theme/typography.ts:1`)

| Token | Valor |
|-------|-------|
| `serifFont` | `Platform.select({ ios: 'Georgia', default: 'serif' })` — todas as telas usam serifado (identidade Krumer) |
| `monoFont` | `'Courier'` (reservado) |

Tamanhos recorrentes: título hero `22–26`, subtítulo `14`, body `13–15`, caption `11–12`, badge `10`.

### 2.4 Iconografia

Biblioteca: `lucide-react-native` (`BookOpen`, `List`, `Settings`, `ArrowLeft`, `Heart`, `Star`, `Check`, `Search`, `Plus`, etc.). Sem ícones customizados além do `KrumerLogo` (`assets/Krumer-logo.png` + SVG fallback `assets/Krumer-logo.svg`).

### 2.5 Bottom Tab Bar (`App.tsx:28`)

```ts
tabBarActiveTintColor: theme.accent
tabBarInactiveTintColor: theme.textSecondary
tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border, height: 56 }
tabBarLabelStyle: { fontFamily: serifFont }
headerShown: false // todas as tabs desenham header próprio
```

### 2.6 Princípios de Estética (AGENTS.md)

- Tema padrão: `dark`. Dark/minimalista, nunca template genérico Expo.
- Cards com `borderWidth: 1` + `borderColor: theme.border` — bordas visíveis em todos os temas.
- Imagens sempre `resizeMode: cover` dentro de container `aspectRatio: 5/7`, `overflow: hidden`.
- Fallback de capa: `placeholderBackground` por tema (`#2d2d2d` dark / `#ececec` light / `#e8dccb` sepia) + título em `fontWeight: 800` centralizado.
- Animações: `Animated.spring` / `Animated.timing` para clear button da busca e barras do leitor (200ms, `useNativeDriver: true`).

---

## 3. Janela 0 — Splash / Loading

**Arquivo:** `App.tsx:88` · `AppShell`

| Estado | O que renderiza |
|--------|-----------------|
| `ready === false` (hidratação AsyncStorage) | `<View>` full-screen `bg: theme.bg` + `<ActivityIndicator color={theme.accent}>` + texto `"Krumer"` serifado `textSecondary` |

Nenhuma navegação disponível até `loadPreferences() + loadBooks() + loadSyncLists()` resolverem (`AppContext.tsx:76`).

---

## 4. Janela 1 — Onboarding (3 slides)

**Arquivo:** `src/screens/OnboardingScreen.tsx:1`  
**Quando aparece:** `preferences.hasOnboarded === false` (`App.tsx:97`). Fora do `NavigationContainer` — tela raiz sem navegação.
**Layout base:** `SafeAreaView` + `ScrollView` centralizado (`maxWidth: 420`, `padding: spacing.lg`) + `KrumerLogo hideLabel size={104}` no topo + dots indicador embaixo.

### 4.1 Slide `setup` — Idioma e Tema

```
┌─────────────────────────────────┐
│           [Logo 104px]          │
│         "Configurar Krumer"     │  ← t('onboarding.setup'), 24px, center
│                                 │
│  Idioma                         │  ← t('language.label'), 13px
│  [ LangPickerButton ▾ ]         │  ← abre modal de 3 idiomas (en/pt-br/es)
│                                 │
│  Tema                           │  ← t('theme.label')
│  [ Dark ] [ Light ] [ Sepia ]   │  ← ThemeCard (42×82), borda accent quando selected
│                                 │
│         [ Continuar ]           │  ← PrimaryButton accent, goTo(1)
│                                 │
│           ○ ● ○ (dots)           │  ← accent no ativo, border nos demais
└─────────────────────────────────┘
```

- `ThemeCard` (`src/components/ThemeCard.tsx:1`): preview `preview.bg` + `preview.border` + label. `selected ? borderColor: theme.accent borderWidth:2 : theme.border borderWidth:1`.
- Dots: `Pressable hitSlop={8}` permite pular direto para qualquer slide (`goTo(index)`).

### 4.2 Slide `library` — Pasta da Biblioteca

```
┌─────────────────────────────────┐
│          "Biblioteca"           │
│  [ FolderPickerField ]          │  ← exibe pasta atual, botão Selecionar
│  [ Escanear ]                   │  ← PrimaryButton, disabled se !folder || scanning
│  ── ou ──                       │
│  [ ScanProgress ]               │  ← barra + "fileName · percent%" + spinner
│  [ Continuar ]                  │  ← só quando scanProgress.done
└─────────────────────────────────┘
```

- `FolderPickerField` (`src/components/FolderPickerField.tsx` / `.web.tsx`): SAF no Android, input simulado na web. `updateFolder()` persiste via `setLibraryFolder()`.
- `scanLibrary(folder, setScanProgress)` (`src/services/libraryScanner.ts`): varredura recursiva SAF, detecta `.pdf`/`.epub`, pastas com múltiplos arquivos viram `Book` com `children`.
- `ScanProgress` (`src/components/ScanProgress.tsx`): `fileName`, `percent`, `done`.

### 4.3 Slide `api` — Chave Gemini

```
┌─────────────────────────────────┐
│      "Busca de Metadados"       │  ← t('api.metadataTitle')
│  "Adicione sua chave..."        │  ← t('api.metadataSubtitle'), 13px center, textSecondary
│  Chave da API Gemini            │  ← 13px
│  [ ApiKeyInput (secure) ]       │  ← TextInput com toggle olho
│  [ Salvar ]                     │  ← disabled se !apiKey.trim()
│  "Configurar mais tarde"        │  ← underline, textSecondary → finish(null)
└─────────────────────────────────┘
```

- `ApiKeyInput` (`src/components/ApiKeyInput.tsx`): campo seguro com ícone olho.
- `finish(key)` → `setGeminiApiKey(key)` (se houver) + `setHasOnboarded(true)` → navega automaticamente para `MainTabs`.

---

## 5. Janela 2 — Biblioteca (Aba Principal)

**Arquivo:** `src/screens/LibraryScreen.tsx:1`  
**Rota:** `MainTabs > Library` · **Ícone:** `BookOpen` 20px  
**Layout:** `SafeAreaView edges=['top']` + `FlatList` vertical (grid) + `ListHeaderComponent` acima do grid + `ListEmptyComponent`.

### 5.1 Header da Biblioteca (`LibraryHeader:115`)

Ordem vertical exata:

1. **Logo compacto** — `KrumerLogo compact hideLabel` com `paddingHorizontal: spacing.md, paddingTop: 20, paddingBottom: 10`.
2. **Continuar Lendo** (condicional) — só quando `!isSearching && continueReading.length > 1`:
   - Título `t('library.continueReading')` 17px `fontWeight: 700`.
   - `FlatList` horizontal `data={continueReading}` (livros com `0 < progressPct < 100`) — `gap: spacing.md`, `paddingHorizontal: spacing.md`.
   - Cada item: `BookCardContinue` (`CARD_WIDTH: 140`, `COVER_HEIGHT: 196`, `COVER_RADIUS: 16`).
   - Divisor `borderBottomWidth: 1, borderBottomColor: theme.border, marginHorizontal: spacing.md, marginTop: spacing.lg` após o carrossel.
3. **Barra de Busca + Ordenação** — `SearchSortBar` (`src/components/SearchSortBar.tsx:1`).
4. **Stats em 3 colunas** — card `theme.card` com `borderWidth: 1, borderRadius: radii.md`:

```
┌─────────────────────────────────────────┐
│   42        │    12     │     30         │  ← totalCount | readCount (accent) | unreadCount
│   Total     │   Lidos   │  Não lidos     │  ← 11px textMuted, 600
└─────────────────────────────────────────┘
```

- `totalCount = flattenBooks(books).length` (recursivo — já conta filhos).
- `readCount = progressPct >=100 || isRead`.
- `unreadCount = progressPct === 0 && !isRead`.

### 5.2 `SearchSortBar` (`src/components/SearchSortBar.tsx:25`)

```
┌────────────────────────────────────────────────┐
│ [ Buscar título ou autor…            (x)] [ ↕ Título ▾ ] │
└────────────────────────────────────────────────┘
```

| Elemento | Detalhe |
|----------|---------|
| Campo de busca | `backgroundColor: theme.surface, borderRadius: radii.lg (16), borderWidth:1`, `TextInput` com `placeholderTextColor: theme.textMuted`, `returnKeyType: search`. Botão clear `(x)` animado via `Animated.spring(clearScale)` — círculo `theme.border` 18×18 com `X` 11px. Ao limpar, refoca o input. |
| Botão ordenar | `backgroundColor: theme.surface` (ou `cardHover` pressed), `borderColor: theme.accent` quando `sort !== 'recent'` senão `theme.border`, `ArrowUpDown` 15px. Label = opção ativa. Acessível via `accessibilityLabel`. |
| Modal de ordenação | `Modal transparent animationType="fade"` + backdrop `rgba(0,0,0,0.45)` + sheet inferior `theme.surface, borderTopRadius: radii.lg+4, paddingBottom: spacing.xl`. Handle 36×4 `theme.border`. Título `SORT` 11px uppercase `letterSpacing: 1.2`. 4 opções com ícone + label + dot accent quando ativo. |

**Opções de ordenação (`SortKey`):**

| `SortKey` | Label (pt-br) | Ícone | Lógica (`LibraryScreen.tsx:51`) |
|-----------|---------------|-------|---------------------------------|
| `recent` | Recentes | `Clock` | `b.addedAt - a.addedAt` (default) |
| `name` | Título | `ArrowDownAZ` | `localeCompare` sensível |
| `rating` | Avaliação | `Star` | `b.rating - a.rating` |
| `progress` | Progresso | `BookMarked` | `b.progressPct - a.progressPct` |

Busca: `query.trim().toLowerCase()` casa `title` ou `author`. Quando `isSearching`, esconde "Continuar Lendo" e achata (`flattenBooks`) antes de filtrar/ordenar.

### 5.3 Grid de Capas

```
┌──────────┬──────────┬──────────┐  ← 3 colunas (celular) / 5 (tablet)
│ BookCard │ BookCard │ BookCard │     cardWidth = width / numColumns
│ BookCard │ BookCard │ BookCard │
└──────────┴──────────┴──────────┘
```

- `FlatList` com `numColumns`, `key={numColumns}` (força remount ao mudar breakpoint), `keyExtractor: book.id`, `renderItem: BookCard`.
- `BookCard` (`src/components/BookCard.tsx:1`): ver [Seção 11.1](#111-bookcard).
- Interações: `onPress → navigate('BookDetail', {bookId})`, `onLongPress → toggleFavorite(book)` (async, atualiza `AsyncStorage` + `SyncCoordinator` outbox).

### 5.4 Estados Vazios

| Estado | Componente | Ícone | Título | Subtítulo |
|--------|------------|-------|--------|-----------|
| Biblioteca vazia (`filteredBooks.length===0 && !isSearching`) | `EmptyLibrary:248` | `BookOpen` 56px `strokeWidth:1.2` `textSecondary` | `t('library.empty')` | `t('library.emptyHint')` — "Vá em Configurações > Geral..." |
| Sem resultados (`isSearching`) | `NoResults:262` | `SearchX` 48px | `t('library.noResults')` | `t('library.noResultsHint')` |

Ambos: `flex:1, justifyContent:center, alignItems:center, padding: spacing.xl`.

---

## 6. Janela 3 — Detalhes do Livro (BookDetail)

**Arquivo:** `src/screens/BookDetailScreen.tsx:1`  
**Rota:** `RootStack > BookDetail { bookId }` · `headerShown: false`  
**Fonte de dados:** `findBookById(books, bookId)` recursivo + `Book` do `AppContext`. Fallback "Book not found" + botão "Go Back" se `!book`.

### 6.1 Backdrop Hero com Blur (`:192`)

```
┌─────────────────────────────────┐
│  [←]              [♡] [⋮]       │  ← header flutuante zIndex:10, ícones heroIconColor
│                                 │
│   ┌───────────────────┐         │
│   │   CAPA 180×252    │         │  ← aspectRatio 5/7, borderRadius 18, elevation 12
│   │  (coverShadow)    │         │
│   └───────────────────┘         │
│        ○ ● ● (dots decor)       │
│    "Título da Obra" 22px 800    │  ← heroTextColor
│    "Série de ... / Editora" 14  │  ← heroSubtextColor
│    "Autor" 14                   │  ← heroMutedColor
│    ★★★★☆ (5 estrelas tap)      │
│                                 │
│  [ 📖 Continuar Lendo / Ler Agora ]  ← accent (#ff6500 dark), 52h, radius 14
│  [ ✓ Marcado como Lido ]            ← theme.card, border 1
│                                 │
│  ┌──────────────┬──────────────┐ │
│  │ 📅 Publicado │ 📄 Formato   │ │  ← card theme.card, radius 16, padding md
│  │  2024        │  PDF         │ │
│  └──────────────┴──────────────┘ │
│  ┌────────────────────────────┐  │
│  │ Progresso            42%   │  │  ← track 4px theme.bg, fill accent
│  │ ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░  │  │
│  └────────────────────────────┘  │
│  [#tag1] [#tag2]                 │  ← chips theme.card border 1, radius 12
│  Sinopse              Ver mais   │  ← toggle 4 linhas ↔ completo
│  "Lorem ipsum..."                │
│  Capítulos / Volumes (3)         │  ← só se isSeries (children.length >0)
│  ┌────────────────────────────┐  │
│  │ [thumb] Título   42%  [✓]  │  │  ← card por capítulo, thumb 54h
│  └────────────────────────────┘  │
└─────────────────────────────────┘
 ░░░░░░░░░ fundo: capa desfocada ░░░░░░░░░
```

**Camadas do backdrop (por trás de tudo, `position:absolute, top:-50 left:-50 right:-50 bottom:-50`):**

1. `Image` da capa `blurRadius={20}`, `height: 720, width: 100%, transform: scale(1.35), opacity:1`.
2. Tint `backgroundColor: 'rgba(0,0,0,0.25)' dark / 'rgba(0,0,0,0.04)' light` sobre a imagem.
3. `Svg LinearGradient` (`id="smoothHeroFade"`) cobrindo toda a área: `0%→0 opacity →15%→0.1→32%→0.4→55%→0.8→75%→1→100%→1` em `stopColor={theme.bg}` — fade 100% procedural sem banding, seamless com o `theme.bg` do scroll.

**Cores hero (adaptativas por tema, `:99`):**

| Token | dark | light / sepia |
|-------|------|---------------|
| `heroTextColor` | `#ffffff` | `theme.textPrimary` |
| `heroSubtextColor` | `rgba(255,255,255,0.7)` | `theme.textSecondary` |
| `heroMutedColor` | `rgba(255,255,255,0.55)` | `theme.textSecondary` |
| `heroIconColor` | `#ffffff` | `theme.textPrimary` |
| `accentColor` | `#ff6500` | `theme.accent (#f97316)` |
| `starEmptyColor` | `#414141` | `#a8acb5` light / `#bfae88` sepia |

### 6.2 Dimensões e Tipografia do Hero

- Capa: `width: width >= TABLET_BREAKPOINT ? 220 : 180`, `aspectRatio: 5/7`, `borderRadius: 18`, `boxShadow: coverShadow(theme.name)`, `elevation: 12`.
- Título: `22px, fontWeight: 800, lineHeight: 28, textAlign: center, marginTop: spacing.sm`.
- Dots decorativos: 3 círculos `6×6, borderRadius:4` — primeiro `opacity:1` em `heroTextColor`, demais `0.3`.
- Estrelas: 5× `Star` 20px `strokeWidth:1.5` — `STAR_FILLED: #ffda4d` / vazio `starEmptyColor`. Cada estrela é `Pressable hitSlop:6` com `handleRatingPress(star)` → `updateBookMetadata({rating})`.

### 6.3 Botões de Ação (`:379`)

| Botão | Estilo | Ação |
|-------|--------|------|
| **Ler Agora / Continuar Lendo** | `backgroundColor: accentColor, borderRadius:14, height:52, width:100%`, ícone `BookOpen` 20px branco + label 16px `700` branco | `handleOpenReader()` — se série, abre primeiro não-lido, senão o próprio livro → `navigate('Reader', {book})` |
| **Marcar como Lido / Não Lido** | `backgroundColor: theme.card, borderColor: theme.border, borderWidth:1, borderRadius:14, height:52`, ícone `Check` 20px (`accent` se lido senão `textPrimary`) | `handleToggleRead()` → `updateBookProgress({isRead: !isRead, progressPct: isRead?0:100})` |

### 6.4 Cards de Metadados (`:431`)

**Card Ano + Formato** — `flexDirection: row, backgroundColor: theme.card, borderWidth:1, borderRadius:16, padding: spacing.md`:

- Tile esquerdo: ícone `Calendar` 22px em quadrado `44×44 theme.bg radius:12` + label "Publicado" 12px `textMuted` + valor `15px 700` (ano ou `—`).
- Separador: `width:1, height:40, backgroundColor: theme.border, alignSelf:center, marginHorizontal: spacing.sm`.
- Tile direito: ícone `FileText` 22px + "Formato" + `format.toUpperCase()` ou `PDF`.

**Card Progresso** — `theme.card, radius:16, padding: spacing.md`: header `Progresso — %` (`textSecondary 13px 600` + `accent 13px 700`) + track `theme.bg 4px` + fill `accent` em `%`.

**Chips de Tags** — `flexDirection: row, flexWrap: wrap, gap: spacing.xs`: cada tag `theme.card, borderWidth:1, borderRadius:12, paddingH: spacing.sm+4, paddingV:4`, texto `#tag` 12px `textSecondary`.

### 6.5 Sinopse (`:557`)

- Header row `space-between`: título `18px 700` + botão `Ver mais / Ver menos` 13px `600 accent` (só se `description.length > 120`).
- Texto `numberOfLines: synopsisExpanded ? undefined : 4`, `14px lineHeight:22, color: description ? textSecondary : textMuted`.

### 6.6 Seção Capítulos / Volumes (`:585`)

Só renderiza se `isSeries` (`book.children?.length > 0`):

- Título `18px 700` + `({count})`.
- Lista `gap: spacing.sm`: cada capítulo é `Pressable` `theme.card, borderWidth:1, radius: radii.md, padding: spacing.md, flexDirection: row, gap: spacing.md`:

```
┌─────────────────────────────────────┐
│ [thumb 5/7 54h]  Título vol 1  [✓/📖] │
│                 PDF · 42% / Lido    │  ← 15px 600 + 12px textMuted
└─────────────────────────────────────┘
```

- Thumb: `Image` se `chapter.coverPath` senão `FileText` 20px.
- Status à direita: `Check accent 18px` se `isRead` senão `BookOpen textMuted 18px`.
- Tap → `handleOpenReader(chapter)` → `navigate('Reader', {book: chapter})`.

### 6.7 Header Flutuante (`:239`)

```ts
flexDirection: row, justifyContent: space-between, paddingH: spacing.md, paddingV: spacing.md, zIndex:10
```

- Esquerda: `ArrowLeft 24px heroIconColor, hitSlop:12` → `navigation.goBack()`.
- Direita: `Heart 22px` (`fill: accentColor` se favorito senão `transparent`, `color: accentColor|heroIconColor`) → `toggleFavorite(book)` + `MoreVertical 22px heroIconColor` → `handleOpenEditModal()`.

### 6.8 Modal de Edição de Metadados (`:646`)

`Modal animationType="slide" visible={isEditing}` — full-screen `SafeAreaView edges=['top','bottom'], bg: theme.bg`:

**Header do modal:** `flexDirection: row, space-between, borderBottomWidth:1, paddingH: spacing.lg, paddingV: spacing.md` — título `18px 700` + `Cancelar` (`textSecondary`) + botão `Salvar` (`accent, radius: radii.sm, paddingH: spacing.md+4`) com `ActivityIndicator` quando `isSaving`.

**Scroll do formulário** (`contentContainerStyle: gap: spacing.lg, paddingH: spacing.md, paddingTop: md, paddingBottom: xl*2`):

| Campo | Componente | Detalhe |
|-------|------------|---------|
| Capa | Preview `aspectRatio 5/7, height:230, radius: radii.md, boxShadow, elevation:8` + 2 botões row | `Alterar Capa` (`ImageIcon accent 15px` + `theme.card border1`) → `DocumentPicker.getDocumentAsync({type:'image/*', copyToCacheDirectory:true})` → copia para `${documentDirectory}covers/custom_${id}_${Date.now()}.jpg` → `setEditCoverPath`. `Restaurar Capa Original` (`RotateCcw textSecondary`) → `setEditCoverPath(editCoverOriginalPath)` — **F3 Android**. |
| Título | `TextInput` `theme.card, border1, radius: radii.sm, paddingH: md, paddingV: sm+4, fontSize:15` | `value: editTitle`, placeholder `t('details.titleInput')` |
| Autor | idem | `editAuthor` |
| Ano | `keyboardType: numeric`, placeholder `Ex: 2024` | `editYear` → `parseInt` no save, `null` se vazio |
| Avaliação | Row de 5 `Star 26px` | `star <= editRating ? #ffda4d : starEmptyColor`, `onPress: setEditRating(star)` |
| Tags | `TextInput` placeholder `t('details.tagsHint')` ("Separe as tags por vírgula") | `editTags` (string com vírgulas) → `split(',').map(trim).filter(Boolean)` no save |
| Sinopse | `multiline numberOfLines:6, minHeight:120, textAlignVertical: top, lineHeight:22, fontSize:14` | `editDescription` |

**Save:** `handleSaveMetadata()` → `updateBookMetadata(book.id, {title, author, year, description, rating, tags, coverPath, coverOriginalPath})` → fecha modal. Campos vazios preservam originais (`title.trim() || book.title`).

---

## 7. Janela 4 — Listas (Aba)

**Arquivo:** `src/screens/ListsScreen.tsx:1`  
**Rota:** `MainTabs > Lists` · **Ícone:** `List` 20px  
**Dados:** `collections: CollectionItem[]` computado via `useMemo` a partir de `books` + `lists` (AsyncStorage).

### 7.1 Coleções Fixas + Customizadas (`:72`)

```
┌──────────────┬──────────────┐  ← 2 colunas celular / 4 tablet
│  Favoritos   │ Séries/Manga │    (ListCard)
│  ♡ 3 livros  │  📚 2 séries │
├──────────────┼──────────────┤
│    Lidos     │  Não Lidos   │
│  ✓ 12        │  ○ 8         │
├──────────────┼──────────────┤
│ Minha Lista  │ Outra Lista  │  ← listas customizadas (isFixed:false)
└──────────────┴──────────────┘
```

| Coleção | `key` | `isFixed` | `isFavorite` | Fonte dos `books` |
|---------|-------|-----------|--------------|-------------------|
| Favoritos | `favoriteList.id \|\| 'favorites'` | `true` | `true` | `allBooks.filter(b => favoriteList.bookFingerprints.includes(b.fingerprint))` |
| Séries/Mangás | `series` | `true` | — | `books.filter(b => b.children?.length)` |
| Lidos | `read` | `true` | — | `allBooks.filter(b => progressPct>=100 \|\| isRead)` |
| Não Lidos | `unread` | `true` | — | `allBooks.filter(b => progressPct===0 && !isRead)` |
| Customizadas | `list.id` | `false` | — | `allBooks.filter(b => list.bookFingerprints.includes(b.fingerprint))` para cada `!isDefault && name !== 'Favoritos'` |

`allBooks = flattenBooks(books)` — achata séries recursivamente. `custom` vem de `lists.filter(!isDefault)`.

**Grid:** `FlatList numColumns={listNumColumns} key={listNumColumns}` + `columnWrapperStyle: gap: spacing.md` + `contentContainerStyle: gap+padding md`. Se `collections.length % numColumns !== 0`, adiciona spacers invisíveis (`__spacer_i__`) para alinhar última linha.

**Header da aba:** `padding: spacing.md, flexDirection: row, space-between` — título `26px serif` + botão `Plus 24px accent hitSlop:10` → `setCreating(true)`.

**Estado vazio:** se todas as 4 coleções fixas têm `0` livros e não há customizadas → `ListIcon 56px` + `t('lists.empty')` + `t('lists.emptyHint')` ("Toque em + para criar").

### 7.2 `ListCard` (`src/components/ListCard.tsx:1`)

```
┌─────────────────────────┐
│ ┌─────────────────────┐ │
│ │  [capa1][capa2][capa3] │  ← previewBg (#18181b dark / theme.surface claro), 80h, radius sm
│ │  (até 3 capas sobrepostas, marginLeft:-14) │
│ └─────────────────────┘ │
│  Título da Lista 14px 700 │
│  3 livros 11px 600 muted │
└─────────────────────────┘
```

- Wrapper: `theme.card, borderWidth:1, borderRadius: radii.md, padding: spacing.sm+2, gap: spacing.sm`.
- Área de capas: `height:80, borderWidth:1, overflow:hidden`. Se `preview.length===0` → `BookOpen 22px textSecondary`. Se há capas → `flexDirection: row, justifyContent:center`, cada capa `40×62, borderRadius:4, borderWidth:1, elevation:4, shadow, zIndex:10-index, marginLeft:-14`.
- Capa fallback sem `coverPath`: `theme.surface` + texto `format` 8px `800 accent uppercase`.
- Tap → `setActiveCollectionKey(item.key)` (abre Modal de Detalhe).

### 7.3 Modal: Detalhe da Coleção (`:275`)

`Modal animationType="slide" visible={Boolean(activeCollection)}` — `SafeAreaView bg: theme.bg`:

**Header do detalhe:** `flexDirection: row, gap: spacing.md, borderBottomWidth:1, padding: spacing.md` — `ArrowLeft 24px` (voltar) + coluna título `20px 700` + subtítulo `12px muted` com `"{count} livros"` + ações à direita:

| Botão | Condição | Ícone | Ação |
|-------|----------|-------|------|
| Gerenciar livros | `!isFixed \|\| isFavorite` | `PlusCircle 22px accent` | `setManagingBooks(true)` |
| Renomear | `!isFixed` | `Edit2 20px textSecondary` | `setRenameName(title); setRenaming(true)` |
| Excluir | `!isFixed` | `Trash2 20px #ef4444` | `setDeleting(true)` |

**Conteúdo:**

- Se `books.length===0` → empty `ListIcon 48px` + `t('lists.emptyList')` + botão `Gerenciar livros` (`theme.card border1 radius:8`) quando permitido.
- Se há livros → `FlatList numColumns={numColumns}` (3/5 igual Biblioteca) com `BookCard` por livro. `onPress → navigate('BookDetail', {bookId})`, `onLongPress → toggleBookInList(listId, fingerprint)` (remove da lista).

### 7.4 Modal: Criar Lista (`:235`)

`Modal transparent animationType="fade"` — backdrop `rgba(0,0,0,0.88)` full + card `theme.card, borderWidth:1, borderRadius:12, padding: spacing.lg, gap: spacing.md`:

- Título `18px` `t('lists.create')`, `TextInput autoFocus placeholder: t('lists.namePlaceholder')` (`border1 radius:8 padding: spacing.md`), botões `Cancelar` (`textSecondary`) + `Salvar` (`theme.accent radius:6`). `handleCreateList` → `createList(name)` (valida trim, evita duplicata `toLowerCase`).

### 7.5 Modal: Renomear / Excluir (`:380`, `:421`)

Mesmo padrão de card sobre backdrop escuro:

- **Renomear:** título `t('lists.rename')` + `TextInput autoFocus value={renameName}` + `Cancelar` / `Salvar` → `renameList(listId, newName)` (não renomeia `isDefault`, não duplica).
- **Excluir:** título `t('lists.delete') 18px 600` + `t('lists.deleteConfirm') 14px textSecondary` + `Cancelar` / `Excluir` (`#ef4444 radius:6`) → `deleteList(id)` (não exclui `isFixed`), fecha detalhe e deleta.

### 7.6 Modal: Gerenciar Livros na Lista (`:453`)

`Modal transparent animationType="slide"` — `SafeAreaView bg: theme.bg`:

- **Header:** `space-between, borderBottomWidth:1, padding: spacing.md` — título `18px 700 t('lists.manageBooks')` + botão `Concluído` (`theme.accent radius:6`).
- **Barra de busca:** `theme.card, border1, radius: radii.md, flexDirection: row, margin: spacing.md, paddingH: spacing.md` — ícone `Search 18px textMuted` + `TextInput` `flex:1, fontSize:14, paddingVertical: md` com `placeholder t('library.search')` + `value: bookSearchQuery`.
- **Grid de seleção:** `FlatList numColumns` sobre `searchableBooks` (allBooks filtrado por `title|author`). Cada célula:

```
┌──────────────────────┐
│      BookCard        │  ← onPress toggle
│           [✓/○]      │  ← absoluto top:sm+6 right:sm+6, 28×28, radius 14
└──────────────────────┘
```

  - Badge seleção: `28×28, borderRadius:14, borderWidth:1.5, elevation:4`. Se `isSelected` (`activeCollection.books.some(b.fingerprint===item.fingerprint)`) → `backgroundColor: theme.accent, borderColor: #fff` + `Check 18px branco strokeWidth:3`; senão `rgba(0,0,0,0.4) + border: theme.border` vazio.
  - Tap no card ou no badge → `toggleBookInList(listId, fingerprint)` (adiciona/remove no array `bookFingerprints`).

---

## 8. Janela 5 — Configuracões (Aba)

**Arquivo:** `src/screens/SettingsScreen.tsx:1`  
**Rota:** `MainTabs > Settings` · **Ícone:** `Settings` 20px  
**Layout:** `SafeAreaView edges=['top'], flex:1, bg: theme.bg` — título `26px serif` em `padding: spacing.md` + 5× `SettingsRow`.

| # | `SettingsRow` | `title` | `subtitle` | `group` |
|---|---------------|---------|------------|---------|
| 1 | Geral | `t('settings.general')` | `"{Folder\|NoFolder} · {Language name}"` (`languages.find(code===preferences.language)`) | `general` |
| 2 | Conta | `t('auth.account')` | `user.email ?? t('auth.signedOut')` (de `useAuth()`) | `account` |
| 3 | Tema | `t('settings.theme')` | `t('theme.dark'\|'light'\|'sepia')` conforme `preferences.theme` | `theme` |
| 4 | Chave API | `t('settings.apiKey')` | `preferences.geminiApiKey ? t('api.configured') : t('api.noKey')` | `api` |
| 5 | Sobre | `t('settings.about')` | `Krumer Mobile v0.1.0` | `about` |

Cada row: `onPress → navigation.navigate('SettingsGroup', {group})`.

### 8.1 `SettingsRow` (`src/components/SettingsRow.tsx:1`)

```
┌─────────────────────────────────────────┐
│ Título 15px textPrimary                 │  › 20px
│ Subtítulo 12px textSecondary (1 linha)  │
└─────────────────────────────────────────┘
```

Estilo: `Pressable flexDirection: row, alignItems:center, gap: spacing.md, padding: spacing.md, backgroundColor: theme.card, borderBottomWidth:1, borderBottomColor: theme.border`. Seta `ChevronRight 20px textSecondary` à direita.

---

## 9. Janela 6 — Configuracões › Subtelas (SettingsGroup)

**Arquivo:** `src/screens/SettingsGroupScreen.tsx:1`  
**Rota:** `RootStack > SettingsGroup { group }` — `headerStyle: {backgroundColor: theme.bg}, headerTintColor: theme.textPrimary`, `title: ''` (título renderizado dentro do `ScrollView`).  
**Layout:** `SafeAreaView edges=['top'], bg: theme.bg` + `ScrollView contentContainer: gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xl` — título `26px serif` no topo (`titles[group]`).

### 9.1 `group: 'general'`

```
Geral (26px)
[ FolderPickerField ]          ← value={folder} onChange={updateFolder → setLibraryFolder}
[ Escanear ]                   ← PrimaryButton disabled={!folder}
[ ScanProgress ]               ← quando houver progresso
Idioma 13px
[ LangPickerButton ]
```

- `PrimaryButton` local: `alignSelf:flex-start, backgroundColor: disabled?accentMuted:accent, borderRadius: radii.md, paddingH: spacing.lg, paddingV: spacing.sm`, label `15px 700` com `color: theme.bg`.
- `LangPickerButton` (`src/components/LangPicker.tsx`): modal com 3 idiomas (PT/EN/ES) — bandeira/label, selecionado com dot accent.

### 9.2 `group: 'theme'`

```tsx
<View flexDirection:row gap:sm>
  <ThemeCard large value="dark"  selected={preferences.theme==='dark'}  />
  <ThemeCard large value="light" selected={preferences.theme==='light'} />
  <ThemeCard large value="sepia" selected={preferences.theme==='sepia'} />
</View>
```

`ThemeCard large` → `minHeight:112` (vs 82 normal), preview interno `minHeight:54` (vs 34). Ver seção 11.

### 9.3 `group: 'account'` — `AuthSettings`

**Arquivo:** `src/components/AuthSettings.tsx:1` — autenticação Supabase completa.

**Estado não-logado:**

```
"Entre para preparar a sincronização..." 13px textSecondary lineHeight 19
[StatusMessage se houver]                 ← accentMuted ou #ef44441a com border
[ G  Continuar com Google ]               ← botão branco #fff border #dadce0, "G" azul #4285f4
───────── ou continue com email ─────────  ← linhas theme.border + texto muted uppercase 11px
[ Entrar | Criar conta ] (tabs)           ← card theme.card border1 padding 3, tab ativa accent
Email [________]                           ← Field theme.card border1 radius md
Senha [________]
Confirmar senha [________] (só signup)
[ Entrar / Criar conta ]                   ← AuthButton accent
[ Receber link de acesso ]  [ Esqueci minha senha ]  ← LinkButton accent 12px, lado a lado
```

**Estado logado:**

```
[StatusMessage]
┌─────────────────────────────────┐
│ Conectado como 12px textSecondary│
│ user@email.com 16px selectable   │
│ Email confirmado 12px muted      │
│ ✓ Sync (3) 12px                  │  ← syncMark(state) + pending count
└─────────────────────────────────┘
[Recovery banner se recovery=true]  ← accentMuted borderLeft 3px accent
Nova senha [________]
Confirmar senha [________]
[ Alterar senha ]                    ← AuthButton accent
[ Sair da conta ]                   ← AuthButton secondary (theme.card)
```

- `syncMark`: `synced→✓, syncing→↻, pending→…, error→! (vermelho #ef4444), offline/signed_out→○`.
- Modos `signin|signup` com validação `password===confirmation`, `busy` desabilita tudo, `message` com `auth.working` ("Aguarde…").
- Ações: `signIn`, `signUp` (retorna `confirmationRequired`), `signInWithGoogle` (`'cancelled'|'signed-in'|'browser-opened'`), `sendMagicLink`, `requestPasswordReset`, `updatePassword`, `signOut`.

### 9.4 `group: 'api'`

```
Chave da API Gemini 13px textPrimary
[ ApiKeyInput ]                       ← secure, value={apiKey}
[ Salvar ]                           ← disabled se !trim
"{Key saved. | No key configured.}"  ← 13px accent se tem chave senão textSecondary
```

`saveKey() → setGeminiApiKey(apiKey.trim()) → setStatus(t('settings.keySaved'))`.

### 9.5 `group: 'about'`

```
        [ KrumerLogo 52px ]
        Krumer (28px 600 serif)
        Krumer Mobile v0.1.0 13px textSecondary
        [ GitHub ] 15px accent → Linking.openURL('https://github.com/adriantinoco-dev/Krumer')
        "Gerenciador de biblioteca pessoal por adriantinoco-dev." 13px center lineHeight 18
        "Licenças" 12px textSecondary
```

Container: `alignItems:center, gap: spacing.md, paddingTop: spacing.xl`.

---

## 10. Janela 7 — Leitor (Reader) — PDF & EPUB

**Arquivo:** `src/screens/ReaderScreen.tsx:1`  
**Rota:** `RootStack > Reader { book: Book }` · `headerShown: false`, `StatusBar hidden={!barsVisible}`  
**Persistência:** `AsyncStorage.getItem('progress_${book.id}')` como posição salva + `progress_${id}` local + `updateBookProgress()` para AsyncStorage global + outbox Supabase.

### 10.1 Arquitetura do Reader

```
┌─────────────────────────────────────────┐
│  TopBar (Animated, theme.surface+ee)    │  ← ArrowLeft + título 15px 600 + autor 11px muted
│  ─────────────────────────────────────  │
│                                         │
│         PdfReader  ou  EpubReader       │  ← flex:1, bg: theme.bg
│                                         │
│  ─────────────────────────────────────  │
│  BottomBar (Animated, theme.surface+ee) │  ← progress track + %, página + [⚙ Config]
└─────────────────────────────────────────┘
         ↕ tap centro = toggle barras (HIDE_DELAY 4000ms)
```

- `barsVisible` inicia `true`, `opacity = Animated.Value(1)`. `toggleBars()` → `setBars(!visible)` com `Animated.timing(200ms, useNativeDriver:true)`. `scheduleHide()` agenda `setBars(false)` após `HIDE_DELAY: 4000`. Ao abrir `settingsVisible`, cancela o timer.
- `ReaderSettings` (`AsyncStorage 'krumer.reader.settings'`): `{ fontSize: 12–32 step2 default18, lineHeight: 1.0–2.4 step0.2 default1.5 }` — só afetam EPUB.

### 10.2 Leitor PDF — `PdfReader`

**Arquivo:** `src/readers/PdfReader.tsx:1` (orquestrador) + `src/readers/pdf/PdfHorizontal.tsx` (render) + `src/readers/pdf/pdfUri.ts` + `src/readers/pdf/usePdfPrefs.ts`

**Fluxo de abertura (D1):**

1. `resolvePdfUri(filePath)` — se `content://`, copia para cache via `FileSystem.copyAsync`; se `file://` ou `/`, usa direto.
2. `loadPdfPrefs()` → `scale` (default `PDF_DEFAULTS.scale`).
3. `PdfHorizontal` renderiza `react-native-pdf` com `singlePage:true` (horizontal página única), `enableAntialiasing:true`.
4. `onLoadComplete(totalPages, path, pageSize)` captura `totalPages` + `pageSize` (para `fittedHeight`), `hasCapturedTotalRef` trava total, `clampPage(initialPage, totalPages)`.
5. Guards anti-1-página fantasma (D3): se `singlePage && numberOfPages===1 && totalPages>1`, ignora. `onPageChanged` só corrige total se `numberOfPages > totalPages`.
6. Fallback 4s: se `!captured && !resolving && resolvedUri`, destrava com `totalPages||1`.

**Render:**

- `PdfHorizontal` única instância (evita double-load). Props: `resolvedUri, currentPage, totalPages, pageSize, scale, isSinglePageReady, onLoadComplete/onPageChanged/onLoadProgress/onError/onSingleTap`.
- Overlay de loading `theme.bg + ActivityIndicator + "Carregando documento..."` enquanto `loading||!captured` (zIndex 10).
- Erro: card `theme.surface border1 radius: lg` com título vermelho + detalhe + `filePath` 10px `selectable`.

**Navegação (D4):**

- Tap zones 25/50/25: `x/width <0.25 → prev`, `>0.75 → next`, senão `onCenterTap() → toggleBars()`.
- `goToPage(next)` com guard `renderingPagesRef` (Set, debounce 300ms) + `clampPage` + `onPageChange(clamped, totalPages)` → `ReaderScreen.saveProgress(String(page), page/total, page, total)`.

**Responsivo:** `useWindowDimensions().width` para zonas de tap.

### 10.3 Leitor EPUB — `EpubReader`

**Arquivo:** `src/readers/EpubReader.tsx:1` + `src/readers/epubVendorScript.ts` (epub.js vendorizado)

**HTML base (`EPUB_HTML_BASE:35`):**

```html
<body>
  <div id="loading"><div class="spinner"></div></div>
  <div id="running-header"></div>   <!-- capítulo atual, 11px uppercase 700 -->
  <div id="running-footer"></div>   <!-- "12 / 139", 11px 500 -->
  <div id="viewer"></div>           <!-- rendition do epub.js, flow:paginated -->
</body>
```

**Estilos fixos:** `body: Georgia serif, #181818 bg`, `#viewer: absolute top36 left20 width:calc(100vw-40px) height:calc(100vh-60px)`, spinner `f97316`.

**Bridge JS ↔ React Native (via `WebView.injectJavaScript`):**

- `window.addEventListener('message')` → `SET_INSETS | OPEN_BOOK | NEXT_PAGE | PREV_PAGE | SET_THEME | SET_FONT_SIZE | SET_LINE_HEIGHT`.
- `post({type, ...})` → `window.ReactNativeWebView.postMessage(JSON.stringify(obj))` → `onMessage` no RN.
- `openBook(path, cfi, base64, insets)` → `ePub(buffer|path)` → `renderTo('viewer', {width, height, flow:'paginated'})` → `book.loaded.navigation` (toc), `rendition.display(cfi?)`, `locations.generate(1500)` (páginas reais), listeners `relocated` + `rendered` (swipe + typography inject).

**Topologia de mensagens:**

| Direção | `type` | Payload |
|---------|--------|---------|
| RN → WebView | `SET_INSETS` | `{insets: {top,bottom,left,right}}` |
| RN → WebView | `OPEN_BOOK` | `{path, cfi, base64, insets}` |
| RN → WebView | `SET_THEME` | `{theme: 'dark'|'light'|'sepia'}` |
| RN → WebView | `SET_FONT_SIZE` | `{size: number}` |
| RN → WebView | `SET_LINE_HEIGHT` | `{value: number}` |
| WebView → RN | `READY` | — |
| WebView → RN | `ERROR` | `{message}` |
| WebView → RN | `LOCATION_CHANGED` | `{cfi, percentage, locationIndex, totalLocations, chapterTitle}` |
| WebView → RN | `LOCATIONS_READY` | `{totalLocations}` |
| WebView → RN | `TAP_CENTER` | — |

**Detalhes visuais EPUB:**

- `safeInsets` (`useSafeAreaInsets`): `top: max(insets.top,20)+30, bottom: max(insets.bottom,12)+40, left/right: max(insets.left|right,8)+6` → passado como `insets` para `applyInsets()` que reposiciona `#viewer` + `resize(w,h)` no `rendition` + move header/footer.
- `running-header`: `top: max(12, top-24), left/right: insets`, capítulo extraído via `findChapterLabel(toc)` casando `href` do `location.start.href`.
- `running-footer`: `bottom: max(10, bottom-22), right: insets`, `"locIdx+1 / totalLocs"`.
- `_injectBookTypography(doc)`: injeta `font-family: Georgia !important, line-height:1.75, a {color:#f97316}` em cada `view.document`.

**Gestos (D4):**

- `setupSwipeGesture(doc)` — `touchstart` registra `x/y/time`, `touchend` calcula `deltaX/Y`; se `|deltaX|>30 && |deltaX| > |deltaY|*1.2 && deltaTime<600` → `rendition.next()/prev()`, seta `lastSwipeTime`.
- `handleIframeTap(e)` — ignora se `now - lastSwipeTime <400` (evita clique sintético pós-swipe); `zone = x/w` → `<0.25 prev | >0.75 next | else TAP_CENTER`.

**Resolução de arquivo:**

- `resolveEpubUri(filePath)` — `file://`/`/` direto; `content://` → copia para `${cacheDirectory}epub-reader/${Date.now()}-${safeName}.epub`.
- RN lê `base64` via `FileSystem.readAsStringAsync(resolvedPath, {encoding: Base64})` e envia no `OPEN_BOOK` (fallback se `ePub(path)` falhar).

**Estados RN:**

- `resolving` → `ActivityIndicator + "Preparando EPUB..."`.
- `loading` → `ActivityIndicator` overlay até `READY`.
- `error` → card `theme.surface border1 radius lg` com título `accent 16px 700`, mensagem `textSecondary 13px`, `filePath selectable 10px`.

### 10.4 Top Bar do Reader (`ReaderScreen.tsx:158`)

`Animated.View pointerEvents: barsVisible?'auto':'none', opacity, position:absolute top0 left0 right0`

```ts
backgroundColor: theme.surface + 'ee' // 93% opaco
borderBottomWidth:1, borderBottomColor: theme.border
paddingTop: max(insets.top, 44 iOS / 24 Android) + spacing.xs
paddingBottom: spacing.sm, paddingH: max(insets.left|right, spacing.md)
```

Conteúdo: `Row gap: spacing.md` — `ArrowLeft 22px textPrimary, hitSlop:12, onPress: navigation.goBack()` + coluna `flex:1 gap:2` com `book.title 15px 600 1 linha` + `book.author 11px muted 1 linha`.

### 10.5 Bottom Bar do Reader (`:216`)

```ts
position:absolute bottom0 left0 right0, bg: theme.surface+'ee', borderTopWidth:1
paddingBottom: max(insets.bottom,16)+xs, paddingTop: spacing.sm
```

**Linha 1 — Progress track:** `Row gap:sm marginBottom:sm` — track `theme.border 6h flex:1 radius: sm overflow:hidden` + fill `theme.accent 100%h width: progressPercent%` + label `theme.accent 12px 700 minWidth:36 right`.

**Linha 2 — Info + Config:** `Row space-between center` — esquerda `12px textMuted`: se PDF com `totalPages → "Página 42 / 139"` senão EPUB com ambos → `"Página 12 / 139 · 42%"` senão `"% "`; direita `Pressable theme.card border1 radius sm paddingH:sm paddingV:xs gap:xs` com `Settings 14px textSecondary` + `t('reader.readingSettings') 11px`.

### 10.6 BottomSheet — Configurações de Leitura (`:310`)

`Modal transparent animationType="slide"` — overlay `flex:1 justifyContent:flex-end` + sheet:

```ts
backgroundColor: theme.card, borderWidth:1, borderColor: theme.border
borderTopLeft/Right: radii.lg, gap: spacing.lg
paddingBottom: ios? spacing.xl : spacing.lg, paddingH: spacing.lg, paddingTop: spacing.lg
```

- Handle `36×4 theme.border radius:2 self:center marginBottom:xs`.
- Título `18px 700`.
- **Controles de fonte (só EPUB, `isEpub`):**
  - Font size: header `Type 14px + t('reader.fontSize') 13px textSecondary` + valor `12px muted "{size}px"`; row com botão `A` 16px (`theme.surface border1 36×36 radius sm`) + track `theme.border 6h flex:1` + fill `accent` em `((size-MIN)/(MAX-MIN))*100%` + botão `A` 20px. Desabilita em `MIN/MAX` (`opacity:0.3`).
  - Spacing: header `t('reader.spacing')` + `lineHeight.toFixed(1)`; row `Minus 16px` + track + `Plus 16px` (mesmo estilo).
- **Seletor de tema:** label `t('theme.label') 13px textSecondary` + `Row gap:sm` 3× `ThemeCard` (sem `large`, 82h).
- **Reset (só EPUB):** `Pressable theme.surface border1 radius: radii.md paddingV: sm` → `t('reader.resetDefaults') 13px textSecondary` → `setReaderSettings({18,1.5}) + saveReaderSettings`.

---

## 11. Componentes Reutilizáveis (Design Atômico)

### 11.1 `BookCard` (`src/components/BookCard.tsx:1`)

```
┌─────────────────────┐
│ ┌───────────────┐   │
│ │   capa 5/7    │ ● │ ← VolumeBadge absoluto top8 right8
│ │  radius:20    │   │
│ └───────────────┘   │
│ Título 12px 600     │ ← 1 linha, left
│ Autor 11px 600 45%  │ ← 1 linha, left, muted
│ ★★★★☆ 14px          │ ← 5 estrelas, STAR_FILLED #ffda4d
└─────────────────────┘
```

| Prop | Tipo | Padrão |
|------|------|--------|
| `book` | `Book` | — |
| `width` | `number` | `width/numColumns` |
| `onPress` | `() => void` | — |
| `onLongPress` | `() => void` | `toggleFavorite` na Biblioteca |

- Container: `Pressable paddingH: spacing.sm, paddingV: spacing.sm, width`.
- Capa: `width: coverWidth = max(0, width - spacing.sm*2)`, `aspectRatio:5/7, backgroundColor: placeholderBackground, borderRadius: COVER_RADIUS 20, boxShadow, overflow:hidden`. `Image resizeMode:cover` ou fallback `Text 16px 800 center paddingH: md, numberOfLines:4`.
- Título `marginTop:8, 12px 600 textPrimary`, autor `2px, 11px 600 textSecondary`, estrelas row `marginTop:4, gap via marginH:1, STAR_SIZE 14, strokeWidth:1.4`.
- `VolumeBadge` dentro: `position:absolute top8 right8` (ver 11.4).

### 11.2 `BookCardContinue` (`src/components/BookCardContinue.tsx:1`)

Variante para carrossel horizontal:

- Fixo `CARD_WIDTH:140, COVER_HEIGHT:196, COVER_RADIUS:16` (não responsivo — horizontal scroll).
- Capa `height: COVER_HEIGHT, width: CARD_WIDTH, radius:16, placeholderBackground, boxShadow`.
- Título/autor idem `BookCard` mas `CARD_WIDTH`-bound, sem estrelas (mais limpo no carrossel).
- `VolumeBadge` idem.

### 11.3 `ListCard` (`src/components/ListCard.tsx:1`)

Ver [7.2](#72-listcard).

### 11.4 `VolumeBadge` (`src/components/VolumeBadge.tsx:1`)

```tsx
if (!count || count <=1) return null
<View position:absolute right8 top8>
  <View bg: theme.accent, borderRadius:8, paddingH:8 paddingV:4, elevation:4, shadow>
    <Text color:#fff serif 10px 800>{count} {t('library.volumesShort')} // "3 vol's"</Text>
  </View>
</View>
```

Usado em `BookCard` + `BookCardContinue` quando `book.childrenCount >1` (séries).

### 11.5 `ThemeCard` (`src/components/ThemeCard.tsx:1`)

```
┌─────────────────────┐
│ ┌─────────────────┐ │
│ │  preview.bg     │ │ ← bg/border do tema alvo (themes[value])
│ │  54h (large)    │ │    ou 34h (normal), radius sm, border1
│ └─────────────────┘ │
│   Escuro / Claro / Sépia 12–14px center │
└─────────────────────┘
```

- Props: `value: ThemeName, selected: bool, large?: bool, onPress`.
- Wrapper: `flex:1, minHeight: large?112:82, borderColor: selected?theme.accent:theme.border, borderWidth: selected?2:1, borderRadius: radii.md, padding: spacing.sm, backgroundColor: theme.card, gap: spacing.sm`.
- Preview interno: `flex:1, minHeight: large?54:34, backgroundColor: preview.bg, borderColor: preview.border, borderRadius: radii.sm`.

### 11.6 `SearchSortBar` (`src/components/SearchSortBar.tsx:1`)

Ver [5.2](#52-searchsortbar).

### 11.7 `SettingsRow` (`src/components/SettingsRow.tsx:1`)

Ver [8.1](#81-settingsrow).

### 11.8 `KrumerLogo` (`src/components/KrumerLogo.tsx:1`)

```
[Icon 40–104px]   // Image require('../../assets/Krumer-logo.png'), resizeMode:contain
Krumer           // 18–28px 600 serif, hideLabel? hidden
```

- Props: `compact?: bool (40 vs 52), useFullLogo?: bool (tenta SVG via SvgUri), hideLabel?: bool, size?: number`.
- No onboarding: `hideLabel size=104`. Na biblioteca: `compact hideLabel` (40px). No about: padrão 52px com label.

### 11.9 `ScanProgress` (`src/components/ScanProgress.tsx`)

```
Escaneando... 12px muted
▓▓▓▓▓░░░░ 42%
arquivo.pdf 11px muted
```

Props: `{ fileName, percent, done }`. Barra `theme.accent` sobre `theme.border`.

### 11.10 `LangPicker` (`src/components/LangPicker.tsx`)

Botão `LangPickerButton` → modal com 3 idiomas (`en: English, pt-br: Português, es: Español`), `onPress: setLanguage(code)`. Persistido via `preferences.language`.

### 11.11 `ApiKeyInput` / `FolderPickerField`

- `ApiKeyInput` (`src/components/ApiKeyInput.tsx`): `TextInput secureTextEntry` com toggle olho, `placeholder: t('api.placeholder')`.
- `FolderPickerField` (`src/components/FolderPickerField.tsx`): botão que abre SAF picker no Android (`DocumentPicker`/`Storage Access Framework`), exibe `libraryFolder` ou `t('general.noFolder')`.

### 11.12 `AuthSettings` (`src/components/AuthSettings.tsx:1`)

Ver [9.3](#93-group-account--authsettings).

---

## 12. Estados Globais, Persistência e Responsividade

### 12.1 `AppContext` (`src/context/AppContext.tsx:1`)

Provider raiz que expõe:

| Estado | Tipo | Persistência |
|--------|------|--------------|
| `books: Book[]` | árvore (pai `children?: Book[]`) | `AsyncStorage 'krumer.books'` |
| `lists: SyncList[]` | `{id, name, isDefault, sortOrder, createdAt, bookFingerprints: string[]}` | `AsyncStorage 'krumer.sync.lists'` |
| `preferences: MobilePreferences` | `{hasOnboarded, language, theme, libraryFolder, geminiApiKey}` | `AsyncStorage 'krumer.preferences'` |
| `ready: boolean` | hidratação concluída | — |
| `theme: ThemeTokens` | `themes[preferences.theme]` | derivado |
| `t(key)` | `translate(language, key)` | derivado |

**Funções principais:**

- `setBooks(books)` — `mergeScannedBooks` preserva metadados editados (`title/author/year/description/tags/coverPath/rating/progress`) por `fingerprint`, depois `saveBooks` + `extractCoversInBackground`.
- `updateBookMetadata(id, update)` — `updateBookTree` recursivo, seta `metadataUpdatedAt`, `enqueueMetadata/outbox`, `rating→enqueueBookProgress`, `tags→enqueueTag`.
- `updateBookProgress(id, update)` — `enqueueBookProgress`.
- `toggleFavorite(book)` — cria lista `Favoritos` se não existe (`isDefault:true`), toggle `fingerprint` em `bookFingerprints`, `enqueueListMembership`.
- `createList/renameList/deleteList/toggleBookInList` — validam trim, duplicata `toLowerCase`, `isDefault` imutável, `enqueueSyncList/enqueueListMembership`.
- `setLanguage/setThemeName/setLibraryFolder/setGeminiApiKey/setHasOnboarded` → `persistPreferences`.

### 12.2 `AuthContext` (`src/context/AuthContext.tsx`)

Supabase Auth com `user, session, ready, recovery`, métodos `signIn/signUp/signInWithGoogle/sendMagicLink/requestPasswordReset/updatePassword/signOut`. Sessão persistida via `supabase.auth` storage.

### 12.3 `SyncCoordinator` (`src/sync/SyncCoordinator.tsx` + `engine.ts` + `outbox.ts`)

- Outbox local (AsyncStorage/SQLite) com `pending` count, push/pull paginado, merge monotônico, tombstones, backoff, `subscribeSyncStatus` para UI.

### 12.4 Modelos (`src/models/item.ts`)

```ts
Book {
  id: string
  title: string, author: string|null, year: number|null
  description: string|null, tags: string[], rating: number|null (0–5)
  format: 'pdf'|'epub', filePath: string, fileSize: number
  fingerprint: string // "file|basename|size" ou "series|name"
  coverPath: string|null, coverOriginalPath: string|null
  progress: string|null, progressPct: number (0–100), currentPage: number, totalPages: number|null, cfi: string|null
  isRead: boolean, addedAt: number, metadataUpdatedAt: string|null
  children?: Book[], childrenCount?: number
}
```

### 12.5 Configuração da App (`app.json:1`)

```json
{
  "name": "Krumer", "slug": "krumer", "displayName": "Krumer",
  "scheme": "krumer", "orientation": "portrait",
  "android": { "package": "com.adriantinoco.krumer", "permissions": ["READ_EXTERNAL_STORAGE","READ_MEDIA_IMAGES","READ_MEDIA_VIDEO"] },
  "plugins": ["./plugins/with-ndk27"],
  "extra": { "eas": { "projectId": "4f26c674-76c9-469f-b38a-05c8b6a00234" } }
}
```

Development build necessário: `npx expo prebuild && npx expo run:android` (módulos nativos `react-native-pdf`, `react-native-webview` não funcionam no Expo Go).

---

## 13. Paridade com Desktop & Roadmap Visual

### 13.1 O que já é idêntico ao desktop v1.3.0

| Recurso desktop | Status mobile |
|-----------------|---------------|
| Grid de capas 3 colunas + 5 tablet | ✅ `LibraryScreen` |
| Continuar Lendo + stats 3 colunas | ✅ |
| Busca + ordenação (nome/data/avaliação/progresso) | ✅ PB1 |
| Detalhes (capa hero + metadados + progresso + sinopse + capítulos) | ✅ PB2 |
| Edição metadados (título/autor/ano/sinopse/tags/avaliação/capa) | ✅ PB3 |
| Listas fixas + customizadas CRUD | ✅ PB4 |
| Favoritos (long-press + heart) | ✅ |
| Restaurar capa original | ✅ F3 (`BookDetailScreen:161`) |
| Leitor PDF horizontal paginado + EPUB paginado com tema | ✅ M6 |
| Temas dark/light/sépia | ✅ M8 (3/3) |
| Supabase Auth (email/senha, Google nativo, magic link, recovery) | ✅ M10 parcial |

### 13.2 Paridade pendente (PLANNING.md)

| ID | Feature | Janela afetada | Nota de design |
|----|---------|----------------|----------------|
| PB5 | Busca metadados via Gemini | `BookDetail` (botão buscar) + `SettingsGroup api` | Reaproveitar `mobile/src/api`, reaplicar UX do desktop (loading, erro, aplicar) |
| PB6 | Sync pai↔filhos (séries) | `BookDetail` + `Library` | Marcar série como lida deve marcar filhos e vice-versa |
| F1 | Contador recursivo | `Library` stats + `Lists` cards | `flattenBooks` já faz; falta aplicar em contadores de lista custom |
| F2 | Menu atalhos/gestos | `SettingsGroup` nova seção | Lista por contexto: Geral / Biblioteca / Leitura |
| F4 | Rescan automático | `Library` + `Reader` (ao voltar) | `AppState`/`focus` listener → `scanLibrary` sem travar UI |
| F5 | 10 idiomas | `Onboarding` + `LangPicker` + `translations.ts` | Expandir `LanguageCode` de 3 → 10 (`fr/de/it/ja/zh/ko/ru`) |
| F6 | Modo capítulos `title` vs `title+cover` | `BookDetail` capítulos | Toggle `window.chapterViewMode` equivalente em `AsyncStorage` |
| F7 | Tela atualização + changelog | Nova modal em `AppShell` | GitHub Releases API + `marked.min.js` vendorizado |

### 13.3 Diretrizes visuais para novas janelas

- Manter `serifFont` em todos os textos (sem sans genérico).
- Todo card novo: `theme.card, borderWidth:1, borderColor: theme.border, borderRadius: radii.md`.
- Botão primário: `theme.accent, radius: radii.md, label 15px 700 color: theme.bg`.
- Botão secundário: `theme.card, borderWidth:1, borderColor: theme.border, label textPrimary`.
- Toasts/snackbars: usar `theme.accentMuted` + `borderColor: theme.accent` (padrão `StatusMessage`).
- Modals: backdrop `rgba(0,0,0,0.45–0.88)` + sheet `theme.card/theme.surface`.

---

## 14. Referência Rápida — Arquivos-fonte por Janela

| Janela | Arquivo principal | Componentes auxiliares |
|--------|-------------------|------------------------|
| Splash | `App.tsx:74 AppShell` | `AppContext.ready` |
| Onboarding | `src/screens/OnboardingScreen.tsx` | `KrumerLogo, LangPickerButton, ThemeCard, FolderPickerField, ApiKeyInput, ScanProgress` |
| Biblioteca | `src/screens/LibraryScreen.tsx` | `BookCard, BookCardContinue, SearchSortBar, KrumerLogo` |
| Detalhes | `src/screens/BookDetailScreen.tsx` | `BookDetail` hero, modal edição, stars, tags, capítulos |
| Listas | `src/screens/ListsScreen.tsx` | `ListCard, BookCard` + 4 modals (criar/renomear/excluir/gerenciar) |
| Configurações (hub) | `src/screens/SettingsScreen.tsx` | `SettingsRow ×5` |
| Configurações › Grupos | `src/screens/SettingsGroupScreen.tsx` | `FolderPickerField, LangPickerButton, ThemeCard, AuthSettings, ApiKeyInput, ScanProgress` |
| Leitor (orquestrador) | `src/screens/ReaderScreen.tsx` | `PdfReader, EpubReader, ThemeCard` |
| Leitor PDF | `src/readers/PdfReader.tsx` + `pdf/PdfHorizontal.tsx` | `pdf/pdfUri.ts, pdf/usePdfPrefs.ts` |
| Leitor EPUB | `src/readers/EpubReader.tsx` + `epubVendorScript.ts` | `WebView` bridge |
| Navegação | `src/navigation/types.ts` | `App.tsx: NavigationContainer, Tabs, Stack` |
| Tema | `src/theme/colors.ts, typography.ts, spacing.ts` | `themes, radii, spacing, serifFont, coverShadow` |
| i18n | `src/i18n/translations.ts` | 3 idiomas, `TranslationKey` 70+ chaves |
| Estado | `src/context/AppContext.tsx, AuthContext.tsx` | `storage/preferences.ts, sync/*` |

---

> **Dica de manutenção:** ao adicionar nova janela, registre a rota em `src/navigation/types.ts:1`, crie o arquivo em `src/screens/`, declare em `App.tsx:Stack.Screen`, e documente neste arquivo na seção correspondente. Novos atalhos/gestos devem ser mapeados para `F2` (menu de atalhos) quando implementado.

