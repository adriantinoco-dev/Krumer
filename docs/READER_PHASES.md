# Plano faseado do leitor — Krumer Mobile

## F1 — EPUB mínimo viável

**Objetivo:** ao final desta fase, o Krumer abre um EPUB local em Android e iOS, exibe seu conteúdo e permite avançar e voltar sem travar.

**Features incluídas:**

- Shell mínimo do leitor em React Native.
- Motor EPUB com `react-native-webview` e runtime web local baseado em `epub.js`.
- Leitura do arquivo EPUB a partir de armazenamento durável do app.
- Bridge JSON versionada com apenas `READY`, `OPEN_BOOK`, `BOOK_OPENED`, `NEXT`, `PREVIOUS`, `LINK_PRESSED`, `CLOSE_BOOK` e `ERROR`.
- Renderização de texto, CSS, imagens e recursos internos do EPUB.
- Paginação LTR básica, com fundo branco e tipografia padrão fixa.
- Interceptação de links externos para impedir navegação arbitrária dentro da WebView.

**Dependências:**

- Confirmar e fixar a versão atual do Expo SDK, `react-native-webview` e `epub.js`.
- Receber um URI de arquivo local já disponível; seleção, importação e gerenciamento de livros não pertencem a esta fase.
- Definir uma única página HTML/JS local como runtime do EPUB.
- `[VERIFICAR — risco bloqueante]` Validar em dispositivos Android e iOS o carregamento de HTML local, EPUB, blob URLs, iframes, CSP e recursos internos. Esse ponto não pode ser adiado porque sem ele o EPUB não abre.

**Critério de conclusão:**

- Em um dispositivo Android e um dispositivo iOS, abrir EPUBs locais com texto, CSS e imagens e chegar à primeira página legível.
- Executar pelo menos 30 ações alternadas de próxima/anterior sem tela branca, reload da WebView ou erro não tratado.
- Fechar um EPUB e abrir outro na mesma sessão sem manter conteúdo ou eventos do livro anterior.
- Tocar em link externo e confirmar que a WebView não navega para fora do runtime local.
- Mensagens enviadas antes de `READY` ficam em uma fila limitada e são processadas após a inicialização.
- Um EPUB acima do limite de leitura integral definido para esta fase é recusado com erro controlado; suporte a arquivos grandes fica para F7.

**Nível de complexidade:** Médio

**Restrições desta fase:**

- Não implementar PDF, progresso persistido, bookmarks, busca, seleção, anotações, tema configurável, fontes configuráveis, scroll contínuo, RTL ou escrita vertical.
- Não renderizar EPUB com componentes React Native; todo DOM, iframe e parsing EPUB deve permanecer na WebView.
- Não importar código dependente de DOM do foliate-js no runtime JS nativo.
- Não portar `FoliateViewer.tsx` linha a linha; implementar somente o contrato mínimo da bridge.
- Não enviar o EPUB como array JSON. Se for usada leitura integral temporária, impor limite explícito de tamanho e medir memória.
- Não expor filesystem genérico à WebView; fornecer somente acesso ao livro aberto.
- Não concatenar dados não escapados em JavaScript injetado; serializar e validar toda mensagem.
- Não permitir múltiplos viewers, formatos secundários ou qualquer feature fora do leitor EPUB/PDF.

## F2 — Progresso EPUB e bookmarks duráveis

**Objetivo:** ao final desta fase, o EPUB reabre na última posição salva e o usuário consegue criar, remover e navegar por bookmarks persistentes.

**Features incluídas:**

- `expo-sqlite` com migrations transacionais para progresso e bookmarks.
- Locator discriminado por formato, com CFI EPUB e fallbacks `spineHref`, `progressionInSection` e `excerpt`.
- Eventos `RELOCATE` e comando `GO_TO_LOCATOR` na bridge.
- Estado de progresso transitório separado do estado durável.
- Autosave com debounce de 1 segundo e flush em `AppState` `inactive`/`background` e no fechamento controlado.
- Criação, remoção, listagem e navegação por bookmarks EPUB.
- Tombstones e timestamps nos bookmarks, sem implementar sync.

