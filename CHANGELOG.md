# Changelog — Krumer

Todas as mudanças relevantes do projeto são registradas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Unreleased]

### Corrigido
- **Mobile — zoom e paginação após rotação do PDF:** o viewer Android agora invalida
  restaurações atrasadas quando o viewport muda, reenquadra e centraliza a página em 100%
  depois que as novas dimensões estabilizam e preserva somente o ponto focal válido acima de
  100%. O avanço paginado usa o centro exato em zoom natural e callbacks protegidos por geração,
  evitando que uma página ou orientação anterior sobrescreva a geometria atual.
- **Mobile — enquadramento de 100% no PDF:** o modo paginado agora usa ajuste completo da
  página, mantendo-a inteira e centralizada em 100%, enquanto o modo scroll continua
  ajustado à largura. Ao girar o aparelho, o viewer recalcula o enquadramento para a nova
  área e preserva o ponto focal relativo quando o zoom está acima de 100%.
- **Mobile — trilho de páginas e pan no PDF paginado:** o Android volta a carregar somente
  a página selecionada no viewer nativo. O arraste com um dedo movimenta livremente a página
  ampliada, enquanto snap/fling permanecem desligados e toques laterais ou volume continuam
  responsáveis por trocar de página. A troca reaplica o zoom e o ponto focal normalizado,
  limitado às dimensões da nova página.
- **Mobile — falha `Already closed` no zoom do PDF:** ajustes consecutivos de escala agora
  atualizam a view imediatamente, mas agrupam a renovação do cache após 160 ms de inatividade.
  Tarefas antigas são canceladas ao receber outro zoom, trocar página/arquivo ou fechar a view,
  evitando disputar páginas que a thread do PDFium ainda está renderizando ou encerrando.

### Alterado
- **Mobile — controle de zoom do PDF:** a barra superior agora oferece um painel compacto com
  ajuste de 5% entre 50% e 200% e restauração para 100%. O valor acompanha o gesto de pinça,
  permanece ao trocar de página e é aplicado ao redor do centro visível, imitando a pinça sem
  remontar ou reabrir o documento nativo. Cada nova abertura começa em 100%.
- **Mobile — abertura acelerada de EPUB e PDF:** a tela de detalhes agora pré-aquece arquivo,
  preferências, fontes e banco antes do toque em Ler. EPUB reutiliza a cópia/base64 preparados
  e carrega WebView, fontes e arquivo em paralelo; PDF reutiliza uma cópia validada por tamanho
  e inicia imediatamente quando a URI e as preferências já estão em memória.
- **Mobile — PDF sem piscar ao abrir modais:** o bloqueio temporário de interação agora usa
  uma camada transparente independente, sem alterar o contêiner nem os callbacks da view
  nativa ao abrir painéis, preservando a página e o zoom atuais sem redesenhar o documento.
- **Mobile — leitor PDF, Fase 4 (notas e prévia):** notas agora carregam e persistem por
  livro no formato PDF, vinculadas à página corrente, com criação, lista, detalhes, edição
  e exclusão confirmada. A âncora abre somente a página salva em uma prévia paginada e sem
  interação, mantendo o leitor principal montado, bloqueado e na mesma posição sob os modais.
- **Mobile — leitor PDF, Fase 3 (marcadores):** marcadores agora são salvos na página
  corrente, persistem separadamente por livro e formato, aceitam repetições e exibem
  página, data e eventual rótulo. Abrir um marcador fecha o modal e navega para a página
  salva tanto no modo paginado quanto no modo scroll; exclusão e EPUB permanecem intactos.
- **Mobile — leitor PDF, Fase 2 (paginação e orientação):** as preferências de
  Scroll/Paginado e Livre/Paisagem/Retrato agora são carregadas, aplicadas e persistidas
  no PDF. O modal oculta coluna simples/dupla somente para PDF, restaura os padrões para
  Paginado + Retrato e mantém a página corrente ao alternar modo ou girar o aparelho.
- **Mobile — leitor PDF, Fase 1 (interface e brilho):** o PDF agora exibe somente
  título, fechar, paginação, brilho, notas e marcadores; tipografia, sumário e layout
  permanecem exclusivos do EPUB. O ajuste de brilho passa a funcionar também no PDF
  e, ao fechar o leitor, restaura o valor ou o controle automático original do aparelho.
- **Mobile — página isolada no PDF paginado:** o Android agora carrega somente a página
  atual no modo paginado, removendo o trilho contínuo de páginas anteriores e seguintes.
  O documento completo permanece carregado apenas no modo scroll.
