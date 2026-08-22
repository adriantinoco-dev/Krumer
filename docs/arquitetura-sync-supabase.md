# Arquitetura de Sincronização — Krumer + Supabase

> **Status:** Implementado no código — a ativação em produção ainda requer aplicar a migration, executar a verificação RLS no projeto alvo e configurar os provedores de Auth no Supabase.
> **Decisão:** Supabase como backend único de auth + dados (Auth + Postgres + RLS)  
> **Escopo de sync:** progresso de leitura, listas e favoritos  
> **Plataformas:** Electron + Python (desktop), React Native/Expo (mobile)  
> **Princípio:** offline-first de verdade — todo write é local primeiro; sync remoto é background e oportunístico

---

## 1. Visão geral da decisão

### 1.1 O que foi decidido

Usar **Supabase** como único backend remoto para autenticação e persistência de dados sincronizados. Isso significa:

- **Supabase Auth** para identidade do usuário (email/senha, magic link e Google OAuth). Sem Clerk, sem serviço de auth separado.
- No desktop, Google OAuth abre no navegador padrão com seleção explícita de conta e retorna pelo deep link `krumer://auth/callback`.
- No Android, Google Sign-In abre o seletor nativo de contas e envia o ID token ao Supabase com `signInWithIdToken`, sem navegador.
- **Supabase Postgres** como fonte canônica remota dos dados sincronizados.
- **Row Level Security (RLS)** como mecanismo de isolamento por usuário — cada linha pertence a um `user_id` e só é visível/editável pelo dono.

#### Configuração externa do Google OAuth

O código cliente já está preparado. Para ativar o provedor no ambiente hospedado:

1. Criar um cliente OAuth do tipo **Web application** no Google Auth Platform.
2. Cadastrar nesse cliente a URI autorizada `https://bcwgtutmzdhkotiuymxl.supabase.co/auth/v1/callback`.
3. Criar também um cliente OAuth **Android** para `com.adriantinoco.krumer`, cadastrando os SHA-1 dos certificados de desenvolvimento e produção.
4. Ativar Google em **Supabase → Authentication → Providers**. Informar primeiro o Web Client ID, seguido do Android Client ID, e usar o Client Secret do cliente Web.
5. Definir `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` no `.env.local` mobile com o Web Client ID.
6. Manter `krumer://auth/callback` em **Authentication → URL Configuration → Redirect URLs** para desktop, confirmação por email, magic link e recuperação.

O Client Secret fica somente no painel do Supabase e nunca é incluído no aplicativo ou no repositório.

### 1.2 Por que não Clerk

| Critério | Clerk + Postgres separado | Supabase Auth nativo |
|----------|---------------------------|----------------------|
| Superfície de auth | Serviço extra, SDK extra, webhook para mapear `clerk_user_id → app_user` | Nativo, `auth.uid()` já é o `user_id` do Postgres |
| RLS | Clerk exige `JWT` custom ou lógica de aplicação para filtrar por usuário | RLS funciona out-of-the-box com o JWT do Supabase |
| Custo/complexidade | Duas faturas, dois dashboards, duplicação de sessão | Um projeto, um painel, um token |
| Offline | Clerk pressupõe validação online frequente | Supabase Auth permite sessão persistida localmente e refresh oportunístico |
| Tamanho do time | Overhead desproporcional para projeto solo | Alinhado ao princípio do projeto: sem dependências desnecessárias |

A redundância do Clerk foi o fator determinante. Ele não adiciona nada que o Supabase Auth já não entregue para o caso de uso do Krumer, e ainda obrigaria a manter lógica extra de isolamento na aplicação — exatamente o que RLS elimina.

### 1.3 O que **não** será sincronizado (nesta fase)

- **Arquivos** (PDF/EPUB) — continuam locais, derivados da pasta escaneada. Sincronizar binários está fora de escopo.
- **Capas extraídas** (`covers/`), `cover_path` customizadas — cache local, regenerável via `metadata.py:process_file_metadata_and_cover`.
- **Metadados editados** (título, autor, sinopse) e **tags** — ficam locais até segunda decisão. O snapshot de `archive.py` já cobre restauração local por fingerprint.
- **Estrutura de pastas / `Item.path`** — `path` é absoluto e específico do device (`C:\Users\...` vs `/storage/emulated/...`). Não é chave de sync.

Sincronizamos apenas **estado do usuário sobre os livros**, não os livros em si.

