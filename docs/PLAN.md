# Leitor PDF — modais funcionais por fases

## Resumo

Manter no PDF apenas:

- Paginação: Scroll/Paginado e Livre/Paisagem/Retrato.
- Brilho.
- Marcadores: adicionar, listar, acessar e excluir.
- Notas: criar, listar, visualizar, editar, excluir e abrir prévia da página.

Tipografia, sumário, margens e layout continuarão disponíveis no EPUB, mas serão ocultados no PDF. Não serão adicionadas dependências nem migrations.

## Fases de implementação

### Fase 1 — Interface e brilho

- No PDF, remover os botões de tipografia, sumário e layout.
- Manter título, fechar, paginação, brilho, notas e marcadores.
- Habilitar a inicialização do brilho também para PDF.
- Alterar o brilho do dispositivo durante o ajuste e restaurar o valor original ao fechar o leitor.
- Manter o EPUB inalterado.

Critério de conclusão: o PDF mostra somente os controles definidos e o brilho funciona sem afetar permanentemente o aparelho.

### Fase 2 — Paginação e orientação

- Adicionar ao `PaginationSettingsModal` uma opção para ocultar coluna simples/dupla no PDF, mantendo-as no EPUB.
- Tornar funcionais no PDF:
  - Scroll/Paginado.
  - Livre/Paisagem/Retrato.
  - Restaurar padrões para Paginado + Retrato.
- Carregar e persistir modo e orientação usando as preferências de PDF existentes.
- Preservar a página atual ao trocar modo ou orientação.
- Preservar os comportamentos já ajustados: uma página isolada no paginado, sem toques laterais no scroll e volume como rolagem no scroll.

Critério de conclusão: configurações persistem após fechar/reabrir e nenhuma opção de coluna aparece no PDF.

### Fase 3 — Marcadores de PDF

- Criar um locator `{ format: 'pdf', page, progressionInPage: null }` usando a página corrente.
- Reutilizar o banco existente para carregar, adicionar e excluir marcadores separados por livro e formato.
- Conectar o botão de adicionar marcador à página atual.
- Exibir na lista página, data e eventual rótulo.
- Ao tocar no marcador, fechar o modal e navegar pelo `PdfReader` até a página salva.
- Permitir marcadores repetidos, mantendo o comportamento atual do EPUB.

Critério de conclusão: marcadores sobrevivem ao reinício do leitor e navegam para a página correta nos dois modos.

### Fase 4 — Notas e prévia da página

- Ativar o armazenamento existente de notas para `book.id + pdf`.
- Ao criar uma nota, vinculá-la à página atual.
- Manter lista, detalhes, edição, exclusão e confirmação de exclusão.
- Corrigir os indicadores de página no editor e na lista para usarem a página corrente do PDF.
- Ao tocar na âncora, abrir uma prévia paginada contendo somente a página vinculada.
- Manter o leitor principal montado e na posição atual enquanto a prévia estiver aberta.
- Adicionar `interactionEnabled?: boolean` ao `PdfReader`, com padrão `true`; na prévia será `false`, bloqueando toques laterais, volume, links e navegação acidental.
- Suspender a interação do leitor principal enquanto um modal de PDF estiver aberto.

Critério de conclusão: todas as operações de nota persistem e a prévia mostra a página salva sem alterar a leitura principal.

## Contratos internos

- `PaginationSettingsModal`: novo `showColumnOptions?: boolean`, padrão `true`.
- `PdfReaderProps`: novo `interactionEnabled?: boolean`, padrão `true`.
- Reutilizar `PdfLocator`, tabelas de marcadores/notas e preferências já existentes.
- Nenhuma alteração de banco, dependência ou código nativo.

## Validação

Em cada fase:

- Atualizar `CHANGELOG.md` e criar um commit convencional separado.
- Executar:
  - `node scripts/validate-pdf-reader.cjs`
  - `node scripts/validate-epub-runtime.cjs`
  - `node scripts/validate-reading-preferences.cjs`
  - `node scripts/validate-reader-persistence.cjs`
  - `node node_modules/typescript/bin/tsc --noEmit`
- Ampliar os validadores para cobrir locators, marcadores e notas PDF, orientação persistida, controles ocultos e modo de prévia.
- Testar manualmente no Android persistência, navegação, brilho, orientação e fechamento dos modais.
- Revalidar o EPUB avançando pelo menos 10 páginas e selecionando texto nos modos paginado e scroll, garantindo que o leitor não seja remontado.

## Premissas

- A remoção vale somente para os controles do PDF; o EPUB permanece completo.
- Navegação, progresso, links, gestos e volume continuam como funções básicas do PDF.
- A lista de marcadores mantém a ação de excluir já existente.
- Este conjunto não introduz nova necessidade de rebuild nativo; eventuais alterações nativas anteriores continuam exigindo o rebuild correspondente.