**Dependências:**

- F1 estável em Android e iOS.
- CFI emitido e resolvido de forma consistente pelo runtime `epub.js` escolhido.
- Schema dos locators EPUB/PDF definido antes da primeira migration, mesmo que PDF só seja usado em F3.

**Critério de conclusão:**

- Navegar para uma posição EPUB, aguardar o debounce, encerrar e reabrir o app; o livro deve retornar ao mesmo trecho.
- Navegar e mandar o app imediatamente para background; após reabrir, a posição recebida antes do background deve estar salva.
- Corromper ou invalidar o CFI de uma fixture e confirmar que a restauração tenta, nessa ordem, `spineHref + progressionInSection` e `excerpt`.
- Criar um bookmark, reiniciar o app, tocar no bookmark e voltar ao trecho salvo.
- Remover um bookmark e confirmar que ele não reaparece após reinício.
- Confirmar por instrumentação que eventos sucessivos de scroll/página não produzem uma escrita SQLite por evento.

**Nível de complexidade:** Médio

**Restrições desta fase:**

- Não persistir somente porcentagem global ou offset em pixels.
- Não assumir compatibilidade byte a byte entre CFIs de epub.js e foliate-js.
- Não depender somente do cleanup React para salvar progresso.
- Não gravar no SQLite a cada `RELOCATE`; atualizar primeiro o estado transitório.
- Não gerar bookmark a partir da posição visual de uma toolbar; usar o último locator estabilizado do motor.
- Não deduplicar bookmark somente por porcentagem.
- Não implementar sync, biblioteca, importadores ou configurações de conta.
- Não alterar o fundo ou as fontes do EPUB nesta fase; o conteúdo continua com o estilo fixo de F1.

## F3 — PDF básico nativo

**Objetivo:** ao final desta fase, o Krumer abre e lê PDFs locais com zoom, scroll/paginação, links, progresso e bookmarks.

**Features incluídas:**

- Adapter `NativePdfEngine` sobre `react-native-pdf`.
- Abertura por URI local com `source={{ uri }}`.
- Página inicial, `setPage()`, `onPageChanged` e contagem total de páginas.
- Zoom com escala mínima/máxima e callback de mudança de escala.
- Scroll contínuo e modo paginado fornecidos pelo componente nativo.
- Links PDF via `onPressLink`.
- Progresso PDF persistido como página 1-based e posição normalizada opcional.
- Bookmarks PDF usando a infraestrutura SQLite de F2.
- Renderização das anotações já embutidas no arquivo quando suportada pelo componente.

**Dependências:**

- F2 estável e migrations compatíveis com locators discriminados.
- Expo development build/prebuild configurado; `react-native-pdf` não deve depender de Expo Go.
- Normalização testada de `file://`, `content://` e path cru na borda do adapter.

**Critério de conclusão:**

- Abrir PDFs locais em Android e iOS e exibir corretamente número total e página atual.
- Alternar entre scroll e paging, navegar por pelo menos 30 páginas e aplicar zoom sem perder o documento ou reiniciar o viewer.
- Fechar na página N, reabrir e restaurar exatamente a página N.
- Criar um bookmark na página N, navegar para outra página e retornar pelo bookmark.
- Abrir um link interno/externo suportado e confirmar que ele é entregue ao shell RN.
- Abrir sequencialmente dois PDFs e confirmar que página, zoom e callbacks do primeiro não vazam para o segundo.

**Nível de complexidade:** Médio

**Restrições desta fase:**