### 1.4 Implicação arquitetural

O backend FastAPI local (`backend/main.py`) e o SQLite (`backend/database.py:14`, `~/.librarian/librarian.db`) continuam sendo a **fonte primária** da aplicação. Supabase é **réplica remota** para reconciliação entre devices, nunca dependência de leitura/escrita síncrona.

```
App (qualquer plataforma)  ──sync──>  Supabase Postgres (canônico remoto)
       │                                       │
       └──── SQLite local (fonte primária) ────┘  (nunca bloqueia UI)
```

---

## 2. Modelo de dados

### 2.1 Mapeamento local → remoto

O SQLite atual (`backend/models.py`) já tem as entidades. O Postgres remoto espelha apenas o subconjunto sincronizável, com `user_id` obrigatório.

#### Local (SQLite) — permanece como está

- `items` (`backend/models.py:17`) — `id`, `path` (unique, local), `type`, `parent_id`, `file_size`, `cover_path`, `is_read`, `rating`, `added_at`, `last_read`
- `progress` (`backend/models.py:45`) — `item_id FK`, `file_path`, `progress_pct`, `current_page`, `total_pages`, `cfi`, `updated_at`
- `user_lists` (`backend/models.py:83`) — `id`, `name`, `sort_order`, `is_default`, `created_at`
- `list_items` (`backend/models.py:75`) — `list_id FK`, `item_id FK`, `added_at`
- `tags` + `item_tags` — local only nesta fase
- `settings` — local only
- `archived_items` — local only

#### Remoto (Supabase Postgres) — novo

> Todas as tabelas abaixo têm `user_id uuid NOT NULL REFERENCES auth.users(id)` e RLS habilitado.

**`profiles`** (opcional, mas recomendado)

```sql
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);
```

**`sync_items`** — identidade estável do livro entre devices

Problema: `Item.path` e `Item.id` (autoincrement local) não são portáveis. A chave de sync precisa ser determinística a partir do conteúdo, reaproveitando o fingerprint já usado em `archive.py:_fingerprint_key` (`backend/archive.py:20`).

```sql
create table sync_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,          -- ex: "file|nome|123456" ou "series|Nome da Serie"
  title text not null,                -- denormalizado para debug/listagem sem join local
  type text not null check (type in ('book','series','chapter','comic','graphic_novel')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, fingerprint)
);
```

`fingerprint` é a ponte entre o SQLite local e o Postgres remoto. No desktop já existe em `ArchivedItem.fingerprint`; no mobile precisará ser calculado no scanner (`mobile/src/services/libraryScanner.ts`) com a mesma regra.

**`reading_progress`** — espelho de `progress` + `Item.is_read`/`rating`

```sql
create table reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,          -- FK lógica para sync_items(user_id, fingerprint)
  progress_pct double precision not null default 0,
  current_page integer not null default 0,
  total_pages integer,
  cfi text,
  is_read boolean not null default false,
  rating smallint check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  -- garante um registro por livro por usuário
  unique (user_id, fingerprint)
);
```

Observação: `is_read` e `rating` hoje vivem em `items` (`backend/models.py:37`, `:33`). Para sync faz sentido co-localizá-los com progresso — são estado de leitura do usuário, não metadado do arquivo. O SQLite local continua com as colunas onde estão; a camada de sync faz a projeção.

**`user_lists`** (remoto)

```sql
create table user_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, name)  -- evita "Favoritos" duplicado por usuário
);
```

**`list_items`** (remoto)

```sql
create table list_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references user_lists(id) on delete cascade,
  fingerprint text not null,  -- item pertence via fingerprint, não via id local
  added_at timestamptz default now(),
  unique (list_id, fingerprint)
);
```

> Por que `fingerprint` em vez de `sync_items.id`? Porque `list_memberships` precisa ser resolvível mesmo quando o `sync_items` ainda não chegou no device (sync fora de ordem). Fingerprint é auto-contido.

### 2.2 RLS — isolamento por usuário

Todas as tabelas remotas seguem o mesmo padrão. Exemplo para `reading_progress`:

```sql
alter table reading_progress enable row level security;

create policy "Usuários só veem seu próprio progresso"
  on reading_progress for select
  using (auth.uid() = user_id);

create policy "Usuários só inserem seu próprio progresso"
  on reading_progress for insert
  with check (auth.uid() = user_id);

create policy "Usuários só atualizam seu próprio progresso"
  on reading_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Usuários só deletam seu próprio progresso"
  on reading_progress for delete
  using (auth.uid() = user_id);
```