- **Mobile — controles do PDF em modo scroll:** toques nas laterais deixam de trocar
  páginas, e os botões de volume passam a deslocar 18% da altura visível por acionamento,
  como uma roda de mouse. O modo paginado preserva a navegação anterior por página.
- **Mobile — transição entre capítulos EPUB:** o modo paginado agora mantém as views
  adjacentes preparadas, evitando o frame vazio que fazia a tela piscar ao avançar ou
  voltar pela fronteira entre capítulos.
- **Mobile — rescan automático ao retomar a navegação (F4):** Biblioteca, Listas e telas de
  detalhe atualizam a pasta configurada depois que a transição termina, incluindo o retorno
  do leitor. Solicitações simultâneas são serializadas, falhas mantêm a biblioteca em cache e
  o merge preserva progresso, capas, metadados e a data original de inclusão.
- **Mobile — animação compartilhada dos bottom-sheets (F3):** o modal de ações dos livros
  agora reutiliza o mesmo componente de transição dos demais bottom-sheets, mantendo fade
  do backdrop, slide com easing e fechamento sem piscar de forma consistente.
- **Tela de abertura com progresso (desktop e Android):** ao entrar no Krumer,
  a inicialização agora exibe a marca, a porcentagem acima de uma barra fina e
  nenhum texto adicional. O progresso parte de 0% e, se necessário, permanece
  em 94% até ser seguro revelar o aplicativo. No desktop, o progresso leva cerca
  de 3 segundos, mantém os 100% visíveis por 1 segundo e então inicia um fade
  explícito de 1 segundo, inclusive
  quando o Windows está configurado para reduzir animações. O comportamento
  finalizado no Android permanece inalterado. As travas em `ready` permanecem
  para nunca revelar a interface antes da restauração dos dados necessários.
- **Sincronização Supabase congelada para o beta (desktop e Android):** autenticação,
  refresh de sessão, worker/bridge, outbox, push/pull e gatilhos em segundo plano
  ficam desativados. Sessões, filas e migrations existentes são preservadas para
  reativação futura; o acesso à Conta/“Entrar” exibe um aviso de que a nuvem ainda
  não está disponível. Persistência local, Gemini e atualizações continuam ativos.
- **Mobile — busca de metadados responsiva (Android/tablet):** os modais de
  introdução, lote, ações e progresso agora respeitam as áreas seguras do
  dispositivo, mantendo controles fora da câmera e da barra de navegação. A
  prévia de resultados encontrados foi centralizada e recebeu largura máxima
  confortável para celulares e tablets.
- **Metadados — modelos Gemini atualizados para novas chaves (desktop/Android):**
  o serviço agora usa `gemini-3.6-flash` com fallback explícito para
  `gemini-3.5-flash-lite`. O caminho padrão do Free Tier não envia Google
  Search/grounding, usa `responseSchema` para garantir JSON estruturado e
  mantém a validação local. O contador local diário obsoleto do desktop foi
  removido; limites e respostas `429` ficam sob controle da API. A mudança
  evita o `404` retornado para chaves novas que não têm acesso ao Gemini 2.5.
