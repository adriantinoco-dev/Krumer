# Krumer — Planning

> Roadmap de features, decisões de arquitetura e estado atual do projeto.
> Atualizar este arquivo a cada decisão relevante de design ou mudança de escopo.

---

## Status geral

**Versão atual (desktop):** 1.3.0  
**Versão mobile (Android):** 0.1.0 — em desenvolvimento  
**Branch principal:** `main`  
**Plataforma primária:** Windows (NSIS). Linux (AppImage + deb) suportado via CI.
**Mobile:** Android com React Native + Expo, em `mobile/`. PDF via PDF.js/foliate-js em WebView e EPUB via WebView + epub.js.

---

## Features planejadas

### Legenda de status
- `[ ]` — pendente
- `[~]` — em progresso
- `[x]` — concluída

---

## Roadmap de longo prazo (README)

- [ ] Suporte a CBZ / CBR
- [~] Sincronização offline-first entre dispositivos via Supabase (implementação congelada durante o beta)
- [ ] Exportar biblioteca como CSV / JSON
- [~] Versão Android — React Native + Expo em `mobile/`, no mesmo repositório (base concluída, paridade com o desktop v1.3.0 em andamento)

---

## Features mobile planejadas

### M1 — Base Expo Go e estrutura do app
**Status:** `[x]`

Criar a versão Android em `mobile/` usando React Native com Expo Go. O app deve manter dependências isoladas do desktop e seguir uma estrutura por domínio: API, modelos, telas, componentes, leitores, tema, i18n, storage e navegação.

### M2 — Onboarding mobile
**Status:** `[x]`

Fluxo inicial:
- escolher idioma;
- escolher tema;
- escolher pasta da biblioteca;
- escanear/importar a biblioteca;
- entrar na tela principal.

O onboarding deve seguir a identidade visual dark/minimalista do desktop, adaptada para toque e telas pequenas.

### M3 — Biblioteca mobile
**Status:** `[x]`

Tela principal equivalente a "Minha Biblioteca" no desktop:
- seção "Continuar lendo" no topo;
- grid de capas abaixo;
- busca por título/autor;
- ordenação por título, recentes, avaliação e progresso;
- visual fiel ao desktop, mas com ergonomia mobile.

Referência futura: pode ser adicionado modo lista, mas o MVP usa grid de capas.

### M4 — Listas mobile
**Status:** `[x]`

A aba "Listas" contém:
- Séries/Mangás;
- Lidos;
- Não lidos;
- Favoritos;
- listas customizadas;
- opção de criar, renomear e excluir listas customizadas;
- seleção e remoção de livros por lista.

(favoritos, series/mangas, lidos e não lidos são fixos. Portanto não podem ser excluídos ou renomeados)

### M5 — Detalhes e metadados
**Status:** `[x]`

Tela de detalhes baseada no desktop:
- capa;
- título;
- autor;
- ano;
- sinopse;
- avaliação;
- progresso;
- capítulos/volumes quando houver;
- marcar como lido/não lido.

Edição mobile:
- editar título;
- editar autor;
- editar ano;
- editar sinopse;
- editar avaliação;
- editar capa;
- restaurar capa original;
- não editar editora no mobile.

### M6 — Leitores PDF/EPUB
**Status:** `[x]`

Leitores já validados:
- **PDF** via PDF.js + foliate-js em WebView — paginação/scroll, zoom e ranges binários, salva página atual.
- **EPUB** via WebView + epub.js — paginado, aplica tema do app e salva posição CFI.

Ambos:
- abrem arquivos da pasta selecionada;
- salvam progresso no AsyncStorage;
- restauram posição ao reabrir;
- respeitam o tema (dark/light/sépia);
- têm controles próprios para toque (barras que se ocultam automaticamente, menu de configurações do leitor).

Dependências nativas (`react-native-webview`, thumbnails) exigem development build (`npx expo prebuild` + `npx expo run:android`).

### M7 — Gemini no mobile
**Status:** `[x]`

Busca e aplicação de metadados via Gemini implementadas no mobile Android:
- chave migrada para `expo-secure-store`, sem validação antecipada;
- busca individual e em lote (máximo de 10), com normalização, fallback,
  progresso e cache positivo por fingerprint/idioma;
- `gemini-3.6-flash` com fallback para `gemini-3.5-flash-lite`, usando resposta
  estruturada (`responseSchema`) no caminho de texto do Free Tier; Google
  Search não é enviado por padrão porque não está disponível no Free Tier dos
  modelos Gemini 3.x;
- prévia obrigatória e aplicação explícita de título, autor, ano e sinopse;
- títulos de séries preservados; o título retornado só atualiza livros avulsos;
- tratamento de offline, timeout, chave inválida, bloqueio, rate limit, JSON
  inválido, modelo indisponível e falhas parciais;
