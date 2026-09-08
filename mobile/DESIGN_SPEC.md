# Design Spec — Krumer Mobile

> Auditoria reversa do sistema visual existente em `mobile/`. O desktop não foi analisado nem usado para completar lacunas. Valores não encontrados no código são indicados explicitamente; cores de capas de demonstração geradas em `libraryScanner.web.ts` são conteúdo de exemplo, não tokens da interface.

## 1. Paleta de cores

### 1.1 Temas centrais da interface

A fonte de verdade é `src/theme/colors.ts:1-68`. O tema inicial persistido é `dark` (`src/storage/preferences.ts:29-38`). Todos os três temas compartilham o mesmo laranja de ação.

| Token | Dark | Light | Sepia | Uso observado |
|---|---:|---:|---:|---|
| `bg` | `#111111` | `#ffffff` | `#f4ecd8ff` | Fundo da aplicação, telas, áreas internas e texto de alguns botões sobre o accent |
| `surface` | `#262626` | `#ececec` | `#e6dab8` | Superfície elevada, trilhas, bottom sheets e controles secundários |
| `card` | `#202020` | `#ffffff` | `#f0e6cc` | Cards, modais, campos e tab bar |
| `cardHover` | `#262626` | `#ececec` | `#e6dab8` | Feedback pressionado em linhas, ações e opções |
| `border` | `#2e2e2e` | `#e0e0e0` | `#d8c9a3` | Bordas de 1 px, divisores e trilhas inativas |
| `textPrimary` | `#f1f1f1` | `#1a1a1a` | `#3b2f1e` | Títulos, valores e corpo de alta ênfase |
| `textSecondary` | `#cccccc` | `#4a4a4a` | `#5c4c33` | Corpo secundário, labels e ícones |
| `textMuted` | `#888888` | `#777777` | `#8a7a5c` | Metadados, captions, placeholders e estados vazios |
| `accent` | `#f97316` | `#f97316` | `#f97316` | Ações primárias, seleção, progresso, links e ícones ativos |
| `accentMuted` | `#f9731622` | `#f9731622` | `#f9731622` | Fundo sutil de seleção e callouts; alpha hexadecimal `0x22` (cerca de 13%) |
| `starEmpty` | `#6b6b6b` | `#a8acb5` | `#a89060` | Estrelas vazias fora da variante com container |
| `cardShadowStack` | `#222222` | `#000000` | `#2a2014` | Token definido, mas sem uso encontrado no código móvel atual |
| `cardBorder3D` | `#464545` | `#000000` | `#2a2014` | Token definido, mas sem uso encontrado no código móvel atual |

Evidência resumida:

```ts
// src/theme/colors.ts:23-32
dark: {
  bg: '#111111', surface: '#262626', card: '#202020',
  border: '#2e2e2e', textPrimary: '#f1f1f1',
  textSecondary: '#cccccc', textMuted: '#888888',
  accent: '#f97316', accentMuted: '#f9731622',
}
```

### 1.2 Cores semânticas e auxiliares

Estas cores estão locais nos componentes, não no objeto de tema.

| Papel | Valor | Uso | Fonte |
|---|---:|---|---|
| Sucesso | `#22c55e` | Diálogos e resultados de metadados; indicador de chave configurada | `src/components/MetadataDialog.tsx:49-54`, `src/screens/SettingsScreen.tsx:303-313` |
| Sucesso de pasta | `#2f8f46` | Fundo e borda do seletor após uma pasta ser escolhida | `src/components/FolderPickerField.tsx:36-54` |
| Erro/perigo | `#ef4444` | Ícone, borda, texto e estado de exclusão/erro | `src/components/MetadataDialog.tsx:49-54`, `src/screens/BookDetailScreen.tsx:1208-1228` |
| Perigo pressionado | `#dc2626` | Fundo pressionado de ação destrutiva | `src/components/MetadataDialog.tsx:227-247` |
| Perigo mais escuro pressionado | `#991b1b` | Exclusão de notas no leitor | `src/screens/ReaderScreen.tsx:1693-1705` |
| Branco sobre ação | `#ffffff` / `#fff` | Texto e ícones em vários botões preenchidos, badges e seleção | Vários componentes |
| Seleção de card inativa | `rgba(0, 0, 0, 0.35)` + `rgba(255, 255, 255, 0.85)` | Círculo de seleção ainda não marcado | `src/components/BookCard.tsx:198-215` |
| Favorito | `rgba(249, 115, 22, 0.94)` | Badge circular sobre a capa | `src/components/FavoriteBadge.tsx:65-89` |
| Overlay padrão de sheet | `rgba(0,0,0,0.55)` | Backdrop do `ActionSheetModal` | `src/components/ActionSheetModal.tsx:14-27` |
| Overlay de busca/ordenação | `rgba(0,0,0,0.45)` | Bottom sheet de ordenação | `src/components/SearchSortBar.tsx:187-256` |
| Overlay de marcadores | `rgba(0,0,0,0.53)` | Bottom sheet do leitor | `src/screens/ReaderScreen.tsx:1113-1126` |
| Overlay de modal no dark | `#00000099` ou `#000000aa` | Modal comum e diálogos/update | `src/components/SettingsModal.tsx:108-117`, `src/components/MetadataDialog.tsx:162-168` |
| Overlay de modal no light/sepia | `#00000055` ou `#00000066` | Modal comum e update | `src/components/SettingsModal.tsx:108-117`, `src/components/UpdateModal.tsx:283-294` |
| Accent pressionado | `#ea580c` | Botão primário pressionado em diálogo de metadados | `src/components/MetadataDialog.tsx:227-247` |
| Google | `#4285f4`, `#ffffff`, `#202124`, `#dadce0` | Botão de login com identidade Google | `src/components/AuthSettings.tsx:190-199` |

