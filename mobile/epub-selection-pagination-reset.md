# Diagnóstico — seleção de texto reseta a paginação do EPUB

> **Nota de manutenção (03/09/2026):** o PDF passou a usar exclusivamente
> PDF.js/foliate-js em WebView. As referências abaixo ao leitor PDF nativo são
> evidências do baseline anterior e não descrevem mais o runtime atual.

**Data:** 2026-08-30  
**Status:** contenção paginada reforçada e validada automaticamente; novo reteste Android pendente  
**Escopo:** leitor EPUB mobile (Android, React Native/Expo, `react-native-webview` + epub.js)

## Extensão — seleção restrita à página visível

**Problema observado após a estabilização:** no modo paginado, ao ampliar uma seleção até o
limite da página, as alças nativas continuam incluindo palavras de colunas anteriores ou
posteriores que não estão visíveis.

**Causa:** o epub.js pagina um documento XHTML contínuo com colunas CSS. A página é apenas a
janela visível sobre esse documento; o `Selection/Range` nativo do Android continua enxergando
todo o DOM e pode atravessar as colunas ocultas. Ao arrastar a alça para fora da página, o
Android também auto-rola horizontalmente um contêiner do manager para acompanhar a seleção.
Esse deslocamento não fica alinhado à largura da página e deixa o viewport entre duas colunas,
exibindo metade de cada página e o vão no centro.

**Correção implementada:** durante `selectionchange` e somente no modo paginado, obter
`rendition.currentLocation().start/end.cfi`, convertê-los para ranges DOM pelo `Contents` ativo
e limitar o início/fim da seleção ao intervalo visível. Como o epub.js 0.3.93 só publica a
seleção estabilizada após 250 ms, a contenção é reaplicada em `rendition.on('selected')` para
não ser sobrescrita pelo `ActionMode` nativo. A posição dos contêineres roláveis é capturada no
primeiro toque da seleção e preservada enquanto as alças estiverem ativas. A restauração cobre
o container do manager, os scrollers do XHTML e as janelas interna/externa. Como fallback
independente do snapshot, `moveToLocatorInPlace()` realinha o manager ao locator de leitura em
cada atualização e ao limpar a seleção. Isso impede o viewport intermediário entre colunas.
A direção das alças e o menu nativo são preservados. Em modo scroll, tanto a contenção quanto
a restauração horizontal permanecem desativadas.

Como o `ActionMode` pode auto-rolar depois do callback DOM, o realinhamento permanece ativo por
uma janela curta de quatro verificações (0, 32, 120 e 320 ms). As correções usam o scroll
silencioso do manager e não publicam relocation de usuário nem gravam progresso.

**Regressões obrigatórias:** seleção dentro da página não deve ser alterada; seleção que
ultrapassa o início ou o fim deve ser truncada no CFI visível; seleção em scroll deve continuar
livre; todos os testes de estabilidade da WebView, paginação, persistência e contexto devem
continuar passando.

O validador cobre ranges dentro da página, ranges que atravessam os dois limites, seleção em
direção reversa, reescrita tardia do range nativo, restauração do scroll paginado e ausência de
contenção no modo scroll. Também cobre a recuperação pelo locator quando o snapshot não existe.
A implementação não altera `AppContext`, persistência, source da WebView nem o fluxo de resize;
`EpubReader` apenas registra a telemetria limitada do clamp em desenvolvimento.

## Resumo executivo

O primeiro diagnóstico encontrou um risco real no runtime: seleção nativa podia produzir um
`window.resize`, executar `rendition.resize()` e deslocar a location do epub.js. A proteção de
seleção/resize eliminou esse caminho, mas o erro persistiu no aparelho e passou a ocorrer
também na troca normal de página.

Os logs do reteste mostraram repetidamente a sequência `progresso persistido` ->
`in-memory EPUB metrics` -> `runtime HTML carregado`. Essa sequência prova que o arquivo era
preparado novamente e a WebView era desmontada/montada após uma gravação de progresso.

A causa raiz dominante está no ciclo entre `AppContext` e `EpubReader`:

1. Uma relocation de usuário é persistida por `useEpubPersistence`.
2. `syncDurableEpubProgress()` chama `updateBookProgress()`.
3. `updateBookProgress()` atualiza `books`, reconstruindo o valor do `AppContext`.
4. O contexto criava `t: (key) => translate(...)` inline, portanto uma nova função `t` a cada
   atualização de `books`, mesmo sem troca de idioma.
5. `EpubReader` usa `t` direta ou indiretamente nas dependências dos efeitos de preparação,
   abertura, timeout e cleanup. A nova identidade invalidava esses efeitos: o livro era
   fechado, `prepared` voltava a `null`, `prepareEpubFile()` rodava novamente e a WebView era
   recriada.
6. A nova rendition abria com o locator inicial da sessão, não com a página recém-alcançada,
   produzindo o retorno visível — frequentemente para a página 1.

O bug de resize continua corrigido como proteção específica da seleção. A correção adicional
estabiliza `t` com `useCallback`, fazendo sua identidade mudar somente quando o idioma muda.

## Componentes e fluxo completo

### 1. Montagem do leitor

1. `mobile/src/screens/ReaderScreen.tsx` monta `EpubReader` quando o progresso e as
   preferências já foram hidratados.
2. `mobile/src/readers/EpubReader.tsx` mantém o objeto `source` da WebView estável com
   `useMemo(..., [])` e não passa uma `key` variável ao leitor principal.
3. A WebView carrega `EPUB_RUNTIME_HTML`, definido em
   `mobile/src/readers/epubRuntime.ts`.
4. O runtime abre o arquivo e cria uma rendition do epub.js 0.3.93:
   - paginado: `flow: 'paginated'`, `manager: 'default'`;
   - scroll: `flow: 'scrolled-doc'`, `manager: 'continuous'`.
5. Cada seção EPUB é renderizada pelo epub.js em um documento/iframe próprio. No evento
   `rendition.on('rendered')`, `bindReaderDocument()` conecta os listeners de toque ao
   documento XHTML.
6. Uma mudança de página emite `RELOCATE`; `useEpubPersistence` salva o locator e
   `ReaderScreen.syncDurableEpubProgress()` replica o progresso para a biblioteca no
   `AppContext`.

### 2. Seleção de palavra

1. O usuário faz long-press sobre o texto do XHTML.
2. Blink/Android WebView cria a seleção DOM e abre o menu nativo de seleção
   (copiar, compartilhar, pesquisar/dicionário ou itens equivalentes).
3. O evento relevante ocorre dentro do documento da rendition, não em um componente
   `<Text>` do React Native. Não existe `onSelectionChange` no `ReaderScreen` nem state React
   com o texto selecionado.
4. Os listeners de `touchstart`, `touchend` e `click` de `bindReaderDocument()` também recebem
   a sequência do gesto. O caminho normal já rejeitava long-press por duração, mas não
   mantinha um estado explícito de seleção nem isolava completamente o clique sintético
   posterior ao gesto.

### 3. Caminho primário confirmado pelos logs do aparelho

1. A troca de página emite relocation de usuário e agenda a persistência.
2. A persistência atualiza o registro durável e chama `updateBookProgress()`.
3. A mudança em `books` reconstrói o objeto do `AppContext` e, antes da correção, criava uma
   nova função `t` inline.
4. A troca de identidade de `t` disparava cleanup e reexecução dos efeitos do `EpubReader`.
5. `setPrepared(null)` removia a WebView da árvore; em seguida `prepareEpubFile()` recalculava
   as métricas e a nova WebView disparava `onLoad`.
6. O livro reabria na posição inicial da sessão. O próximo progresso repetia o ciclo, tornando
   difícil avançar mais de uma página.

Evidência observada: cada bloco de `progresso persistido` é seguido por novas mensagens
`in-memory EPUB metrics` e `runtime HTML carregado`. Esses dois logs só são emitidos na
preparação do arquivo e no carregamento da WebView, respectivamente.

### 4. Caminho secundário específico da seleção

1. A UI nativa/viewport da WebView produz um `window.resize` durante a interação de seleção.
2. O handler anterior de `window.resize` sempre enfileirava
   `applyViewportLayout(anchor, 'reflow')`, sem distinguir:
   - resize de largura/orientação, que exige repaginação;
   - resize somente de altura ou transitório, que não deve mover uma rendition paginada;
   - resize ocorrido enquanto há seleção ativa.