- integração local-first, sem depender dos endpoints ou IDs SQLite do desktop.

### M8 — Temas e idiomas
**Status:** `[~]` (3 temas concluídos; idiomas: 3 de 10 — expandir via F5 para Android)

Suportar os 10 idiomas do desktop:
- Português (BR);
- English;
- Español;
- Français;
- Deutsch;
- Italiano;
- 日本語;
- 中文;
- 한국어;
- Русский.

Suportar três temas:
- dark;
- branco/claro;
- sépia.

### M9 — Cache básico offline
**Status:** `[~]` (persistência base via AsyncStorage concluída; cache offline completo de capas/metadados pendente)

Implementar cache básico para melhorar uso sem conexão imediata:
- última biblioteca carregada;
- metadados principais;
- capas já vistas;
- preferências locais.

Offline real permanece local-first; a reconciliação pelo Supabase está congelada durante o beta.

### M10 — Sincronização via Supabase
**Status:** `[~]` — congelada até a pós-beta

Arquitetura detalhada em `docs/arquitetura-sync-supabase.md`. Implementar com abordagem offline-first:
- progresso entre dispositivos;
- listas e favoritos;
- resolução de conflitos;
- outbox local e RLS por usuário.

Supabase Auth permanece preparado no desktop e Android, mas está congelado durante o beta: não há login, renovação, leitura ou gravação remota. Não introduzir Firebase.

Implementação preservada no repositório: migration remota, RPC de merge monotônico, tombstones, outbox SQLite/AsyncStorage, backfill inicial, push/pull paginado, progresso órfão, backoff, conectividade e status discreto. O cliente, Auth, worker, bridge e outbox ficam desativados no beta; sessões e filas existentes são preservadas para reativação futura. Não aplicar mudanças externas no Supabase nesta fase.

---

## Android — paridade com o desktop (v1.3.0)

> Objetivo: deixar o mobile (Android) praticamente idêntico em funcionalidade ao desktop v1.3.0.
> Cada item abaixo é a versão **Android** do recurso equivalente do desktop. Implementar em ordem — as seções "Base de paridade" são pré-requisitos dos itens F1–F7 sempre que indicado.

### Já implementado no mobile (`mobile/`, versão 0.1.0)

- Onboarding (idioma/tema, pasta da biblioteca e chave Gemini).
- Abas inferiores Biblioteca / Listas / Configurações, com subtelas de configuração (Geral, Tema, API Key, Sobre).
- Biblioteca com "Continuar lendo" no topo e grid responsivo de capas.
- Listas fixas: Séries/Mangás, Lidos, Não Lidos, Favoritos (placeholder) e Para ler.
- Scanner local de `.pdf` e `.epub` com progresso visual (SAF).
- Extração de capas (EPUB via ZIP/OPF; PDF via thumbnail nativo).
- Leitores: PDF via PDF.js/foliate-js em WebView e EPUB via WebView + epub.js, com progresso persistido no AsyncStorage.
- Temas dark / light / sépia.
- i18n parcial: 3 de 10 idiomas (`en`, `pt-br`, `es`).
- Supabase Auth preparado na aba Configurações, mas congelado durante o beta; o acesso exibe aviso de indisponibilidade da nuvem.

### Base de paridade (pré-requisitos)

- **PB1** `[x]` **Busca e ordenação na biblioteca** — buscar por título/autor; ordenar por nome, data, avaliação e progresso. Igual à base do desktop.
- **PB2** `[x]` **Tela de detalhes do livro** — capa, título, autor, ano, sinopse, tags, avaliação, progresso, capítulos/volumes quando houver e marcar lido/não lido.
- **PB3** `[x]` **Edição de metadados** — título, autor, ano, sinopse, tags, avaliação e capa. **Não editar editora no mobile.** Pré-requisito do F3.
- **PB4** `[x]` **Listas customizadas + favoritos** — criar/renomear/excluir listas, adicionar/remover itens e gerenciar favoritos. Séries/Mangás, Lidos e Não Lidos são fixos e não excluíveis.
- **PB5** `[x]` **Busca de metadados via Gemini** — chave no SecureStore; busca/aplicação individual e em lote via REST direto, sem depender dos endpoints ou IDs do backend desktop.
- **PB6** `[ ]` **Sincronizar status de leitura entre pai e filhos (séries)** — espelhar o fix do v1.3.0 no desktop.

### Paridade F1–F7 (Android)

