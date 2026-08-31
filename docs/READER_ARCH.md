# Arquitetura do leitor do Readest para o Krumer Mobile

## Escopo e decisão arquitetural

Este documento cobre somente abertura e renderização de EPUB/PDF, navegação, paginação/scroll, posição de leitura, temas, fontes, busca, highlights, anotações e bookmarks.

Ficam fora do escopo: autenticação, sync, OPDS, TTS, biblioteca/importação de arquivos, conta, IA, dicionários, tradução e integrações externas.

Arquitetura recomendada para o Krumer Mobile:

| Camada | Implementação recomendada | Responsabilidade |
| --- | --- | --- |
| UI React Native | React Native + Expo | barras, menus, modais, lista de resultados e estado de sessão |
| Motor EPUB | `react-native-webview` + runtime web local | EPUB, DOM, CFI, seleção, paginação/scroll, CSS e overlays |
| Motor PDF | `react-native-pdf` | renderização nativa, zoom, scroll/paging e navegação por página |
| Persistência | `expo-sqlite` | progresso, configurações por livro, bookmarks, anotações e índice de busca |
| Arquivos | API moderna de `expo-file-system` | arquivos duráveis, cache extraído e leitura por faixa quando necessário |
| Bridge EPUB | protocolo JSON versionado sobre `postMessage` | comandos RN → WebView e eventos WebView → RN |

Não criar uma interface comum que esconda capacidades incompatíveis. EPUB usa CFI e ranges do DOM; PDF usa número de página e, quando disponível, geometria normalizada da página. A UI pode compartilhar ações, mas os locators devem continuar discriminados por formato.

`[VERIFICAR]` Na consulta de documentação feita em 2026-08-25, o catálogo do Expo expunha o SDK 56 como versão mais recente. Confirmar e fixar a versão exata antes de iniciar o Krumer Mobile.

## Mapa das fontes analisadas

### Entrada e ciclo de vida

- `src/app/reader/page.tsx`: entrada da rota do leitor.
- `src/app/reader/components/Reader.tsx`: shell visual, tema e montagem de `ReaderContent`.
- `src/app/reader/components/ReaderContent.tsx`: cria as instâncias de leitura, inicializa o estado e fecha os documentos.
- `src/store/readerStore.ts`: estado por viewer, abertura do documento e atualização de progresso.
- `src/store/bookDataStore.ts`: dados duráveis por livro e gravação de configuração/booknotes.
- `src/store/readerProgressStore.ts`: progresso de alta frequência, mantido separado dos dados duráveis.

### Motor e formatos

- `src/app/reader/components/FoliateViewer.tsx`: adaptador React do Web Component `<foliate-view>`.
- `src/app/reader/hooks/useFoliateEvents.ts`: liga eventos do foliate-js ao React.
- `src/app/reader/hooks/usePagination.ts`: ações de página/scroll, RTL, wheel, swipe e controles físicos.
- `src/libs/document.ts`: detecção do formato e construção do `BookDoc`.
- `src/types/view.ts`: contrato do `FoliateView` e dos renderers.
- `../../packages/foliate-js`: submódulo que contém `view.js`, `paginator.js`, `fixed-layout.js`, `epub.js`, `epubcfi.js`, `pdf.js`, `progress.js`, `search.js`, `text-walker.js` e `overlayer.js`.

O submódulo `foliate-js` está fixado no gitlink `79191075dfc513f563fd8e8acc56e50470fd9f4c`. A análise do pacote usa esse commit, não a branch atual do repositório externo.

Entre os demais diretórios de `../../packages`, nenhum fornece diretamente um segundo motor EPUB/PDF ao leitor. Os assets PDF.js — worker, WASM, CMaps, fontes padrão e CSS das camadas de texto/anotação — são copiados por scripts de `package.json` a partir das dependências do foliate-js.

### Dados e features

- `src/types/book.ts`: `BookConfig`, `BookNote` e locators persistidos.
- `src/services/bookService.ts`: leitura e gravação do `config.json` de cada livro.
- `src/utils/serializer.ts`: defaults, migração e remoção de valores redundantes antes de serializar.
- `src/app/reader/components/annotator/Annotator.tsx`: criação, edição e remoção de highlights/anotações.
- `src/app/reader/utils/annotatorUtil.ts`: desenho via `foliate-js/overlayer.js`.
- `src/app/reader/utils/annotationIndex.ts`: índice das anotações por seção/spine.
- `src/app/reader/utils/globalAnnotations.ts`: highlights globais de todas as ocorrências.
- `src/app/reader/components/BookmarkToggler.tsx`: criação e remoção de bookmarks.
- `src/app/reader/components/sidebar/SearchBar.tsx`: UI, debounce e opções de busca.
- `src/services/librarySearchService.ts`: extração, matching e resolução de offsets para CFI.
- `src/services/librarySearchIndex.ts`: cache SQLite de texto e offsets.
- `src/services/librarySearchWorker.ts`: matching executado fora da thread principal para modos mais caros.
- `src/utils/style.ts`, `src/styles/themes.ts` e `src/store/themeStore.ts`: tema, tipografia e CSS do conteúdo.
- `src/app/reader/hooks/useProgressAutoSave.ts`: debounce e flush do progresso.