3. `applyViewportLayout()` chama `rendition.spread(...)` e
   `rendition.resize(readerViewportWidth(), window.innerHeight)`.
4. Após o resize, o runtime lê `rendition.currentLocation()` e tenta recuperar o CFI anterior
   com `moveToLocatorInPlace()` quando detecta drift.
5. Se essa recuperação in-place não consegue localizar a view/section ativa, não havia uma
   segunda tentativa com `displayLocator(anchor)`.
6. O locator observado depois do reflow era aceito como estável, enviado em
   `POSITION_STABILIZED`/`VIEW_STATUS` e refletido em `ReaderScreen.currentPage`. Se o manager
   voltou ao início, a UI passa a mostrar página 1 e a posição errada pode ser persistida.

## Avaliação das hipóteses solicitadas

| Hipótese | Resultado | Evidência |
|---|---|---|
| Re-render/remount ao mudar estado de seleção | **Remount confirmado, mas não causado pelo state de seleção** | A persistência de uma relocation atualizava `books`; a função `t` inline mudava de identidade e invalidava os efeitos do leitor. Os logs mostram preparação e carregamento repetidos da WebView. |
| `useEffect` recalcula paginação ao selecionar | **Confirmada indiretamente** | Não existe dependência de seleção, porém os efeitos dependiam de callbacks derivados de `t`. A atualização do contexto executava cleanup/preparação/abertura novamente. |
| Perda de `currentPage`/`currentLocation` | **Confirmada como consequência** | Na causa primária, a rendition era recriada com o locator inicial. No caminho de resize, `rendition.resize()` também podia deslocar a location visual. |
| Conflito entre state de paginação e seleção | **Descartado como fonte direta** | O conflito real era entre a persistência de progresso e o ciclo de vida do contexto/leitor. A seleção apenas expunha também o caminho secundário de resize. |

## Causa raiz

**Causa primária confirmada em aparelho:** `mobile/src/context/AppContext.tsx` criava a função
`t` inline dentro do valor memoizado do contexto. Toda atualização de `books` — inclusive a
gravação normal de progresso — criava uma nova identidade. Em
`mobile/src/readers/EpubReader.tsx`, essa identidade participa das dependências que preparam,
abrem e encerram o runtime. O resultado era uma recriação completa da WebView após avançar.

**Causa secundária específica da seleção:** `mobile/src/readers/epubRuntime.ts`, no listener
global de `window.resize` e em `applyViewportLayout()`, permitia reflow do epub.js durante
seleção nativa de texto.

**Falha de recuperação:** a restauração do anchor/CFI depois do resize dependia apenas de
`moveToLocatorInPlace()`. Quando a view necessária não estava disponível, o runtime mantinha
a location deslocada em vez de redisplayar o CFI salvo.

**Fator de gesto secundário:** o runtime não marcava explicitamente o intervalo entre
`selectionchange`, o fim do long-press/drag e o `click` sintético. Isso deixava a seleção
competir com a navegação por toque, embora o caminho de resize explique o reset para a página
1 e seja a causa principal.

Nível de confiança da causa primária: **alto**. A sequência de logs corresponde diretamente
às chamadas de `prepareEpubFile()` e `WebView.onLoad`, e o grafo de dependências explica por
que ambas ocorrem imediatamente após `updateBookProgress()`.

## Alcance por modo de leitura

| Modo | Conclusão | Motivo |
|---|---|---|
| Paginado | **Afetado e cenário observado** | A persistência de progresso recriava a WebView em qualquer modo; adicionalmente, resize de seleção pode recalcular colunas/spread. |
| Scroll | **Afetado pela causa primária; cobertura automática do resize** | A recriação do `EpubReader` é comum aos dois modos. O teste de runtime também garante resize diferido e locator preservado no manager contínuo. |
| PDF | **Fora do escopo/não afetado por este mecanismo** | Usa PDF.js/foliate-js em uma WebView separada do runtime EPUB. |

Não há ADB/emulador disponível neste ambiente para fechar a matriz manual por modo. Portanto,
os modos paginado e scroll têm cobertura automatizada; ambos devem permanecer na matriz de
validação Android antes de considerar a correção concluída em dispositivo real.

## Relação com as bibliotecas