Aviso usa o próprio `accent`/`accentMuted`; não existe um amarelo de warning separado. Também não há token de informação (`info`) no tema.

### 1.3 Cores do leitor EPUB

O conteúdo EPUB não consome diretamente todos os tokens centrais. `EpubReader` monta uma paleta específica para o XHTML (`src/readers/EpubReader.tsx:113-142`), enquanto o chrome do leitor usa combinações em `ReaderScreen` (`src/screens/ReaderScreen.tsx:132-135`).

| Tema | Fundo do conteúdo/chrome superior | Texto do XHTML | Texto muted do chrome | Link no XHTML |
|---|---:|---:|---:|---:|
| Dark | `#202020` | `#e7e7e7` | `#a2a2a2` | `#f59a5a` |
| Light | `#ffffff` | `#222222` | `#6f6f6f` | `#c2570a` |
| Sepia | `#f4ecd8` | `#3b2f1e` | `#796c52` | `#a94f12` |

O runtime isolado inicia em branco antes de receber a aparência: fundo `#ffffff`, texto fallback `#171717`, link `#c2570a`, spinner com trilha `#e5e5e5` e topo `#f97316` (`src/readers/epubRuntime.ts:18-42`, `81-97`).

### 1.4 Cores do leitor PDF e recursos Android

| Contexto | Valor | Uso | Fonte |
|---|---:|---|---|
| Runtime PDF | `#000000` | Fundo de `html`, `body` e `#viewer` por trás das páginas | `src/readers/pdf/web/pdfWebRuntime.ts:1214` |
| Splash Android | `#FFFFFF` | Fundo nativo antes do React Native | `android/app/src/main/res/values/colors.xml:2` |
| `colorPrimary` Android | `#023c69` | Cor primária do tema AppCompat nativo; não aparece como token da UI React | `android/app/src/main/res/values/colors.xml:3`, `values/styles.xml:4` |

## 2. Tipografia

### 2.1 Famílias

| Família | Onde é usada | Pesos/observações |
|---|---|---|
| `Georgia` no iOS; `serif` nas demais plataformas | Interface geral: títulos, corpo, botões, labels, tab bar e metadados | Declarada como `serifFont` em `src/theme/typography.ts:1-6`; os pesos vistos na UI são `400` implícito, `500`, `600`, `700`, `800` e `bold` |
| Noto Serif | Conteúdo EPUB quando “Serif” está selecionada | Arquivos embarcados 300/400/500/700; default do leitor | `src/readers/readerFonts.ts:1-39`, `src/models/readingPreferences.ts:13-20` |
| Noto Sans | Conteúdo EPUB quando “Sans” está selecionada | Arquivos embarcados 300/400/500/700 | `src/readers/readerFonts.ts:1-39` |
| Noto Sans Mono | Conteúdo EPUB quando “Mono” está selecionada | Arquivos embarcados 300/400/500/700 | `src/readers/readerFonts.ts:1-39` |
| `Courier` | API key, nome de arquivo durante scan e blocos de código do changelog | Monoespaçada utilitária | `src/components/ApiKeyInput.tsx:30-44`, `src/components/ScanProgress.tsx:33-39`, `src/components/UpdateModal.tsx:141-149` |
| `Arial` | Letra “G” do botão Google | Exceção de marca | `src/components/AuthSettings.tsx:194-197` |

Fallbacks do EPUB antes/depois do carregamento das Noto:

- Serif: `Georgia, "Times New Roman", serif`.
- Sans: `Arial, Helvetica, sans-serif`.
- Mono: `"Courier New", Courier, monospace`.

Esses fallbacks são definidos em `src/readers/epubRuntime.ts:177-194`.

### 2.2 Escala tipográfica observada na interface

Não há tokens tipográficos centralizados além das famílias. A escala abaixo é uma consolidação dos valores efetivamente usados; ela não deve ser interpretada como uma escala formal já existente.

| Tamanho | Papel observado |
|---:|---|
| 9 px | Sigla de formato em miniatura sem capa |
| 10 px | Badge de volumes, labels compactas do leitor e opções de peso |
| 11 px | Autor no card, captions, eyebrow uppercase, label da tab compacta |
| 12 px | Metadados, captions, título do chrome do leitor, código e progresso |
| 13 px | Texto auxiliar, labels de formulário, ações compactas, corpo secundário |
| 14 px | Corpo padrão, busca, subtítulos, conteúdo de modal, placeholders de capa |
| 15 px | Linhas de configuração, inputs, botões secundários e títulos de capítulo |
| 16 px | Botão primário da tela de detalhes, cabeçalhos menores e estado vazio |
| 17 px | Títulos de modal e seção “Continuar lendo” |
| 18 px | Cabeçalhos de seção/modal, números de estatística e placeholder de capa hero |
| 20 px | Título de lista detalhada, valor de zoom e título de diálogo |
| 22 px | Título hero do livro e versão no modal de atualização |
| 24 px | Títulos das etapas do onboarding |
| 26 px | Títulos principais de tela (`Listas`, `Configurações`) |
| 28 px | Wordmark “Krumer” no logo não compacto |

Os títulos principais usam peso regular/implícito em algumas telas (26 px) e `700`/`800` em outras; não há um componente único de heading.

### 2.3 Line-height, tracking e transformações

