# Scan mobile: titulo imediato + capas em segundo plano

## Objetivo

Tornar o scan da biblioteca no mobile praticamente instantaneo do ponto de vista do usuario:

- cadastrar cada livro usando apenas o **titulo derivado do nome do arquivo**;
- **nao bloquear** o scan na extracao da capa;
- registrar o livro na biblioteca imediatamente, sem capa (`coverPath: null`);
- disparar a extracao de capas **em segundo plano**, com limite de concorrencia;
- conforme cada capa fica pronta, ela aparece no livro correspondente na pagina principal (Biblioteca), sem precisar reescanear nem recarregar a tela;
- reduzir o tempo do onboarding e do rescan a quase zero.

## Comportamento atual (problema)

O fluxo atual em `mobile/src/services/libraryScanner.ts` (`scanLibrary`) e **sequencial e sincrono**:

1. Percorre todos os arquivos da pasta.
2. Para cada arquivo:
   - calcula o `id` e o titulo (nome do arquivo);
   - chama `await extractCover(filePath, id, format)` e **espera** a extracao terminar;
   - so entao empurra o `Book` no array com `coverPath` preenchido.
3. Retorna a lista completa de livros **somente depois** que todas as capas foram extraidas.

Consequencias:

- Com muitas pastas/livros, o scan pode demorar muito (EPUB le o arquivo inteiro via `JSZip`; PDF chama o modulo nativo `PdfRenderer`).
- O usuario fica preso no onboarding ou na tela de rescan vendo a barra de progresso por minutos.
- A biblioteca so aparece inteira depois do scan, mesmo para os livros cuja capa ainda nem seria visivel.

## Comportamento esperado

### Durante o scan (fase 1 — rapida)

Para cada arquivo detectado:

1. calcular `id` e titulo pelo nome do arquivo (regra ja existente em `getTitle`);
2. criar o `Book` com `coverPath: null`;
3. empurrar no resultado e emitir `onUpdate` de progresso **sem esperar capa**;
4. no final, retornar a lista completa e atualizar a biblioteca.

A barra de progresso reflete apenas a **varredura e o cadastro dos arquivos** (leitura de diretorio), nao mais a extracao de capas.

### Apos o scan (fase 2 — em segundo plano)

1. A lista de livros ja esta salva e visivel na Biblioteca, com placeholder (titulo no lugar da capa, comportamento ja existente em `BookCard`/`BookCardContinue`).
2. Um processo de background percorre os livros **sem capa** (`coverPath == null`) e extrai a capa de cada um:
   - `extractEpubCover` para EPUB;
   - `extractPdfCover` para PDF.
3. A extracao roda com **concorrencia limitada** (ex.: 2 a 3 por vez) para nao travar o app nem saturar o modulo nativo.
4. Ao concluir cada capa:
   - atualiza o `Book.coverPath` no estado global (AppContext);
   - persiste a biblioteca atualizada no AsyncStorage;
   - o componente `BookCard` reage ao novo `coverPath` e troca o placeholder pela capa **automaticamente** (sem recarregar a tela).

## Arquivos envolvidos

- `mobile/src/services/libraryScanner.ts`
  - `scanLibrary` passa a **so cadastrar** livros (sem `extractCover`).
  - Novo export `extractCoversInBackground(books, onCoverReady)` (ou equivalente) que roda a extracao em background.
- `mobile/src/services/coverExtractor.ts`
  - Reutilizado como esta: `extractCover(filePath, id, format)` continua sendo a entrada unica de extracao.
  - Nenhuma mudanca obrigatoria aqui; a logica de capa permanece identica.
- `mobile/src/context/AppContext.tsx`
  - Dono da extracao em background: dispara e retoma automaticamente.
  - `runCoversLoop` — garante que a extracao roda uma vez por vez (guard `coversRunningRef`) e retoma para livros sem capa sempre que ha novos pendentes (`coversRestartRef`).
  - `updateBookCover(id, coverPath)`:
    - atualiza o estado React (`setBookState`);
    - persiste via `saveBooks` com throttle (ver nota de persistencia abaixo).
  - `setBooks` dispara `runCoversLoop` apos salvar a biblioteca (cobre onboarding e rescan).
- `mobile/src/screens/OnboardingScreen.tsx`
  - `runScan` chama `scanLibrary` + `setBooks` e segue o onboarding normalmente; a extracao e responsabilidade do `AppContext`.
- `mobile/src/screens/SettingsGroupScreen.tsx`
  - `runScan` faz o mesmo: cadastra rapido; `setBooks` dispara o background.