- Não usar PDF.js em WebView como viewer principal.
- Não gerar CFI para PDF; persistir página 1-based.
- Não implementar busca full-text, seleção própria ou highlights próprios em PDF nesta fase.
- Não assumir que `enableAnnotationRendering` cria anotações do Krumer; ele somente renderiza anotações existentes no arquivo.
- Não portar worker, CMaps, canvas, protocolo `rangefile` ou cache PDF.js do Readest.
- Não misturar regras de paginação EPUB com o componente PDF nativo.
- **Não implementar tema, recoloração, dark mode, branco ou sepia para páginas PDF. O PDF deve manter suas cores originais.**

## F4 — Experiência de leitura EPUB

**Objetivo:** ao final desta fase, o usuário alterna paginação/scroll e personaliza fundo e tipografia do EPUB sem perder a posição de leitura.

**Features incluídas:**

- Flow EPUB paginado e scroll contínuo dentro da WebView.
- Comandos `SET_FLOW` e `APPLY_READER_STYLE` na bridge.
- Paginação por tap/swipe sem interferir em links, seleção futura ou scroll.
- Direção RTL e suporte aos writing modes expostos pelo EPUB.
- Safe areas e viewport recalculados pelo shell RN.
- Três presets visíveis de fundo EPUB: `white`, `dark` e `sepia`, mapeados internamente para modo luminoso e paleta separados.
- Cor de texto e links adequada a cada um dos três fundos.
- Família, tamanho, peso, altura de linha, espaçamento, margens e largura de leitura.
- Fontes EPUB via `@font-face` acessível dentro da WebView.
- Restauração pelo CFI/anchor após reflow, troca de fonte, mudança de viewport ou troca de flow.

**Dependências:**

- F2 estável, principalmente fallback de posição e `GO_TO_LOCATOR`.
- F1 estável após mudanças de viewport e reinicialização do runtime.
- `[VERIFICAR — risco]` Fixar e validar os nomes e comportamentos exatos dos flows/métodos da versão escolhida do epub.js. Encapsular essa diferença apenas no runtime web.
- `[VERIFICAR — risco baixo]` Não reutilizar `BookStyle.theme` do Readest como fonte de verdade. No Krumer, modo luminoso e paleta persistidos são a fonte de verdade; `white`, `dark` e `sepia` são presets da UI.

**Critério de conclusão:**

- Alternar entre paginado e scroll no mesmo trecho e manter o conteúdo visível dentro do mesmo anchor.
- Trocar entre `white`, `dark` e `sepia` e confirmar background, texto e links legíveis em todas as seções carregadas.
- Alterar fonte, tamanho e espaçamento e continuar no mesmo trecho após o reflow estabilizar.
- Reabrir o EPUB e restaurar flow, fundo e tipografia persistidos.
- Em fixtures RTL e de escrita vertical, próxima/anterior deve seguir a direção de leitura do livro.
- Taps em links e texto selecionável não podem disparar virada de página.
- Rotacionar o dispositivo ou alterar a área disponível e confirmar que o CFI salvo não é substituído por uma posição transitória incorreta.

**Nível de complexidade:** Alto

**Restrições desta fase:**

- Não mover um `ScrollView` RN externo para paginar EPUB; o flow pertence ao runtime web.
- Não compartilhar `StyleSheet` RN com o conteúdo EPUB; gerar CSS explícito.
- Não assumir que `expo-font` torna a fonte automaticamente visível na WebView.
- Não restaurar por offset em pixels após qualquer reflow.
- Não emitir `RELOCATE` durável antes de fontes, CSS e layout estabilizarem.
- Não ignorar RTL, escrita vertical ou elementos interativos ao configurar gestos.
- Não usar um filtro visual global para criar sepia; aplicar uma paleta CSS real ao EPUB.
- Não modelar internamente os presets como um único enum de tema; manter modo luminoso e paleta separados.
- **Não alterar a aparência das páginas PDF. Os fundos `white`, `dark` e `sepia` existem somente no leitor EPUB.**
- Não implementar anotações, busca ou highlights globais nesta fase.