Repetir para `sync_items`, `user_lists`, `list_memberships`, `profiles`. Nenhuma query precisa de `where user_id = ...` na aplicação — o driver Supabase já envia o JWT e o Postgres filtra.

**Armadilhas:**

- Esquecer `enable row level security` deixa a tabela aberta. Criar migration que habilita RLS antes de inserir dados.
- Políticas `for all` com `using (true)` anulam o isolamento. Revisar com `supabase --inspect`.
- Service role key nunca deve ir para o cliente (desktop/mobile). Apenas `anon` + RLS.

### 2.3 Timestamps e relógio

Todas as tabelas remotas têm `updated_at timestamptz`. O servidor Postgres é a fonte de verdade do tempo (default `now()`), mas para resolução de conflito também guardamos `client_updated_at` quando o device precisa ordenar writes offline sem confiar no relógio local. Ver §5.

### 2.4 O que não muda no SQLite local

- Nenhuma coluna `user_id` no SQLite. O SQLite continua single-user local. O `user_id` só existe na camada de sync/outbox e no Postgres.
- Migrations continuam inline em `backend/main.py:lifespan` com `try/except` (sem Alembic), conforme convenção do projeto.
- `Item.path` continua `unique` local — mas não é chave de sync.

---

## 3. Arquitetura de sync

### 3.1 Princípio offline-first

1. **Todo write é local primeiro.** `PUT /items/{id}/progress` (`backend/main.py:1032`), `PATCH /items/{id}/read`, `POST /lists`, `POST /lists/{id}/items` etc. continuam escrevendo no SQLite e retornando imediatamente. A UI nunca espera rede.
2. **Sync é background e oportunístico.** Uma camada de sincronização observa conectividade e drena uma fila local (`sync_outbox`) para o Supabase. Se offline, a fila cresce; quando voltar, drena.
3. **Leitura também é local primeiro.** Biblioteca, "Continuar lendo" (`GET /items/continue-reading`), listas — tudo vem do SQLite/AsyncStorage. Dados remotos só enriquecem o local após merge.

### 3.2 Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        APLICAÇÃO (UI)                           │
│  Electron renderer / React Native screens                        │
└──────────────┬──────────────────────────────────────────────────┘
                │ writes/reads (síncrono, sempre local)
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CAMADA LOCAL (fonte primária)                │
│  Desktop: SQLite via SQLAlchemy (backend/main.py + database.py)  │
│  Mobile:  AsyncStorage (mobile/src/storage/preferences.ts)       │
│           + SQLite local (expo-sqlite) quando PBs forem para DB │
│                                                                 │
│  Tabelas: items, progress, user_lists, list_items, settings     │
└──────────────┬──────────────────────────────────────────────────┘
               │ intercepta writes (trigger/hook)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SYNC OUTBOX (fila local durável)                │
│  Tabela local `sync_outbox` (não sincronizada):                  │
│   - id (local uuid/autoincrement)                                │
│   - entity_type: 'progress' | 'list' | 'list_membership'         │
│   - fingerprint / list_id (chave lógica)                         │
│   - operation: 'upsert' | 'delete'                               │
│   - payload: json (campos do §2)                                 │
│   - client_updated_at: timestamptz (clock local, monotônico)     │
│   - status: 'pending' | 'syncing' | 'done' | 'error'             │
│   - retry_count, last_error, created_at                          │
│                                                                 │
│  Cada write local enfileira 1 linha aqui (transação atômica com │
│  o write original). Outbox é a única fonte para o sync remoto.  │
└──────────────┬──────────────────────────────────────────────────┘
               │ drenado quando online
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SYNC ENGINE (background)                         │
│  - Observa conectividade (§4)                                    │
│  - Drena outbox em ordem (FIFO por client_updated_at)            │
│  - Faz upsert/delete no Supabase via supabase-js                 │
│  - Em caso de conflito, aplica estratégia do §5                  │
│  - Após sucesso, marca outbox como 'done' e prunes               │
│  - Pull: busca mudanças remotas (updated_at > last_sync_at)      │
│    e aplica no SQLite local (merge)                              │
└──────────────┬──────────────────────────────────────────────────┘
               │ https (quando online)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│              SUPABASE POSTGRES (réplica canônica)                │