| Valor | Uso observado |
|---:|---|
| 16 px | Hints compactos de controles do leitor |
| 17 px | Texto vazio de notas |
| 18 px | Corpo/caption de 12–14 px, onboarding e changelog |
| 19 px | Título de marcador |
| 20 px | Chrome do leitor, editor de notas e texto auxiliar |
| 21 px | Corpo de diálogo e callout de sincronização |
| 22 px | Sinopse e corpo de nota |
| 28 px | Título hero de 22 px |
| 0.5 px tracking | Eyebrows do leitor, zoom e changelog |
| 0.8 px tracking | Cabeçalhos de seção nas Configurações |
| 1.2 px tracking | Labels uppercase de sheets de ordenação e ações do livro |

`textTransform: uppercase` aparece em eyebrows e no título discreto do capítulo EPUB; tags são prefixadas com `#`. Itálico é usado no blockquote do changelog, não como estilo editorial geral.

### 2.4 Tipografia ajustável do EPUB

| Propriedade | Default | Intervalo | Passo | Comportamento |
|---|---:|---:|---:|---|
| Tamanho | 18 px | 12–32 px | 2 px | Aplicado ao `body` do XHTML |
| Entrelinha | 1.5 | 1.0–2.4 | 0.1 | Aplicada com `!important` apenas quando margens customizadas estão ativas; com “margens do livro”, a entrelinha original é preservada |
| Família | Serif | Serif / Sans / Mono | Opções | Noto Serif, Noto Sans ou Noto Sans Mono |
| Peso | Regular (400) | 300 / 400 / 500 / 700 | Opções | Light, Regular, Medium e Bold |

Font size e line-height vêm de `src/readers/readerSettings.ts:5-15` e seus limites de `src/screens/ReaderScreen.tsx:49-54`. A aplicação ao XHTML está em `src/readers/epubRuntime.ts:247-260`.

```js
// src/readers/epubRuntime.ts:249-258
var lineHeightRule = readerLayout.useBookMargins
  ? ''
  : ' line-height: ' + typography.lineHeight + ' !important;';
// ...
'body { font-size: ' + typography.fontSize + 'px !important; }'
```

## 3. Espaçamento e layout

### 3.1 Escala base

| Token | Valor | Uso típico |
|---|---:|---|
| `spacing.xs` | 4 | Microgap, padding de ícone, margem de label |
| `spacing.sm` | 8 | Gap interno, padding compacto, distância entre capa e título |
| `spacing.md` | 16 | Padding padrão de card/tela/modal |
| `spacing.lg` | 24 | Seções, padding de diálogos e onboarding |
| `spacing.xl` | 40 | Respiro amplo, rodapé e estado vazio |

Fonte: `src/theme/colors.ts:84-90`. A aplicação segue majoritariamente múltiplos de 4/8, mas há ajustes locais de 2, 3, 5, 6, 10, 12, 14, 18, 20 e 32 px. Portanto, a escala é uma base, não uma grade rígida.

### 3.2 Raios

| Token | Valor | Uso típico |
|---|---:|---|
| `radii.sm` | 6 | Inputs compactos, chips, controles internos |
| `radii.md` | 10 | Cards, botões, linhas de configuração |
| `radii.lg` | 16 | Modais, busca pill e sheets |
| `radii.xl` | 20 | Diálogos semânticos e modal de atualização |

Fonte: `src/theme/colors.ts:71-76`.

Valores locais também fazem parte da linguagem atual: 4 px em barras de progresso/minicards, 8 px em campos e badges, 10 px nas capas do grid, 12/14/16 px em cards de detalhe, 18 px na capa hero e popovers, 20–24 px em containers tipo pill, `99`/`999` para círculos e cápsulas.

### 3.3 Larguras, densidade e breakpoints

| Regra | Valor/resultado | Fonte |
|---|---|---|
| Breakpoint de tablet | 600 px | `src/theme/colors.ts:92` |
| Breakpoint de grid largo | 900 px | `src/theme/responsive.ts:8` |
| Largura máxima de conteúdo | 960 px | `src/theme/responsive.ts:3` |
| Largura máxima de Configurações | 720 px | `src/theme/responsive.ts:4` |
| Card de livro | mínimo 100 px, máximo 220 px | `src/theme/responsive.ts:5-6` |
| Grid padrão | 3 colunas abaixo de 600; 4 entre 600–899; 5 a partir de 900 | `src/theme/responsive.ts:18-25` |
| Preferência manual | 3, 4, 5 ou 6 colunas; reduzida automaticamente se não couber o mínimo de 100 px | `src/screens/SettingsScreen.tsx:330-363`, `src/theme/responsive.ts:30-45` |
| Grid de listas | 2–4 colunas, alvo mínimo de 160 px por card | `src/theme/responsive.ts:7`, `47-51` |
| Capa na tela de detalhes | 180 px em telefone; 220 px em tablet | `src/screens/BookDetailScreen.tsx:108` |
| Conteúdo de modal comum | máximo 380 px | `src/components/SettingsModal.tsx:121-135` |
| Modal de atualização | máximo 400 px, máximo 85% da altura | `src/components/UpdateModal.tsx:297-308` |
| Popup de paginação | máximo 360 px | `src/components/PaginationSettingsModal.tsx:104-109` |
| Popup de zoom | máximo 280 px | `src/components/PdfZoomModal.tsx:25-29` |

Não há media queries CSS na UI React Native. A responsividade usa `useWindowDimensions`, safe areas e cálculos de largura. A orientação geral do app é portrait em `app.json:8`, mas o leitor oferece portrait, landscape e livre.

