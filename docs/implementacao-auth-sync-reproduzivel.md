# Krumer — recuperação reproduzível de Auth + sincronização

Este documento reúne o que foi decidido e implementado na conversa sobre autenticação
Supabase/Google e sincronização offline-first. Ele serve como checklist de restauração
depois da perda das alterações.

## 1. Ponto de recuperação encontrado

O Git ainda conserva o commit original:

```text
931b50a feat: adiciona sistema de sincronização de dados via Supabase
```

Ele está fora da branch atual, mas pode ser recuperado sem reescrever o histórico:

```powershell
git branch recovery/auth-sync 931b50a
git show --stat 931b50a
```

O commit contém a maior parte do código de Auth e sync. **Não o aplique cegamente**:
ele não continha fisicamente a migration SQL do Supabase e ainda tinha o `backend/main.py`
iniciando Uvicorn com porta fixa/reload. As correções da seção 6 são obrigatórias.

Antes de restaurar arquivos em uma árvore com trabalho local, faça uma cópia/commit. Não
use `git reset --hard`.

Restauração dos arquivos do commit em um branch separado:

```powershell
git switch -c feat/auth-sync-rebuild
$recoveryFiles = git diff-tree --no-commit-id --name-only -r 931b50a
git restore --source=931b50a -- $recoveryFiles
```

Depois aplique a migration da seção 9 e as correções da seção 6. O `git restore` acima
não recupera arquivos que nunca chegaram a um commit (em particular `supabase/`).

## 2. Resultado funcional esperado

- Desktop (Electron): email/senha, cadastro, magic link, recuperação/alteração de senha,
  logout e Google OAuth.
- Google no desktop abre o navegador padrão, com `prompt=select_account`, e retorna por
  `krumer://auth/callback`.
- Android: Google Play Services abre o seletor nativo de contas; o ID token é trocado por
  uma sessão Supabase com `signInWithIdToken`, sem abrir navegador.
- Sessão Supabase persiste localmente; refresh token nunca sai do Electron no desktop.
- Sincronização somente de estado do usuário: progresso, lido/não lido, avaliação, listas,
  favoritos e memberships. Arquivos, capas, caminhos, metadados editados e tags continuam
  locais.
- Offline-first: a gravação local retorna imediatamente; a outbox envia em background,
  com coalescência, backoff, push/pull paginado e aplicação de progresso pendente quando o
  arquivo aparecer no dispositivo.
- SQLite continua sendo a fonte primária do desktop; AsyncStorage é a fonte local do MVP
  Android; Supabase é a réplica remota canônica.

## 3. Arquivos da implementação

### Criar/restaurar

```text
auth-config.js                         configuração pública Supabase/redirect
auth-service.js                         Auth desktop + storage Electron safeStorage
backend-port.js                         reserva 8765 ou porta local livre
backend/sync_outbox.py                  outbox/coalescência desktop
backend/sync_service.py                 motor push/pull desktop
backend/test_sync_service.py            testes de merge/outbox
frontend/js/sync.js                     gatilhos/status de sync desktop
frontend/assets/Krumer-icon-google.png  ícone do botão Google
mobile/.env.example                     variáveis públicas mobile
mobile/scripts/fix-netinfo-gradle9.cjs  workaround do codegen NetInfo/Gradle 9
mobile/src/auth/google.ts               Google Sign-In nativo
mobile/src/auth/supabase.ts             cliente Supabase + AsyncStorage
mobile/src/context/AuthContext.tsx      provider de sessão e ações de auth
mobile/src/components/AuthSettings.tsx  tela/ações de conta
mobile/src/sync/types.ts                contratos do sync mobile
mobile/src/sync/outbox.ts               outbox AsyncStorage mobile
mobile/src/sync/engine.ts               push/pull/merge mobile
mobile/src/sync/SyncCoordinator.tsx     NetInfo/AppState/status
supabase/migrations/20260822_sync.sql  migration a criar (não estava no commit)
supabase/tests/sync_rls.sql             teste RLS/merge recomendado
```

### Alterar