│  Tabelas do §2 com RLS por user_id                               │
│  Sem Realtime: pull periódico e gatilhos de conectividade        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Fluxo de write (offline-first)

```
UI chama saveProgress(itemId, {progress_pct: 42, current_page: 10})
  │
  ├─► 1. Transação SQLite local:
  │      - UPDATE progress SET ... WHERE item_id = ?
  │      - INSERT INTO sync_outbox (entity_type='progress', fingerprint=?, payload=?, status='pending')
  │      COMMIT
  │      Retorna para UI imediatamente (sem await de rede)
  │
  └─► 2. Sync engine (se online):
         - SELECT * FROM sync_outbox WHERE status='pending' ORDER BY client_updated_at
         - Para cada linha: supabase.from('reading_progress').upsert(payload, {onConflict: 'user_id,fingerprint'})
         - Se ok: UPDATE sync_outbox SET status='done'
         - Se erro de rede: mantém 'pending', backoff
         - Se conflito (ex: 409 ou dado mais novo no servidor): aplica §5
```

O mesmo para listas: criar lista → `INSERT user_lists` local + `INSERT sync_outbox (entity_type='list')`; adicionar item à lista → `INSERT list_items` local + `INSERT sync_outbox (entity_type='list_membership')`.

### 3.4 Fluxo de pull (reconciliação)

```
Sync engine (online, periódico ou ao voltar de offline):
  1. Lê last_sync_at do Setting local (ex: "sync_last_pull_at")
  2. Supabase: SELECT * FROM reading_progress WHERE user_id = auth.uid() AND updated_at > last_sync_at
              SELECT * FROM user_lists WHERE user_id = auth.uid() AND updated_at > last_sync_at
              SELECT * FROM list_memberships WHERE user_id = auth.uid() AND added_at > last_sync_at
  3. Para cada linha remota:
       - Resolve fingerprint → item local (se não existir localmente, ignora membership — livro ainda não escaneado naquele device)
       - Aplica merge conforme §5
       - Atualiza SQLite local
  4. Atualiza last_sync_at = max(updated_at) visto
```

Pull e push são independentes; podem rodar em intervalos diferentes. Pull não depende de outbox.

### 3.5 Onde vive o sync engine em cada plataforma

| Plataforma | Onde roda | Detalhe |
|------------|-----------|---------|
| Desktop (Electron + Python) | `backend/sync_service.py` + task no `lifespan` de `main.py` | Usa `httpx` direto contra PostgREST/RPC e mantém o SQLite sob responsabilidade exclusiva do backend. |
| Mobile (Expo) | `mobile/src/sync/` — módulo TS com `supabase-js` | Usa AsyncStorage para outbox, cursores e pendências; `SyncCoordinator` roda pelo ciclo de vida React Native. |

Decisão recomendada: **sync engine no backend Python para desktop** (mantém `backend/main.py` como único dono do SQLite, evita concorrência Electron↔Python no arquivo `.db`). O frontend apenas lê/escreve via API local (`http://localhost:{porta}`) como já faz hoje (`frontend/js/api.js`, `mobile/src/api/client.ts:22`).

### 3.6 Diagrama de estados do outbox

```
pending ──► syncing ──► done (prune após N dias)
  ▲           │
  │           └─► error (retry com backoff exponencial)
  │                  │
  └──────────────────┘ (volta para pending após backoff)
```

- `pending` → `syncing` quando o engine pega a linha.
- `done` não é deletado imediatamente — mantém por 7 dias para debug/replay, depois prune (similar a `archive.py:_prune`).
- `error` com `retry_count` e `last_error`. Backoff: 5s, 30s, 2min, 10min, 1h (cap). Erros 4xx não-retriáveis (ex: RLS violation) marcam `error` permanente e logam.

---

## 4. Detecção de conectividade por plataforma

O sync só tenta rede quando há conectividade. Cada plataforma tem um mecanismo diferente.

### 4.1 Desktop — Electron

Electron tem duas camadas: renderer (Chromium) e main (Node) + backend Python.

**Renderer (vanilla JS):**

```js
// frontend/js/sync.js (novo)
window.addEventListener('online',  () => triggerSync());
window.addEventListener('offline', () => pauseSync());
if (navigator.onLine) triggerSync();
```

`navigator.onLine` é barato mas mente (captive portals, VPN sem internet). Serve como gatilho, não como verdade.