## 1. Ciclo de vida e contrato do motor

### Como o Readest implementa

Fluxo de abertura:

1. `ReaderContent.tsx` cria uma chave de viewer com o hash do livro e chama `readerStore.initViewState(...)`.
2. `readerStore.ts` obtém o `File` por `AppService`, tenta resolver um caminho nativo e chama `new DocumentLoader(file, { nativeFilePath }).open()`.
3. `src/libs/document.ts` detecta EPUB pelo ZIP e PDF pelo cabeçalho `%PDF-`.
4. `FoliateViewer.tsx` importa dinamicamente `foliate-js/view.js`, cria `<foliate-view>`, chama `view.open(bookDoc)` e depois `view.init({ lastLocation })`.
5. O foliate-js escolhe internamente `<foliate-paginator>` para conteúdo reflowable ou `<foliate-fxl>` para `rendition.layout === 'pre-paginated'`.
6. No fechamento, o viewer é fechado/removido, a configuração é salva e os stores transitórios são limpos.

O `FoliateView` é um Custom Element DOM, não um componente React. `src/types/view.ts` apenas tipa e adapta seu contrato. A comunicação React ↔ foliate-js ocorre por métodos e `CustomEvent`s no mesmo WebView; não existe IPC Tauri nesse trecho.

O Readest também suporta mais de uma instância de livro/viewer. Somente a instância primária persiste progresso.

### Equivalente em React Native

Criar dois adapters explícitos:

```ts
type ReaderEngine = EpubWebViewEngine | NativePdfEngine;

type ReaderLocator =
  | {
      format: 'epub';
      cfi: string;
      spineHref?: string;
      progressionInSection?: number;
      excerpt?: string;
    }
  | {
      format: 'pdf';
      page: number;
      progressionInPage?: number;
    };
```

- `EpubWebViewEngine`: controla uma página web local dentro de `react-native-webview`.
- `NativePdfEngine`: adapta `react-native-pdf` para o contrato mínimo comum.
- Estado transitório do viewer pode ficar em Zustand/React state.
- Estado durável deve ficar em `expo-sqlite`.

Complexidade: **Médio** para o shell e **Complexo** para manter um contrato consistente entre motores.

### Restrições e gaps

- Custom Elements, `Document`, `Range`, iframe e CSSOM não existem no runtime JS do React Native. Código do foliate-js que usa essas APIs só pode rodar dentro da WebView.
- Não portar `FoliateViewer.tsx` como componente RN linha a linha. Portar o protocolo e a lógica de estado.
- Não reproduzir o suporte a múltiplos viewers na primeira versão móvel; ele aumenta o ciclo de vida e não é requisito de Android/iOS.
- O encerramento do processo móvel não é garantido. O último progresso deve ser gravado por debounce e também quando `AppState` entrar em `inactive` ou `background`.

## 2. EPUB: carregamento, parsing e renderização

### Como o Readest implementa

`src/libs/document.ts` cria um loader ZIP com `@zip.js/zip.js`. Ele oferece ao `foliate-js/epub.js` as funções `entries`, `loadText`, `loadBlob`, `getSize` e hash. O `EPUB.init()`:

- lê `META-INF/container.xml` e o OPF;
- monta metadata, manifest, spine, TOC, page list e propriedades de rendition;
- cria uma seção por item do spine;
- reescreve URLs de recursos para URLs carregáveis no WebView;
- atribui um CFI base a cada seção;
- oferece `resolveCFI`, `resolveHref`, `createDocument`, `loadText` e `loadContent`.

`FoliateViewer.tsx` transforma cada seção XHTML/CSS antes de renderizá-la e aplica fontes, tema, handlers, overlays e estilos após o evento `load` de cada documento.

Há um fast path Tauri opcional:

- `src/utils/tauriEpubBridge.ts` chama o comando Rust `parse_epub_full`.
- `src-tauri/src/epub_parser.rs` lê central directory, OPF, nav/NCX e tamanhos em uma thread bloqueante.
- O Rust **não** calcula spine CFIs nem interpreta toda a semântica do OPF. Os bytes retornam ao foliate-js, que continua sendo a fonte de verdade.
- Se o fast path falhar, o loader JS abre o EPUB normalmente.

### Equivalente em React Native

Recomendação para o Krumer:

1. Executar o motor EPUB dentro de uma WebView local.
2. Usar `epub.js` se a prioridade for reduzir o tempo da primeira implementação, já que a equipe já domina essa biblioteca.
3. Manter a bridge independente de `epub.js`, permitindo substituir o runtime por foliate-js no futuro sem alterar a UI RN nem o banco.
4. Manter o livro em `Paths.document` via API moderna de `expo-file-system`.
5. Para arquivos pequenos, carregar bytes no runtime web com limite explícito de tamanho.
6. Para arquivos grandes, implementar leitura por faixas: RN abre um `FileHandle`, a WebView solicita `{ offset, length }`, RN usa `readBytes`, devolve chunks e mantém cache de blocos.

O foliate-js pode ser reutilizado integralmente dentro da WebView se paridade com o Readest for mais importante do que simplicidade. Nesse caso, empacotar o commit escolhido como um runtime web versionado. Não importar o pacote no bundle JS nativo.