### 3.4 Elevação e sombras

A hierarquia normal é criada sobretudo por diferença de superfície + borda de 1 px. Sombras ficam concentradas em capas, previews, tab bar, diálogos e popovers.

| Elemento | Sombra/elevação |
|---|---|
| Capa dark | `0 2px 6px rgba(0, 0, 0, 0.35)` |
| Capa light | `0 3px 10px rgba(0, 0, 0, 0.16)` |
| Capa sepia | `0 3px 10px rgba(90, 60, 30, 0.22)` |
| Tab bar | elevation 10; offset `0,4`; opacity 0.2; radius 10 |
| Miniaturas empilhadas de lista | elevation 5; offset `0,2`; opacity 0.4; radius 4 |
| Badges sobre capa | elevation 4; sombra CSS `0 2px 6/10px rgba(0,0,0,0.3)` |
| Capa hero | elevation 12 + `coverShadow` |
| Capa no editor | elevation 8 + `coverShadow` |
| Diálogo semântico | elevation 14; offset `0,8`; opacity 0.4 dark / 0.18 demais; radius 16 |
| Popovers do leitor | elevation 18; offset `0,6`; opacity 0.35; radius 14 |

Fonte principal das sombras de capa: `src/theme/colors.ts:78-82`. Não foi encontrada sombra padrão aplicada a todo card.

## 4. Componentes

### 4.1 Navegação principal

A navegação possui três tabs inferiores: Biblioteca, Listas e Configurações. A tab bar é uma cápsula flutuante centralizada, não uma barra colada à borda.

| Propriedade | Telefone normal | Compacto (`width < 360` ou `height < 600`) | Tablet (`width >= 600`) |
|---|---:|---:|---:|
| Largura máxima | 360 | 360 | 420 |
| Margem horizontal | 20 | 12 | 16 |
| Altura | 62 | 56 | 62 |
| Ícone | 20 | 18 | 20 |
| Label | 11/14 line-height | 10/12 line-height | 11/14 line-height |
| Distância inferior | `max(12, safe-area + 8)` | idem | idem |

Visual: `theme.card`, borda `theme.border` de 1 px, raio igual à metade da altura, sombra/elevation 10. Tab ativa usa `accent`; inativa, `textSecondary`. Ícones: `BookOpen`, `List` e `Settings`, todos Lucide (`App.tsx:28-104`).

### 4.2 Biblioteca e grid de livros

Estrutura visual (`src/screens/LibraryScreen.tsx`):

1. Logo compacto no topo.
2. Faixa horizontal “Continuar lendo”, omitida durante busca.
3. Divisor.
4. Busca + rescan + ordenação.
5. Card de estatísticas em três colunas.
6. Grid responsivo de capas.

O conteúdo é centralizado até 960 px e deixa 96 px no rodapé para a tab bar. A preferência de densidade aceita 3–6 colunas, respeitando card mínimo de 100 px e máximo de 220 px.

#### Card de livro

| Parte | Especificação |
|---|---|
| Área clicável | Largura calculada; padding 8 px vertical/horizontal; opacity pressionada 0.82; long press em 200 ms |
| Capa | Aspect ratio `220 / 300`; largura do card menos 16 px; raio 10; `coverShadow`; `overflow: hidden` |
| Placeholder | Dark `#2d2d2d`, light `#ececec`, sepia `#e8dccb`; título centralizado 14/18, peso 800, até 4 linhas |
| Título | 12 px, peso 700, uma linha, `textPrimary` |
| Autor | 11 px, peso 700, uma linha, `textSecondary`, margem superior 2 |
| Progresso | Barra laranja de 6 px na base; visível para progresso acima de 1%; preenchimento animado 350 ms |
| Favorito | Círculo 22×22, canto superior esquerdo a 7 px; estrela branca 12 px; entrada spring e saída 250 ms |
| Volumes | Pill laranja no canto superior direito a 8 px; texto branco 10/800; só aparece para contagem maior que 1 |
| Seleção de gerenciamento | Overlay central com círculo 20×20; accent quando marcado e check branco 12 px |

Fonte: `src/components/BookCard.tsx:10-265`, `FavoriteBadge.tsx`, `VolumeBadge.tsx`.

O card de “Continuar lendo” replica a mesma capa e textos, mas usa barra de progresso de 5 px e anima a entrada em 600 ms / atualizações em 500 ms (`src/components/BookCardContinue.tsx`).

#### Busca, ordenação e estatísticas

- Busca: fundo `cardHover`, borda 1 px, raio 16, texto 14 px, padding vertical 10. O botão limpar é um círculo 18×18 com X de 11 px e anima por spring.
- Rescan: botão 42×42, borda accent, raio 16; mostra spinner durante scan; disabled em opacity 0.55.
- Ordenação: botão outlined accent, label 13/600; abre bottom sheet com opções de 15 px e ponto ativo 8×8.
- Estatísticas: card com borda, raio 10 e padding vertical 10; números 18/700, labels 11/600 e divisores 1×24.

Fonte: `src/components/SearchSortBar.tsx`, `src/screens/LibraryScreen.tsx:257-307`.

### 4.3 Listas

O grid de listas tem 2–4 colunas e gap/padding de 16 px. Cada `ListCard` usa fundo `card`, borda de 1 px, raio 10 e padding 10 px. A área de preview tem 130 px de altura, raio 6 e fundo local por tema. Até três capas de 64×100 px são empilhadas com overlap de −12 px e sombra; lista vazia mostra `BookOpen` outline. Título: 14/700; contagem: 11/600 muted (`src/components/ListCard.tsx`).