- `mobile/src/components/BookCard.tsx` / `BookCardContinue.tsx` / `ListCard.tsx`
  - Nenhuma mudanca: ja exibem placeholder quando `coverPath` e nulo e trocam para a capa quando o path chega.

## Fluxo tecnico proposto

### `scanLibrary` (novo, fase 1)

```ts
export async function scanLibrary(
  directoryUri: string,
  onUpdate?: (update: ScanUpdate) => void
): Promise<Book[]> {
  const files = await scanDirectory(directoryUri);
  const books: Book[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const { uri: filePath, childrenCount } = files[index];
    const format = getBookFormat(filePath);
    if (!format) continue;

    const id = createBookId(filePath);
    const fileName = getFileName(filePath);
    onUpdate?.({
      fileName,
      percent: files.length ? (index / files.length) * 100 : 0,
      done: false,
    });

    books.push({
      id,
      title: getTitle(filePath),
      author: '',
      format,
      filePath,
      coverPath: null, // capa chega em segundo plano
      progress: null,
      childrenCount,
      addedAt: Date.now(),
    });

    onUpdate?.({
      fileName,
      percent: files.length ? ((index + 1) / files.length) * 100 : 100,
      done: index + 1 === files.length,
    });
  }

  if (!files.length) {
    onUpdate?.({ fileName: '', percent: 100, done: true });
  }

  return books;
}
```

### Background (novo, fase 2)

Novo export, por exemplo:

```ts
const CONCURRENCY = 3;

export async function extractCoversInBackground(
  books: Book[],
  onCoverReady: (bookId: string, coverPath: string) => void
): Promise<void> {
  const queue = books.filter((book) => !book.coverPath);
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const book = queue[cursor];
      cursor += 1;
      try {
        const coverPath = await extractCover(book.filePath, book.id, book.format);
        if (coverPath) onCoverReady(book.id, coverPath);
      } catch {
        // livro fica sem capa; nao quebra o fluxo
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
}
```

Observacoes:

- `onCoverReady` nao espera a capa; apenas notifica. A chamada em background nao bloqueia `runScan`.
- Livros que ja tem capa (reescan) sao ignorados pelo background, respeitando o criterio de aceite de nao sobrescrever/refazer trabalho.
- `extractCover` ja tem try/catch interno e fallback silencioso (retorna `null`), entao falhas de capa nunca quebram o scan.

### `AppContext` (atualizacao pontual)

Adicionar ao contexto:

```ts
const updateBookCover = useCallback(async (bookId: string, coverPath: string) => {
  setBookState((current) => current.map((book) =>
    book.id === bookId ? { ...book, coverPath } : book
  ));
  // persistencia: ver nota abaixo
}, []);
```

### Chamadas (onboarding e settings)

As telas **nao** disparam mais a extracao diretamente. Elas apenas:

```ts
async function runScan() {
  if (!folder || scanning) return;
  setScanning(true);
  const books = await scanLibrary(folder, setScanProgress);
  await setBooks(books);
  setScanProgress({ fileName: t('common.done'), percent: 100, done: true });
  setScanning(false);
}
```

`setBooks` (no `AppContext`) dispara `runCoversLoop` em segundo plano, sem bloquear a UI.

## Pausa e retomada ao fechar/reabrir o app

Se o app for encerrado enquanto as capas estao sendo extraidas:

1. **Pausa**: ao fechar, o runtime JS morre e a extracao para naturalmente — nao ha thread em background persistente.
2. **Estado salvo**: as capas ja extraidas ficam em `documentDirectory/covers/`; os livros atualizados ficam no AsyncStorage (persistencia com throttle de 400ms).
3. **Retomada**: ao reabrir o app, `AppContext` hidrata as preferencias e a biblioteca do AsyncStorage e, se houver livros com `coverPath: null`, chama `runCoversLoop` automaticamente.
4. **Sem retrabalho**: antes de extrair, o background consulta `getExistingCoverPath(bookId)` — capas que ja estao em disco sao reaplicadas instantaneamente, sem reextrair.
5. **Sem duplicidade**: `coversRunningRef` impede duas extracoes simultaneas; `coversRestartRef` marca uma nova rodada quando `setBooks` acontece durante uma extracao em andamento (ex.: rescan no meio do background).

Fluxo no `AppContext`:

```ts
const runCoversLoop = useCallback(async () => {
  if (coversRunningRef.current) {
    coversRestartRef.current = true;
    return;
  }
  coversRunningRef.current = true;
  try {
    do {
      coversRestartRef.current = false;
      const pending = booksRef.current.filter((book) => !book.coverPath);
      if (!pending.length) break;
      await extractCoversInBackground(pending, (bookId, coverPath) => {
        updateBookCover(bookId, coverPath);
      });
    } while (coversRestartRef.current);
  } finally {
    coversRunningRef.current = false;
  }
}, [updateBookCover]);
```