- **Mobile — chrome do leitor EPUB mais compacto:** a altura vertical das barras superior e inferior foi reduzida em 10%, incluindo espaçamentos e controles, mantendo as larguras, ícones, áreas seguras e hit slops para toque.
- **Mobile — novo visual imersivo do leitor EPUB (Android/iOS):** o conteúdo passou a usar chrome discreto e auto-ocultável, título do capítulo e paginação lógica estável durante a leitura, barra superior com marcadores, tipografia e fechamento, além de navegação/progresso no rodapé. A faixa superior do conteúdo reserva espaço suficiente para a barra cobrir o título do capítulo sem sobrepor o texto do livro; a barra usa fundo totalmente sólido, aparece sem transparência ou fade e mantém suas ferramentas explicitamente acima da superfície nativa da WebView no Android. O painel de leitura agora altera tamanho da fonte, espaçamento e temas escuro, claro e sépia ao vivo no capítulo renderizado, sem reabrir o EPUB, perder a posição ou interferir nos gestos, botões de volume, progresso e bookmarks existentes.
- **Mobile — Ícone estilizado de idioma em badges sobrepostas (文A) (Android):** reformulação do componente [`LanguageIcon.tsx`](file:///c:/Projects/Krumer%20RN/mobile/src/components/LanguageIcon.tsx) com visual premium de badges geométricas com cantos arredondados, preenchimento translúcido com profundidade em camadas e tipografia nítida ("文" e "A"), integrado ao [`LangPicker.tsx`](file:///c:/Projects/Krumer%20RN/mobile/src/components/LangPicker.tsx).
- **Mobile — Centralização e ajuste vertical das telas de detalhes de configuração (Android):** em `SettingsGroupScreen`, o título do menu permanece fixado no topo, enquanto o conteúdo interativo de cada submenu (Conta, Geral, Tema, Chave de API e Sobre) é centralizado horizontalmente (`alignItems: 'center'`, `maxWidth: 460`) e posicionado ~10% acima do centro da tela (`justifyContent: 'center'`, `paddingBottom: Math.round(height * 0.18)`), mantendo o layout limpo e ergonômico.
- **Mobile — Animações e Transições Fluidas de Entrada/Saída na Janela de Detalhes da Lista (Android):** refatoração da visualização de detalhes de lista (`ListDetailScreen`) para uma rota de navegação nativa dedicada (`createNativeStackNavigator`). Foram eliminadas as travas e saltos secos de renderização causados pela troca síncrona de estado interno na aba `ListsScreen`, proporcionando animações nativas a 60/120fps tanto na abertura quanto no fechamento, com suporte completo ao botão de voltar nativo do Android e gestos do sistema.
- **Mobile — Paridade do BookCard com BookCardContinue (Android):** o componente `BookCard` foi harmonizado para seguir a mesma estrutura, proporções (5:7), raio de capa (`COVER_RADIUS = 10`), tipografia do fallback e hierarquia de espaçamentos do `BookCardContinue`, mantendo alinhamento consistente e uniforme em todas as telas de grade da biblioteca e listas.
- **Mobile — Botões redondos sem borda com fundo do tema nos detalhes do livro (Android):** na tela `BookDetailScreen`, os botões superiores flutuantes circulares (voltar, favoritos e opções) e o container de avaliação por estrelas não possuem mais bordas e agora utilizam exatamente a cor de fundo do tema ativo (`theme.bg`): `#111111` no tema escuro (Dark), `#ffffff` no tema claro (White/Light) e `#f4ecd8ff` no tema Sépia.
- **Botões na barra superior / cabeçalho na cor padrão (laranja):** botões de ação e navegação do topo (ordenar, adicionar lista, etc.) padronizados com a cor de destaque do aplicativo (`theme.accent` / `#f97316`).
- **Títulos e autores em negrito nas visualizações em grade:** títulos de livros e nomes de autores agora são exibidos em negrito (`fontWeight: '700'`) em todos os cards e grades da biblioteca e listas (mobile e desktop).

### Corrigido
- **Mobile — rolagem rápida por volume no PDF:** no modo scroll, manter Vol+ ou Vol−
  pressionado agora repete continuamente o deslocamento na direção correspondente. Toques
  curtos permanecem unitários, e EPUB/PDF paginado continuam ignorando repetições longas.
- **Mobile — zoom do PDF paginado:** avançar ou voltar uma página isolada agora preserva
  o nível de zoom e o ponto focal relativo escolhido pelo leitor, adaptando-o às dimensões
  da nova página sem recentralizar automaticamente o conteúdo.
- **Desktop — carregamento centralizado desde o primeiro quadro:** a janela
  oculta agora já renderiza com as dimensões da área útil da tela e, no Windows,
  permanece transparente até a maximização e dois quadros de layout terminarem.
  O ícone, a porcentagem e a barra não saltam mais da esquerda e de cima para o
  centro durante os primeiros milissegundos.
- **Desktop — inicialização deixa a tela de carregamento corretamente:** o
  backend Python não fica mais preso em uma consulta WMI do Windows durante a
  importação do SQLAlchemy quando é iniciado pelo Electron. A tela continua em
  94% somente enquanto necessário, chega a 100% e conclui o fade normalmente;
  o fluxo do Android permanece inalterado.
- **Desktop — backend encerra junto com o aplicativo:** o fechamento não usa
  mais o `taskkill` síncrono que podia retornar acesso negado, travar a saída e
  perder a referência do servidor. O Electron agora encerra diretamente o
  processo filho que iniciou e pode finalizar sem bloquear a interface.
- **Metadados — título de séries preservado (Android/desktop):** resultados de
  busca para obras pai com capítulos não substituem mais o título da série;
  o modal também exibe o título local do pai, mesmo quando o Gemini retorna o
  nome de um capítulo. Somente livros avulsos recebem o título retornado.
  Autor, ano e sinopse continuam aplicáveis nas séries.
- **Mobile — controles e configurações sem reflow no EPUB em landscape:** o toque central agora exibe apenas o chrome sobreposto do leitor, mantendo a barra de status do Android oculta para não reduzir a altura da WebView. O modal de configurações usa as áreas de sistema translúcidas, evitando alteração do viewport, perda da posição e compressão vertical do texto ao abrir ou fechar o painel em duas colunas.
- **Mobile — rotação fluida e paginação estável do EPUB:** a WebView agora determina a orientação pelo viewport e aplica `spread` antes de redimensionar a `rendition`, mantendo uma âncora de leitura independente dos eventos intermediários do reflow e restaurando o CFI original diante de qualquer deslocamento, sem destruir, limpar ou renderizar novamente o livro durante rotação, troca de colunas e alterações tipográficas. Ao ativar duas colunas, o CFI é alinhado como primeira coluna de leitura em vez de ser encaixado pelo epub.js no spread anterior, evitando o aparente retorno de uma página. Livros abertos diretamente na horizontal já usam duas colunas no primeiro quadro. O contador paginado usa localizações CFI fixas de 1.600 caracteres, permanece invariável após reflow e atualiza a página atual em cada `relocated`; durante a geração exibe `— / —`, e uma falha não bloqueia a leitura, usando porcentagem como fallback.
- **Mobile — fontes, posição e rotação do leitor EPUB:** as famílias Noto Serif, Noto Sans e Noto Sans Mono agora são incorporadas nos pesos 300/400/500/700, carregadas antes da paginação e aplicadas com prioridade inclusive sobre o CSS interno do livro. O fechamento consulta a posição viva da rendition antes de persistir, enquanto abertura e reflow estabilizam o mesmo CFI sem sobrescrevê-lo com eventos intermediários. O binário permite as orientações suportadas, o shell mantém as telas comuns em retrato e somente o leitor libera retrato/landscape durante seu ciclo de vida, restaurando o bloqueio anterior ao sair e habilitando a coluna dupla horizontal.
- **Mobile — toque lateral no leitor EPUB:** o avanço e o retrocesso pelas extremidades agora são processados uma única vez no `touchend`, usando `screenX` para não confundir a largura visível com a largura das colunas de um capítulo. O `click` sintético gerado pelo Android é descartado globalmente mesmo durante a troca de iframe, e as transições do epub.js são serializadas, evitando alternância involuntária entre a apresentação e o início do capítulo.
- **Mobile — inicialização do runtime EPUB no Android:** corrigida a geração do HTML com `String.raw`, preservando as barras das expressões regulares do runtime que antes chegavam sintaticamente inválidas à WebView. O HTML inline volta a usar `originWhitelist={['*']}`, como exigido pela API para fontes `source={{ html }}`, e o handshake `READY` agora roda pelo `injectedJavaScript` após a ponte nativa estar disponível. A CSP, o bloqueio de navegação externa e as restrições de acesso ao filesystem continuam ativos.
- **Mobile — Autor em negrito com cores por tema nos detalhes (Android):** alteração do peso da fonte do autor para negrito (`fontWeight: '700'`) e cor dinâmica (`heroAuthorColor`): branco (`#ffffff`) no tema escuro (Dark) e preto (`#000000`) nos temas claro (Light) e sépia (Sepia) na tela `BookDetailScreen`.
- **Mobile — Removido formato do livro nos detalhes (Android):** remoção da exibição do formato (PDF ou EPUB) que aparecia logo abaixo do nome/título do livro na tela `BookDetailScreen`.
- **Mobile — Margens do Leitor EPUB (Android):** ajuste das margens laterais para um valor natural e discreto (14px). O container `#viewer` é dimensionado e posicionado explicitamente com base nos insets da tela (`width = window.innerWidth - left - right` e `left = offset`), mantendo o aproveitamento de mais de 93% da largura da tela sem deixar o texto afunilado ou estranhamente centralizado.
- **Mobile — Leitor EPUB (Android):** correção na inicialização de arquivos EPUB no WebView. Os scripts `JSZip` (v3.10.1) e `epub.js` (v0.3.93) foram vendorizados localmente (`epubVendorScript.ts`) eliminando dependência da CDN externa para leitura 100% offline. Abertura do livro otimizada para converter Base64 diretamente em `ArrayBuffer` em memória via `window.atob()`, evitando bloqueios CORS/Same-Origin no `fetch('file://')` do Android WebView e eliminando timeouts no carregamento.

### Adicionado
- **Mobile — limpeza de metadados no editor (Android):** novo botão destrutivo
  com confirmação remove autor, ano e sinopse, mantendo título, tags,
  avaliação, capa e progresso de leitura.
- **Mobile — busca de metadados via Gemini (Android):** busca individual pelo
  menu de três pontos e busca em lote pela seção Biblioteca das Configurações,
  com introdução na primeira utilização, seleção de até 10 obras, progresso
  sequencial, prévia, cache positivo por fingerprint/idioma e aplicação
  explícita de título, autor, ano e sinopse. A chave migra do AsyncStorage para
  `expo-secure-store`; o fluxo usa REST direto, schema JSON e fallback de
  modelos sem alterar os arquivos PDF/EPUB.
- **Mobile — configurações de exibição do leitor EPUB (Android/iOS):** novo bottom sheet acessível pela barra superior com alternância ao vivo entre rolagem contínua e paginação, intenção persistida de coluna dupla aplicada somente em modo paginado e orientação horizontal, seleção com prévia entre fontes serifada, sem serifa e monoespaçada, e quatro pesos de fonte. As preferências ficam locais ao dispositivo em `AsyncStorage`; orientação, colunas e tipografia atualizam a `rendition` existente no locator atual, enquanto somente a troca entre rolagem e paginação recria o gerenciador exigido pelo epub.js. O modo de rolagem preserva o scroll vertical natural e desativa gestos/toques laterais de virada de página.
- **Mobile — F2 do novo leitor EPUB (Android/iOS):** progresso e marcadores duráveis em `expo-sqlite`, com migration transacional e locators discriminados preparados para EPUB/PDF. O runtime EPUB agora emite `RELOCATE`, aceita `GO_TO_LOCATOR` e restaura na ordem CFI, `spineHref + progressionInSection` e trecho textual. O progresso permanece transitório durante a navegação, grava com debounce de 1 segundo e faz flush ao entrar em background ou fechar o leitor; marcadores podem ser criados, listados, acessados e removidos por tombstone com timestamps.
- **Mobile — navegação EPUB pelos botões de volume:** enquanto o leitor EPUB está aberto no Android, `Volume +` avança uma página e `Volume -` retrocede uma página. Os eventos físicos são consumidos pela Activity para não alterar o volume do aparelho; ao sair do leitor, o controle de volume normal é restaurado.
- **Mobile — F1 do novo leitor EPUB (Android/iOS):** runtime local minimo com JSZip 3.10.1 + `epub.js` 0.3.93, bridge JSON v1 tipada e limitada a `READY`, `OPEN_BOOK`, `BOOK_OPENED`, `NEXT`, `PREVIOUS`, `LINK_PRESSED`, `CLOSE_BOOK` e `ERROR`, fila de inicializacao com no maximo 8 comandos, controles nativos de pagina anterior/proxima e encerramento explicito do livro ao desmontar o leitor. O arquivo aberto e copiado para `Paths.document/reader-books`, a leitura integral fica limitada a 16 MiB com erro controlado para arquivos maiores e o pico de memoria temporario e estimado no log.
- **Mobile — Gesto de toque longo de 1.25s e Modal de Listas (Android):** suporte a gesto de toque longo configurado para 1.25 segundos (`delayLongPress={1250}`) nos cards de livros (`BookCard` e `BookCardContinue`). Ao pressionar um livro, abre o modal `BookListModal` em folha inferior permitindo marcar/desmarcar o item rapidamente nos Favoritos ou em qualquer lista customizada criada pelo usuário.
- **Mobile — Busca flexível e insensível a acentos e pontuação (Android):** implementação do utilitário `fuzzySearch` com normalização Unicode NFD, remoção de caracteres de pontuação e diacríticos. Permite encontrar livros mesmo com termos parciais ou sem caracteres especiais (ex.: "xmen" localiza "X-Men", "o ladrao" localiza "O Ladrão de Raios").
- **Mobile — Margens e Safe Area para EPUB (Android):** cálculo dinâmico de recuos seguros (`useSafeAreaInsets`) no leitor EPUB. O texto é automaticamente afastado da câmera frontal (notch, furo de tela ou ilha dinâmica), da barra inferior de gestos e do contorno curvo das telas de qualquer modelo de celular. Cabeçalho superior e rodapé de progresso também ajustados para nunca sobrepor elementos do sistema.
- **Mobile M6 — Leitores PDF e EPUB (Android):** refatoração completa dos leitores mobile. **PDF:** indicador de carregamento, estado de erro com mensagem amigável, callbacks robustos de `onLoadComplete`/`onPageChanged` e restauração da última página lida. **EPUB:** zonas de toque integradas na WebView (25% esquerda = página anterior, 25% direita = próxima página, 50% central = toggle das barras), spinner de carregamento visível até o epub.js renderizar o conteúdo, callback `onCenterTap` para controlar a UI do React Native de dentro do iframe, fundo do body sincronizado com o tema ativo e tratamento de erros de abertura/renderização. **ReaderScreen:** integração das zonas de toque do EPUB via `onCenterTap`, manutenção do `Pressable` wrapper para toggle no PDF, barra de progresso, informação de página/porcentagem e modal de configurações de leitura (tamanho de fonte, espaçamento de linha, tema e reset) preservados.
- **Mobile M5 / PB2 / PB3 / F3 — Detalhes e metadados do livro (Android):** nova tela `BookDetailScreen` acessível ao tocar em qualquer livro ou volume da biblioteca e das listas. Exibição de capa em alta definição com fallback, título, autor, ano, formato (PDF/EPUB/Série), tamanho do arquivo, avaliação por 5 estrelas interativas, progresso de leitura, tags e sinopse. Ações de leitura imediata ("Ler Agora" / "Continuar Lendo"), alternância de status ("Marcar como Lido" / "Marcar como Não Lido") e listagem de capítulos/volumes para séries. Modal de edição de metadados permitindo editar título, autor, ano, sinopse, tags, avaliação e alterar a capa com suporte a seletor de imagens local (`expo-document-picker`) e recurso de restaurar a capa original do arquivo (`coverOriginalPath` / F3). Preservação de metadados editados pelo usuário durante novos rescans e enfileiramento na outbox de sincronização offline.
- **Mobile M4 / PB4 — Listas customizadas e gerenciamento de favoritos (Android):** criação, renomeação e exclusão de listas customizadas na aba Listas. Detalhes de coleção com visualização dos livros da lista, modal de gerenciamento/seleção de livros com busca em tempo real, suporte para listas fixas (Séries/Mangás, Lidos, Não lidos, Favoritos) e enfileiramento na outbox de sincronização offline-first.
- **Mobile M3 — Busca e ordenação na biblioteca (Android):** campo de busca por título/autor e seletor de ordenação (título, recentes, avaliação, progresso) integrados à tela Biblioteca. A seção "Continuar lendo" é ocultada durante a busca; estado de lista vazia diferencia biblioteca vazia de busca sem resultados. Traduções adicionadas em pt-BR, en e es (`library.search`, `library.sortBy`, `library.sortName`, `library.sortRecent`, `library.sortRating`, `library.sortProgress`, `library.noResults`, `library.noResultsHint`). Novo componente `SearchSortBar` com bottom-sheet de seleção de ordenação.
- Supabase Auth no desktop e Android: cadastro por email/senha, login, Google OAuth, magic link, confirmação por email, recuperação e alteração de senha, logout e sessão persistida.
- No desktop, login e cadastro com Google abrem no navegador padrão e solicitam explicitamente a seleção da conta antes de retornar ao Krumer.
- No Android, Google Sign-In usa o seletor nativo de contas via Google Play Services e troca o ID token diretamente por uma sessão Supabase, sem abrir o navegador.
- Nova seção **Conta** nas Configurações das duas plataformas, integrada aos temas existentes.
- Deep link `krumer://auth/callback` para confirmação de cadastro, magic link e recuperação de senha.
- Sessão desktop protegida com `Electron.safeStorage`; no Android, persistência e refresh seguem o ciclo de vida do app via `AsyncStorage`.
- Traduções da autenticação nos 10 idiomas do desktop e nos 3 idiomas atualmente disponíveis no mobile.
- Schema remoto de sincronização no Supabase para perfis, identidade por fingerprint, progresso de leitura, listas e memberships.
- Migrations versionadas em `supabase/migrations/`, com índices para pull incremental e timestamps canônicos do servidor.
- Outbox SQLite offline-first no desktop para progresso, estado lido, avaliação, listas e favoritos.
- Coalescência da outbox: writes repetidos da mesma entidade mantêm somente o estado pendente mais recente.
- Motor de sincronização bidirecional no desktop (`backend/sync_service.py`) e Android (`mobile/src/sync/`), com backfill inicial, push/pull paginado e retry exponencial.
- RPC `merge_reading_progress` no Postgres: maior progresso vence atomicamente; avaliação usa a gravação mais recente recebida.
- Tombstones e UUIDs estáveis para listas e favoritos; memberships são reconciliadas por fingerprint.
- Progresso remoto de livros ainda não escaneados fica pendente localmente e é aplicado quando o arquivo aparece.
- Detecção de conectividade/foco no Electron e `NetInfo` + `AppState` no Android, com status discreto de sync nas Configurações.
- Testes locais do motor de sync e teste SQL reproduzível para a estrutura de RLS.

### Segurança
- O runtime EPUB usa CSP local, valida versao/tipo/payload de cada mensagem, bloqueia navegacao arbitraria e desativa acesso generico da WebView ao filesystem; links `http`, `https`, `mailto` e `tel` sao interceptados e abertos somente pelo shell React Native.
- Cliente usa somente a chave publishable do Supabase; nenhuma `service_role`/secret key é distribuída.
- Tokens da sessão Electron permanecem no processo principal e não são expostos ao renderer.
- URLs de autorização OAuth são validadas contra a origem do projeto Supabase antes de serem abertas externamente.
- Deep links são aceitos somente no endpoint `krumer://auth/callback`.
- Dependências de autenticação fixadas no lockfile (`@supabase/supabase-js` 2.112.3 e `react-native-url-polyfill` 4.0.0 no mobile).
- Google Sign-In nativo fixado em `@react-native-google-signin/google-signin` 16.1.4; requer development build, não Expo Go.
- Todas as tabelas remotas de sync usam RLS por `auth.uid()`, quatro policies por operação e grants mínimos somente para `authenticated`.
- Memberships usam FK composto `(user_id, list_id)`, impedindo associação cruzada entre usuários mesmo com UUID conhecido.
- O token de acesso do desktop chega ao FastAPI apenas por canal localhost autenticado com segredo efêmero; refresh token continua exclusivo do processo principal Electron.

### Sincronização
- Implementação das fases 0–4 no código: migration/RLS, outboxes, push, pull, conflitos, conectividade, status, prune e paginação para desktop e Android. A aplicação da migration e a configuração dos provedores de Auth são etapas de deploy.
- TypeScript do mobile validado após a integração da sincronização; o build Android nativo de desenvolvimento ainda precisa ser executado em ambiente configurado.

### Alterado
- **Visibilidade do fundo com capa nos temas Claro e Sépia (Mobile e Desktop):** ajustada a opacidade e o gradiente do backdrop da capa desfocada no cabeçalho da tela de detalhes (`BookDetailScreen` no mobile e `library.css` no desktop). Nos temas claro e sépia, a opacidade foi elevada (de 0.3 para 0.65/0.68 no mobile e ajustes de `brightness` no desktop) e a transição do gradiente foi estendida suavemente, tornando o fundo com a arte da capa perfeitamente visível, vibrante e harmonioso mantendo a legibilidade do texto.
- **Cor da estrela de avaliação vazia nos temas Claro e Sépia (Mobile e Desktop):** mantido o design e formato original da estrela preenchida (`strokeWidth` 1.5, preenchimento sólido `fill` igual ao `color`), ajustando o tom do cinza para um tom um pouco mais escuro e definido (`#a8acb5` no tema Claro e `#bfae88` no tema Sépia, mantendo `#414141` no escuro), garantindo visibilidade e contraste perfeitos.

### Corrigido
- **Compilação Java de `@react-native-community/netinfo` (Android):** corrigido o script `mobile/scripts/fix-netinfo-gradle9.cjs` que aplicava o plugin `com.facebook.react` incondicionalmente no `build.gradle` do NetInfo, o que forçava o modo New Architecture e causava erro de símbolo ausente (`NativeRNCNetInfoSpec`). A aplicação do plugin e suas regras de ordenação de tarefas codegen foram condicionadas a `isNewArchitectureEnabled()`.
- Build Android com Expo SDK 57: removida a tentativa obsoleta de desativar a Nova Arquitetura, dependências Expo alinhadas à matriz do SDK e paralelismo nativo limitado para evitar falhas de codegen/CMake e falta de memória.
- Bridge de sincronização no desktop agora valida a prontidão pelo canal autenticado e seleciona automaticamente outra porta local quando a 8765 já está ocupada, evitando respostas 403 de um backend residual.
- Propagação da sessão Supabase para o FastAPI aguarda a bridge ficar pronta, eliminando o `ECONNREFUSED` transitório durante a inicialização do desktop.
- Backend FastAPI iniciado pelo Electron agora roda em processo único por padrão; o reloader do Uvicorn fica opt-in, evitando o travamento do subprocesso no Windows e o timeout da bridge de sync.

---

## [1.3.0] — atual

### Adicionado
- F1: Contador de itens recursivo — soma todos os livros dentro de subpastas/coleções
- F2: Menu de Atalhos nas Configurações — nova seção que renderiza o `shortcutsMap` centralizado em `app.js`, com suporte a múltiplas combinações de tecla por ação, organizado por contexto (Geral, Biblioteca, Leitura)
- F3: Restauração de capa original na edição de metadados via `cover_original_path`
- F4: Rescan automático ao sair da leitura ou trocar de aba
- F5: Seleção de idioma no onboarding (step 0)
- F6: Toggle de modo de visualização de capítulos — "Somente Título" ou "Título + Capa"
- F6: Preferência `krumer_chapter_view` persistida via `localStorage`
- F7: Tela de atualização com changelog via GitHub Releases API — renderiza o `body` (Markdown) da release, com estados de loading/fallback e notificação exibida uma única vez por versão

### Corrigido
- Sincronização de status de leitura entre livros pai e filhos (séries)
- Restauração de capa original em séries: agora usa a capa original do primeiro capítulo e força atualização visual após salvar
- Cache de capas originais já existentes não é mais tratado como ausência de capa, evitando placeholders/capas incorretas em rescans
- Capas de séries legadas apontando para outro livro são reparadas no scan, sem substituir capas personalizadas
- Cache do navegador não reutiliza mais a imagem anterior quando uma capa é restaurada ou a biblioteca é escaneada
- Upload de capa e restauração atualizam o item gravado pelo backend imediatamente; o re-scan incremental também preserva capas personalizadas

### Mobile (Android) — em desenvolvimento
- Base do app Android em `mobile/` (React Native + Expo): onboarding (idioma/tema/pasta/API key), abas Biblioteca/Listas/Configurações, biblioteca com "Continuar lendo" e grid de capas, listas fixas, scanner local de PDF/EPUB, extração de capas, leitor PDF via `react-native-pdf` e EPUB via WebView + epub.js, 3 temas e i18n parcial (3 de 10 idiomas).
- Ainda não publicado. Roadmap de paridade com o desktop v1.3.0 (PB1–PB6 + F1–F7 para Android) em `PLANNING.md`.

---

## [1.2.0]

### Adicionado
- Coluna `file_size` em `Item`
- Tabela `archived_items` — snapshot JSON de itens removidos, restaurados por fingerprint (`tipo|basename|tamanho`)
- Tabela `user_lists` e `list_items` — listas customizadas com suporte a lista padrão "Favoritos"
- Coluna `is_default` em `user_lists`
- Seed automático da lista "Favoritos" no startup
- Suporte a temas escuro, claro e sépia no leitor EPUB
- Ajuste de tamanho de fonte no leitor EPUB
- Tela cheia no leitor PDF e EPUB
- Sistema I18N com `i18n.js` e suporte a 10 idiomas de sinopse
- Reescaneamento rápido (botão dedicado sem rediálogos)
- Listas personalizadas de usuário
- Tags e avaliações (1–5 estrelas)
- Extração automática de capas durante a varredura
- Busca e ordenação (nome, data, avaliação, progresso)
- Verificação diária de atualizações com barra de progresso
- CI via GitHub Actions (Windows NSIS, Linux AppImage + deb)

### Corrigido
- Migrations inline com `try/except` no `lifespan` para evitar erros em bancos existentes

---

## [1.1.0]

### Adicionado
- Leitor de EPUB com epub.js
- Metadados automáticos via Google Gemini API (2.5 Flash / 2.0 Flash)
- Progresso de leitura salvo por arquivo (página, percentual, CFI para EPUB)
- Suporte a séries: pastas com capítulos agrupados automaticamente
- Modos de leitura PDF: horizontal (página única) e vertical (rolagem contínua)
- Tradução de sinopses para 10 idiomas nas Configurações

### Corrigido
- Problema com SmartScreen no Windows (assinatura do instalador)

---

## [1.0.0] — lançamento público

### Adicionado
- Estrutura base Electron + FastAPI
- Escaneamento de pasta com detecção de PDF e EPUB
- Leitor de PDF com PDF.js
- Extração de metadados dos arquivos
- Banco de dados SQLite via SQLAlchemy
- Empacotamento com PyInstaller (`krumer-backend.exe`)
- Instalador Windows via electron-builder (NSIS)
- Publicação de releases no GitHub com `electron-updater`
- README em pt-BR com instruções de instalação e uso

---

<!-- 
Ao lançar uma nova versão:
1. Renomeie [Unreleased] para [X.Y.Z] com a data
2. Crie novo bloco [Unreleased] vazio no topo
3. Use: feat → Adicionado, fix → Corrigido, refactor → Alterado, chore → Infraestrutura
-->
-->