```text
.gitignore, CHANGELOG.md, PLANNING.md
backend/main.py, backend/models.py, backend/archive.py, backend/requirements.txt
backend/test_backend.py
frontend/index.html, frontend/js/app.js, frontend/js/i18n.js,
frontend/js/library.js, frontend/styles/settings.css
main.js, preload.js, package.json, package-lock.json
mobile/App.tsx, mobile/package.json, mobile/package-lock.json,
mobile/android/gradle.properties, mobile/.gitignore, mobile/README.md
mobile/src/context/AppContext.tsx
mobile/src/components/BookCard.tsx
mobile/src/i18n/translations.ts
mobile/src/models/item.ts, mobile/src/models/list.ts
mobile/src/navigation/types.ts
mobile/src/screens/LibraryScreen.tsx, ListsScreen.tsx, ReaderScreen.tsx,
  SettingsGroupScreen.tsx, SettingsScreen.tsx
mobile/src/services/libraryScanner.ts
mobile/src/storage/preferences.ts
```

O commit também adicionou `docs/sync-realtime-supabase.md` e
`docs/monitoramento-biblioteca-orientado-eventos.md`. Realtime é opcional: o MVP deve
continuar funcionando só com os gatilhos de abertura, foco, conectividade e retry.

## 4. Dependências e versões

No desktop:

```json
"@supabase/supabase-js": "2.112.3"
```

No `mobile/package.json`:

```json
"@react-native-community/netinfo": "^12.0.1",
"@react-native-google-signin/google-signin": "16.1.4",
"@supabase/supabase-js": "2.112.3",
"react-native-url-polyfill": "4.0.0",
"expo": "~57.0.15",
"expo-file-system": "~57.0.5"
```

Depois de restaurar `package.json`, reinstale as dependências e valide:

```powershell
npm install
Set-Location mobile
npm install
npx expo install --fix
npx expo install --check
npx tsc --noEmit
Set-Location ..
```

## 5. Configuração externa (sem segredos no Git)

### Supabase

No painel do projeto:

1. Ative Email/Password e Google em Authentication → Providers.
2. No Google OAuth, use um cliente Web para o Supabase (Web Client ID + Client Secret).
3. Cadastre o callback hospedado do projeto:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Em URL Configuration → Redirect URLs, inclua exatamente:
   `krumer://auth/callback`.
5. No cliente Android, cadastre package `com.adriantinoco.krumer` e os SHA-1 de debug e
   produção.

O Client Secret e a service-role key ficam somente no painel Supabase. O código cliente
usa a publishable/anon key e o JWT do usuário.

### Variáveis

`mobile/.env.local` (não versionar):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
```

O desktop lê `KRUMER_SUPABASE_URL` e `KRUMER_SUPABASE_PUBLISHABLE_KEY`, com fallback
apenas para valores públicos de desenvolvimento. Nunca copie uma secret/service-role key.

## 6. Correções obrigatórias para não repetir os bugs antigos

### 6.1 Bridge Electron ↔ FastAPI

O erro `Canal de sincronização inválido` ocorreu porque outro FastAPI já ocupava 8765,
mas usava outro `KRUMER_SYNC_BRIDGE_TOKEN`. O erro `ECONNREFUSED`/timeout ocorreu porque
o backend filho usava `uvicorn(..., reload=True)` no Windows e o processo reloader não
ficava pronto para o Electron.

Manter todos estes invariantes:

- `main.js` gera um token aleatório por execução (`crypto.randomBytes`), escolhe 8765 ou
  uma porta livre via `backend-port.js`, e passa para o filho:
  `KRUMER_API_PORT`, `KRUMER_BACKEND_RELOAD=0`, `KRUMER_SYNC_BRIDGE_TOKEN`.
- A mesma porta é passada ao preload por
  `additionalArguments: ['--krumer-backend-port=<port>']`.
- `preload.js` expõe `window.electronAPI.backendBaseUrl`.
- `frontend/js/api.js` usa essa URL validada, com fallback `http://127.0.0.1:8765`.
- `callSyncBackend` envia `X-Krumer-Sync-Bridge`; FastAPI compara com
  `hmac.compare_digest` e aceita somente loopback.
- `waitForBackend` testa `GET /sync/status` com o header do bridge. Não use um endpoint
  público de onboarding como prova de que o sync está pronto.
- `syncAuthToBackend()` retorna cedo se ainda não houver `pyProcess`/`backendReady` e envia
  somente `{access_token, user_id, expires_at}`. Refresh token fica no Electron.
- `backend/main.py` deve usar a porta/env e nunca ligar reload por padrão:

```python
api_host = os.getenv("KRUMER_API_HOST", "127.0.0.1")
api_port = int(os.getenv("KRUMER_API_PORT", "8765"))
reload_enabled = os.getenv("KRUMER_BACKEND_RELOAD", "0") == "1"
if reload_enabled:
    uvicorn.run("main:app", host=api_host, port=api_port, reload=True)
else:
    uvicorn.run(app, host=api_host, port=api_port, log_level="info")
```

