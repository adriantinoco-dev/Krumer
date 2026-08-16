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
| Mobile (Android) | React Native · Expo Go |

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
│   ├── database.py          # Engine SQLite, COVERS_DIR
│   ├── scanner.py           # Varredura de pastas, detecção de livros e séries
│   ├── metadata.py          # Extração de capa e metadados do arquivo
│   ├── metadata_service.py  # Integração Gemini API
│   ├── archive.py           # Arquivo morto: arquiva e restaura itens removidos
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── vendor/
│   │   └── marked.min.js    # Parser Markdown (GFM) vendorizado, usado no changelog da tela de update
│   ├── js/
│   │   ├── app.js           # AppController principal, shortcutsMap global
│   │   ├── api.js           # LibraryAPI — todas as chamadas ao backend
│   │   ├── library.js       # LibraryManager — renderização da biblioteca
│   │   ├── metadata.js      # MetadataManager — edição de metadados
│   │   ├── i18n.js          # Sistema I18N próprio (traduções inline, 10 idiomas)
│   │   ├── reader-pdf.js    # Leitor PDF (PDF.js)
│   │   ├── reader-epub.js   # Leitor EPUB (epub.js)
│   │   └── updater.js       # Lógica de atualização automática
│   └── styles/
│       ├── main.css
│       ├── library.css
│       ├── reader.css
│       ├── reader-epub.css
│       ├── settings.css
│       └── onboarding.css
└── mobile/                  # React Native Android, cliente da mesma API FastAPI
    ├── android/
    ├── ios/
    ├── assets/
    └── src/
        ├── api/
        ├── components/
        ├── i18n/
        ├── models/
        ├── navigation/
        ├── readers/
        ├── screens/
        ├── storage/
        └── theme/
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

## Mobile — padrões

- App Android em React Native com Expo Go, dentro de `mobile/`.
- Nome do app: `Krumer`.
- Package Android: `com.adriantinoco.krumer`.
- O mobile deve se basear na experiência desktop, mas com navegação, densidade e controles adaptados para toque.
- O MVP mobile deve permitir selecionar uma pasta local de livros no Android, usando estrutura compatível com a descrita no README.
- Durante desenvolvimento, a URL base padrão do backend pode ser `http://localhost:8765`, com configuração no app quando necessário.
- Manter o código mobile separado por domínio:
  - `mobile/src/api` — cliente HTTP e chamadas REST;
  - `mobile/src/models` — tipos/contratos equivalentes aos schemas do backend;
  - `mobile/src/screens` — telas principais;
  - `mobile/src/components` — UI reutilizável;
  - `mobile/src/navigation` — navegação;
  - `mobile/src/readers` — leitores PDF/EPUB;
  - `mobile/src/i18n` — traduções;
  - `mobile/src/theme` — tokens visuais;
  - `mobile/src/storage` — preferências/cache local.
- Navegação principal por abas inferiores:
  - Biblioteca;
  - Listas;
  - Configurações.
- A aba Biblioteca equivale a "Minha Biblioteca" do desktop, com "Continuar lendo" no topo e grid de capas abaixo.
- A aba Listas deve conter Séries/Mangás, Lidos, Não Lidos, Favoritos e listas customizadas, incluindo opção de criar listas.
- Grid de capas é o modo visual principal. Modo lista pode ser adicionado futuramente.
- Séries e capítulos devem manter os modos `'title'` e `'title+cover'`.
- Leitores PDF/EPUB devem começar por WebView. Bibliotecas nativas só devem ser testadas se WebView não entregar boa experiência.
- Busca de metadados via Gemini deve existir no mobile como no desktop.
- Edição de metadados no mobile deve permitir título, autor, ano, sinopse, tags, avaliação e capa. Não editar editora no mobile.
- Implementar cache básico offline para biblioteca, capas vistas, metadados principais e preferências. Sincronização real fica para uma fase futura.
- Firebase é decisão futura para sincronização; não introduzir Firebase no MVP.

---

## Estética e design

- Tema padrão: dark/minimalista.
- Temas disponíveis: escuro, branco/claro, sépia.
- Estilo consistente com o design atual — não introduzir novos padrões visuais sem justificativa.
- Mobile deve preservar a identidade dark/minimalista do desktop, evitando aparência genérica de template Expo/React Native.
- Suporte aos 10 idiomas do desktop: Português (BR), English, Español, Français, Deutsch, Italiano, 日本語, 中文, 한국어, Русский.

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
- **M1** `[~]` Base mobile React Native + Expo Go em `mobile/`.
- **M2** `[ ]` Onboarding mobile: idioma, tema, pasta e biblioteca.
- **M3** `[ ]` Biblioteca mobile com "Continuar lendo" e grid de capas.
- **M4** `[ ]` Aba Listas com Séries/Mangás, Lidos, Não Lidos, Favoritos e listas customizadas.
- **M5** `[ ]` Detalhes e edição mobile de metadados, exceto editora.
- **M6** `[ ]` Leitores PDF/EPUB via WebView.
- **M7** `[ ]` Busca de metadados Gemini no mobile.
- **M8** `[ ]` 10 idiomas e 3 temas no mobile.
- **M9** `[ ]` Cache básico offline.
- **M10** `[ ]` Sincronização futura via Firebase.

---

## Convenções

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- Sem dependências desnecessárias — adicionar só o que é realmente necessário.
- Sem aliases de import no Python (`from x import y as z` é evitado).
- Build desktop: Windows (NSIS), Linux (AppImage + deb). CI via GitHub Actions em `.github/workflows/build.yml`.
- Versão mobile Android em desenvolvimento com React Native + Expo Go dentro de `mobile/`, no mesmo repositório.
- Publicação de releases no GitHub (`owner: adriantinoco-dev`, `repo: Krumer`).

---

## O que NÃO fazer

- Não sugerir React, Vue, Angular ou qualquer framework JS.
- Não introduzir bundler (webpack, vite, etc.).
- Não usar Alembic — migrations são sempre inline.
- Não criar arquivos de rotas separados no backend.
- Não adicionar dependências sem verificar se já existe solução no código atual.
- Não substituir vanilla JS por TypeScript.
- Não empacotar o backend Python manualmente. O npm já cuida disso ao buildar o app.
- Não introduzir Firebase antes da fase de sincronização.
- Não trocar WebView por leitor nativo no mobile sem validar primeiro a experiência inicial.

---

## Arquivos de referência

- `krumer-features.md` — spec detalhada de features planejadas (F1–F7).
- `PLANNING.md` — roadmap, status e decisões de arquitetura.
- `CHANGELOG.md` — histórico de versões.