Partes quase diretamente portáveis, desde que executadas em ambiente DOM:

- parsing EPUB de `epub.js`;
- cálculo e comparação de CFI em `epubcfi.js`;
- matching de `search.js`;
- `text-walker.js`, `progress.js` e transformações DOM;
- desenho de overlays de `overlayer.js`.

Complexidade: **Complexo**. Um MVP com `epub.js` e livros pequenos é **Médio**; suporte robusto a arquivos grandes e bridge por faixas é **Complexo**.

### Restrições e gaps

- `window.ReactNativeWebView.postMessage` aceita uma string. Não transportar um EPUB inteiro como array JSON.
- O carregamento de HTML/arquivos locais em `react-native-webview` tem diferenças entre iOS e Android. No Android, o caminho estático documentado é `file:///android_asset/`; documentos gravados pelo app exigem estratégia adicional.
- `[VERIFICAR]` Validar em dispositivo real a estratégia escolhida para assets locais, CSP, blob URLs, iframes e `allowFileAccessFromFileURLs` nas versões exatas de `react-native-webview`, Android System WebView e WKWebView.
- Não é necessário portar `parse_epub_full` para Swift/Kotlin para obter correção funcional. Ele é uma otimização.
- JSZip carrega estruturas grandes em memória. Não adotá-lo sem limite de tamanho e medição de pico de memória.
- CFIs gerados por epub.js e foliate-js seguem EPUB CFI, mas não devem ser considerados byte a byte compatíveis quando a árvore DOM ou as transformações diferem.

## 3. PDF: carregamento e renderização

### Como o Readest implementa

`src/libs/document.ts` chama `makePDF(file)` de `foliate-js/pdf.js`. Esse módulo usa PDF.js e expõe o PDF como um `BookDoc` de layout fixo:

- `rendition.layout = 'pre-paginated'`;
- cada página vira uma seção;
- a página é desenhada em canvas;
- uma `TextLayer` separada permite seleção e ranges;
- uma `AnnotationLayer` renderiza links/anotações existentes no arquivo;
- TOC e page list são convertidos para navegação por índice;
- existe cache LRU de páginas e resultados renderizados;
- leituras por faixa são limitadas a seis requisições concorrentes;
- em WebViews móveis, DPR é limitado e a área de canvas tem teto para reduzir OOM no WKWebView.

O PDF passa pelo mesmo `<foliate-view>` de EPUB. Como cada página possui uma camada DOM de texto, o Readest consegue gerar CFIs sintéticos, selecionar texto e desenhar highlights com o mesmo overlayer.

No Tauri móvel, `NativeFile`/`RemoteFile` e o protocolo Android `rangefile` resolvem leitura por faixas do arquivo local. Isso é uma adaptação específica do Tauri WebView.

### Equivalente em React Native

Usar `react-native-pdf` para o viewer principal:

- `source={{ uri: fileUri }}` para arquivo local;
- `page`/`setPage()` para restauração e navegação;
- `onPageChanged` para progresso;
- `scale`, `minScale`, `maxScale` e `onScaleChanged` para zoom;
- `horizontal` + `enablePaging` para modo paginado;
- `onPressLink` para links;
- `enableAnnotationRendering` somente para anotações já presentes no PDF.

Como `react-native-pdf` contém código nativo, usar Expo development build/prebuild; ele não é uma dependência adequada para Expo Go.

Complexidade: **Simples** para abrir, paginar, aplicar zoom e persistir página; **Complexo** para busca, seleção e highlights equivalentes ao Readest.

### Restrições e gaps

- Não portar PDF.js, worker, CMaps, fontes e canvas do Readest se `react-native-pdf` for o motor escolhido.
- O contrato documentado de `react-native-pdf` não oferece busca full-text nem API para criar highlights geométricos.
- `enableAnnotationRendering` renderiza anotações contidas no arquivo; não substitui o sistema de booknotes do aplicativo.
- Seleção de texto e callback de seleção estão documentados somente para iOS. Não assumir paridade no Android.
- `[VERIFICAR]` Confirmar na versão escolhida se há suporte confiável a cor de página/night mode. A API consultada não expõe equivalente direto ao `pageColors` do PDF.js.
- Para highlights PDF próprios, será necessário um módulo nativo que exponha quads/retângulos por página, um overlay sincronizado com zoom/scroll ou um SDK PDF mais completo. Não existe port direto do overlayer DOM.
- O locator persistido de PDF deve ser página, não CFI sintético do foliate-js.

## 4. Paginação, scroll, spreads e direção

### Como o Readest implementa

Para conteúdo reflowable, `foliate-js/paginator.js` implementa ambos os modos no mesmo renderer:

- paginado: conteúdo em colunas CSS, uma ou duas colunas por spread;
- scroll: fluxo contínuo, com seções adjacentes pré-carregadas;
- `flow`, `scroll-direction` e `no-continuous-scroll` são atributos configurados por `FoliateViewer.tsx`;
- margens, gap, largura máxima, altura máxima e número de colunas vêm de `viewSettings`;
- direção RTL e writing modes verticais alteram eixo, lado e cálculo de progresso;
- ao mudar tamanho ou estilo, o renderer preserva um range âncora para evitar salto de posição.

