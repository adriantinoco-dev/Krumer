# Krumer — Planning

> Roadmap de features, decisões de arquitetura e estado atual do projeto.
> Atualizar este arquivo a cada decisão relevante de design ou mudança de escopo.

---

## Status geral

**Versão atual:** 1.2.0  
**Branch principal:** `main`  
**Plataforma primária:** Windows (NSIS). Linux (AppImage + deb) suportado via CI.
**Mobile:** Android com React Native + Expo Go, em `mobile/`.

---

## Features planejadas

### Legenda de status
- `[ ]` — pendente
- `[~]` — em progresso
- `[x]` — concluída

---

## Roadmap de longo prazo (README)

- [ ] Suporte a CBZ / CBR
- [ ] Sincronização de progresso entre dispositivos via Firebase
- [ ] Exportar biblioteca como CSV / JSON
- [~] Versão Android — React Native + Expo Go em `mobile/`, no mesmo repositório

---

## Features mobile planejadas

### M1 — Base Expo Go e estrutura do app
**Status:** `[~]`

Criar a versão Android em `mobile/` usando React Native com Expo Go. O app deve manter dependências isoladas do desktop e seguir uma estrutura por domínio: API, modelos, telas, componentes, leitores, tema, i18n, storage e navegação.

### M2 — Onboarding mobile
**Status:** `[ ]`

Fluxo inicial:
- escolher idioma;
- escolher tema;
- escolher pasta da biblioteca;
- escanear/importar a biblioteca;
- entrar na tela principal.

O onboarding deve seguir a identidade visual dark/minimalista do desktop, adaptada para toque e telas pequenas.

### M3 — Biblioteca mobile
**Status:** `[ ]`

Tela principal equivalente a "Minha Biblioteca" no desktop:
- seção "Continuar lendo" no topo;
- grid de capas abaixo;
- busca por título/autor;
- ordenação por título, recentes, avaliação e progresso;
- visual fiel ao desktop, mas com ergonomia mobile.

Referência futura: pode ser adicionado modo lista, mas o MVP usa grid de capas.

### M4 — Listas mobile
**Status:** `[ ]`

A aba "Listas" deve conter:
- Séries/Mangás;
- Lidos;
- Não lidos;
- Favoritos;
- listas customizadas;
- opção de criar listas.

Também deve permitir adicionar/remover itens de listas e gerenciar favoritos. (favoritos, series/mangas, lidos e não lidos são fixos. Portanto não podem ser excluidos)

### M5 — Detalhes e metadados
**Status:** `[ ]`

Tela de detalhes baseada no desktop:
- capa;
- título;
- autor;
- ano;
- sinopse;
- tags;
- avaliação;
- progresso;
- capítulos/volumes quando houver;
- marcar como lido/não lido.

Edição mobile:
- editar título;
- editar autor;
- editar ano;
- editar sinopse;
- editar tags;
- editar avaliação;
- editar capa;
- restaurar capa original;
- não editar editora no mobile.

### M6 — Leitores PDF/EPUB
**Status:** `[ ]`

Primeira abordagem: leitores via WebView.

PDF e EPUB devem:
- abrir arquivos da pasta selecionada;
- salvar progresso;
- restaurar posição;
- respeitar tema;
- ter controles próprios para mobile.

Se WebView não entregar boa experiência, testar bibliotecas nativas depois.

### M7 — Gemini no mobile
**Status:** `[ ]`

Implementar busca e aplicação de metadados via Gemini como no desktop:
- configurar chave;
- buscar metadados de obras selecionadas;
- aplicar resultados;
- respeitar limites e mensagens de erro;
- reaproveitar endpoints existentes do backend sempre que possível.

### M8 — Temas e idiomas
**Status:** `[ ]`

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
**Status:** `[ ]`

Implementar cache básico para melhorar uso sem conexão imediata:
- última biblioteca carregada;
- metadados principais;
- capas já vistas;
- preferências locais.

Offline real com sincronização fica para etapa futura.

### M10 — Sincronização futura
**Status:** `[ ]`

Futuramente, implementar sincronização via Firebase:
- progresso entre dispositivos;
- biblioteca/metadados quando aplicável;
- resolução de conflitos;
- autenticação, se necessária.

Não implementar Firebase no MVP.

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

No MVP, o mobile deve funcionar de forma semelhante ao desktop: o usuário seleciona uma pasta contendo livros com a mesma estrutura descrita no README, e o app escaneia/importa essa biblioteca. Futuramente haverá sincronização via Firebase, mas isso não entra na primeira fase.

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
