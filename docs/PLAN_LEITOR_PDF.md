# F3 — Leitor PDF nativo com shell do EPUB

## Resumo

Concluir a F3 inicialmente no Android, reutilizando o shell visual do EPUB e o `react-native-pdf`. Além dos requisitos originais — paginação/scroll, zoom, links, progresso, bookmarks e anotações embutidas — entram auto-ocultação das barras, orientação, brilho, botões de volume e notas ancoradas por página com prévia modal.

Não entram coluna dupla, recoloração das páginas, sumário PDF, busca, seleção, highlights ou anotações desenhadas pelo Krumer. As notas serão registros laterais vinculados à página, não alterações no PDF.

## Implementação faseada

### Fase 1 — Fundação e contratos

- Fixar o `react-native-pdf` na versão `6.7.7` já registrada no lockfile.
- Consolidar tipos e remover coluna dupla do estado ativo.
- Introduzir `PdfPreferences` com:
  - `displayMode: 'paginated' | 'scroll'`;
  - `orientation: 'free' | 'portrait' | 'landscape'`;
  - `scale: 0.5..2.0`.
- Migrar silenciosamente preferências antigas `horizontal/vertical` para `paginated/scroll`.
- Extrair helpers puros para clamp de página/zoom e classificação de taps.
- Reutilizar `pdfUri.ts` em um hook de resolução com cleanup seguro de cópias `content://`.

**Aceite:** o comportamento visual atual permanece; caminhos crus, `file://` e `content://` continuam abrindo; TypeScript e validadores atuais passam.

### Fase 2 — Motor PDF nativo confiável

- Criar o adapter `NativePdfEngine` como único ponto que importa `react-native-pdf`.
- Substituir o hack `singlePage=true` do leitor principal por uma única instância com o documento completo:
  - paginado: `horizontal=true` e `enablePaging=true`;
  - scroll: `horizontal=false` e `enablePaging=false`;
  - `singlePage=false` em ambos.
- Manter `source` memoizada e não usar `key` variável, evitando reload ao mudar barras, zoom ou modo.
- Expor navegação por `ref.setPage()`, página inicial 1-based, total, loading e erros.
- Encaminhar links externos ao shell; links internos continuam sendo navegados nativamente.
- Ativar explicitamente `enableAnnotationRendering` somente para anotações já presentes no arquivo.

**Aceite:** PDFs de 1, 5 e 300 páginas informam total correto, sem “1/1” fantasma; dois PDFs abertos sequencialmente não compartilham página, escala ou callbacks.

### Fase 3 — Progresso e bookmarks duráveis

- Criar `usePdfPersistence`, reutilizando as tabelas existentes e `PdfLocator`.
- Ordem de restauração: SQLite → `progress_<book.id>`/estado legado do livro → página 1.
- Persistir `{ format: 'pdf', page, progressionInPage: null }`.
- Atualizar a UI imediatamente e gravar após debounce de 1 segundo; fazer flush ao fechar e ao ir para background.
- Continuar sincronizando `AsyncStorage` e `AppContext` para compatibilidade com biblioteca e “Continuar lendo”.
- Implementar criação, listagem, remoção por tombstone e navegação de bookmarks.
- Renderizar o nome do bookmark como “Página N” no idioma atual, sem persistir texto traduzido.

**Aceite:** fechar na página N restaura exatamente N; bookmarks sobrevivem ao reinício e navegam à página correta. Nenhuma migration nova será necessária.

### Fase 4 — Shell compartilhado com o EPUB

- Extrair componentes de chrome reutilizáveis sem alterar a montagem do `EpubReader`.
- Barra superior do PDF:
  - adicionar bookmark;
  - listar bookmarks;
  - título central;
  - zoom;
  - exibição/orientação;
  - fechar.
- Barra inferior do PDF:
  - anterior;
  - campo de página, total e percentual;
  - notas;
  - brilho;
  - próxima.
- O campo aceita apenas `1..total`; valor inválido volta à página atual.
- Replicar altura compacta, safe areas, cores, animação de 200 ms e ocultação após 4 segundos.
- Com barras ocultas, manter título discreto no topo e página/total no canto inferior, como no EPUB.
- O tema afeta somente shell e fundo externo; as páginas preservam integralmente suas cores.

**Aceite:** PDF e EPUB usam a mesma linguagem visual; abrir/fechar barras ou modais não recarrega nenhum leitor nem altera a posição.

### Fase 5 — Modos, navegação e controles do aparelho