- **F1** `[ ]` **Contador de itens recursivo (Android)** — a contagem na biblioteca/listas soma os livros dentro de séries/subpastas, não só o nível raiz. Requer modelar pai/filhos (séries) e contagem recursiva.
- **F2** `[ ]` **Menu de atalhos nas Configurações (Android)** — seção listando os atalhos/gestos do app por contexto (Geral, Biblioteca, Leitura), adaptando o `shortcutsMap` do desktop para gestos/navegação mobile.
- **F3** `[x]` **Restaurar capa original (Android)** — botão na edição de metadados que volta à capa original do arquivo (equivalente ao `cover_original_path`). Requer PB3.
- **F4** `[x]` **Rescan automático (Android)** — reescanear ao sair da leitura ou voltar à biblioteca/mudar de aba, sem travar a UI.
- **F5** `[~]` **Idioma no onboarding + 10 idiomas (Android)** — expandir de 3 para os 10 idiomas do desktop (pt-BR, en, es, fr, de, it, ja, zh, ko, ru) e aplicar no onboarding e no resto do app.
- **F6** `[ ]` **Modo de visualização de capítulos (Android)** — toggle "Somente Título" ou "Título + Capa" na lista de capítulos de séries, com preferência salva localmente (equivalente ao `window.chapterViewMode`).
- **F7** `[ ]` **Tela de atualização com changelog (Android)** — notificação de nova versão com changelog via GitHub Releases, exibida uma única vez por versão (equivalente ao `marked.min.js` + GitHub Releases API do desktop).

### Ordem sugerida de implementação

1. PB1 → PB2 → PB3 (detalhes e edição) → F3
2. PB4 → PB5 → PB6
3. F1 → F2 → F4 → F5 → F6 → F7

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
Decisão: React Native com Expo Go (não Capacitor). App Android mantido no mesmo repositório, dentro de `mobile/`.

No MVP, o mobile funciona de forma semelhante ao desktop: o usuário seleciona uma pasta contendo livros com a mesma estrutura descrita no README, e o app escaneia/importa essa biblioteca. Progresso, listas e favoritos permanecem locais durante o beta; a sincronização via Supabase será reativada em fase posterior.

Durante o desenvolvimento, a URL base padrão do backend pode ser `http://localhost:8765`, com opção de configuração no app quando necessário.

Configuração Expo:
- `name`: `Krumer`;
- `slug`: `krumer`;
- `android.package`: `com.adriantinoco.krumer`.

Estrutura inicial:
- `mobile/src/api` para o cliente HTTP e chamadas REST.
- `mobile/src/models` para contratos baseados nos schemas Pydantic.
- `mobile/src/screens` para as telas principais.
- `mobile/src/components` para UI reutilizável.
- `mobile/src/readers` para leitores PDF/EPUB.
- `mobile/src/i18n`, `mobile/src/theme` e `mobile/src/storage` para traduções, tokens visuais e preferências locais.

### Navegação mobile
Navegação principal por abas inferiores:
- Biblioteca;
- Listas;
- Configurações.

A aba Biblioteca representa "Minha Biblioteca" do desktop. A aba Listas agrupa Séries/Mangás, Lidos, Não Lidos, Favoritos e listas customizadas.

### Design mobile
O visual deve permanecer bem semelhante ao desktop:
- dark/minimalista como tema padrão;
- grid de capas como apresentação principal;
- cards compactos;
- foco em leitura e organização;
- botões e áreas de toque adaptados para Android;
- nada de visual genérico de app template.

Temas obrigatórios:
- dark;
- branco/claro;
- sépia.

### Dados e arquivos no mobile
O app mobile deve trabalhar com uma pasta selecionada pelo usuário, mantendo a mesma lógica de organização do desktop:
- arquivos soltos viram livros;
- pastas com capítulos viram séries;
- PDF e EPUB são formatos centrais;
- CBZ/CBR continua no roadmap.

O escaneamento inicial é executado localmente no Android via Storage Access Framework (SAF). A pasta do celular não depende de um caminho equivalente no backend desktop; o catálogo básico e as listas do MVP são persistidos no próprio aparelho.

O scanner e os contratos de dados devem permanecer compatíveis com o backend sempre que possível.

### Persistência de configurações
Duas camadas coexistem:
- `localStorage` no renderer (preferências de UI, rápidas)
- Tabela `settings` no SQLite via API (preferências que o backend precisa conhecer)
- `localStorage` tem precedência quando ambas existem
- No mobile, preferências locais devem usar storage próprio do React Native/Expo; configurações compartilhadas devem continuar usando a API e a tabela `settings`.

---

## Notas de contexto

- O arquivo `krumer-features.md` contém a spec completa de cada feature (F1–F7) com implementação detalhada e critérios de conclusão.
- Releases publicadas no GitHub com CI via `.github/workflows/build.yml`.
- `autoUpdater` verifica atualizações diariamente; download manual (não automático); instala ao fechar.