**Main (Node) + Python:**

- `main.js` já faz `child_process.spawn` do backend. Adicionar IPC `sync:status` entre main ↔ renderer ↔ Python.
- No Python, a própria chamada autenticada ao endpoint REST/RPC do projeto é a verificação robusta; falhas de DNS, conexão, timeout e HTTP entram no mesmo backoff do outbox. Um probe separado seria redundante e poderia indicar online enquanto a API necessária está indisponível.

- Polling de fallback: ciclo a cada 5 minutos quando autenticado, além de gatilhos por foco/online.
- Ao detectar transição `offline → online`, drenar outbox imediatamente + pull.

**Não fazer:** bloquear UI esperando rede. Sync é sempre assíncrono.

### 4.2 Mobile — Expo / React Native

Expo tem `expo-network` e `NetInfo`.

```ts
// mobile/src/sync/connectivity.ts (esboço)
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

NetInfo.addEventListener(state => {
  if (state.isConnected && state.isInternetReachable) triggerSync();
  else pauseSync();
});

AppState.addEventListener('change', next => {
  if (next === 'active') checkConnectivityAndSync();
});
```

- `isConnected` = interface de rede up; `isInternetReachable` = probe real (NetInfo faz HEAD em `https://clients3.google.com/generate_204` por padrão). Usar ambos.
- Ao voltar de background (`AppState === 'active'`), checar e sincronizar — é o equivalente mobile do "rescan ao sair da leitura" (F4).
- Bateria: não usar `BackgroundFetch` agressivo no MVP. Sync ao abrir app + ao voltar de leitura + ao mudar de aba já cobre 95% dos casos.

**Dependência:** `@react-native-community/netinfo` (já é peer de Expo, não é "dependência desnecessária" — é o padrão para conectividade).

---

## 5. Estratégia de resolução de conflito

Conflito = mesmo `fingerprint` (mesmo livro) ou mesma `list_id` alterado em dois devices offline, com sync posterior.

### 5.1 Avaliação: last-write-wins (LWW) vs merge por campo

| Estratégia | Como funciona | Prós | Contras |
|------------|---------------|------|---------|
| **LWW com timestamp** | Maior `updated_at` vence, sobrescreve tudo | Simples, determinístico, fácil de implementar com `upsert` | Perde dados: se device A avança progresso e device B adiciona rating offline, o último write apaga o campo do outro |
| **Merge por campo** | Cada campo tem seu próprio timestamp; merge pega o mais recente por campo | Preserva edições concorrentes em campos diferentes | Mais complexo, precisa `client_updated_at` por campo ou `updated_at` por coluna |
| **CRDT / OT** | Estruturas convergentes (ex: OR-Set para listas) | Correto para sets/edit concorrente | Overkill para MVP solo, complexidade desnecessária |

### 5.2 Decisão recomendada: híbrido

Diferentes entidades têm diferentes semânticas de conflito. Não usar uma estratégia única.

#### Progresso de leitura — LWW com regra de domínio "maior progresso vence"

Progresso é um **valor escalar monotônico na prática** (usuário avança, raramente volta). Conflito típico: leu até pág. 50 no celular offline e até pág. 70 no desktop offline.

- **Regra 1 (dentro do mesmo livro):** se `progress_pct` diverge, vence o **maior `progress_pct`** (ou maior `current_page` se `progress_pct` empatar). Isso é mais útil que timestamp puro — reflete intenção do usuário (continuar de onde parou mais longe).
- **Regra 2 (desempate):** se `progress_pct` igual mas `cfi`/`current_page` diverge, vence o maior `updated_at` (LWW).
- **Regra 3 (`is_read`):** `is_read = true` vence `false` se o `progress_pct` correspondente for 100. Caso contrário, LWW.
- **Regra 4 (`rating`):** LWW por `updated_at` — rating é subjetivo, último gesto do usuário vence.

Implementação no sync engine (pull e push):

```python
def merge_progress(local, remote):
    # local e remote são dicts com progress_pct, current_page, cfi, is_read, rating, updated_at
    if remote["progress_pct"] > local["progress_pct"]:
        winner = remote
    elif remote["progress_pct"] < local["progress_pct"]:
        winner = local
    else:
        winner = remote if remote["updated_at"] > local["updated_at"] else local

    # rating é independente — merge por campo
    if remote.get("rating_updated_at", remote["updated_at"]) > local.get("rating_updated_at", local["updated_at"]):
        winner["rating"] = remote["rating"]
    return winner
```

