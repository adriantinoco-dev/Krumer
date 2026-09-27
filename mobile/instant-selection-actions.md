# Seleção e ações instantâneas no EPUB mobile

## Referência observada no Readest

O repositório local está em `C:\Projects\readest` (nome **readest**). O leitor usa
foliate-js em Next.js/Tauri, enquanto o Krumer Mobile usa epub.js 0.3.93 dentro de
uma WebView React Native. A licença raiz do Readest é AGPLv3. Esta proposta
reimplementa o comportamento no código do Krumer, sem copiar a implementação.

| Fluxo | Readest | Referência |
|---|---|---|
| Escolha da ação | O leitor permite escolher uma ação rápida, incluindo Copiar ou Destacar. | `apps/readest-app/src/app/reader/components/annotator/AnnotationTools.tsx:39-59`, `components/HeaderBar.tsx:256-288` |
| Copiar | Após a seleção, a ação rápida escreve `selection.text` no clipboard e dispensa a seleção; no Android espera `touchend`. | `components/annotator/Annotator.tsx:976-1042`, `:1204-1213` |
| Destacar | Um toque parado por 300 ms engaja o marcador. O arraste produz uma prévia; ao soltar, o Range vira CFI e a anotação é salva. | `hooks/useTextSelector.ts:40-49`, `hooks/useInstantAnnotation.ts:238-310`, `:370-460` |
| Captura | A seleção nativa fornece um `Range`, texto e CFI da seção visível. O marcador instantâneo também sabe obter caret e Range a partir de coordenadas. | `hooks/useTextSelector.ts:380-419`, `hooks/useInstantAnnotation.ts:75-85`, `:129-180` |
| Persistência | `BookNote` contém CFI, texto, estilo, cor e datas; entra em `booknotes` dentro do `config.json` do livro. | `hooks/useInstantAnnotation.ts:183-232`, `src/types/book.ts:178-203`, `src/services/bookService.ts:992-1009` |
| Caixa de ações | No Readest a ação rápida substitui a toolbar. Ela não permanece visível em todos os modos. | `components/annotator/Annotator.tsx:1045-1106`, `:2147-2172` |

O Readest depende de foliate-js para converter o `Range` em CFI e usa o
clipboard do Tauri, com fallback do navegador (`apps/readest-app/src/utils/clipboard.ts:18-61`).
O Krumer Mobile usa `Contents.cfiFromRange` do epub.js, `expo-clipboard` e
`expo-sqlite`; as APIs e o formato de armazenamento não são intercambiáveis.

Trecho guia da reimplementação, em pseudocódigo próprio (não transcrito do Readest):

```text
após soltar a seleção:
  range = selection.getRangeAt(0)
  texto = selection.toString()
  cfi = contents.cfiFromRange(range)
  bridge.envia({ texto, cfi, gesto })

ação copiar: clipboard.setStringAsync(texto)
ação destacar: SQLite.salva({ livro, cfi, texto }); epubJs.anota(cfi)
```

No Krumer, esses passos estão em `src/readers/epubRuntime.ts`,
`src/readers/EpubReader.tsx` e `src/storage/readerDatabase.ts`.

## Adaptação ao Krumer Mobile

- Manter a seleção nativa, alças e menu do Android. A WebView continua montada,
  com `source` estável e sem repaginar por causa da seleção.
- Adicionar uma caixa de ações do Krumer com **Copiar** e **Destacar** sempre que
  houver texto selecionado, tanto na apresentação quanto nos capítulos. Ela
  aparece após a seleção se estabilizar e permanece enquanto a seleção existir.
- Oferecer a preferência **Ação instantânea**: Desativada, Copiar ou Destacar.
  Só uma ação é automática por vez, como no Readest. Os dois botões da caixa
  continuam disponíveis independentemente do modo escolhido.
- Disparar a ação automática após `touchend`/fim da seleção, uma vez por gesto.
  Não copiar nem salvar durante o arraste das alças. Manter a caixa acessível
  após a ação; um toque fora dispensa a seleção e a caixa.
- Obter o texto do `Selection/Range` do XHTML visível e o CFI com
  `Contents.cfiFromRange(range)` do epub.js. Respeitar os limites de página já
  existentes; não usar texto de uma página vizinha.
- Copiar pelo clipboard nativo de Expo, recebendo o texto pelo bridge. O
  clipboard não depende da posição CFI.
- Salvar highlights no SQLite local mobile, vinculados ao `bookId`, com CFI
  range, excerto, cor e datas. Reaplicar as anotações do epub.js ao abrir o
  livro e ao renderizar páginas. Não usar o backend desktop nem sua tabela.
- Sem adicionar ações automáticas ao leitor PDF nesta entrega: o mecanismo de
  seleção e ancoragem do PDF é distinto.

## Critérios de aceite

1. Selecionar uma palavra ou trecho em apresentação/capítulo exibe a caixa com
   Copiar e Destacar; arrastar alças não faz a caixa piscar ou mudar de página.
2. Copiar manual ou automaticamente grava exatamente o texto visível no
   clipboard, sem abrir outro menu ou exigir segunda ação no modo automático.
3. Destacar manual ou automaticamente salva pelo CFI da seleção estabilizada;
   selecionar o mesmo intervalo não duplica o registro e o destaque reaparece
   depois de fechar e abrir o EPUB. Ajustar as alças depois de um destaque
   automático já salvo pode criar outro intervalo, que é preservado.
4. Toque fora, navegação ou fechamento limpa a caixa e a seleção anterior.
5. Modos paginado e scroll continuam funcionais. A seleção não remonta a WebView,
   não altera o locator e não aciona `rendition.resize()`.

## Prova requerida antes de concluir

- Validadores EPUB, preferências, persistência e TypeScript descritos no
  `AGENTS.md` da raiz.
- No Android: avançar dez páginas, selecionar palavra e trecho longo na
  apresentação e no capítulo, nos modos paginado e scroll; conferir caixa,
  clipboard, highlight após reabrir e ausência de oscilação visual.