A tela detalhada mantém header com divisor, título 20/700 e ações de adicionar/editar/excluir por ícones. Livros usam o mesmo `BookCard`; o gerenciamento abre um overlay full-screen com busca e estado de seleção no próprio card (`src/screens/ListDetailScreen.tsx:240-350`, `434-524`).

### 4.4 Tela de detalhes do livro

É a composição mais editorial do app (`src/screens/BookDetailScreen.tsx`):

- Backdrop da própria capa com blur 24, expansão de 48 px para fora do viewport e altura entre 520 e 920 px (`86%` da janela dentro desses limites).
- Tint específico por tema e gradiente vertical até `theme.bg`; a capa hero fica centralizada sobre esse fundo.
- Botões flutuantes de voltar, favorito e menu: 40×40, circulares, fundo translúcido correspondente ao tema, sem borda.
- Capa hero: 180 px em telefone / 220 px em tablet, aspect ratio `193 / 264`, raio 18 e elevation 12.
- Título: 22/28, peso 800; subtítulo/autor: 14 px; rating interativo com estrelas de 20 px.
- Ação principal: full-width, altura 52, raio 14, laranja preenchido, ícone + label 16/700 branco.
- Ações de lido/não lido: mesma altura e raio, fundo card, borda 1 px; dividem a linha quando há progresso parcial.
- Cards de metadados e progresso: raio 16, fundo card, borda 1 px; ícones em tiles 44×44 de raio 12.
- Tags: chips bordered de raio 12; sinopse 14/22; capítulos em cards de raio 10 com thumbnail 54 px.

### 4.5 Rating

Cinco estrelas Lucide preenchidas, sem stroke (`strokeWidth=0`). Default: 14 px e gap 2. A variante `container` cria uma cápsula sobre `theme.bg`, raio 20, padding 14×8. No editor, as estrelas têm 24 px e gap 8. Press/reavaliação usa scale 1 → 1.16/0.92 → 1 em 90 + 150 ms (`src/components/RatingStars.tsx`).

### 4.6 Modais, diálogos, sheets e popovers

Há quatro famílias visuais:

#### Modal central padrão (`SettingsModal`)

- Card `theme.card`, borda 1 px, raio 16, largura máxima 380 px e altura máxima 80%.
- Padding 16; título 17/600; divisor antes do conteúdo; X de 20 px.
- Backdrop `#00000099` no dark e `#00000055` nos demais.
- Entrada: opacity + scale 0.96→1 em 220 ms, cubic-out. Saída: 180 ms, cubic-in.

Fonte: `src/components/SettingsModal.tsx`.

#### Diálogo semântico (`MetadataDialog`)

- Card `theme.card`, raio 20, largura máxima 380, altura máxima 85%, padding 24, borda 1 e sombra/elevation.
- Ícone semântico central em círculo 58×58; título 20/700; mensagem 14/21 centralizada.
- Ações empilhadas, altura mínima 48, raio 10.
- Variantes success, warning, error e danger; danger inverte a ordem para destacar primeiro a ação destrutiva.
- Entrada 280 ms; saída 220 ms.

Fonte: `src/components/MetadataDialog.tsx`.

#### Bottom sheet (`ActionSheetModal`)

- Backdrop padrão preto 55%; slide inicial de 450 px.
- Abertura: backdrop 180 ms e sheet 520 ms cubic-out.
- Fechamento: backdrop 220 ms e sheet 300 ms cubic-in.
- O conteúdo filho define fundo e geometria. Os sheets observados usam `card` ou `surface`, cantos superiores 16 ou 20 px, handle 36×4 e alturas máximas de 60%, 72% ou 88%.

Fonte: `src/components/ActionSheetModal.tsx`, `BookListModal.tsx`, `ReadingSettingsModal.tsx`, `ReaderScreen.tsx:1113-1226`.

#### Popover ancorado do leitor

- Paginação: largura até 360 px; zoom: até 280 px.
- Fundo dark local `#2b2b2b` (nos demais temas, `theme.card`), raio 18, borda 1, elevation 18 e sombra forte.
- Fica no canto superior direito, abaixo da safe area; opções por ícone circular 46×46 e label 10 px.

Fonte: `src/components/PaginationSettingsModal.tsx`, `PdfZoomModal.tsx`.

O modal de atualização é uma variação central de até 400 px, raio 20, header/footer separados por borda e changelog em card interno. O Markdown usa headings 18/16/14/13, corpo 13/18, blockquote com borda esquerda accent de 3 px e código em Courier 12 (`src/components/UpdateModal.tsx:162-231`, `270-581`).

### 4.7 Botões e estados

Não existe um componente único para todas as variantes; estes padrões se repetem:

| Variante | Aparência | Estado pressionado | Disabled/selecionado |
|---|---|---|---|
| Primário | `accent`, raio 10–14, altura mínima 44 ou 48/52, label 14–16 em 700 | Opacity 0.85/0.88 ou fundo `#ea580c` | Fundo `accentMuted` ou opacity 0.3–0.55 |
| Secundário outlined | Fundo `card`/transparente, borda `border`, raio 6–14 | `cardHover`, `surface` ou opacity 0.6–0.82 | Opacity reduzida |
| Ghost | Fundo transparente, label/ícone `textSecondary` ou accent | Opacity 0.5–0.7 | Nem sempre definido |
| Ícone circular | 36–48 px, raio total, área de toque ampliada por `hitSlop` | Opacity 0.5–0.6 ou `cardHover` | Opacity 0.3–0.35 |
| Danger | `#ef4444` preenchido ou outlined | `#dc2626` / `#991b1b` | Opacity reduzida |
| Segmented/radio | `surface` inativo; accent ou `accentMuted` ativo; borda accent na seleção | Opacity 0.7 | Opacity 0.3–0.35 |

