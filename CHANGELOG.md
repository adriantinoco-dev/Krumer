# Changelog — Krumer

Todas as mudanças relevantes do projeto são registradas aqui.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [1.2.0] — atual

### Adicionado
- F1: Contador de itens recursivo — soma todos os livros dentro de subpastas/coleções
- F2: `shortcutsMap` centralizado em `app.js` com suporte a múltiplas combinações de tecla por ação
- F3: Restauração de capa original na edição de metadados via `cover_original_path`
- F4: Rescan automático ao sair da leitura ou trocar de aba
- F5: Seleção de idioma no onboarding (step 0)
- F6: Toggle de modo de visualização de capítulos — "Somente Título" ou "Título + Capa"
- F6: Preferência `krumer_chapter_view` persistida via `localStorage`
- F7: Tela de atualização com changelog via GitHub Releases API — renderiza o `body` (Markdown) da release, com estados de loading/fallback e notificação exibida uma única vez por versão
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
