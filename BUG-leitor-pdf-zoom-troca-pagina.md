# Bug: Zoom in/out no leitor de PDF troca de página sozinho

**Status:** Corrigido — veja seção [Implementação](#implementa%C3%A7%C3%A3o)

---

## Resumo

No leitor de PDF, ao dar **zoom in / zoom out** (slider, presets 50–200% ou atalhos
`Ctrl+`/`Ctrl-`/`Ctrl+0`), o indicador de página fica **mudando sozinho** durante o
ajuste — o número no campo de página salta, o progresso é gravado com a página errada
e a leitura parece "pular" entre páginas mesmo sem o usuário rolar ou virar página.

O comportamento afeta principalmente o **modo vertical** (rolagem contínua), que é o
modo onde a página "atual" é determinada dinamicamente pelo `IntersectionObserver`.

## Comportamento esperado

- Ao aplicar zoom, o usuário deve permanecer **na mesma página** e, idealmente, na
  **mesma posição relativa** dentro dela (topo da página, meio, etc.).
- O campo de página e o progresso salvo (`Progress`) **não devem ser alterados** em
  decorrência apenas de uma mudança de escala.
- A troca de página deve ocorrer somente por ação explícita do usuário (botões prev/next,
  input de página, setas do teclado) ou por **rolagem real** no modo vertical.

## Sintoma observado

1. Abrir um PDF no modo **vertical** (rolagem contínua).
2. Arrastar o slider de zoom (ou clicar em um preset, ou usar `Ctrl+`/`Ctrl-`).
3. Durante/imediatamente após o ajuste, o número no campo de página
   (`#pdf-page-input`) muda para outra página.
4. Se a mudança for suficiente, o progresso é salvo com `current_page` errado e a
   próxima abertura do livro retoma em uma página diferente da que o usuário estava.

## Causa raiz

A página "atual" no modo vertical não é controlada pela rolagem do usuário
diretamente, e sim pelo `IntersectionObserver` em
`frontend/js/reader-pdf.js` (`initVirtualScrollObserver`, linhas 171–211), que
recalcula a página mais visível a cada mudança de layout:

```js
virtualObserver = new IntersectionObserver((entries) => {
  let mostVisiblePage = pdfCurrentPage;
  let highestRatio = 0;

  entries.forEach(entry => {
    const pageNum = Number(entry.target.dataset.page);

    if (entry.isIntersecting) {
      renderizarPaginaPdf(pageNum);

      if (entry.intersectionRatio > highestRatio) {
        highestRatio = entry.intersectionRatio;
        mostVisiblePage = pageNum;
      }
    }
  });

  if (pdfMode === 'vertical' && highestRatio > 0.3 && mostVisiblePage !== pdfCurrentPage) {
    pdfCurrentPage = mostVisiblePage;      // <-- sobrescreve a página atual
    updatePdfControlsState();              // <-- atualiza o campo de página
    savePdfProgress();                     // <-- grava progresso com a página errada
  }
}, options);
```

O `IntersectionObserver` **não distingue** entre:
- uma rolagem real do usuário (legítima para recalcular a página); e
- uma **mudança de layout programática** (resize dos placeholders durante o zoom).

### Sequência que dispara o bug

1. O usuário aplica zoom → `aplicarZoomPdf(novaEscala, ...)`
   (`frontend/js/reader-pdf.js`, linhas 613–652).
2. A função chama `atualizarDimensoesPlaceholders()`
   (`frontend/js/reader-pdf.js`, linhas 150–166), que redimensiona **todas** as
   `.pdf-canvas-wrap` (altera `width` e `minHeight` de cada uma):
   ```js
   wrap.style.width = `${calcW}px`;
   wrap.style.minHeight = `${calcH}px`;
   ```
3. O redimensionamento muda a altura/largura de todas as páginas empilhadas no
   contêiner vertical (`#reader-container.vertical`, `flex-direction: column`). Com
   `scrollTop` fixo, o conteúdo sob a viewport **desloca fisicamente** (páginas acima
   da atual também crescem, alterando o `offsetTop` de cada página em relação ao topo
   do scroll).
4. Essa mutação de layout dispara os callbacks do `IntersectionObserver` (thresholds
   `[0.1, 0.5]`). As razões de interseção recalculadas apontam para uma página
   diferente da atual → `mostVisiblePage !== pdfCurrentPage` → o observer **sobrescreve
   `pdfCurrentPage`** (linha 203).
5. `updatePdfControlsState()` (linhas 560–571) atualiza o campo de página e os botões
   prev/next; `savePdfProgress()` (linhas 596–611) grava o progresso com a página
   errada.
6. O re-render agendado pelo zoom (`renderizarPaginaPdf(pdfCurrentPage)` — debounce de
   150 ms na linha 648–650, ou imediato via `renderNow`, linha 645) passa a renderizar
   a **nova** `pdfCurrentPage`, que pode não ser a página em foco — reforçando o
   "pulo" visual quando a diferença é de 1+ páginas.

### Fatores agravantes

- **`scroll-behavior: smooth`** em `#reader-container`
  (`frontend/styles/reader.css`, linha 403) combinado com
  `wrap.scrollIntoView({ behavior: 'smooth' })` em `irParaPaginaPdf`
  (`frontend/js/reader-pdf.js`, linha 238): qualquer rolagem induzida pela mudança de
  layout é animada, dando a sensação de o leitor estar "saltando" entre páginas.
- **Scroll anchoring do Chromium** (`overflow-anchor` padrão em contêiner de scroll):
  o navegador pode ajustar `scrollTop` para manter ancorado o elemento visível quando
  as alturas mudam, deslocando de fato a página em foco.
- O observer não guarda qual página era a "atual" antes do resize; ele apenas reavalia
  o estado pós-resize, sem histórico de que a mudança veio de um zoom.

## Passos para reproduzir

1. Abrir qualquer PDF com 2+ páginas.
2. Trocar para o modo **vertical** (rolagem contínua) via botão de modo.
3. Posicionar-se em uma página do meio do documento.
4. Arrastar o slider de zoom (ou aplicar um preset 50% → 200%, ou usar `Ctrl+`/`Ctrl-`).
5. Observar que o número no campo de página muda sozinho durante o ajuste e o progresso
   é gravado com essa página.

> No modo **horizontal** o sintoma não ocorre: apenas a página `.current-page` é
> exibida (`frontend/styles/reader.css`, linhas 407–417) e não há `IntersectionObserver`
> ativo, então o resize centralizado não altera a página atual.

## Correções sugeridas

### Correção principal — impedir o observer de trocar de página durante o zoom

1. Adicionar um flag de estado, ex.: `let pdfZooming = false`.
2. Em `aplicarZoomPdf`, setar `pdfZooming = true` antes de
   `atualizarDimensoesPlaceholders()` e limpar o flag quando o resize "assentar"
   (ex.: no mesmo debounce de 150 ms já existente, ou em um `requestAnimationFrame`
   após o último evento de zoom).
3. No callback do `IntersectionObserver`, condicionar o bloco que sobrescreve
   `pdfCurrentPage`/`updatePdfControlsState()`/`savePdfProgress()` a
   `!pdfZooming`:
   ```js
   if (pdfMode === 'vertical' && !pdfZooming && highestRatio > 0.3 && mostVisiblePage !== pdfCurrentPage) {
     pdfCurrentPage = mostVisiblePage;
     updatePdfControlsState();
     savePdfProgress();
   }
   ```
   Durante o zoom o observer continua **renderizando** as páginas em foco, mas nunca
   altera a página/progresso.

### Correção complementar — ancorar a posição de leitura no zoom

4. Em `aplicarZoomPdf`, antes de redimensionar, capturar a posição relativa da página
   atual:
   ```js
   const wrapAtual = document.querySelector(`#reader-container .pdf-canvas-wrap[data-page="${pdfCurrentPage}"]`);
   const offsetAntes = wrapAtual ? (viewer.scrollTop - wrapAtual.offsetTop) : null;
   ```
   Após `atualizarDimensoesPlaceholders()`, restaurar a posição:
   ```js
   if (offsetAntes !== null && wrapAtual) {
     viewer.scrollTop = wrapAtual.offsetTop + offsetAntes;
   }
   ```
   Isso mantém o usuário na mesma página e na mesma posição relativa, eliminando o
   deslocamento físico de conteúdo que alimenta o observer.

### Defesas opcionais

5. Desativar temporariamente o scroll anchoring durante o resize
   (`viewer.style.overflowAnchor = 'none'` enquanto `pdfZooming`, restaurando depois),
   evitando que o navegador ajuste o scroll por conta própria.
6. Considerar usar `behavior: 'instant'`/`'auto'` (não `'smooth'`) nos
   `scrollIntoView` disparados programaticamente, para não animar saltos causados por
   mudanças de layout.
7. Tornar a atualização de página do observer **debounced**: só "confirmar" uma nova
   página se ela permanecer a mais visível por alguns frames/milissegundos — o que
   absorve flutuações transitórias de ratio durante resizes.

## Implementação

Correção aplicada em `frontend/js/reader-pdf.js`, seguindo a **correção principal**
(flag `pdfZooming`) e a **correção complementar** (ancoragem da posição de leitura):

### `frontend/js/reader-pdf.js`

- Novo estado `pdfZooming` (linha 635), inicializado como `false`.
- `aplicarZoomPdf()` (linhas 640–694):
  - Seta `pdfZooming = true` antes do resize e **desativa temporariamente**
    `overflow-anchor` e `scroll-behavior` do contêiner durante o ajuste (evita que o
    scroll anchoring desloque o conteúdo e que a restauração de scroll seja animada);
  - Captura a âncora da página atual (`capturarAncoraScroll`), redimensiona os
    placeholders e restaura a posição relativa (`restaurarAncoraScroll`);
  - Libera `pdfZooming = false` e restaura os estilos do contêiner em `encerrarZoom`,
    disparado no debounce de 150 ms (slider) ou após 200 ms (zoom imediato).
- `capturarAncoraScroll()` (linhas 171–179): guarda o wrapper da página atual e o
  `diff` entre `scrollTop` e `offsetTop` — usado apenas no modo vertical.
- `restaurarAncoraScroll()` (linhas 184–187): restaura `scrollTop` para manter o
  usuário na mesma página e na mesma posição relativa após o resize.
- Callback do `IntersectionObserver` (linha 223): o bloco que sobrescreve
  `pdfCurrentPage`/`updatePdfControlsState()`/`savePdfProgress()` agora exige
  `!pdfZooming` — durante o zoom o observer continua **renderizando** as páginas em
  foco, mas nunca altera a página/progresso.
- `closePdf()` (linhas 783–809): limpa o debounce de zoom e reseta `pdfZooming` ao
  fechar o leitor.

## Arquivos e linhas envolvidos

| Local | Descrição |
|-------|-----------|
| `frontend/js/reader-pdf.js:185-207` | Callback do `IntersectionObserver` que sobrescreve `pdfCurrentPage`/salva progresso a cada mudança de layout |
| `frontend/js/reader-pdf.js:150-166` | `atualizarDimensoesPlaceholders` — redimensiona todas as `.pdf-canvas-wrap` no zoom (gatilho do observer) |
| `frontend/js/reader-pdf.js:613-652` | `aplicarZoomPdf` — aplica escala, redimensiona placeholders e agenda re-render |
| `frontend/js/reader-pdf.js:512-523` | Handlers `input`/`change` do slider de zoom |
| `frontend/js/reader-pdf.js:527-534` | Handlers dos presets de zoom (50/100/150/200%) |
| `frontend/js/reader-pdf.js:686-704` | Atalhos `Ctrl+`/`Ctrl-`/`Ctrl+0` (zoom via teclado) |
| `frontend/js/reader-pdf.js:560-571` | `updatePdfControlsState` — atualiza campo de página e botões |
| `frontend/js/reader-pdf.js:596-611` | `savePdfProgress` — persiste `current_page` incorreta durante o bug |
| `frontend/js/reader-pdf.js:238` | `scrollIntoView({ behavior: 'smooth' })` em `irParaPaginaPdf` |
| `frontend/styles/reader.css:403` | `scroll-behavior: smooth` em `#reader-container` |
| `frontend/styles/reader.css:407-428` | Modos `horizontal` (exibe só `.current-page`) e `vertical` (empilha todas as páginas) |
