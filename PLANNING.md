# Krumer — Planning

> Roadmap de features, decisões de arquitetura e estado atual do projeto.
> Atualizar este arquivo a cada decisão relevante de design ou mudança de escopo.

---

## Status geral

**Versão atual:** 1.2.0  
**Branch principal:** `main`  
**Plataforma primária:** Windows (NSIS). Linux (AppImage + deb) suportado via CI.

---

## Features planejadas

### Legenda de status
- `[ ]` — pendente
- `[~]` — em progresso
- `[x]` — concluída

---

### F1 — Contador de itens conta livros dentro de pastas
**Status:** `[x]`  
**Complexidade:** baixa

Contador ao lado de "Minha Biblioteca" deve somar todos os livros recursivamente, incluindo os dentro de subpastas/coleções. Usar travessia DFS/BFS nos nós do tipo `book`. Atualizar após rescan.

---

### F2 — Menu de Atalhos nas Configurações
**Status:** `[x]`  
**Complexidade:** baixa

Seção "Atalhos" nas Configurações que renderiza o `shortcutsMap` (centralizado em `app.js`) em uma tabela agrupada por contexto (Geral, Biblioteca, Leitura). Somente leitura nesta fase. Qualquer novo atalho adicionado ao `shortcutsMap` deve aparecer automaticamente aqui.

---

### F3 — Restaurar capa original na edição de metadados
**Status:** `[x]`  
**Complexidade:** média

Botão "Restaurar capa original" na janela de edição de metadados. Usa o campo `cover_original_path` já presente no modelo `Item`. Desabilitado se a capa atual já é a original ou se o arquivo não tem capa embutida.

---

### F4 — Rescan automático ao sair de leitura ou mudar de aba
**Status:** `[x]`  
**Complexidade:** média-alta

Hook `onLibraryFocus` disparado ao fechar leitura ou trocar de aba. Backend: endpoint de rescan incremental comparando arquivos em disco com SQLite via hash ou `mtime`. Retorna apenas diff (adicionados/removidos). Debounce para evitar rescans duplicados. UI não deve travar — rescan é assíncrono.

---

### F5 — Seleção de idioma no Onboarding
**Status:** `[x]`  
**Complexidade:** média

Tela de idioma como `step 0` do onboarding. Sistema I18N via `i18n.js` já existe. Adicionar step antes do fluxo atual. Persiste em `localStorage` ou `electron-store`. Mudança de idioma nas Configurações recarrega strings sem reiniciar (ou com reinício mínimo).

---

### F6 — Novo estilo de visualização de capítulos (Título ou Título + Capa)
**Status:** `[x]`  
**Complexidade:** média

Toggle na seção "Geral" das Configurações. Modos: `'title'` (lista simples) e `'title+cover'` (grid com miniatura). Controlado por `window.chapterViewMode`. Persistido via `localStorage` (`krumer_chapter_view`) com precedência sobre Setting do backend.

---

### F7 — Tela de atualização com changelog de novas features
**Status:** `[x]`  
**Complexidade:** média

Refatorar tela de notificação de atualização para buscar dados via GitHub Releases API (`GET /repos/adriantinoco-dev/Krumer/releases/latest`). Exibir `tag_name`, `name` e `body` (Markdown) renderizados. Estados de loading e fallback. Notificação exibida apenas uma vez por versão.

---

## Roadmap de longo prazo (README)

- [ ] Suporte a CBZ / CBR
- [ ] Sincronização de progresso entre dispositivos
- [ ] Exportar biblioteca como CSV / JSON
- [~] Versão Android — React Native (repositório separado, consome a API FastAPI do backend)

---

## Decisões de arquitetura

### Por que vanilla JS e sem bundler?
Preferência deliberada. Reduz complexidade de toolchain, mantém o projeto simples de auditar e modificar. Não mudar isso.

### Por que FastAPI + SQLite e não Electron puro com Node?
Backend Python permite reusar libs de processamento de PDF/EPUB (PyMuPDF, EbookLib) sem wrappers. SQLite via SQLAlchemy é simples e funciona offline sem configuração.

### Por que migrations inline e não Alembic?
Projeto solo, banco local por usuário. Alembic adicionaria overhead desnecessário. Migrations via `ALTER TABLE` com `try/except` no `lifespan` do FastAPI funcionam bem.

### Empacotamento do backend
PyInstaller gera `krumer-backend.exe` incluído no bundle do Electron via `extraResources`. Em dev, o backend roda como script Python normal via venv.

### Mobile Android — React Native
Decisão: React Native (não Capacitor). App Android separado que consome a mesma API FastAPI do backend. O backend pode rodar localmente no dispositivo (via Termux) ou em rede local apontando para a máquina desktop.

### Persistência de configurações
Duas camadas coexistem:
- `localStorage` no renderer (preferências de UI, rápidas)
- Tabela `settings` no SQLite via API (preferências que o backend precisa conhecer)
- `localStorage` tem precedência quando ambas existem

---

## Notas de contexto

- O arquivo `krumer-features.md` contém a spec completa de cada feature (F1–F8) com implementação detalhada e critérios de conclusão.
- Releases publicadas no GitHub com CI via `.github/workflows/build.yml`.
- `autoUpdater` verifica atualizações diariamente; download manual (não automático); instala ao fechar.