## F5 — Highlights e anotações EPUB

**Objetivo:** ao final desta fase, o usuário seleciona texto EPUB, cria highlights/anotações persistentes e volta a elas após reabrir o livro.

**Features incluídas:**

- Evento `SELECTION_CHANGED` com texto, CFI/range, spine e âncora visual.
- Comandos `UPSERT_ANNOTATION`, `DELETE_ANNOTATION` e `LOAD_SECTION_ANNOTATIONS`.
- Evento `ANNOTATION_PRESSED`.
- Highlights `highlight`, `underline` e `squiggly`, com cor configurável.
- Nota textual associada ao highlight e preservação do trecho selecionado.
- Persistência em `reader_annotations` com locator, timestamps e `deleted_at`.
- Índice por livro/seção e pintura somente das anotações dos spines carregados.
- Recriação dos overlays depois de reload, reflow ou reabertura do documento.

**Dependências:**

- F4 estável; seleção e overlays devem funcionar nos dois flows e após mudança de estilo.
- F2 estável para locators e migrations.
- `[VERIFICAR — risco alto]` Validar a API exata de marks da versão fixada do epub.js e o comportamento de seleção que atravessa spine items. Esta é a fase mais tardia possível para essa validação porque F6 reutiliza o mesmo mapeamento de ranges/CFIs.

**Critério de conclusão:**

- Selecionar texto em um spine, criar cada um dos três estilos e confirmar alinhamento após página, scroll, zoom de texto e rotação.
- Fechar e reabrir o EPUB; todos os highlights vivos devem reaparecer no trecho correto.
- Editar cor e nota, reiniciar o app e confirmar os novos valores.
- Excluir um highlight e confirmar que ele não reaparece depois de reload/reflow.
- Tocar em uma anotação na lista e navegar para seu CFI; tocar no overlay e abrir a anotação correta.
- Carregar uma seção e confirmar que a bridge envia apenas as anotações relevantes àquela seção.
- Para seleção entre spines, concluir um dos comportamentos testados: dividir em booknotes válidos por spine ou impedir explicitamente a seleção cruzada sem criar dados parciais.

**Nível de complexidade:** Alto

**Restrições desta fase:**

- Não calcular `Range`, CFI ou retângulos no runtime React Native.
- Não desenhar overlays RN por cima da WebView; desenhar no mesmo DOM que sofre reflow.
- Não calcular CFI antes de conteúdo, fontes e transformações estabilizarem.
- Não enviar todas as anotações do livro a cada relocação.
- Não fazer hard delete; manter tombstone local, sem implementar sync.
- Não implementar highlights globais/book-wide; eles ficam para F8.
- Não implementar anotações próprias em PDF.
- Não ampliar o escopo para importadores de anotações de terceiros.

## F6 — Busca full-text EPUB

**Objetivo:** ao final desta fase, o usuário busca texto no EPUB, navega pelos resultados e vê o resultado destacado no conteúdo.

**Features incluídas:**

- Tabelas SQLite `search_meta`, `search_sections` e `search_nodes`.
- Extração de texto e offsets a partir da mesma árvore DOM usada pelo renderer.
- Evento `INDEX_CHUNK` e indexação incremental em lotes canceláveis.
- Texto original e versão folded/normalizada.
- Pré-filtro SQLite `LIKE` e matcher JS final sobre o texto original.
- Modos contains, whole words, regex e nearby words.
- Opções de case e diacríticos.
- Escopo por livro ou seção.
- Histórico curto de consultas por livro, separado do índice.
- Comandos `SHOW_SEARCH_RESULTS` e `CLEAR_SEARCH_RESULTS`.
- Conversão de offsets em Range/CFI e pintura dos resultados na seção visível.
- Invalidação por identidade/updatedAt do arquivo, versão do extractor e versão das transformações.

**Dependências:**