Para PDF e EPUB pre-paginated, `foliate-js/fixed-layout.js` monta spreads por `pageSpread`, oferece modo scroll, zoom/pan, pré-renderização e cache.

`usePagination.ts` centraliza a ação “anterior/próximo”:

- no scroll, avança aproximadamente um viewport com pequena sobreposição;
- em scroll vertical, ajusta o deslocamento a uma linha de texto;
- no modo por seção, chama `prevSection()`/`nextSection()`;
- em layout fixo com zoom, faz pan antes de virar a página;
- troca os lados no RTL;
- recebe taps, wheel, swipe, teclas, botões de volume e controles de mídia.

Não há IPC Rust na paginação. Toda a lógica é DOM/JS.

### Equivalente em React Native

EPUB:

- manter paginação e scroll dentro da WebView;
- no runtime epub.js, mapear configurações para flow paginado ou scrolled;
- enviar somente comandos semânticos `NEXT`, `PREVIOUS`, `GO_TO` e `SET_FLOW` pela bridge;
- o runtime web deve emitir `RELOCATE` depois que o layout estabilizar.

PDF:

- paginado: `horizontal` + `enablePaging`;
- scroll contínuo: `enablePaging={false}` e eixo definido pelo produto;
- `onPageChanged` é a fonte do índice atual;
- zoom e pan permanecem no componente nativo.

Complexidade: **Médio** para LTR e layout simples; **Complexo** para RTL, escrita vertical, spreads e preservação perfeita do anchor após reflow.

### Restrições e gaps

- Não implementar virada de página EPUB movendo um `ScrollView` RN externo; o renderer web conhece colunas, escrita vertical e limites das seções.
- A altura/largura segura deve ser enviada à WebView após considerar safe areas e barras do leitor.
- Taps e gestos competem com seleção de texto, links e scroll. Definir uma arena de gestos; não registrar “tap para virar” sem verificar seleção ativa e elementos interativos.
- `[VERIFICAR]` Os nomes exatos dos flows e métodos do epub.js dependem da versão fixada. Encapsular isso apenas no runtime web.
- Não tentar igualar spreads de PDF e EPUB por uma única regra. O PDF nativo controla sua própria composição.

## 5. Progresso de leitura e restauração

### Como o Readest implementa

O evento `relocate` do foliate-js contém, conforme o formato e renderer:

- `cfi`;
- `section` atual/total;
- `location` atual/próxima/total;
- `fraction` global;
- `range` visível;
- item atual do TOC e da page list;
- estimativas de tempo.

`readerProgressStore.ts` recebe esse objeto em alta frequência. `readerStore.setProgress` converte o evento em progresso do livro. Para a view primária, persiste em `BookConfig`:

- `location`: CFI;
- `progress`: tupla `[current, total]`.

`useProgressAutoSave.ts`:

- ignora a relocação inicial equivalente à posição já salva;
- ignora navegação de preview/deep link até a primeira ação real do usuário;
- aplica debounce de 1 segundo e agenda a escrita aproximadamente 500 ms depois;
- faz flush imediato em `visibilitychange: hidden` e `pagehide`;
- força o flush da gravação maior da biblioteca ao desmontar.

O arquivo por livro é `<hash>/config.json`, gravado pelo `BookService` via `AppService`. O store separa progresso transitório da configuração durável para não re-renderizar/gravar a cada pixel de scroll.

### Equivalente em React Native

Persistir um locator discriminado e um fallback:

```ts
type PersistedEpubPosition = {
  cfi: string;
  spineHref: string | null;
  progressionInSection: number | null;
  excerpt: string | null;
  totalProgress: number | null;
};

type PersistedPdfPosition = {
  page: number; // 1-based, igual ao contrato de react-native-pdf
  totalPages: number;
  progressionInPage: number | null;
};
```

Fluxo recomendado:

1. Atualizar estado transitório imediatamente.
2. Aplicar debounce de 1 segundo para SQLite.
3. Gravar imediatamente em `AppState` `inactive`/`background` e ao desmontar a tela.
4. Na abertura EPUB, tentar CFI; se falhar, tentar `spineHref + progressionInSection`; por último procurar `excerpt` próximo.
5. Na abertura PDF, restaurar `page`; não restaurar scroll absoluto em pixels.

Complexidade: **Médio**.

### Restrições e gaps

- CFI depende do spine e da árvore DOM usada pelo renderer. Mudanças de motor ou transformações podem invalidá-lo.
- Não converter posição PDF para `epubcfi(...)` apenas para uniformizar o schema.
- Não gravar no SQLite em cada evento de scroll.
- Não guardar somente porcentagem global; mudanças de layout, edição do EPUB ou contagem de páginas podem deslocá-la.
- O sistema operacional pode encerrar o app sem executar cleanup. O debounce deve ser curto e o flush em background obrigatório.
- O Krumer não precisa reproduzir `library.json`; a linha de progresso no SQLite deve ser a fonte durável de verdade.

## 6. Highlights e anotações EPUB

### Como o Readest implementa

`BookNote` em `src/types/book.ts` usa um único modelo para `bookmark`, `annotation` e `excerpt`. Para anotações, os campos principais são:

- `id`, `type`, `cfi` e, opcionalmente, xpointers;
- trecho `text` e `page`;
- `style`: `highlight`, `underline` ou `squiggly`;
- `color`, `note` e flag `global`;
- `createdAt`, `updatedAt` e `deletedAt`.

Em `Annotator.tsx`, uma seleção DOM vira `Range`; `view.getCFI(sectionIndex, range)` gera o locator. Seleções que atravessam páginas/seções podem gerar mais de um booknote.

O desenho usa `foliate-js/overlayer.js`. `annotatorUtil.ts` seleciona o painter de highlight/underline/squiggly. O overlayer é recriado por documento/seção, e `annotationIndex.ts` permite carregar somente as anotações da seção visível. Ao reabrir ou carregar uma nova seção, `FoliateViewer.tsx` chama `view.addAnnotation(...)` novamente.

Remoções são soft delete: o registro permanece com `deletedAt`. `bookDataStore.updateBooknotes` deduplica por `id-type-cfi`, mantém tombstones e salva `BookConfig`.

Highlights globais, em `globalAnnotations.ts`, procuram todas as ocorrências do texto em seções renderizadas e criam overlays sintéticos. Eles não são usados em fixed layout.

Não há Rust no cálculo de CFI, seleção ou desenho. Tauri participa somente da gravação do JSON.

### Equivalente em React Native

Para EPUB, executar seleção, CFI e desenho dentro da WebView. A UI RN recebe eventos de seleção e envia comandos de anotação.

Schema SQLite recomendado:

```sql
CREATE TABLE reader_annotations (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
  locator_json TEXT NOT NULL,
  quote TEXT,
  style TEXT NOT NULL,
  color TEXT NOT NULL,
  note TEXT,
  is_global INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX reader_annotations_book_live
ON reader_annotations(book_id, deleted_at);
```

Bridge mínima:

| Direção | Mensagem | Payload essencial |
| --- | --- | --- |
| WebView → RN | `SELECTION_CHANGED` | CFI/range, texto, spine, retângulo da toolbar |
| RN → WebView | `UPSERT_ANNOTATION` | id, CFI, estilo e cor |
| RN → WebView | `DELETE_ANNOTATION` | id/CFI |
| RN → WebView | `LOAD_SECTION_ANNOTATIONS` | booknotes vivos da seção |
| WebView → RN | `ANNOTATION_PRESSED` | id/CFI e âncora visual |

Guardar tombstones se houver qualquer plano de sync futuro. Se o Krumer for definitivamente local-only, hard delete é aceitável, mas isso deve ser uma decisão de produto explícita.

Complexidade: **Complexo**.

### Restrições e gaps

- Não tentar criar ou resolver `Range` no runtime RN.
- Não desenhar highlight EPUB como overlay RN sobre a WebView; zoom, reflow, fontes e scroll invalidam a geometria.
- CFIs só podem ser calculados após o conteúdo e as transformações DOM estabilizarem.
- A WebView deve receber apenas as anotações do spine carregado, não todos os overlays do livro a cada mudança.
- Highlights globais têm custo proporcional ao texto e ao número de ocorrências. Não incluí-los no MVP.
- `[VERIFICAR]` Se o runtime for epub.js, validar a forma exata de adicionar/remover marks e o comportamento de seleções que cruzam spine items.

## 7. Bookmarks

### Como o Readest implementa

`BookmarkToggler.tsx` lê a posição atual do `readerProgressStore`, incluindo `location`, `range` e página. Ao adicionar:

- gera um `BookNote` com `type: 'bookmark'`;
- usa o CFI atual;
- guarda um trecho de contexto e o rótulo de página;
- grava timestamps.

Ao remover, encontra bookmarks dentro da localização atual e define `deletedAt`. A lista é salva no mesmo `BookConfig.booknotes` das anotações.

Não há IPC Rust específico.

### Equivalente em React Native

Usar tabela própria ou a mesma tabela de annotations com `kind`. Uma tabela própria simplifica constraints:

```sql
CREATE TABLE reader_bookmarks (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL,
  format TEXT NOT NULL,
  locator_json TEXT NOT NULL,
  excerpt TEXT,
  label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
```

- EPUB: salvar locator emitido pelo último `RELOCATE` estabilizado.
- PDF: salvar página 1-based e, se disponível, progresso normalizado dentro da página.
- Ao tocar na lista, delegar a navegação ao motor correto.

Complexidade: **Simples**.

### Restrições e gaps

- Não gerar bookmark com a posição visual da toolbar; usar a posição canônica do motor.
- Não deduplicar apenas por porcentagem. EPUB deve comparar CFI/spine; PDF deve comparar página e posição normalizada.
- Se houver sync futuro, manter soft delete e timestamps desde o início.

## 8. Busca full-text

### Como o Readest implementa

`src/app/reader/components/sidebar/SearchBar.tsx` aplica debounce de 500 ms. O mínimo padrão é dois caracteres; CJK e regex permitem um. Há escopo por livro ou seção e modos:

- contains;
- whole words;
- regex;
- nearby words;
- opções de case e diacríticos.

O histórico de consultas é mantido por livro em `localStorage`; ele não faz parte do índice full-text.

O fluxo atual não faz uma busca DOM completa a cada consulta:

1. `librarySearchService.ts` extrai o texto de cada seção com `foliate-js/text-walker.js`.
2. Também guarda offsets cumulativos dos text nodes para reconstruir `Range`.
3. `librarySearchIndex.ts` persiste `<hash>/search.db` com `search_meta`, `search_sections` e `search_nodes`.
4. O índice possui texto original e uma versão folded/normalizada.
5. SQLite `LIKE` é usado como pré-filtro; o matcher JS sobre texto original decide o resultado final e preserva offsets.
6. O resultado por offset é convertido em `Range` e depois em CFI com `CFI.fromRange` + CFI base da seção.
7. A UI chama `view.search({ query, results, ...config })` principalmente para desenhar os resultados já resolvidos.

O Readest **não** usa SQLite FTS como fonte de verdade para a busca de substring. A escolha por texto folded + matcher exato preserva semântica e offsets.

O banco usa a abstração de database do Readest: plugin Turso/SQLite no Tauri e implementação web/WASM em outros targets. O Rust não executa o matcher de texto.

### Equivalente em React Native

EPUB:

- persistir `search_meta`, `search_sections` e `search_nodes` em `expo-sqlite`;
- persistir o histórico curto de consultas separadamente do índice e limitá-lo por livro;
- construir o índice na primeira busca ou em job explícito após abertura;
- executar a extração no runtime web para usar a mesma árvore DOM do renderer;
- enviar `INDEX_CHUNK` em lotes para RN, nunca um livro inteiro em uma mensagem;
- executar pré-filtro e matching em JS/RN ou numa task dedicada;
- enviar ao runtime web somente resultados da seção visível para pintura;
- invalidar o índice por hash/updatedAt do arquivo, versão do extractor e versão das transformações.

PDF:

- `react-native-pdf` não expõe busca full-text na API consultada;
- para um MVP, usar um extractor separado para gerar `{ page, text }`, mostrar resultados e navegar para a página;
- highlight dentro da página exige retângulos/quads do mesmo motor de texto; sem isso, não prometer pintura precisa;
- alternativas são módulo nativo próprio, PDF.js em WebView apenas para indexação ou SDK PDF com search/annotations.

Complexidade: **Complexo** para EPUB e **Complexo** para PDF com highlight visual; o risco técnico do PDF é maior.

### Restrições e gaps

- Não chamar busca linear em todas as seções a cada tecla.
- Não afirmar que o Readest usa FTS5/Tantivy; o código atual usa tabelas SQLite normais, pré-filtro `LIKE` e matcher exato.
- Não guardar somente texto normalizado; offsets precisam apontar para o texto original.
- Não calcular CFI a partir de HTML extraído por parser diferente sem validar a correspondência com o DOM renderizado.
- Não enviar milhares de resultados/CFIs em uma única mensagem da bridge.
- `[VERIFICAR]` Escolher e validar o extractor PDF em Android e iOS. O viewer `react-native-pdf` por si só não cobre essa feature.

## 9. Temas, cores e fontes

### Como o Readest implementa

O tema tem duas dimensões diferentes:

- `ThemeMode` em `themeStore.ts`: `auto`, `light`, `dark` ou `ambient`;
- `themeColor` em `themes.ts`: paletas como default, gray e sepia, cada uma com variantes clara/escura.

Portanto, sepia é uma paleta, não um terceiro modo equivalente a light/dark.

`Reader.tsx` aplica o tema ao shell. Para o conteúdo, `getThemeCode` e `getStyles` em `src/utils/style.ts` geram CSS com:

- background, foreground e cor primária;
- família, tamanho, peso e espaçamento de fonte;
- altura de linha, alinhamento, margens e largura de linha;
- CSS de fontes customizadas via `@font-face` e blob URL;
- estilos customizados do usuário.

`FoliateViewer.tsx` reaplica o CSS em cada documento/iframe carregado. Fontes padrão incluem famílias separadas para serif, sans, monospace e CJK. Há ajuste de escala de fonte em WebViews móveis.

Em PDF, o Readest só envia `pageColors` ao PDF.js quando `applyThemeToPDF` está ativo. Isso recolore a renderização, não altera a tipografia embutida do PDF.

Não há Rust nessa feature.

### Equivalente em React Native

- Shell: `useColorScheme`/`Appearance` para modo do sistema e tokens RN para cores.
- Preferências: SQLite ou store persistido; manter `mode` e `palette` separados.
- EPUB: enviar `APPLY_READER_STYLE` para a WebView e aplicar CSS no rendition/documento.
- Fontes do shell: `expo-font`.
- Fontes do EPUB: empacotar ou copiar o arquivo para um URI acessível ao WebView e gerar `@font-face`; não assumir que uma fonte carregada por `expo-font` está automaticamente visível dentro da WebView.
- Sepia: aplicar paleta de background/foreground/links, não um filtro global.
- PDF: manter tema na chrome do leitor; aplicar recoloração de página somente se o motor nativo expuser uma API testada.

Complexidade: **Médio** para EPUB e shell; **Complexo** para recoloração PDF com fidelidade.

### Restrições e gaps