Para MVP, pode simplificar para **LWW puro com `updated_at` do servidor** e aceitar a perda marginal de um campo. A regra "maior progresso vence" é melhoria de segunda iteração, mas vale documentar desde já.

**Clock skew:** não confiar no relógio do device para `updated_at`. O `updated_at` canônico é `now()` do Postgres (servidor). O device envia `client_updated_at` apenas para ordenar outbox local; na hora do `upsert`, o servidor reescreve `updated_at`. Conflitos são resolvidos comparando `updated_at` do servidor, não do cliente.

#### Listas e favoritos — merge por união (set semantics)

Listas são **conjuntos** (`list_memberships`). Operações são `add` e `remove` de fingerprints.

- **Add concorrente:** união vence — se device A adiciona livro X e device B adiciona livro Y offline, após sync a lista contém X ∪ Y. LWW apagaria um dos adds.
- **Remove concorrente:** remove vence — se um device remove X e outro não mexe, X sai.
- **Add vs remove do mesmo item:** **remove vence** (ou LWW se timestamps muito próximos). Justificativa: remover é gesto explícito do usuário para "tirar da lista"; re-adicionar é fácil, mas re-remover um item que voltou sozinho é frustrante.

Implementação: `list_memberships` como tabela de fatos com `added_at`. Sync faz:

- Push: envia todas as linhas `pending` de `sync_outbox` para `list_memberships` (insert) ou delete.
- Pull: busca `list_memberships` remotas e reconcilia com locais por `fingerprint`. Se existe remoto mas não local e não há tombstone local recente → adiciona local. Se existe local mas não remoto e há `delete` pendente → mantém delete.

Para MVP sem tombstones, pode usar **último estado vence por lista**: comparar `user_lists.updated_at` e `list_memberships` como snapshot (enviar lista completa). Menos correto, mas aceitável para projeto solo com baixa concorrência. Documentar como limitação e evoluir para outbox por membership.

**Favoritos** é apenas `user_lists` com `is_default = true` (seed em `backend/main.py:114`). Mesma estratégia de listas. Nome "Favoritos" é fixo — RLS `unique (user_id, name)` impede duplicata.

### 5.3 Idempotência e replay

- Todas as operações de sync devem ser **idempotentes**: `upsert` com `onConflict: 'user_id,fingerprint'`, `delete` com `where fingerprint = ?` (não falha se já deletado).
- Outbox linhas `done` mantidas por 7 dias permitem replay manual se necessário (debug).
- `supabase.from(...).upsert(..., {onConflict: 'user_id,fingerprint', ignoreDuplicates: false})` garante que reenvio não duplica.

### 5.4 O que fazer quando o livro não existe no device

Se `reading_progress` remoto referencia `fingerprint` que ainda não existe localmente, o desktop guarda o estado em `pending_sync_progress` e o Android em `krumer.sync.pending-progress.v1`. Quando o scanner criar o item correspondente, o ciclo seguinte aplica o progresso. Isso evita perder progresso de um livro que só existe no outro device.

---

## 6. Riscos e limitações conhecidas

### 6.1 Fingerprint instável

- **Risco:** `fingerprint = tipo|basename|tamanho` (`backend/archive.py:20`) muda se o arquivo for re-encodado (tamanho muda) ou renomeado. Sync quebra — mesmo livro vira dois fingerprints.
- **Mitigação:** aceitar como limitação do MVP. Futuro: usar hash de conteúdo (ex: `sha256` dos primeiros/últimos N bytes) ou `file_hash` persistido no `Item`. Documentar que renomear arquivo perde vínculo de progresso sincronizado.
- **Séries:** `fingerprint = series|basename` sem tamanho — mais estável, mas renomear pasta quebra.

### 6.2 Clock skew e `updated_at`

- **Risco:** device com relógio atrasado gera `client_updated_at` no passado, perde LWW.
- **Mitigação:** `updated_at` canônico é do servidor (Postgres `now()`). Cliente nunca decide LWW baseado no próprio relógio. `client_updated_at` serve apenas para ordenar outbox local (FIFO), não para resolver conflito remoto.

### 6.3 RLS mal configurado

