# Desempenho do PDF em scroll: Readest e Krumer

> **Decisão atual (03/09/2026):** o Krumer usa exclusivamente a engine PDF.js /
> foliate-js em WebView. As comparações com `react-native-pdf` e o rollout entre
> engines registram o baseline histórico; não há mais seleção nem fallback nativo
> no produto.

Análise de código em 02/09/2026. Fases 1, 2 e 3 implementadas em 03/09/2026; o teste
em aparelho Android continua pendente.

O Krumer já incorpora boa parte da estrutura de scroll do Readest no motor WebView. As diferenças mais relevantes estão no transporte dos bytes do PDF, no custo de rasterização e no trabalho executado enquanto a página se move. A recomendação é medir e corrigir essas diferenças em etapas pequenas, preservando o zoom simples e o comportamento de 18% dos botões de volume.

A análise original não incluiu execução do aplicativo no Android nem medição de FPS. Os mecanismos
descritos abaixo foram verificados no código; sua contribuição para os engasgos ainda precisa ser
medida no aparelho. As validações automatizadas da implementação atual foram executadas.

## Escopo e revisões consultadas

| Componente | Referência analisada |
| --- | --- |
| Readest local | `C:/Projects/readest`, versão 0.12.1, commit `2fd8b3bc9287c644ed23e161a2ed3b7db1ac9c3a` |
| foliate-js do Readest | Gitlink `79191075dfc513f563fd8e8acc56e50470fd9f4c` |
| PDF.js do Readest | 6.2.108 no lockfile; dependência do foliate também aponta para essa série |
| Krumer | Base `5b6e545dfd4d5100c5cc0e440e523f6cf847523d` mais as alterações locais existentes em 02/09 |
| foliate-js do Krumer | Base declarada `ca3f118269f8d78811ef17a1b147363c321273d7`, com adaptações locais |
| PDF.js do Krumer | 5.5.207 |

O submódulo `packages/foliate-js` do Readest estava vazio. Foram consultados `pdf.js`, `fixed-layout.js` e `package.json` da revisão exata do gitlink, por cópias temporárias obtidas do repositório público. O checkout do Readest não foi alterado. Documentos locais de planos anteriores não foram usados como prova de implementação.