- Não compartilhar objetos `StyleSheet` RN diretamente com o conteúdo EPUB; gerar CSS explícito.
- Não usar `filter: invert()` como implementação padrão de dark mode PDF; imagens e cores ficam semanticamente erradas.
- Não assumir que mudar fonte preserva página/offset visual. Depois do reflow, restaurar pelo CFI/anchor e esperar o renderer estabilizar antes de emitir progresso.
- Não usar um único enum `light | dark | sepia`; manter modo luminoso separado da paleta.
- `[VERIFICAR]` `BookStyle.theme` não aparece como fonte autoritativa do tema no fluxo analisado; o comportamento efetivo vem de `themeStore` + `themeColor` + CSS gerado.

## 10. Bridge entre React Native e o runtime EPUB

### Como o Readest implementa

O Readest não precisa de uma bridge serializada entre React e foliate-js: ambos executam no mesmo WebView. Métodos são chamados diretamente e eventos DOM são escutados diretamente. Tauri é usado em paralelo para filesystem e otimizações nativas.

### Equivalente em React Native

Definir um envelope estável:

```ts
type BridgeEnvelope<T = unknown> = {
  version: 1;
  id: string;
  type: string;
  payload: T;
};
```

Comandos RN → WebView:

- `OPEN_BOOK`
- `CLOSE_BOOK`
- `GO_TO_LOCATOR`
- `NEXT` / `PREVIOUS`
- `SET_FLOW`
- `APPLY_READER_STYLE`
- `UPSERT_ANNOTATION`
- `DELETE_ANNOTATION`
- `SHOW_SEARCH_RESULTS`
- `CLEAR_SEARCH_RESULTS`
- `READ_RANGE_RESULT`

Eventos WebView → RN:

- `READY`
- `BOOK_OPENED`
- `RELOCATE`
- `SELECTION_CHANGED`
- `ANNOTATION_PRESSED`
- `LINK_PRESSED`
- `INDEX_CHUNK`
- `READ_RANGE_REQUEST`
- `ERROR`

Regras do protocolo:

- toda mensagem é JSON validado;
- `id` correlaciona request/response;
- `version` permite migração;
- erros possuem `code`, `message` seguro e `requestId`;
- payloads grandes são paginados/chunked;
- o runtime só aceita origens e tipos conhecidos;
- comandos enviados antes de `READY` entram em fila limitada.

Complexidade: **Médio** para comandos básicos; **Complexo** com leitura por faixa e indexação.

### Restrições e gaps

- `injectedJavaScript` deve terminar em valor válido, normalmente `true`, para evitar falhas silenciosas documentadas pelo WebView.
- `onMessage` precisa estar configurado para que `window.ReactNativeWebView.postMessage` exista.
- Não concatenar strings não escapadas em JavaScript injetado. Serializar dados e validar o envelope.
- Não permitir navegação arbitrária no WebView. Links externos devem ser interceptados e entregues ao RN.
- Não expor um bridge genérico de filesystem. Expor operações estritas por `bookId`, range e limites validados.

## 11. Filesystem, banco e IPC nativo

### Como o Readest implementa

O Tauri fornece:

- filesystem via `@tauri-apps/plugin-fs` e `AppService`;
- `NativeFile` com leitura por range e cache;
- protocolo Android `rangefile` para contornar diferenças de Range no WebView;
- comandos Rust de prefetch EPUB;
- database nativo para o cache de busca.

Renderização, CFI, overlays, matching e paginação continuam em JavaScript/DOM.

### Equivalente em React Native

Expo SDK atual fornece na API moderna de `expo-file-system`:

- `File`/`Directory` e `Paths.document` para armazenamento durável;
- `bytes()` para leitura completa;
- `open()`/`FileHandle`, offset e `readBytes()` para leitura por faixas em Android e iOS.

`expo-sqlite` persiste o banco entre reinicializações. Usar migrations transacionais e índices por `book_id`.

Separação recomendada:

- arquivos EPUB/PDF: filesystem;
- progresso, settings e booknotes: SQLite;
- texto de busca: SQLite, em tabelas próprias e rebuildáveis;
- blobs temporários/EPUB extraído: cache, nunca a única cópia do livro.

Complexidade: **Médio**.

### Restrições e gaps

- URIs `content://`, `file://` e caminhos crus não são intercambiáveis. Normalizar somente na borda de cada módulo.
- A documentação do Expo diferencia o path cru do banco SQLite de uma URI `file://` do filesystem.
- Não portar o protocolo `rangefile` do Tauri por reflexo. Primeiro usar URI nativa direta para PDF e as APIs de arquivo do Expo.
- Qualquer módulo nativo adicional exige development build/prebuild e validação nas arquiteturas Android/iOS escolhidas.
- Não guardar o arquivo principal do livro em cache apagável pelo sistema.

## 12. Sequência de implementação recomendada

1. Definir schemas SQLite, locators discriminados e migrations.
2. Implementar PDF básico com página, zoom, paging/scroll e progresso.
3. Criar shell EPUB local e bridge versionada.
4. Abrir EPUB com epub.js, implementar tema, fontes, flow e restauração por CFI.
5. Implementar bookmarks.
6. Implementar seleção e highlights EPUB por seção.
7. Implementar índice de busca EPUB em chunks.
8. Medir EPUBs grandes e decidir entre limite, extração nativa ou reader por ranges.
9. Especificar separadamente busca/seleção/highlights PDF após validar as APIs nativas.