- **Risco:** esquecer `enable RLS` ou criar policy permissiva vaza dados entre usuários.
- **Mitigação:** checklist de deploy: `supabase db reset` + testes de RLS com dois usuários de teste (um não deve ver dados do outro). Adicionar teste automatizado (`test_sync_rls.py`) que autentica como user A e tenta ler `reading_progress` de user B → deve retornar 0 linhas.

### 6.4 Concorrência no SQLite desktop

- **Risco:** Electron renderer + Python backend acessam `librarian.db` simultaneamente (já acontece hoje, mitigado com `check_same_thread=False` em `backend/database.py:18`). Adicionar sync engine Python concorrente aumenta risco de `database is locked`.
- **Mitigação:** sync engine roda na mesma thread/event loop do backend (não processo separado), usa mesma `SessionLocal`. Outbox writes são na mesma transação do write original (atômico). Não abrir segunda conexão SQLite.

### 6.5 Tamanho do outbox e bateria

- **Risco:** sync a cada write (ao virar página) gera muitas linhas de outbox e requests.
- **Mitigação:** debounce/coalesce — `saveProgress` durante leitura pode gerar dezenas de writes por minuto. Outbox deve coalescer: se já existe `pending` para o mesmo fingerprint, **atualiza o payload** em vez de inserir nova linha. Sync só envia o último estado. Batch push a cada 10s ou 10 linhas, não a cada write.

### 6.6 Supabase como ponto único de falha

- **Risco:** Supabase fora do ar → sync falha, mas app continua funcionando (offline-first). Porém usuário pode achar que "sync quebrou" sem feedback.
- **Mitigação:** UI mostra status de sync discreto (ex: ícone na sidebar, similar ao `electron-updater`): "Sincronizado", "Pendente (offline)", "Erro". Nunca bloquear leitura.

### 6.7 Migração de dados existentes

- **Risco:** usuários já têm `librarian.db` com progresso/listas sem `user_id`. Ao logar pela primeira vez, precisa fazer **backfill**: enviar todo estado local para Supabase como `initial sync`.
- **Mitigação:** no primeiro login, sync engine faz `push` completo (todos os `progress` + `user_lists` + `list_memberships` locais) antes do primeiro `pull`. Marcar `Setting` `sync_initial_done = true` para não repetir.

---

## 7. Próximos passos / fases de implementação

### Fase 0 — Preparação

- [ ] Criar/conferir o projeto Supabase e configurar Auth (email/senha, magic link e Google OAuth) no ambiente hospedado.
- [x] Escrever migrations SQL versionadas em `supabase/migrations/` com grants explícitos, `enable row level security`, policies e índices.
- [ ] Aplicar `supabase/migrations/20260822_sync.sql` e executar o teste de RLS/merge no banco Supabase alvo (`supabase/tests/20260822_sync_rls.sql`).
- [x] Decidir onde vive o sync engine no desktop: `backend/sync_service.py` (Python, mesma camada proprietária do SQLite).
- [x] Atualizar `PLANNING.md` para Supabase offline-first e remover a decisão antiga de Firebase.

### Fase 1 — Outbox local + auth (sem rede ainda)

- [x] Modelar `sync_outbox` no SQLite desktop e AsyncStorage Android, ambos com coalescência.
- [x] Hookar writes existentes do desktop para enfileirar no outbox:
  - `PUT /items/{id}/progress` (`backend/main.py:1032`) → outbox `progress`
  - `PATCH /items/{id}/read` / `PUT /items/{id}` com `is_read`/`rating` → outbox `progress`
  - `POST /lists`, `PUT /lists/{id}`, `DELETE /lists/{id}` → outbox `list`
  - `POST /lists/{id}/items`, `DELETE /lists/{id}/items/{item_id}` → outbox `list_membership`
- [x] Implementar coalesce no outbox desktop (atualiza `pending` existente para a mesma chave lógica em vez de duplicar).
- [x] Integrar Supabase Auth no desktop e no mobile pela aba Configurações: email/senha, Google OAuth externo no desktop e nativo no Android, magic link, confirmação, recuperação/alteração de senha, logout e sessão persistida.
- [x] Ligar as outboxes aos respectivos motores remotos; a validação end-to-end depende do deploy da Fase 0.

### Fase 2 — Push (local → remoto)