- O mobile usa `react-native-webview` 13.16.1 e uma cópia vendorizada do epub.js 0.3.93.
- O epub.js expõe eventos distintos de seleção, resize e relocation e renderiza o conteúdo em
  documentos internos. Ele não oferece garantia de que um `rendition.resize()` arbitrário
  preserve sozinho o CFI visual.
- Há uma classe conhecida de problemas de resize/location no epub.js: a documentação e os
  exemplos usam `resized`/`relocated`; relatos da comunidade registram perda ou drift da
  location após resize e recomendam guardar o CFI e restaurá-lo após o evento.
- Também existem relatos upstream de inconsistências de `currentLocation()` após mudanças de
  layout e de problemas de rendition após alterar o tamanho da janela. Não foi encontrado um
  issue upstream que corresponda exatamente a “selecionar uma palavra volta à página 1”.
- O `react-native-webview` fornece o menu de seleção nativo e callbacks para itens customizados,
  mas não administra a posição interna de uma rendition do epub.js.
- A documentação atual do Android WebView alerta que mudanças de UI/insets podem gerar mais
  eventos de viewport resize e que código web não deve executar ações destrutivas em todo
  resize. Isso reforça a necessidade de classificar o evento no runtime, em vez de assumir que
  todo resize significa rotação ou mudança de largura.

Referências:

- [epub.js — eventos de resize, relocation e seleção](https://github.com/futurepress/epub.js)
- [epub.js issue #982 — inconsistência de currentLocation após reflow](https://github.com/futurepress/epub.js/issues/982)
- [epub.js tips — restauração da location após resize](https://github.com/johnfactotum/epubjs-tips#fix-current-location-lost-after-resizing)
- [Android WebView — window insets e resize do viewport](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)
- [React Native WebView — menu de seleção customizável](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#menuitems)

## Abordagem de correção implementada

A correção foi dividida nos dois limites que possuem cada comportamento incorreto. Não é
necessário elevar o texto selecionado a state React nem recriar deliberadamente a WebView.

1. **Estabilizar a tradução no contexto.**
   - Criar `t` com `useCallback(..., [language])` fora do objeto do provider.
   - Reutilizar essa referência em `value`, permitindo que atualizações de `books` renderizem
     os consumidores sem invalidar efeitos dependentes de tradução.
   - Manter a troca de idioma funcional: somente `language` altera a identidade de `t`.

2. **Rastrear seleção no documento EPUB.**
   - Ouvir `selectionchange` em cada documento conectado por `bindReaderDocument()`.
   - Considerar ativa apenas uma seleção com range não colapsado e texto não vazio.
   - Consultar todas as contents da rendition, pois mais de uma view pode estar montada.

3. **Arbitrar o gesto antes da navegação.**
   - Registrar se já havia seleção no `touchstart`.
   - Tratar long-press/drag que cria ou ajusta seleção como gesto de seleção.
   - Consumir o `touchend` e o `click` sintético subsequente sem chamar `next()`, `prev()` ou
     `CENTER_TAP` e sem remover imediatamente a seleção recém-criada.

4. **Bloquear reflow enquanto a seleção estiver ativa.**
   - Aplicar a guarda tanto no listener de `window.resize` quanto em
     `applyViewportLayout()` para evitar entradas indiretas.
   - Guardar no máximo um resize pendente e o anchor vigente.

5. **Classificar o resize pendente ao encerrar a seleção.**
   - Em modo paginado, descartar resize somente de altura quando a largura útil não mudou.
   - Para rotação/mudança real de largura, aplicar uma única atualização após a seleção acabar.
   - Em modo scroll, permitir o resize real após o fim da seleção, preservando o anchor.

6. **Fortalecer a recuperação do locator.**
   - Tentar `moveToLocatorInPlace()` primeiro para evitar remontagem/flicker.
   - Se falhar, usar `displayLocator(anchor)` como fallback explícito.
   - Só publicar `POSITION_STABILIZED`/`VIEW_STATUS` depois de confirmar o anchor recuperado.

7. **Não desabilitar seleção nativa.**
   - Não aplicar `user-select: none` nem suprimir o menu Android.
   - Não alterar o bridge público salvo se telemetria temporária de diagnóstico for aprovada.

## Arquivos afetados pela implementação proposta

- `mobile/src/readers/epubRuntime.ts` — seleção DOM, arbitragem de gestos, classificação de
  resize e fallback de restauração do CFI.
- `mobile/scripts/validate-epub-runtime.cjs` — regressões determinísticas de gesto, resize e
  preservação do locator.
- `mobile/src/context/AppContext.tsx` — referência estável de `t` entre gravações de progresso.
- `mobile/scripts/validate-reading-preferences.cjs` — contrato de regressão para impedir que
  `t` volte a ser criado inline no valor do contexto.

Arquivos revisados que **não** precisam de mudança para esta causa raiz:

- `mobile/src/readers/EpubReader.tsx` — não exigiu alteração na segunda correção; seus efeitos
  deixam de ser invalidados pela função instável do contexto.
- `mobile/src/screens/ReaderScreen.tsx` — apenas reflete os eventos do runtime.
- `mobile/src/readers/useEpubPersistence.ts` — deve continuar ignorando relocation de reflow
  como progresso de usuário e persistindo relocations reais.

## Cobertura e critérios de aceitação

### Automatizada

- A função `t` do `AppContext` permanece estável quando `books`/progresso mudam e só é
  recriada na troca de idioma.
- Long-press/drag com seleção não chama `next()` nem `prev()`.
- O `click` sintético após selecionar não limpa a seleção nem muda a página.
- `window.resize` durante seleção não chama `rendition.resize()` imediatamente.
- Ao encerrar a seleção:
  - resize real de largura é aplicado uma vez;
  - resize somente de altura é descartado no modo paginado;
  - o CFI anterior permanece sendo a location atual.
- Se a recuperação in-place falhar, o fallback por `displayLocator(anchor)` mantém o CFI.
- Rotação e alteração real de tipografia continuam repaginando e preservando o anchor.

### Manual em Android

Executar em pelo menos um device/emulador com WebView atual:

1. Abrir EPUB no meio do livro, selecionar uma palavra e abrir cada ação disponível no menu.
2. Ajustar as duas alças da seleção, inclusive perto das zonas laterais de troca de página.
3. Repetir em paginado simples, paginado de coluna dupla em landscape e scroll.
4. Confirmar que página/scroll e indicador de progresso não mudam.
5. Com seleção ativa, rotacionar o aparelho; ao encerrar a seleção, confirmar repaginação única
   na mesma passagem/CFI.
6. Fechar e reabrir o livro para confirmar que nenhum reset indevido foi persistido.
7. Durante pelo menos dez trocas de página, confirmar no console que
   `runtime HTML carregado` aparece somente na abertura do leitor, não após cada
   `progresso persistido`.

## Estado da implementação

Na data do diagnóstico já existia um patch local não commitado em `epubRuntime.ts` e
`validate-epub-runtime.cjs`. Após aprovação, esse patch foi revisado e consolidado. Além das
guardas de seleção e resize, a implementação final:

- zera o estado global de seleção ao fechar/trocar de livro ou recriar a rendition;
- cobre o fallback por `displayLocator(anchor)` quando a recuperação in-place não encontra a
  view ativa;
- cobre seleção + resize também no modo scroll, preservando o locator.

O validador atual foi executado diretamente com:

```text
node scripts/validate-epub-runtime.cjs
```

Resultado: passou, incluindo os cenários de seleção ativa, resize diferido nos modos paginado e
scroll, descarte de resize somente de altura no paginado, fallback explícito por CFI e
preservação do locator. Também passaram `tsc --noEmit`, a validação de preferências de leitura
e a validação de persistência do leitor. O comando via `npm` não pôde ser usado porque a
instalação global local aponta para um `npm-cli.js` ausente; os scripts foram executados
diretamente com Node.

Após o primeiro reteste Android, os logs revelaram a recriação do leitor após cada persistência.
Foi então adicionada a segunda correção em `AppContext.tsx`: `t` agora é um `useCallback`
dependente apenas do idioma. A validação de preferências passou a falhar caso a tradução volte
a ser criada inline. `node scripts/validate-reading-preferences.cjs` e
`node node_modules/typescript/bin/tsc --noEmit` passaram após essa alteração. Falta repetir a
matriz manual Android para confirmar que há um único carregamento do runtime por sessão.
