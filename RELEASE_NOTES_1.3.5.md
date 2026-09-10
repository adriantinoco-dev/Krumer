# Krumer 1.3.5

## Atualização do desktop + beta do Android

Esta versão reúne a atualização do Krumer para desktop e a primeira beta pública
da versão Android. Do 1.3.2 ao 1.3.5, o projeto recebeu melhorias importantes
na experiência de leitura, na organização da biblioteca, no desempenho e na
base necessária para levar o Krumer aos dispositivos móveis.

## Desktop

- Nova visualização dos cards em **2D ou 3D**, com preferência salva nas
  configurações.
- Marcações de texto no leitor EPUB, com cores, edição e remoção das marcações.
- Melhorias nos leitores, incluindo zoom, navegação, preservação de posição e
  atalhos de teclado.
- Tela de inicialização mais estável: carregamento centralizado desde o primeiro
  quadro, progresso mais claro e transição suave para a biblioteca.
- Encerramento mais confiável do aplicativo e do backend local, especialmente no
  Windows.
- Comunicação entre o Electron e o backend mais segura e resiliente, incluindo
  seleção automática de outra porta quando a porta padrão já estiver ocupada.
- Busca de metadados atualizada para os modelos Gemini mais recentes, com
  resposta estruturada e fallback automático para outro modelo compatível.
- Melhor contraste e visibilidade das capas, avaliações e textos nos temas claro
  e sépia.
- Títulos e autores em negrito nas grades da biblioteca.

### Preparação para sincronização

A versão também inclui a base de autenticação e sincronização entre dispositivos
com Supabase, incluindo conta, outbox offline-first e reconciliação de progresso,
listas e favoritos. Esse recurso permanece **congelado durante o beta**: a
biblioteca, o progresso e as listas continuam sendo mantidos localmente, sem
envio de livros, capas ou PDFs/EPUBs para a nuvem.

## Android — beta

O Android chega como beta com uma experiência mobile inspirada no desktop:

- Onboarding para idioma, tema, pasta da biblioteca e chave da API Gemini.
- Biblioteca local com escaneamento de PDFs e EPUBs, extração de capas e grade
  responsiva para celulares e tablets.
- Busca por título ou autor e ordenação por nome, recência, avaliação e
  progresso, com busca tolerante a acentos e pontuação.
- Abas **Biblioteca**, **Listas** e **Configurações**.
- Favoritos, listas fixas e listas personalizadas, com criação, renomeação,
  exclusão e gerenciamento rápido por toque longo.
- Tela de detalhes do livro com capa, progresso, avaliação, tags, sinopse,
  capítulos/volumes e ações para ler ou marcar como lido.
- Edição de título, autor, ano, sinopse, tags, avaliação e capa, incluindo
  restauração da capa original extraída do arquivo.
- Busca de metadados com Gemini individualmente ou em lote de até 10 obras, com
  prévia antes de aplicar os resultados.

### Leitor EPUB

- Runtime local com `epub.js` e `JSZip` vendorizados, permitindo leitura offline.
- Modos de rolagem contínua e paginação.
- Coluna dupla em orientação horizontal.
- Temas escuro, claro e sépia, fontes serifada, sem serifa e monoespaciada,
  pesos de fonte e ajustes de tamanho, margens e espaçamento.
- Progresso persistente, restauração da posição e marcadores por livro.
- Navegação pelas laterais da tela e pelos botões de volume do Android.
- Interface imersiva com barras de controle discretas, progresso e configurações
  sem perder a posição atual durante mudanças de orientação ou tipografia.

### Leitor PDF

- Leitor baseado em PDF.js/foliate-js em uma WebView local, com abertura offline.
- Modos paginado e scroll, orientação retrato/paisagem e navegação por volume.
- Pinça para zoom, pan, restauração para 100% e preservação do ponto focal ao
  trocar de página ou girar o aparelho.
- Scroll virtualizado, carregamento progressivo, preloading de páginas próximas e
  transporte binário local para reduzir cópias e melhorar a abertura.
- Indicador de carregamento, progresso de abertura, página atual/total, estados
  de erro e tentativas automáticas para páginas que falharem.
- Marcadores e notas persistentes por livro, com prévia da página marcada.
- No modo scroll, manter `Volume +` ou `Volume -` pressionado continua avançando
  ou retornando pela altura visível do documento.

### Desempenho e acabamento

- Pré-aquecimento de arquivos, preferências e fontes antes da abertura do leitor.
- Cache em memória dos oito leitores mais recentes para reabertura mais rápida
  durante a sessão.
- Telas de carregamento com porcentagem durante a preparação de PDF e EPUB.
- Nova tentativa automática de extração de capas para livros que ficaram sem
  capa, sem exigir novo escaneamento.
- Ajustes de safe area, margens, sombras, barras de progresso, ícones, splash
  screen e responsividade em diferentes tamanhos de tela.
- Atualização do aplicativo pelo GitHub Releases e versão exibida corretamente
  na tela Sobre.

## Importante sobre a beta Android

- Esta é uma versão de testes para Android; alguns comportamentos ainda podem
  mudar antes da versão estável.
- A sincronização em nuvem e o login permanecem desativados durante o beta.
  Dados de biblioteca, progresso, favoritos e listas permanecem no aparelho.
- A chave Gemini é armazenada localmente e a busca de metadados continua
  opcional.
- A versão Android usa módulos nativos e deve ser instalada como build Android;
  o fluxo não é compatível com o Expo Go.
- No momento, o mobile tem traduções disponíveis em português do Brasil,
  inglês e espanhol.

## Downloads

- **Windows:** instalador `.exe`.
- **Linux:** pacotes `.AppImage` e `.deb`.
- **Android:** APK da beta.

Relate problemas encontrados na beta, principalmente nos leitores PDF/EPUB,
informando o modelo do aparelho, a versão do Android e o tipo de arquivo usado
no teste.
