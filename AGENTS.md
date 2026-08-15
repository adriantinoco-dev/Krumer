# Krumer

Gerenciador de biblioteca pessoal desktop para leitura de livros, HQs e quadrinhos.
Projeto pessoal solo desenvolvido por adriantinoco-dev.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Desktop | Electron 43+ |
| Backend | Python · FastAPI · SQLAlchemy · SQLite |
| Leitura de PDF | PyMuPDF (fitz) · PDF.js |
| Leitura de EPUB | EbookLib · epub.js |
| Metadados com IA | Google Gemini API (2.5 Flash / 2.0 Flash) via `google-genai` |
| Frontend | HTML · CSS · JavaScript (vanilla) |
| Atualizações | electron-updater |
| Mobile (Android) | React Native |

**Versão atual:** 1.2.0

---

## Estrutura do projeto

```
Krumer/
├── main.js                  # Processo principal Electron (IPC, autoUpdater, spawn do backend)
├── preload.js               # Bridge segura renderer ↔ main
├── package.json
├── krumer-backend.spec      # Spec do PyInstaller para empacotar o backend
├── backend/
│   ├── main.py              # FastAPI app — todos os endpoints REST
│   ├── models.py            # SQLAlchemy ORM + schemas Pydantic
│   ├── database.py          # Engine SQLite, COVERS_DIR, BACKGROUNDS_DIR
│   ├── scanner.py           # Varredura de pastas, detecção de livros e séries
│   ├── metadata.py          # Extração de capa e metadados do arquivo
│   ├── metadata_service.py  # Integração Gemini API
│   ├── archive.py           # Arquivo morto: arquiva e restaura itens removidos
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── vendor/
    │   └── marked.min.js    # Parser Markdown (GFM) vendorizado, usado no changelog da tela de update
    ├── js/
    │   ├── app.js           # AppController principal, shortcutsMap global
    │   ├── api.js           # LibraryAPI — todas as chamadas ao backend
    │   ├── library.js       # LibraryManager — renderização da biblioteca
    │   ├── metadata.js      # MetadataManager — edição de metadados
    │   ├── i18n.js          # Sistema I18N próprio (traduções inline, 10 idiomas)
    │   ├── reader-pdf.js    # Leitor PDF (PDF.js)
    │   ├── reader-epub.js   # Leitor EPUB (epub.js)
    │   └── updater.js       # Lógica de atualização automática
    └── styles/
        ├── main.css
        ├── library.css
        ├── reader.css
        ├── reader-epub.css
        ├── settings.css
        └── onboarding.css
```

---

## Modelos de dados (SQLite)

- **Item** — livro, série, capítulo, comic ou graphic novel. Campos relevantes: `type`, `path`, `cover_path`, `cover_original_path`, `parent_id`, `is_read`, `rating` (1–5), `file_size`.
- **Progress** — progresso por arquivo: `progress_pct`, `current_page`, `total_pages`, `cfi` (EPUB).
- **Tag** — many-to-many com Item via `item_tags`.
- **UserList** — listas customizadas; `is_default=True` → lista "Favoritos".
- **ArchivedItem** — snapshot JSON de itens removidos, restaurados por fingerprint (`tipo|basename|tamanho`).
- **Setting** — chave/valor para configurações do app.

Migrations inline em `main.py` via `ALTER TABLE` com try/except.

---

## Backend — padrões

- FastAPI rodando em processo filho spawned pelo Electron via `child_process.spawn`.
- Em produção, usa executável compilado pelo PyInstaller (`krumer-backend.exe`). Em dev, usa Python do venv.
- Backend escuta em porta local; frontend se comunica via `http://localhost:{porta}`.
- Todas as rotas REST em `backend/main.py`. Não criar arquivos de rotas separados — manter tudo em `main.py`.
- Migrations são sempre inline no `lifespan` com `try/except` (sem Alembic).
- Cobertura de testes em `test_backend.py` e `test_metadata_service.py`.

---

## Frontend — padrões

- **Sem frameworks JS.** Vanilla JS puro — sem React, Vue, Angular ou similares.
- **Sem bundler.** Arquivos JS carregados diretamente no HTML via `<script>`.
- `shortcutsMap` centralizado em `app.js` — todo novo atalho deve ser registrado aqui para aparecer automaticamente na seção de Atalhos (F2).
- `window.chapterViewMode` controla o modo de exibição de capítulos (`'title'` | `'title+cover'`).
- Preferências persistidas via `localStorage` (frontend) ou `Setting` no SQLite (backend) — ambas podem coexistir; localStorage tem precedência.
- Sistema I18N via `i18n.js` com traduções inline no objeto `_translations` (10 idiomas) — sem arquivos de locale separados.

---

## Estética e design

- Tema padrão: dark/minimalista.
- Temas disponíveis: escuro, claro, sépia.
- Estilo consistente com o design atual — não introduzir novos padrões visuais sem justificativa.
- Plano de fundo customizável (F8) usa as variáveis CSS `--bg-image` e `--bg-custom-overlay` (infraestrutura backend/API existente; UI de Configurações pendente).

---

## Features

Status por feature (spec completa em `krumer-features.md`, roadmap em `PLANNING.md`):

- **F1** `[x]` Contador de itens recursivo (soma livros dentro de subpastas/coleções).
- **F2** `[x]` Menu de Atalhos nas Configurações (renderiza `shortcutsMap` de `app.js`).
- **F3** `[x]` Restaurar capa original na edição de metadados (campo `cover_original_path`).
- **F4** `[x]` Rescan automático ao sair da leitura ou mudar de aba.
- **F5** `[x]` Seleção de idioma no Onboarding (step 0).
- **F6** `[x]` Modo de exibição de capítulos: "Somente Título" ou "Título + Capa" (`window.chapterViewMode`).
- **F7** `[x]` Tela de atualização com changelog via GitHub Releases API.
- **F8** `[ ]` Plano de fundo customizável (imagem) — [Em observação]; infraestrutura backend/API/CSS pronta, falta a UI de Configurações.

---

## Convenções

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- Sem dependências desnecessárias — adicionar só o que é realmente necessário.
- Sem aliases de import no Python (`from x import y as z` é evitado).
- Build desktop: Windows (NSIS), Linux (AppImage + deb). CI via GitHub Actions em `.github/workflows/build.yml`.
- Versão mobile Android em desenvolvimento com React Native (repositório separado, consome a mesma API FastAPI do backend).
- Publicação de releases no GitHub (`owner: adriantinoco-dev`, `repo: Krumer`).

---

## O que NÃO fazer

- Não sugerir React, Vue, Angular ou qualquer framework JS.
- Não introduzir bundler (webpack, vite, etc.).
- Não usar Alembic — migrations são sempre inline.
- Não criar arquivos de rotas separados no backend.
- Não adicionar dependências sem verificar se já existe solução no código atual.
- Não substituir vanilla JS por TypeScript.

---

## Arquivos de referência

- `krumer-features.md` — spec detalhada de features planejadas (F1–F8).
- `PLANNING.md` — roadmap, status e decisões de arquitetura.
- `CHANGELOG.md` — histórico de versões.