- F5 estável para reutilizar ranges, CFIs e overlays.
- F2 estável para migrations e identidade persistente por livro.
- Worker/task cancelável disponível para matching que não deve bloquear a UI.

**Critério de conclusão:**

- Em uma fixture conhecida, cada modo retorna a quantidade e os trechos esperados, inclusive variações de case e diacríticos.
- Tocar em um resultado navega para o CFI correto e destaca exatamente o texto correspondente.
- Digitar consultas rapidamente cancela o trabalho anterior e nunca mostra resultados de uma consulta obsoleta.
- Repetir uma busca após reabrir o livro reutiliza o índice completo sem extrair novamente todas as seções.
- Alterar a versão do extractor ou a identidade do arquivo invalida e reconstrói o índice.
- Fechar a busca remove todos os overlays transitórios sem remover highlights do usuário.
- A indexação ocorre em lotes e a UI continua aceitando navegação e cancelamento durante o processo.

**Nível de complexidade:** Alto

**Restrições desta fase:**

- Não executar uma varredura linear completa a cada tecla.
- Não usar FTS5/Tantivy como substituto silencioso da semântica definida; manter `LIKE` como pré-filtro e matcher exato como árbitro.
- Não guardar somente texto normalizado; preservar texto original e offsets.
- Não gerar CFIs a partir de uma árvore HTML diferente da usada pelo renderer.
- Não enviar o livro ou milhares de resultados em uma única mensagem da bridge.
- Não bloquear a thread da UI durante extração ou matching.
- Não misturar overlays de busca com annotations persistentes.
- Não implementar busca PDF nesta fase.

## F7 — EPUBs grandes e robustez de I/O

**Objetivo:** ao final desta fase, EPUBs que ultrapassam o limite de leitura integral abrem e mantêm navegação, progresso, anotações e busca sem pico de memória inaceitável.

**Features incluídas:**

- Medição explícita de tamanho e pico de memória da estratégia usada em F1.
- Limite documentado para leitura integral do EPUB.
- Estratégia alternativa para arquivos acima do limite: staging/extração nativa ou leitura por faixas.
- `FileHandle`, offset e `readBytes()` de `expo-file-system` quando a opção for range.
- `READ_RANGE_REQUEST` e `READ_RANGE_RESULT` em chunks limitados, com correlação, cache e cancelamento.
- Limite de concorrência para requisições de range.
- Cache temporário rebuildável, mantendo o arquivo original em armazenamento durável.
- Indexação full-text incremental compatível com o caminho de arquivos grandes.

**Dependências:**

- F6 estável, para que o caminho de arquivo grande preserve todas as features EPUB anteriores.
- Métricas reais de F1–F6 em Android e iOS.
- Decisão registrada entre extração nativa e reader por ranges; não implementar as duas estratégias sem necessidade medida.
- `[VERIFICAR — risco muito alto]` Revalidar assets locais, CSP, blob URLs, iframes e política de acesso do WebView usando o caminho de I/O escolhido em dispositivos reais.

**Critério de conclusão:**

- Um EPUB maior que o limite de leitura integral deve abrir pelo caminho alternativo, sem ser serializado inteiro como JSON/base64.
- Executar 50 viradas/avanços, saltar entre capítulos, mudar flow e reabrir o livro sem crash, tela branca ou perda de posição.
- Criar e restaurar um highlight e um bookmark nesse arquivo.
- Construir e reutilizar seu índice de busca sem bloquear navegação ou exceder o limite de memória definido pela equipe.
- Cancelar abertura/indexação e confirmar que handles, arquivos temporários, mensagens pendentes e cache são liberados.
- Remover o cache e confirmar que ele é reconstruído a partir da cópia durável do EPUB.

**Nível de complexidade:** Muito Alto

**Restrições desta fase:**