O `PrimaryButton` reutilizável usa min-height 44, raio 10, padding horizontal 24 e vertical 8 (`src/components/PrimaryButton.tsx`). O onboarding contém uma cópia local sem min-height (`src/screens/OnboardingScreen.tsx:137-160`).

### 4.8 Inputs, seletores e linhas

- Inputs: card background, borda de 1 px, raio 6–10, texto 14–15 px e padding 12–16; placeholder usa muted/secondary.
- API key: altura mínima 46, Courier 14 e toggle Eye/EyeOff 18.
- Folder picker: altura mínima 46; muda completamente para verde `#2f8f46` com texto branco após seleção.
- Settings row: card bordered, raio 10, padding 16×18; tile de ícone 36×36 com fundo `accentMuted`, ícone 18; título 15 e subtítulo 12.
- Theme card: preview real do tema dentro de card bordered. Altura mínima 82 ou 112; seleção troca borda 1→2 px accent.
- Font family: três cards de altura mínima 78, amostra “Aa” 22; seleção usa `accentMuted` e borda accent de 2 px.
- Font weight: quatro segmentos; ativo preenchido em accent com texto branco.
- Switch de coluna dupla: track false `border`, true `accentMuted`, thumb ativo `accent`.

### 4.9 Leitor

#### Área de leitura

- PDF: runtime com fundo preto e páginas renderizadas pelo PDF.js. Modos paginado e scroll; zoom de 10% a 400%, em passos de 5%; orientação portrait por default.
- EPUB: fundo específico do tema; o WebView ocupa a sessão inteira. O frame adiciona margem padrão de 20 px nos quatro lados. Margem customizada aceita 0–48 px em passos de 4.
- EPUB paginado: uma coluna por default; duas colunas apenas quando a opção está ativa e o viewport está em landscape (`src/readers/epubRuntime.ts:197-205`).
- O XHTML força a família/peso selecionados, justifica parágrafos, ativa hifenização automática e limita mídia a 100% da largura (`src/readers/epubRuntime.ts:247-260`).

#### Chrome

- Barras aparecem por toque central e somem após 4 s (`HIDE_DELAY = 4000`).
- Barra superior usa o fundo próprio do leitor, sem divisor visível (`borderBottomWidth: 0`) e elevation 20. Botões têm célula de 44 px; ícones 20–21 px. Título central 12 px muted.
- Fora das barras, o título de capítulo aparece no topo esquerdo em 14/20 uppercase, opacity 0.68; página atual/total aparece no canto inferior direito em 14 px, opacity 0.68.
- Barra inferior usa `theme.card`, divisor superior de 1 px e elevation 100. Ícones de tópicos, layout, notas e brilho têm 24 px/stroke 1.9 e padding de toque 12.
- Em EPUB, o chrome vertical é comprimido por fator 0.6 (`EPUB_CHROME_VERTICAL_SCALE`).

Fonte: `src/screens/ReaderScreen.tsx:49-65`, `779-1111`.

#### Controles

- Fonte: família, peso, tamanho e tema em bottom sheet.
- Layout EPUB: margens do livro/customizadas, margem horizontal e entrelinha.
- Paginação: scroll/paginado, simples/dupla e orientação, em popover.
- PDF: zoom em popover; default 100%, limite 10–400%, passo 5% (`src/readers/PdfReader.types.ts:22-38`).
- Brilho: sheet com trilha de 14 px e thumb de 44 px (círculo 22 de raio), accent, sombra/elevation 4.
- Marcadores, sumário e notas: sheets/cards que reutilizam `card`, `surface`, `border`, accent e a escala 11–18 px.

#### Marcadores, notas e destaques

Marcadores existem para PDF e EPUB. Notas têm lista, detalhe, edição, exclusão e preview; cards usam 13/18 para título, 11 para data/página e 14/20 no editor. Não foi encontrada implementação visual de highlight persistente (cor de marca-texto, sublinhado ou decoração associada a uma seleção). `epubRuntime.ts` contém guardas para preservar a seleção de texto nativa e o viewport, mas não estiliza `::selection` nem salva highlights. Para reprodução fiel, a landing page não deve representar highlights como feature visual existente; pode representar marcadores e notas.

### 4.10 Onboarding, inicialização e Configurações

#### Onboarding

- Três etapas: setup (idioma/tema), pasta/scan e chave API.
- Conteúdo centralizado, largura máxima 420, padding 24 e gap principal 24.
- Logo de 104 px; títulos 24 px; labels/corpo 13/18.
- Seletor de temas em três cards na horizontal.
- Indicador inferior: três pontos 10×10, ativos em accent e inativos em border.
- Botão “configurar depois” é ghost sublinhado.

Fonte: `src/screens/OnboardingScreen.tsx`.

#### Startup

- Overlay full-screen no `theme.bg`, logo de 88 px, porcentagem 15/18 tabular e barra de 4 px.
- Progresso vai até 94%, espera o app ficar pronto, conclui em 100%, aguarda 500 ms e faz fade-out em 500 ms.

Fonte: `src/components/StartupLoadingScreen.tsx`.

#### Configurações