Fontes: [manifesto do Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/pdfWebRuntimeManifest.ts:9>), [pacote do Readest](C:/Projects/readest/apps/readest-app/package.json:3), [lockfile do Readest](C:/Projects/readest/pnpm-lock.yaml:718), [PDF do foliate na revisão consultada](https://github.com/readest/foliate-js/blob/79191075dfc513f563fd8e8acc56e50470fd9f4c/pdf.js), [layout na mesma revisão](https://github.com/readest/foliate-js/blob/79191075dfc513f563fd8e8acc56e50470fd9f4c/fixed-layout.js).

### Confirmar qual motor está em uso

O Krumer mantém somente o motor `webview`, que usa PDF.js e foliate. A seleção
de engine foi removida; a abertura deve registrar `engine: webview` em todos os
eventos do leitor.

Antes de atribuir os engasgos a esse código, registrar a versão do APK e da
WebView do aparelho. Também confirmar a versão instalada do Readest: o checkout
analisado não prova qual versão está no celular.

O caminho atual de `scrollByViewport` executa o comando diretamente no runtime
WebView, que também concentra o transporte de ranges e os canvases do PDF.js.

Fontes: [contrato do leitor](<C:/Projects/Krumer RN/mobile/src/readers/PdfReader.types.ts:1>), [shell do PDF](<C:/Projects/Krumer RN/mobile/src/readers/PdfReader.tsx:1>), [runtime WebView](<C:/Projects/Krumer RN/mobile/src/readers/pdf/PdfWebEngine.tsx:1>).

## O que o Readest faz e o que já existe no Krumer

| Estratégia | Readest consultado | Krumer WebView atual | Decisão |
| --- | --- | --- | --- |
| Carregar páginas por proximidade | `IntersectionObserver`, margem de 200%, páginas mais próximas primeiro | Já existe | Preservar e medir; não reimplementar |
| Limitar páginas vivas | Meta de 12 páginas carregadas; descarte das distantes fora da faixa de pré-carregamento | Mesma meta | Avaliar memória em bytes, além de contar páginas |
| Limitar carregamentos | Até 3 carregamentos de páginas | Até 3, mais fila própria de até 2 rasterizações | Já há controle; aumentar paralelismo pode piorar os frames |
| Cache de páginas PDF | LRU de 16 páginas, com `cleanup()` | Também 16 | Preservar e verificar liberação real em uso prolongado |
| Limitar leituras por faixa | Até 6 solicitações simultâneas | Até 2 no foliate e na ponte do app | Não copiar o número 6 sem medir o transporte diferente |
| Evitar progresso a cada frame | Relocation após 150 ms sem scroll | Também 150 ms; gravação de progresso com atraso de 500 ms | Não atribuir o problema a persistência por frame sem um trace |
| Conter resolução em mobile | DPR até 2, orçamento nominal de 3,15 milhões de pixels por canvas | Visível Android até DPR 2,5 / 8,39 milhões; próximas até 4,19 milhões | Diferença concreta a testar |
| Evitar renders obsoletos | Cancela tarefa anterior e invalida resultado por geração; zera canvases descartados | Também possui cancelamento, gerações e reutilização | Auditar tarefas fora de tela e a fila, preservando essas guardas |

Os limites de 12 páginas são metas de descarte: páginas consideradas visíveis não são removidas apenas para satisfazer o número. Os limites de pixels também têm uma ressalva nos dois motores: `getRenderDpr()` mantém DPR mínimo 1. Uma página cuja área CSS já exceda o orçamento pode ultrapassá-lo. Nenhum desses números representa, sozinho, um teto absoluto de memória do processo.

Fontes: [scheduler Readest](https://github.com/readest/foliate-js/blob/79191075dfc513f563fd8e8acc56e50470fd9f4c/fixed-layout.js#L837), [testes do scheduler](C:/Projects/readest/apps/readest-app/src/__tests__/document/fixed-layout-scroll-scheduler.test.ts:1), [limites Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/fixed-layout.js:306>), [fila de rasterização Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/pdf.js:226>), [progresso Krumer](<C:/Projects/Krumer RN/mobile/src/screens/ReaderScreen.tsx:439>).

## Diferenças com maior potencial de impacto

### 1. Bytes do arquivo atravessam o JavaScript do app no Krumer

No caminho Android de arquivos locais permitido pelo escopo do Readest, `RemoteFile.fromNativePath()` usa `fetch` para um protocolo nativo `rangefile`. O handler lê a faixa em trabalho nativo fora da UI e devolve os bytes como resposta binária. Há caminhos alternativos e fallback para `NativeFile`; portanto, essa vantagem não deve ser presumida para todo tipo de URI.

O protocolo carrega início/fim na query e retorna HTTP 200. O código documenta que isso evita um problema de reaplicação de offsets pelo Android em respostas interceptadas com `Range`. Uma futura adaptação deve testar faixas com início diferente de zero, sem simplesmente copiar um endpoint HTTP parcial.

No Krumer, o caminho é:

`WebView → READ_RANGE → FileHandle.readBytes → conversão Base64 em JS → JSON/postMessage → atob + cópia para Uint8Array → PDF.js`.

`readPdfRange()` está declarado como `async`, mas seu corpo chama `readBytes()` e o conversor Base64 de forma síncrona. A declaração não transfere esse trabalho para outra thread. A conversão também aumenta o conteúdo binário para aproximadamente 4/3 em caracteres, antes das cópias de strings, JSON e buffers. Isso não permite calcular a memória total sem medir a representação usada pelo runtime.

**Hipótese forte para medição:** páginas ainda não visitadas ou PDFs com muitos objetos podem produzir leituras e conversões que atrasam eventos do app e trabalho da WebView. O fato de um gesto direto parecer melhor que os botões também é compatível com atraso na ponte, mas não prova essa causa.

**Como confirmar:** medir separadamente tempo de leitura, codificação, espera na ponte e decodificação; comparar primeira passagem e retorno pelo mesmo trecho já carregado. Correlacionar com atrasos de volume e frames lentos.

**Possível adaptação futura:** um transporte binário nativo assíncrono acessível pela WebView, preservando a ponte de comandos leves. Avaliar o suporte já existente no projeto antes de adicionar módulo ou dependência. Não é necessário migrar o app para Tauri. A nova implementação precisa preservar acesso aos arquivos autorizados, fechamento, isolamento entre livros e cancelamento/timeout.

Fontes: [seleção do transporte Readest](C:/Projects/readest/apps/readest-app/src/services/nativeAppService.ts:330), [RemoteFile](C:/Projects/readest/apps/readest-app/src/utils/file.ts:311), [handler nativo](C:/Projects/readest/apps/readest-app/src-tauri/src/range_file.rs:79), [leitura e Base64 Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/PdfWebEngine.tsx:55>), [decodificação Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/pdfWebRuntime.ts:732>).

### 2. O Krumer permite mais pixels e pode pintar duas vezes

O Readest usa DPR móvel até 2 e orçamento nominal de `2048 × 1536` pixels. O Krumer permite até DPR 2,5 na página visível Android e orçamento de `4096 × 2048`. Para uma mesma página sem atingir os limites de área, DPR 2,5 gera **56,25% mais pixels** que DPR 2: `(2,5 / 2)²`.

Nos máximos nominais, um bitmap RGBA ocupa aproximadamente 12 MiB no Readest, 32 MiB na página visível do Krumer e 16 MiB numa página próxima do Krumer. São estimativas apenas do bitmap; canvases temporários, imagens decodificadas e texturas podem elevar o consumo. Não são medições do aparelho nem valores típicos de toda página.

O Krumer ainda tem um caminho progressivo: preview e depois melhoria de resolução. `queueFinalUpgrade()` agenda a melhoria com `setTimeout(..., 0)`. As camadas de texto/anotações também são agendadas com timeout zero. Essa separação permite mostrar conteúdo antes, mas **não espera que o scroll termine**. Quando esse caminho é acionado, o trabalho adicional pode disputar tempo com o movimento.

Há uma interação a validar antes de modificar essa política: `fixed-layout.js` considera a página pronta pela escala, sem incluir a prioridade nesse critério. Uma página pré-carregada na mesma escala pode não voltar a chamar `onZoom` ao ficar visível. Logo, não se deve afirmar que toda página recebe a segunda pintura, nem depender desse evento para ativar suas camadas de interação. Testar explicitamente a promoção de página próxima para visível.

**Implementação da Fase 3:** o bitmap existente é preservado; durante o scroll ativo, o novo
`MAX_SCROLL_CANVAS_PIXELS` limita apenas renders temporários ao orçamento nominal do Readest.
O refinamento após 150 ms sem movimento retorna ao orçamento visível do Krumer. A mudança não
oculta camadas nem interrompe seleção ativa; legibilidade e memória ainda precisam de medição
no aparelho.

O gatilho deve ser o estado de movimento do leitor, independentemente de vir do dedo ou de comandos de volume. Os botões continuam enviando passos de 18%; não precisam simular gestos.

Fontes: [limites Readest](https://github.com/readest/foliate-js/blob/79191075dfc513f563fd8e8acc56e50470fd9f4c/pdf.js#L162), [teste de memória Readest](C:/Projects/readest/apps/readest-app/src/__tests__/document/pdf-canvas-memory-cap.test.ts:1), [limites Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/pdf.js:241>), [upgrade imediato](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/pdf.js:556>), [camadas de interação](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/pdf.js:344>), [critério por escala](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/fixed-layout.js:1464>).

### 3. O caminho de fontes difere

O Readest cria o canvas no documento proprietário do PDF.js, renderiza e só depois o adota no iframe. Ele fornece também WASM, CMaps e fontes padrão. O Krumer cria o canvas diretamente no documento do iframe, desativa `FontFace` e omite essas URLs por usar runtime autocontido.

O comentário do Krumer explica o motivo: fontes instaladas no documento superior não estavam disponíveis no iframe e apareciam como quadrados. O renderizador de contornos resolveu esse defeito. O código instalado do PDF.js confirma que `disableFontFace` altera o caminho de desenho dos glifos; PDFs com muito texto são um caso relevante para comparação de CPU.

**Hipótese secundária:** esse custo pode contribuir para páginas de texto demorarem mais. A disponibilidade de WASM/CMaps/fontes pode afetar documentos específicos. Nenhum desses pontos prova uma melhoria universal.

**Adaptação futura, se o perfil justificar:** testar a estratégia de documento proprietário do Readest e disponibilizar os recursos locais necessários. Só remover `disableFontFace` após comprovar texto, acentos, fontes incorporadas, CJK, seleção e anotações corretos. Tratar atualização do PDF.js como uma etapa independente; diferença de versão não é prova de desempenho superior.

Fontes: [canvas Readest](https://github.com/readest/foliate-js/blob/79191075dfc513f563fd8e8acc56e50470fd9f4c/pdf.js#L226), [recursos Readest](https://github.com/readest/foliate-js/blob/79191075dfc513f563fd8e8acc56e50470fd9f4c/pdf.js#L471), [canvas Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/pdf.js:438>), [opções de carregamento Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/pdf.js:746>).

### 4. Interação e layout precisam de avaliação seletiva

Durante o scroll, o Readest desabilita temporariamente a interação dos iframes e a restaura após 150 ms parado, evitando que handlers internos disputem o gesto. O Krumer mantém os iframes interativos para o controlador de gestos, inclusive pinça entre páginas. Copiar essa regra integralmente pode regredir o comportamento já solicitado; ela também não explica sozinha engasgos de comandos programáticos de volume.

O Krumer já melhorou a busca da página atual com métricas em cache e busca binária. Entretanto, ao terminar o carregamento de uma página, recompõe métricas lendo os offsets de todos os placeholders. Essa varredura, após mudanças de tamanho, merece ser correlacionada com picos de layout em documentos longos. Não ocorre necessariamente a cada frame.

Se houver evidência de layout caro, agrupar medições e atualizações necessárias e evitar recomputação integral quando a geometria não mudou. Não ampliar agora para uma reescrita da virtualização.

Fontes: [interação Readest](https://github.com/readest/foliate-js/blob/79191075dfc513f563fd8e8acc56e50470fd9f4c/fixed-layout.js#L873), [interação Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/fixed-layout.js:1082>), [cache de métricas](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/fixed-layout.js:393>), [recomposição no carregamento](<C:/Projects/Krumer RN/mobile/src/readers/pdf/web/vendor/foliate/fixed-layout.js:1317>).

### 5. O Readest também isolou progresso da interface geral

Além do evento após repouso, o Readest separou progresso em uma store pequena e passou a usar seletores por campo. Os comentários documentam uma investigação anterior de excesso de renders de React. Isso é evidência de uma otimização implementada naquele app, não uma medição do Krumer.

O Krumer já tem WebView/source estáveis, relocation após repouso e gravação de progresso adiada. Só ampliar mudanças de contexto/estado se um perfil mostrar renders custosos coincidentes com os engasgos. Não é necessário adotar Zustand para reproduzir o princípio.

Fontes: [store de progresso Readest](C:/Projects/readest/apps/readest-app/src/store/readerProgressStore.ts:4), [seletores no viewer](C:/Projects/readest/apps/readest-app/src/app/reader/components/FoliateViewer.tsx:123), [source estável Krumer](<C:/Projects/Krumer RN/mobile/src/readers/pdf/PdfWebEngine.tsx:115>).

## Plano recomendado

| Etapa | Trabalho futuro | Condição para avançar |
| --- | --- | --- |
| 0 — Reproduzir e medir | Confirmar motor/APK; registrar uma base do estado atual; comparar dedo e volume, primeira passagem e retorno | Trace identifica onde o tempo é gasto e permite repetir o sintoma |
| 1 — Reduzir trabalho durante movimento | Adiamento do upgrade/camadas opcionais até 150 ms após o scroll, preservando promoção das páginas | Validadores passaram; falta medir frames e páginas em branco no aparelho |
| 2 — Tirar dados pesados da ponte | Rota local interceptada no Android, faixa em query e resposta binária; fallback Base64 preservado | Validadores passaram; falta confirmar faixas não nulas, troca de livro e ganho de p95 no aparelho |
| 3 — Resolver o gargalo restante | Rasterização adaptativa durante o scroll: orçamento de bitmap igual ao Readest; qualidade final preservada após repouso | Validadores passaram; falta medir frames, memória e legibilidade no aparelho |

A ordem muda se a etapa 0 apontar claramente outro responsável. Por exemplo, uma pausa dominada por Base64 justifica antecipar transporte. Se o motor ativo for nativo, seguir a investigação nativa descrita no início; não executar as etapas WebView esperando resolver outro motor.

### Implementação do transporte por bytes, em subfases

Esta é a sequência concreta para substituir o Base64 sem criar uma regressão:

1. **Contrato e diagnóstico.** Adicionar métricas de leitura, codificação, entrega, decodificação e falha por faixa. Manter o protocolo atual `dataBase64` como fallback. Confirmar no aparelho que o tempo de Base64/ponte aparece durante a reprodução.
2. **Canal binário nativo.** Implementar uma rota de arquivo local para a WebView, equivalente ao `rangefile` do Readest: faixa em query ou cabeçalho controlado, leitura fora da UI, resposta HTTP binária, escopo de caminhos e tamanho máximo. A rota deve ser uma extensão nativa pequena do projeto ou uma capacidade já disponível do Expo/RN; não deve criar um servidor aberto nem depender de uma nova cópia integral do PDF.
3. **Leitura A/B.** Fazer o runtime tentar a rota binária para `file://`/arquivos copiados para o cache e voltar ao Base64 em caso de erro. Validar faixa zero, faixa com início diferente de zero, fim de arquivo, troca de livro, cancelamento, arquivo grande e URI `content://` já normalizada pelo Krumer.
4. **Desligamento gradual do Base64.** Comparar relatórios do benchmark em vários PDFs. Só reduzir ou remover `dataBase64` depois de demonstrar menor p95 de faixa, menor CPU/memória e nenhuma falha de leitura. Manter fallback até uma versão posterior e remover apenas quando o canal binário tiver cobertura suficiente.

O `postMessage` atual não é o canal da subfase 2: a implementação Android de `react-native-webview` declara `postMessage(String)`, e o comando de saída também recebe `String`. Enviar `Uint8Array` nesse ponto não é uma transferência binária. A rota correta entrega os bytes pela rede interna da própria WebView e usa a ponte apenas para comandos e metadados. A existência de `FileHandle.readBytes()` não resolve sozinha essa fronteira; ela ainda pertence ao JavaScript do app.

Não usar um arquivo temporário por faixa como solução final sem medir: ele remove Base64, mas acrescenta escrita em disco, leitura duplicada e limpeza concorrente. Pode ser um protótipo de diagnóstico, com limite de tamanho e remoção garantida, nunca um ganho presumido.

As subfases 1 e 2 já foram aplicadas de forma reversível. A Fase 2 usa `rangeUrl` somente para
o WebView Android, intercepta o host local `rangefile.localhost` com `krumerRange=1`,
`path`, `start` e `end`, restringe o caminho às pastas privadas do aplicativo e mantém o
`READ_RANGE`/Base64 como fallback automático. A rota `file://` anterior continua aceita para
compatibilidade. O patch nativo é reaplicado pelo
`scripts/fix-pdf-webview-range.cjs` em `postinstall`, `prebuild` e `android`.

Os validadores e as métricas do runtime continuam cobrindo abertura/páginas, frames lentos de volume e filas de renderização. O benchmark específico de motores foi removido junto com a seleção nativa; novas comparações devem medir apenas o WebView candidato contra o baseline registrado no aparelho. Contadores de animação não substituem uma captura dos frames realmente apresentados: um loop correto pode continuar disputando tempo com rasterização, layout e composição.

### Protocolo de comparação no aparelho

- Usar mesmo aparelho, PDF, trecho, orientação, escala, taxa de atualização e condições térmicas. Comparar builds equivalentes, sem misturar release com uma sessão carregada de logs/debug. Fazer primeiro uma comparação Krumer atual versus candidato; usar Readest como referência adicional.
- Cobrir um PDF de texto, um escaneado/HQ de imagens pesadas e um documento longo com tamanhos de página variados. Incluir o arquivo em que o usuário observa os engasgos.
- Percorrer o mesmo trecho por 30–60 segundos nos dois sentidos, com dedo e volume; repetir em cache quente. Fazer pelo menos três execuções por variante, também testando pausas curtas, inversão de direção e soltura do botão durante carga pesada.
- Registrar frames apresentados/atrasados e p95/p99, tarefas longas na WebView, rasterizações por página, fila de render, duração das faixas e Base64, memória do app **e do processo da WebView**, número de páginas/canvases vivos e demora para uma página visível ficar pronta. Evitar logs por frame que perturbem a própria medição.
- Confirmar se a ferramenta de captura cobre o processo/compositor da WebView; uma amostra de memória apenas do pacote ou o contador de `requestAnimationFrame` não cobre toda a experiência.

### Critérios de aceitação propostos

As metas abaixo são critérios para o futuro ensaio, não resultados obtidos:

1. Redução repetível dos frames que perdem o prazo de apresentação, sem picos crescentes ao manter o botão pressionado. Relacionar o prazo à taxa do aparelho: 16,7 ms a 60 Hz e 8,3 ms a 120 Hz. Avaliar p95/p99 junto da inspeção visual; não declarar fluidez só pela média de FPS.
2. Um clique mantém ±18% do viewport segundo o contrato atual. Ao segurar, os passos se conectam sem parada artificial entre o primeiro e os seguintes; soltar cancela o movimento pendente. Medir latência desde o evento nativo de soltura até a última movimentação, inclusive quando a thread está ocupada.
3. Pinça mantém a página e usa o conteúdo já renderizado; restaurar zoom volta aos 100% corretos. A otimização de scroll não pode introduzir recriação de página a cada zoom.
4. Pré-carregamento mantém páginas visíveis abastecidas; retornar e inverter direção não deixa páginas sem conteúdo nem cria uma fila crescente de trabalho inútil. Páginas promovidas para visíveis ganham texto/anotações quando necessário.
5. Texto, seleção, links, anotações, posição de leitura e salvamento continuam corretos. Memória estabiliza no percurso prolongado e os recursos são liberados ao fechar/trocar livro.

Para mudanças futuras, usar as validações existentes de PDF (`validate-pdf-render-pipeline`, `validate-pdf-runtime-resilience`, `validate-pdf-gestures`, `validate-pdf-reader` e preferências) conforme o trecho alterado, além do teste real de scroll. Se houver mudança em `ReaderScreen`/contexto compartilhado, executar também as validações EPUB e TypeScript exigidas pelo `AGENTS.md`. Gerar o HTML do runtime pelo script existente, sem editar o artefato gerado à mão.

## Limites de escopo

Preservar as alterações locais já existentes e documentar qual snapshot foi medido antes da implementação. Cada experimento deve ser reversível e avaliado separadamente. Não trocar o motor padrão, o leitor, a stack, o contrato de volume ou a política de zoom apenas para reproduzir a arquitetura do Readest.

As leituras de faixa agora usam seis operações simultâneas limitadas, após a confirmação de que
o Readest mantém esse limite de transporte. Isso fica separado de ativar a camada `hardware`,
atualizar PDF.js ou baixar a qualidade; cada ajuste precisa de ensaio próprio. `androidLayerType="none"`
não basta para concluir que a aceleração está desativada.

O resultado atual é uma redução de trabalho durante o movimento, um caminho binário reversível
para as faixas do PDF e um orçamento de rasterização temporário alinhado ao Readest. A causa
dominante dos engasgos e o ganho efetivo permanecem abertos até a captura no motor e no aparelho
afetados.