`backend/main.py` precisa conter as quatro rotas protegidas pelo bridge:

```text
PUT    /sync/session
DELETE /sync/session
POST   /sync/trigger
GET    /sync/status
```

Inclua `sync_service.start()`/`stop()` no lifespan e não inicie outro processo Python
para o motor de sync.

### 6.2 Android CMake/NetInfo

O erro em `@react-native-community/netinfo/.../codegen/jni` sem `CMakeLists.txt` foi um
artefato de codegen/autolinking, não uma pasta que deveria ser criada manualmente.

Em `mobile/android/gradle.properties`:

```properties
org.gradle.parallel=false
org.gradle.workers.max=2
```

Remova `newArchEnabled=false`. Expo SDK 57/RN 0.86 usa New Architecture obrigatória; a
opção antiga é ignorada e confunde o diagnóstico.

O script `mobile/scripts/fix-netinfo-gradle9.cjs` deve ser chamado em `postinstall` e
antes de `expo run:android`. Ele ajusta o `android/build.gradle` instalado do NetInfo
para ordenar o codegen. Não edite `node_modules` manualmente depois de cada instalação.

Se ainda houver artefatos de uma tentativa quebrada, pare os daemons e remova somente
os derivados do projeto:

```powershell
Set-Location mobile
.\android\gradlew.bat --stop
Remove-Item -Recurse -Force android\app\.cxx,android\app\build,android\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\@react-native-community\netinfo\android\build -ErrorAction SilentlyContinue
npm install
npm run postinstall
npx expo run:android
Set-Location ..
```

Isso é limpeza de artefatos gerados; não apague `mobile/android` nem a árvore do projeto.

### 6.3 Atualizador

O `ENOENT` de `dev-app-update.yml` foi explicitamente deixado fora do escopo. Não misture
essa correção com Auth/sync. Se aparecer, é ruído do `electron-updater` em desenvolvimento.

## 7. Auth desktop — contrato de implementação

`auth-config.js` exporta `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e
`AUTH_REDIRECT_URL = 'krumer://auth/callback'`.

`auth-service.js` deve:

- criar o cliente `@supabase/supabase-js` com `autoRefreshToken`, `persistSession`,
  `detectSessionInUrl:false`, `flowType:'implicit'` e storage compatível com
  `electron.safeStorage` em `app.getPath('userData')`;
- expor email/senha, cadastro, magic link, reset/update de senha e logout local;
- gerar Google OAuth com `skipBrowserRedirect:true`, `redirectTo` do deep link e
  `queryParams: { prompt: 'select_account' }`;
- validar que a URL devolvida é HTTPS e pertence ao origin do Supabase antes de
  `shell.openExternal`;
- processar callback por `code` (`exchangeCodeForSession`) ou tokens no fragmento
  (`setSession`), aceitando também `type=recovery`;
- emitir estado sanitizado (id/email/confirmado/expiração), sem colocar tokens na UI.

`main.js` registra IPC `auth:*`, registra `krumer://` como protocolo, trata
`open-url`/`second-instance` e encaminha mudanças de sessão para o renderer e para
`/sync/session`.

## 8. Auth Android — contrato de implementação

`mobile/src/auth/supabase.ts` deve importar `react-native-url-polyfill/auto` e criar o
cliente com AsyncStorage, `persistSession:true`, `autoRefreshToken:true`,
`detectSessionInUrl:false` e `processLock`; ligar/desligar auto-refresh conforme AppState.

`mobile/src/auth/google.ts` deve configurar:

```ts
GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});
```

No botão Google:

1. `GoogleSignin.hasPlayServices()`;
2. `GoogleSignin.signIn()`;
3. validar `response.data.idToken`;
4. `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`.

Trate cancelamento, `IN_PROGRESS` e Play Services ausente. Esse fluxo exige development
build (`npx expo run:android`); Expo Go não contém o módulo nativo.

## 9. Schema Supabase que precisa existir antes do primeiro sync

Criar `supabase/migrations/20260822_sync.sql`. O commit recuperado documentava o schema,
mas não versionou a pasta `supabase/`; sem esta etapa o cliente devolve 404/401 mesmo que
o código esteja correto.

A migration deve criar `pgcrypto` e estas tabelas:

```text
profiles(user_id PK -> auth.users, email, created_at)
sync_items(id uuid, user_id, fingerprint UNIQUE por usuário, title, type, timestamps)
reading_progress(user_id, fingerprint UNIQUE por usuário, progress_pct,
  current_page, total_pages, cfi, is_read, rating, updated_at)
user_lists(id uuid, user_id, name, is_default, sort_order, timestamps, deleted_at)
list_memberships(id uuid, user_id, list_id, fingerprint UNIQUE por lista,
  added_at, updated_at, deleted_at)
```

Todas devem ter `user_id NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, índices
para `(user_id, updated_at)` e RLS habilitado. As policies de select/insert/update/delete
devem usar `auth.uid() = user_id`; conceda acesso somente a `authenticated`.

A RPC `public.merge_reading_progress` deve receber os parâmetros usados pelos dois
clientes:

```text
p_fingerprint, p_title, p_type, p_progress_pct, p_current_page,
p_total_pages, p_cfi, p_is_read, p_rating, p_rating_changed
```

Ela deve usar `auth.uid()` (nunca um `user_id` enviado pelo app), fazer upsert de
`sync_items` e merge transacional de `reading_progress`: maior `progress_pct` vence;
em empate, maior `current_page`/`updated_at` vence; avaliação é substituída somente quando
`p_rating_changed=true`. O `updated_at` vem do Postgres.

Para listas, `deleted_at` é tombstone: upsert de membership usa conflito
`(list_id, fingerprint)` e remove marcando `deleted_at`, não apagando fisicamente. Isso
permite que o pull veja deletes feitos offline. Se Realtime for habilitado, adicione as
três tabelas à publication depois de validar o polling.

## 10. Outbox e hooks locais

### Desktop

No lifespan, faça migrations inline (compatibilidade com a convenção do projeto):

```text
user_lists.sync_id                UUID estável local
sync_outbox                      entity_type, key, payload, operation,
                                  owner_user_id, status, retry_count, next_attempt_at
pending_sync_progress            fingerprint, payload, remote_updated_at
```

Os writes originais devem enfileirar na mesma transação:

```text
progress/read/rating  -> enqueue_progress
criar/editar/apagar lista -> enqueue_list
adicionar/remover item de lista -> enqueue_membership
```

`enqueue` coalesce a linha `pending` da mesma chave. O motor ordena listas antes de
memberships, faz backfill inicial por usuário, push em lotes, pull por cursor e prune de
linhas `done` com mais de sete dias. Erro de rede volta para `pending` com backoff
5 s/30 s/2 min/10 min/1 h; RLS/4xx permanente fica `error` para diagnóstico.

### Android

Use as chaves AsyncStorage do commit (`krumer.sync.outbox.v1`, cursores por usuário/tabela,
`krumer.sync.pending-progress.v1`, mapa de IDs de listas). `SyncCoordinator` deve chamar o
engine somente quando autenticado e online, com um lock para impedir sync paralelo. NetInfo
e AppState são gatilhos; nenhum deles deve bloquear a leitura.

## 11. Testes e aceite

Desktop:

```powershell
& .\backend\.venv\Scripts\python.exe -m unittest backend.test_backend backend.test_sync_service -q
```

Os testes mínimos cobrem: progresso remoto aguardando o arquivo e aplicação posterior;
adoção de outbox criada deslogada sem expor refresh token; merge monotônico e bridge
rejeitando token/host inválido.

Mobile:

```powershell
Set-Location mobile
npx tsc --noEmit
npx expo install --check
Set-Location ..
```

Critérios manuais:

1. Login Google desktop abre navegador e volta ao Krumer.
2. Login Google Android mostra seletor nativo.
3. Desligar internet, avançar página e alterar favorito: UI continua funcionando e
   `pending > 0`.
4. Ligar internet/voltar ao app: outbox zera e o segundo dispositivo recebe os dados.
5. Em dois dispositivos, 80% seguido de 20% mantém 80%; avaliação marcada como alterada
   aplica o gesto mais recente.
6. Executar o Electron com outro processo na 8765: o Krumer escolhe porta livre e não
   retorna `Canal de sincronização inválido`.

## 12. Referências atuais

- [arquitetura-sync-supabase.md](arquitetura-sync-supabase.md) — decisão de domínio,
  fingerprints, conflitos e limites.
- [sync-realtime-supabase.md](sync-realtime-supabase.md) — Realtime opcional.
- Commit recuperável: `931b50a`.
- A documentação atual do Supabase mostra AsyncStorage + `detectSessionInUrl:false` para
  React Native e o fluxo nativo Google com `signInWithIdToken`; a configuração acima segue
  esse contrato.