- Título de tela 26 px e conteúdo de até 720 px.
- Seções por eyebrow 11/700 uppercase, tracking 0.8.
- Conteúdo agrupado em `SettingsRow`; não há container externo por seção.
- Banner de sincronização usa fundo `accentMuted`, borda accent e CTA pequeno preenchido.

Fonte: `src/screens/SettingsScreen.tsx`, `src/components/SettingsRow.tsx`.

### 4.11 Movimento e feedback

| Interação | Movimento atual |
|---|---|
| Press comum | Mudança de opacity ou fundo imediata |
| Favorito no card | Spring com overshoot na entrada; saída scale + fade em 250 ms |
| Rating/favorito do detalhe | Scale em 90 + 150 ms |
| Progresso do card | 350 ms |
| Progresso “Continuar lendo” | 600 ms inicial, 500 ms em atualização |
| Modal central | Fade + scale 0.96→1 em 220–280 ms; saída 180–220 ms |
| Bottom sheet | Fade 180 ms + slide 520 ms; saída 220/300 ms |
| Busca: botão limpar | Spring, tension 200, friction 16 |
| Startup | Barra curta + espera; atraso 500 ms e fade 500 ms |

Não foram encontrados estados hover exclusivos para mouse; `cardHover` é usado principalmente como estado `pressed` no touch.

## 5. Ícones e imagens

### 5.1 Biblioteca e estilo de ícones

A biblioteca principal é `lucide-react-native` versão `^1.31.0` (`package.json:49`). O estilo predominante é outline, cantos arredondados, cor herdada do tema e stroke entre 1.7–2.0. Exceções:

- Empty states usam stroke fino 1.2 e ícones 48–56 px.
- Check de seleção usa stroke 3.
- Estrelas de rating são filled, sem stroke.
- Favorito usa Star ou Heart preenchido no estado ativo.
- `LanguageIcon` é um SVG próprio “文A”, com dois badges geométricos, stroke 1.5/1.6 e fill accent com opacity 0.14/0.22 (`src/components/LanguageIcon.tsx`).

| Escala de ícone | Uso |
|---:|---|
| 11–16 px | Limpar busca, opções compactas, labels e ações dentro de campo |
| 17–19 px | Linhas, inputs, marcadores e botões compactos |
| 20–24 px | Navegação, toolbar, ações principais e controles do leitor |
| 26–36 px | Diálogos e empty states internos |
| 48–56 px | Empty states de tela |

### 5.2 Logo e marca

| Arquivo | Dimensão/viewBox | Uso |
|---|---|---|
| `assets/Krumer-logo.svg` | 1024×1024, viewBox `0 0 1024 1024` | Fonte vetorial disponível; embute raster em data URI |
| `assets/Krumer-logo.png` | 1024×1024 | Fonte efetivamente usada pelo `KrumerLogo` na maioria dos casos |
| `assets/Krumer-icon.svg` | arquivo 1024×1024, viewBox `0 0 256 256` | Variação de ícone; embute raster em data URI |
| `assets/Krumer-icon.png` | 256×256 | Ícone raster |
| `assets/Krumer-icon.ico` | 82.753 bytes | Variação ICO preservada no diretório móvel |
| `android/.../mipmap-*/ic_launcher.webp` | densidades mdpi a xxxhdpi, versões normal e round | Launcher Android gerado |
| `android/.../drawable-*/splashscreen_logo.png` | 288, 432, 576, 864 e 1152 px | Splash Android por densidade |

O componente `KrumerLogo` mostra o ícone em 40 px no modo compacto, 52 px no normal, 88 px no startup e 104 px no onboarding. O wordmark “Krumer” é texto da UI em serif, 18/600 compacto ou 28/600 normal (`src/components/KrumerLogo.tsx`).

Visualmente, `Krumer-logo.png` é um monograma laranja, serifado e simétrico, com textura orgânica/granulada interna e fundo transparente. `Krumer-icon.png` usa o mesmo monograma em escala menor sobre um quadrado creme texturizado, de cantos amplamente arredondados. Como ambos são artes rasterizadas com variação tonal — e os SVGs apenas embutem essas imagens em base64 — não existe no código um único hex exato para o laranja ou para o creme da marca; a reprodução fiel deve reutilizar os ativos, não aproximá-los com preenchimentos planos.

Não foi encontrado um sistema separado de ilustrações. O conteúdo visual dominante são as capas dos livros; quando ausentes, a interface usa texto ou ícones sobre superfícies temáticas.

## 6. Personalidade visual

O Krumer Mobile é escuro, minimalista e editorial: a base quase preta, a tipografia serifada e o protagonismo das capas fazem o app se comportar mais como uma estante de leitura do que como um dashboard genérico. O laranja é usado com disciplina como sinal de ação, progresso e seleção, enquanto bordas finas e superfícies próximas entre si constroem a hierarquia sem excesso de sombra. As formas são macias — cards arredondados, controles circulares e tab bar em cápsula — mas a densidade permanece compacta e funcional. Os temas claro e sépia preservam a mesma estrutura; o sépia reforça a associação com papel e leitura prolongada. O leitor reduz o chrome e deixa título/paginação discretos, mantendo o conteúdo como foco principal.

## 7. Inconsistências encontradas

### 7.1 Tokens e cores