- Não usar JSZip sem limite de tamanho e medição de memória.
- Não enviar EPUB inteiro ou grandes blocos sem chunking pela bridge.
- Não implementar prefetch Rust `parse_epub_full` em Swift/Kotlin antes de provar sua necessidade.
- Não portar o protocolo Tauri `rangefile`; usar APIs Expo ou módulo estrito somente após reproduzir o problema.
- Não expor paths arbitrários ou operações genéricas de filesystem ao runtime web.
- Não armazenar a única cópia do livro em cache apagável.
- Não misturar `content://`, `file://` e path cru fora dos adapters responsáveis.
- Não alterar o leitor PDF nesta fase.

## F8 — Paridade avançada de alto risco

**Objetivo:** ao final desta fase, o Krumer oferece busca PDF validada e decide com evidência se seleção/highlights PDF e highlights EPUB globais podem ser suportados com precisão aceitável.

**Features incluídas:**

- Busca full-text PDF com resultado `{ page, text }`, lista de ocorrências e navegação para a página.
- Extractor PDF separado do viewer, somente após prova em Android e iOS.
- Gate técnico para seleção e highlights PDF próprios.
- Se o gate for aprovado: geometria normalizada por página, persistência e overlay sincronizado com zoom/scroll usando a mesma engine de texto.
- Se o gate for reprovado: busca com navegação por página permanece funcional e seleção/highlights PDF próprios ficam explicitamente não suportados, sem solução visual imprecisa.
- Highlights EPUB globais/book-wide, expandidos apenas nas seções renderizadas e removidos sem overlays órfãos.

**Dependências:**

- F3 estável para viewer e locators PDF.
- F5 estável para overlays EPUB.
- F6 estável para modelo de índice e resultados de busca.
- `[VERIFICAR — risco muito alto]` Escolher e validar o extractor PDF em Android e iOS; `react-native-pdf` não fornece busca full-text.
- `[VERIFICAR — risco muito alto]` Confirmar se a engine escolhida fornece texto e quads/retângulos compatíveis com a renderização do viewer. A seleção documentada por `react-native-pdf` não deve ser presumida no Android.
- Decisão de produto explícita sobre aceitar módulo nativo próprio/SDK PDF adicional ou encerrar o escopo em busca + navegação.

**Critério de conclusão:**

- Buscar uma expressão em PDFs de fixture, receber páginas/trechos corretos e navegar para cada página em Android e iOS.
- Cancelar e substituir consultas sem mostrar resultados obsoletos.
- Registrar formalmente o resultado do gate de seleção/highlights PDF.
- Se aprovado, criar um highlight, mudar zoom/orientação/página e confirmar alinhamento e restauração após reinício.
- Se reprovado, nenhuma UI deve oferecer criação de highlight PDF e nenhum overlay aproximado deve ser desenhado.
- Marcar um highlight EPUB como global e confirmar sua expansão em ocorrências das seções renderizadas, sem varrer seções descarregadas a cada página.
- Desativar/excluir o highlight global e confirmar que nenhum overlay sintético permanece.

**Nível de complexidade:** Muito Alto

**Restrições desta fase:**

- Não prometer busca, seleção ou highlight PDF usando somente `react-native-pdf`.
- Não desenhar highlight PDF sem geometria da mesma engine de texto usada para localizar o trecho.
- Não assumir paridade de seleção entre iOS e Android.
- Não usar PDF.js em WebView como viewer principal; ele pode ser avaliado apenas como extractor se o gate justificar.
- Não tratar `enableAnnotationRendering` como API de criação de anotações.
- Não varrer todas as seções EPUB descarregadas a cada mudança de página para manter highlight global.
- Não replicar multi-view, importadores de anotações, sync ou integrações externas do Readest.
- **Não investigar nem implementar mudança de tema, recoloração, night mode, fundo dark, branco ou sepia para PDF. O item `[VERIFICAR]` correspondente do `READER_ARCH.md` foi removido do escopo por decisão de produto.**