- [x] Implementar push desktop (`backend/sync_service.py`) e Android (`mobile/src/sync/engine.ts`) com RPC/UPSERT idempotente.
- [x] Detecção de conectividade por gatilho Electron e `NetInfo`/`AppState` no Android.
- [x] Backoff exponencial, coalescência e estados `pending`/`syncing`/`done`/`error`.
- [x] Backfill inicial por usuário no primeiro login.
- [x] Implementar a regra de conflito monotônica: 80% seguido de 20% mantém 80%; validar no banco alvo após aplicar a migration.

### Fase 3 — Pull (remoto → local)

- [x] Pull incremental paginado por `updated_at`, com reconciliação integral de memberships ativas.
- [x] Merge atômico de progresso no Postgres e reconciliação por conjunto para listas/favoritos.
- [x] `pending_sync_progress` no desktop e mapa persistente equivalente no Android para fingerprints órfãos.
- [x] Triggers ao abrir/voltar ao app, recuperar conectividade, focar a janela e polling de fallback.
- [x] Listas usam UUID remoto estável e memberships por fingerprint nas duas plataformas.

### Fase 4 — Polimento

- [x] Status discreto `Sync` na seção Conta do desktop e Android.
- [x] Prune de outbox (`done` após 7 dias).
- [x] Paginação em blocos de 1.000 e coalescência para outbox grande.
- [x] Teste SQL reproduzível de estrutura RLS e merge (`supabase/tests/20260822_sync_rls.sql`); execução no projeto Supabase alvo pendente.
- [x] Fingerprint e limitação de renomeio documentados neste documento e no README mobile.

### Fase 5 — Futuro (fora deste doc)

- [ ] Sincronização de metadados editados/tags (se desejado).
- [ ] Exportar/importar CSV/JSON como fallback offline.
- [ ] Métricas de sync (taxa de conflito, tamanho de outbox) para debug.

---

## 8. Referências no código atual

| Local | Relevância para sync |
|-------|----------------------|
| `backend/models.py:17` — `Item` | `path` não é chave de sync; `file_size` + `filename_title` compõem fingerprint |
| `backend/models.py:45` — `Progress` | Campos sincronizados: `progress_pct`, `current_page`, `total_pages`, `cfi`, `updated_at` |
| `backend/models.py:83` — `UserList` | `is_default` (Favoritos) precisa de `unique (user_id, name)` no remoto |
| `backend/models.py:75` — `list_items` | `added_at` vira `added_at` remoto; `list_id` local → `uuid` remoto |
| `backend/archive.py:20` — `_fingerprint_key` | Reutilizar lógica para `sync_items.fingerprint` |
| `backend/database.py:14` — `DB_PATH` | SQLite permanece fonte primária; `sync_outbox` vive ao lado |
| `backend/main.py:36` — `lifespan` | Onde rodar `sync_service` no desktop; migrations inline continuam aqui |
| `backend/main.py:1032` — `save_reading_progress` | Hook principal para outbox de progresso |
| `backend/main.py:128` — `get_continue_reading` | Consome `progress` local; após sync, deve refletir merge remoto |
| `mobile/src/storage/preferences.ts:15` | `AsyncStorage` keys; outbox mobile pode começar aqui antes de `expo-sqlite` |
| `mobile/src/api/client.ts:22` — `fetch` | Cliente HTTP local; sync remoto usará `supabase-js` separado, não este client |
| `PLANNING.md:164` — M10 Sincronização | Status e decisões da implementação Supabase |
| `CHANGELOG.md` | Registrar fases de sync quando implementadas |

---

## 9. Decisões finais da implementação

- Projeto remoto: `bcwgtutmzdhkotiuymxl`; clientes usam apenas chave publishable + JWT do usuário.
- Desktop usa `httpx` direto e recebe somente access token por bridge localhost autenticada; refresh token fica no Electron. A porta 8765 é preferida, com fallback automático para uma porta local livre quando já estiver ocupada; Electron, renderer e FastAPI recebem a mesma porta.
- Android usa `supabase-js`, AsyncStorage e NetInfo.
- `sync_items` foi mantida como identidade/diagnóstico remoto; memberships continuam auto-contidas por fingerprint.
- Apple OAuth permanece fora do escopo; Google OAuth é o provedor social adotado.

---

*Documento gerado a partir da análise do código atual do Krumer (v1.3.0 desktop / 0.1.0 mobile) e dos requisitos de offline-first, fila/outbox e resolução de conflito. O código das Fases 0–4 foi concluído em 2026-08-22; o deploy remoto permanece pendente.*