1. **Dois laranjas de ação.** O tema define `#f97316`, mas `BookDetailScreen` usa `#ff6500` no dark para ações e progresso (`src/screens/BookDetailScreen.tsx:47`, `108-112`). Na landing page, eles não devem ser tratados como um único valor sem uma decisão explícita.
2. **Paleta do EPUB paralela.** Texto, muted e links do leitor diferem de `textPrimary`, `textMuted` e `accent`; por exemplo, dark usa link `#f59a5a` em vez de `#f97316` (`src/readers/EpubReader.tsx:113-142`). Isso parece intencional para legibilidade do conteúdo, mas é uma divergência real.
3. **Sepia com duas notações.** O tema usa `#f4ecd8ff`; o leitor usa `#f4ecd8`. São visualmente equivalentes (alpha `ff`), mas não textualmente idênticos.
4. **Placeholders e previews fora do tema.** Capa vazia usa `#2d2d2d/#ececec/#e8dccb`; preview de lista usa `#111111/#f0f0f0/#e8ddc0`. Esses valores não vêm de tokens e divergem inclusive entre componentes próximos.
5. **Estrela vazia sobrescrita.** `RatingStars` ignora `theme.starEmpty` na variante com container e usa `#9c9c9f` ou `#9a9790` (`src/components/RatingStars.tsx:29-42`).
6. **Estados semânticos não tokenizados.** Success, danger e o verde de pasta são hardcoded. O mesmo papel de sucesso usa `#22c55e` e `#2f8f46`.
7. **Splash claro versus tema inicial dark.** O splash nativo é branco, enquanto a preferência inicial do React é dark. Isso pode produzir um flash claro antes do startup temático.
8. **Azul Android isolado.** `colorPrimary=#023c69` pertence ao tema nativo, mas não à paleta visual React Native.
9. **Tokens sem consumidor.** `cardShadowStack` e `cardBorder3D` estão definidos nos três temas, mas não foram encontrados em uso.

### 7.2 Tipografia

1. **Interface e conteúdo usam famílias diferentes.** A UI usa a serifada genérica/Georgia; Noto Serif/Sans/Mono são carregadas apenas para o leitor. Para uma landing page fiel, “serif” não identifica uma fonte web exata da UI Android.
2. **Hierarquia sem tokens.** Títulos de tela, seção e modal repetem tamanhos próximos, mas pesos variam e não há componentes/tokens tipográficos compartilhados.
3. **Font family ausente em alguns textos.** O label “pasta de livros” de `FolderPickerField` e a porcentagem do startup definem tamanho/cor, mas não `fontFamily`, podendo cair na fonte sans padrão do sistema (`src/components/FolderPickerField.tsx:32`, `src/components/StartupLoadingScreen.tsx:113-120`).

### 7.3 Geometria e componentes

1. **Raios além da escala.** A escala oficial é 6/10/16/20, mas são frequentes 4, 8, 12, 14 e 18, além de 99/999 para pills.
2. **Aspect ratios de capa variam.** Grid `220/300`, hero `193/264`, editor/capítulos `5/7`. A diferença é pequena, mas pode alterar crop/alinhamento em uma reprodução.
3. **Backdrops não uniformes.** Modais usam alpha aproximado de 33% a 67%; sheets específicos usam 45%, 53% ou 55%.
4. **Botão primário com duas regras de contraste.** `PrimaryButton` usa `theme.bg` para o label sobre accent; vários outros primários usam branco. No dark isso resulta em texto quase preto no botão laranja, enquanto o detalhe/update usam branco.
5. **Botão duplicado no onboarding.** Há um `PrimaryButton` local com menos garantias de altura/estado que o componente reutilizável.
6. **`cardHover` é nome de desktop para feedback touch.** No mobile ele funciona principalmente como `pressed`, não hover real.
7. **Modal de criação de lista não usa o modal compartilhado.** Ele possui raio 12 e backdrop `#00000088`, divergindo do `SettingsModal` de raio 16 e backdrops temáticos (`src/screens/ListsScreen.tsx:212-251`).
8. **Bottom sheets alternam `card` e `surface`.** O shell compartilhado não determina a superfície; cada consumidor escolhe, o que produz variação visual legítima mas não centralizada.

### 7.4 Funcionalidade visual ausente

- **Highlights persistentes:** não definidos no código. Há seleção nativa, marcadores e notas, sem token, decoração ou componente de highlight.
- **Sombra padrão de card:** não definida; cards comuns usam borda.
- **Estado focus visível global:** não definido como padrão; inputs dependem do comportamento nativo e não alteram borda ao focar.
- **Estado hover global:** não definido; usa-se `pressed`.

## Referências de implementação principais

| Área | Arquivo |
|---|---|
| Temas, raios, spacing e sombras | `src/theme/colors.ts` |
| Breakpoints e grids | `src/theme/responsive.ts` |
| Família base da UI | `src/theme/typography.ts` |
| Navegação e tab bar | `App.tsx` |
| Biblioteca | `src/screens/LibraryScreen.tsx` |
| Cards de livro | `src/components/BookCard.tsx`, `BookCardContinue.tsx` |
| Listas | `src/screens/ListsScreen.tsx`, `ListDetailScreen.tsx`, `src/components/ListCard.tsx` |
| Detalhes e editor de metadados | `src/screens/BookDetailScreen.tsx` |
| Modal central e sheets | `src/components/SettingsModal.tsx`, `ActionSheetModal.tsx` |
| Diálogos semânticos | `src/components/MetadataDialog.tsx` |
| Leitor e chrome | `src/screens/ReaderScreen.tsx` |
| Runtime EPUB | `src/readers/EpubReader.tsx`, `epubRuntime.ts`, `readerFonts.ts` |
| Runtime PDF | `src/readers/pdf/web/pdfWebRuntime.ts`, `src/readers/PdfReader.types.ts` |
| Marca | `src/components/KrumerLogo.tsx`, `assets/`, `android/app/src/main/res/` |