Observacao: livros cuja capa falhou permanentemente (extracao retorna `null`) continuam sem capa e sao retentados a cada abertura do app. Isso e aceitavel (comportamento de "resume"); a extracao nunca trava por causa deles.

## Persistencia

Duas opcoes:

1. **Salvar por capa** — chamar `saveBooks` a cada `updateBookCover`. Simples, porem escreve no AsyncStorage varias vezes em sequencia quando ha muitos livros.
2. **Salvar em lote (recomendado)** — acumular atualizacoes e persistir com throttle (ex.: 300ms a 500ms) ou ao concluir o background. Menos escrita, mesma experiencia visual (a capa aparece assim que o estado muda; a persistencia pode ser um pouco atrasada).

Na opcao 2, garantir que, se o app for encerrado no meio do background, nao ha perda critica: as capas ja salvas em disco (`documentDirectory/covers/`) continuam la, e o proximo rescan as reaproveita sem reextrair (veja abaixo).

## Reaproveitamento de capas ja extraidas

Para que o reescan nao reextraia capas ja geradas:

- O nome do arquivo de capa ja e determinístico: `cover_${bookId}.${ext}` em `documentDirectory/covers/` (ver `coverExtractor.ts`).
- No momento de cadastrar o livro, `scanLibrary` pode **verificar se a capa do `bookId` ja existe em disco** e, se existir, preencher `coverPath` na hora. Isso mantem o rescan rapido e reaproveita o trabalho feito.
- Se a checagem for cara, uma alternativa aceitavel: deixar `coverPath: null` e deixar o background tentar extrair; antes de extrair, o background verifica se `cover_${bookId}.*` ja existe (funcao `getExistingCoverPath(bookId)`) e usa direto.

## Regras de titulo e metadados (inalteradas)

O titulo continua vindo do nome do arquivo (`getTitle`):

- `Watchmen.pdf` → `Watchmen`;
- `O Hobbit.epub` → `O Hobbit`;
- `Batman - Ano Um.pdf` → `Batman - Ano Um`.

Durante o scan nao buscar metadados no Gemini, nao preencher autor/ano/sinopse/tags, e nao sobrescrever dados editados manualmente.

## Criterios de aceite

- Escanear uma pasta grande termina quase instantaneamente; a biblioteca aparece com todos os livros e placeholders.
- As capas aparecem progressivamente na Biblioteca conforme terminam de ser extraidas, sem reescan nem reload.
- O onboarding pode ser concluido sem esperar as capas; o background continua rodando.
- Se o app for fechado durante a extracao, ao reabrir a extracao retoma automaticamente do ponto onde parou, sem reextrair capas ja salvas em disco.
- Reescane a pasta nao reextrai capas que ja existem em disco.
- Livros cuja capa falhou continuam visiveis com placeholder (titulo), como hoje.
- PDF e EPUB seguem usando o mesmo fluxo de extracao (`extractEpubCover`/`extractPdfCover`), sem regressao.
- Nenhuma chamada ao Gemini durante o scan ou o background de capas.

## Pontos de atencao / riscos

- **Concorrencia**: `extractPdfCover` chama o modulo nativo. Manter `CONCURRENCY` baixa (2-3) evita pressao de memoria no `PdfRenderer` com PDFs grandes.
- **Memoria (EPUB)**: `extractEpubCover` le o arquivo em base64. Com concorrencia baixa e capas pequenas, o impacto e aceitavel; nao mudar a implementacao do extrator neste escopo.
- **Estado global**: `updateBookCover` precisa usar o setter funcional do `useState` para nao depender de closures desatualizados.
- **App fechado no meio do background**: sem prejuizo; capas ja salvas em disco sao reaproveitadas no proximo scan.
- **Reescaneamentos simultaneos**: evitar disparar dois backgrounds ao mesmo tempo (guard em `AppContext` ou no chamador).
- **Titulo com placeholder**: manter `BookCard` sem `onError` destrutivo quando a capa chega depois; o `useEffect` em `book.coverPath` ja reseta o estado de falha.

## Fora de escopo

- Buscar metadados completos automaticamente (Gemini) no scan.
- Sincronizacao com desktop/backend.
- Firebase.
- Mudancas no `coverExtractor.ts` (logica de extracao intacta).
- Priorizacao inteligente de capas (ex.: livros mais recentes primeiro).