- Primeiro uso paginado horizontal; depois lembrar globalmente o último modo PDF.
- Alternar paginado/scroll preservando a página atual e chamando `setPage()` após a reconfiguração nativa.
- Paginado: swipe nativo e taps nas laterais para anterior/próxima.
- Scroll: rolagem vertical contínua; controles e volume saltam uma página por vez.
- Toque central alterna as barras em ambos os modos.
- Generalizar `subscribeToEpubVolumeKeys` para um subscriber comum, preservando o comportamento EPUB.
- Reutilizar `useOrientation` com preferência própria do PDF.
- Habilitar o painel de brilho e restaurar o brilho original ao sair.
- A configuração de exibição contém somente paginado/scroll e orientação; nenhuma opção de coluna.

**Aceite:** trocar modo ou orientação cinco vezes mantém a página; swipe, taps, campo, botões e volume funcionam sem conflito com scroll ou links.

### Fase 6 — Zoom completo

- Usar zoom nativo por pinça entre 50% e 200%.
- Manter estado visual imediato e persistir a escala após debounce, evitando escrita por frame.
- Implementar duplo toque próprio alternando 100%/150%; desabilitar o duplo toque interno da biblioteca.
- Arbitrar taps com uma janela curta para impedir que o primeiro tap do duplo toque navegue ou esconda barras.
- Criar painel com slider de 5%, presets 50/100/150/200 e reset para 100%.
- Após zoom ou rotação, conservar a página corrente e reancorá-la se o callback nativo relatar deslocamento.

**Aceite:** pinça, duplo toque, slider, presets e reset funcionam nos dois modos sem remontar o documento ou gravar progresso incorreto.

### Fase 7 — Notas PDF e prévia modal

- Renomear `useEpubNotes` para `useReaderNotes` e habilitá-lo para ambos os formatos.
- Criar notas com locator da página corrente; manter criação, edição, exclusão e lista existentes.
- Ao tocar na âncora, abrir uma prévia modal de página única e somente leitura.
- A prévia usa um `PdfPagePreview` isolado, sem persistência, volume, navegação ou alteração do progresso principal.
- Manter o leitor principal montado e na mesma posição atrás do modal.
- Limpar a instância e qualquer cache temporário imediatamente ao fechar a prévia.

**Aceite:** notas sobrevivem ao reinício; a prévia abre a página correta; abrir e fechar dez prévias não altera a página principal nem provoca crescimento contínuo de memória.

### Fase 8 — Hardening e conclusão

- Adicionar as novas chaves de PDF aos 10 idiomas.
- Criar `validate-pdf-reader.cjs` para prefs, clamps, locators, taps e invariantes de source estável.
- Expandir `validate-reader-persistence.cjs` com progresso, bookmark, nota e tombstone PDF.
- Executar:
  - `node scripts/validate-pdf-reader.cjs`;
  - `node scripts/validate-reader-persistence.cjs`;
  - `node scripts/validate-epub-runtime.cjs`;
  - `node scripts/validate-reading-preferences.cjs`;
  - `node node_modules/typescript/bin/tsc --noEmit`.
- Testar em Android real/emulador:
  - PDFs de 1, 5, 50 e 300 páginas;
  - path cru, `file://` e `content://`;
  - 30 navegações em cada modo;
  - zoom completo, links internos/externos e anotações embutidas;
  - restauração, bookmarks, notas e prévias;
  - rotação, brilho, volume e dois PDFs sequenciais;
  - EPUB após todas as mudanças compartilhadas.
- Atualizar `READER_PHASES.md`, `PLANNING.md` e `CHANGELOG.md`, registrando “F3 Android concluída; iOS pendente”.

## Interfaces principais

- `PdfReaderHandle`: `goToPage(page)`.
- `PdfReaderProps`: arquivo, página inicial, modo e escala controlados, callbacks de ready, página, escala, tap central e link externo.
- `PdfPagePreview`: arquivo e página, sempre read-only e `singlePage`.
- `PdfLocator` permanece `{ format: 'pdf', page, progressionInPage: null }`.
- Nenhuma dependência nova e nenhuma alteração de schema SQLite.

## Limites e condição de parada


- O aceite desta etapa é Android; iOS permanece fora do status de conclusão.
- Notas não incluem seleção, highlights ou overlays sobre o PDF.
- Não implementar coluna dupla, TOC, busca, tema de página, PDF.js ou viewer web.
- A F3 termina quando todos os validadores passam, o checklist Android fica verde e não há regressão nos invariantes do EPUB.