## Restrições Globais para Implementação no Krumer

- Não renderizar EPUB com componentes React Native; renderizar EPUB dentro de `react-native-webview`.
- Não importar `foliate-js/view.js`, `paginator.js`, `fixed-layout.js` ou qualquer código dependente de DOM no runtime JS nativo; executá-lo somente no runtime web.
- Não portar `FoliateViewer.tsx` linha a linha; portar seu contrato, eventos e regras de estado para uma bridge explícita.
- Não usar PDF.js em WebView como viewer PDF principal quando `react-native-pdf` já cobre renderização, página, zoom e scroll nativos.
- Não tratar `react-native-pdf` como compatível com Expo Go; usar development build/prebuild.
- Não usar CFI para progresso PDF; usar página 1-based e posição normalizada opcional.
- Não assumir que CFI de epub.js e foliate-js é byte a byte intercambiável; persistir fallbacks de spine, progressão e trecho.
- Não persistir somente porcentagem global; persistir locator canônico e fallbacks.
- Não gravar progresso a cada evento de scroll; usar estado transitório, debounce e flush em background.
- Não depender apenas do cleanup do componente para salvar; tratar `AppState` `inactive`/`background`.
- Não enviar o EPUB inteiro como JSON/base64 pela bridge sem limite de tamanho; usar chunks, staging ou leitura por faixas.
- Não usar JSZip sem medir memória e impor limite de tamanho; EPUBs grandes precisam de estratégia streaming/range ou extração nativa.
- Não expor filesystem genérico à WebView; expor somente operações validadas e limitadas ao livro aberto.
- Não carregar URLs remotas ou permitir navegação arbitrária no WebView do leitor; interceptar links e aplicar política de origem.
- Não calcular `Range`, CFI ou geometria de highlight EPUB no React Native; calcular no DOM da WebView.
- Não desenhar highlights EPUB como overlays React Native sobre a WebView; desenhar dentro do mesmo documento que sofre reflow.
- Não enviar todas as anotações do livro a cada relocação; carregar e pintar por spine/seção.
- Não remover booknotes fisicamente se houver possibilidade de sync; usar `deleted_at` e timestamps.
- Não implementar highlights globais no MVP; eles exigem busca de todas as ocorrências e overlays em múltiplas seções.
- Não assumir que `enableAnnotationRendering` de `react-native-pdf` cria anotações do app; ele renderiza anotações já embutidas no PDF.
- Não prometer seleção de texto PDF no Android usando apenas `react-native-pdf`; a API consultada documenta seleção somente no iOS.
- Não prometer busca full-text ou highlights PDF usando apenas `react-native-pdf`; selecionar um extractor/módulo/SDK separado.
- Não desenhar highlight PDF sem geometria normalizada da mesma engine de texto e sem sincronização com zoom/scroll.
- Não aplicar `filter: invert()` como dark mode PDF padrão; manter a página original até existir recoloração nativa validada.
- Não modelar tema como apenas `light | dark | sepia`; separar modo luminoso de paleta.
- Não assumir que `expo-font` registra automaticamente fontes dentro da WebView; fornecer `@font-face` acessível ao runtime web.
- Não restaurar EPUB por offset em pixels depois de mudar fonte, viewport ou espaçamento; restaurar por CFI/anchor após o reflow.
- Não implementar page turn EPUB em um `ScrollView` RN externo; delegar paginação e scroll ao motor web.
- Não ignorar RTL, writing mode e elementos interativos ao implementar gestos de virada de página.
- Não afirmar que o Readest usa FTS5/Tantivy na busca atual; ele usa tabelas SQLite, pré-filtro `LIKE` e matcher JS exato.
- Não reconstruir CFI de resultado de busca com uma árvore HTML diferente da árvore usada pelo renderer sem teste de correspondência.
- Não bloquear a thread da UI ao indexar um livro; construir o índice incrementalmente e em lotes canceláveis.
- Não portar `parse_epub_full` em Swift/Kotlin antes de medir; ele é otimização Tauri, não requisito funcional.
- Não portar o protocolo Android `rangefile` do Tauri sem reproduzir e medir o mesmo problema no RN.
- Não armazenar a única cópia do EPUB/PDF em diretório de cache; usar armazenamento durável.
- Não misturar `content://`, `file://` e paths crus; cada adapter deve normalizar e validar seu tipo de origem.
- Não compartilhar uma tabela/locator não discriminado entre EPUB e PDF; usar `format` e payloads específicos.
- Não adicionar suporte aos formatos secundários do Readest antes de estabilizar EPUB e PDF.
- Não replicar multi-view, highlights globais, importadores de anotações de terceiros ou integrações do Readest no MVP do Krumer.

## Referências de API para o alvo

- [Expo SDK](https://github.com/expo/expo): `expo-file-system` moderno e `expo-sqlite`.
- [React Native WebView](https://github.com/react-native-webview/react-native-webview): `onMessage`, `window.ReactNativeWebView.postMessage`, JavaScript injetado e carregamento local.
- [React Native PDF](https://github.com/wonday/react-native-pdf): fontes locais, página, zoom, paging, callbacks e limitações da API pública.
