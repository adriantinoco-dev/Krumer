# Changelog — Krumer

Todas as mudanças relevantes do projeto são registradas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Unreleased]

### Adicionado
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

### Corrigido
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
