# Bug: Livro filho (capítulo) em leitura não aparece em "Continuar Lendo"

**Status:** Corrigido — veja seção [Implementação](#implementa%C3%A7%C3%A3o)

---

## Resumo

Quando um livro filho (capítulo/volume de uma série) é lido, a série pai passa a ser
**contabilizada como em leitura** (aparece em "Lendo", mostra barra de progresso
parcial no card), porém **não aparece na seção "Continuar Lendo"** da aba
"Minha Biblioteca".

## Adendo: comportamento esperado

> **Importante:** o comportamento desejado **não** é fazer a série pai (livro pai)
> aparecer em "Continuar Lendo". O desejo é que **o livro filho em leitura** seja o
> item exibido na seção "Continuar Lendo" — ou seja, o capítulo/volume específico que
> o usuário está lendo, com seu próprio progresso e sua própria capa.

Isso muda a natureza do problema: não se trata apenas de corrigir o filtro que
descarta a série (ver "Causa raiz" abaixo), mas de **repassar o progresso do filho
para a seção "Continuar Lendo"**, já que hoje o grid só lista itens de nível raiz
(`parent_id == null`) vindos de `GET /items`.

### Implicações do comportamento esperado

- A seção "Continuar Lendo" deve listar **capítulos filhos em andamento**, e não a
  série agregada.
- Ao clicar no card em "Continuar Lendo", deve **retomar a leitura do capítulo**
  (abrir o leitor direto no arquivo), não apenas abrir a página de detalhes da série.
- O card do filho deve mostrar o progresso **do próprio capítulo**
  (`overall_progress` do filho), não o agregado da série.
- A solução provavelmente exigirá buscar também itens com `parent_id` definido no
  backend (ou um endpoint específico de "continuar lendo" que retorne filhos em
  andamento), além de ajustar o filtro descrito em "Causa raiz".

## Sintoma observado

1. O usuário abre uma série e lê um dos capítulos (livro filho) até passar da 1ª página.
2. O progresso do capítulo é salvo corretamente.
3. A série pai exibe progresso parcial (> 0% e < 100%) no grid e aparece na categoria
   "Lendo" da sidebar.
4. Ao voltar para "Minha Biblioteca", a série **não aparece** na seção
   "Continuar Lendo", mesmo estando em andamento.

## Causa raiz

O problema está no filtro que monta a lista da seção "Continuar Lendo" em
`frontend/js/library.js` (`renderGrid`, linhas 191–206):

```js
const inProgressItems = this.items
  .filter(item => {
    const prog = item.overall_progress || 0;
    if (prog <= 0 || prog >= 100) return false;
    // Se o item tem progresso próprio (livro/capítulo), ignorar se ainda está na 1ª página
    if (item.progress && item.progress.length > 0) {
      const currentPage = item.progress[0].current_page || 0;
      if (currentPage <= 1) return false;
    }
    return true;
  })
```

O filtro mistura duas fontes de dados distintas:

- `overall_progress` — para **séries**, é agregado no backend a partir do progresso
  **dos filhos** (`backend/main.py`, `_enrich_item`, linhas 266–278).
- `item.progress` — são os registros `Progress` **do próprio item**
  (`ItemResponse.progress`). Para uma série, essa lista normalmente está vazia,
  **mas** um registro próprio pode existir (e ficar desatualizado) quando a série foi
  marcada como lida/não lida em algum momento — ver `_set_item_read_progress`
  (`backend/main.py`, linhas 298–329).

### Sequência que dispara o bug

1. A série é marcada como **"Não Lido"** (ou passa por um ciclo lido→não lido) via
   menu de contexto / página de detalhes (`persistItemAndChildrenReadState`,
   `frontend/js/library.js`, linhas 687–728; rotas de contexto em 1696 e 1780).
   Isso chama `PATCH /items/{id}/read` na série e cria um registro `Progress` **da
   própria série** com `current_page = 0` (código `_set_item_read_progress`).
2. Em seguida o usuário lê um **capítulo filho**. `save_reading_progress`
   (`backend/main.py`, linhas 1004–1047) atualiza **apenas o progresso do filho** —
   o registro de progresso da série pai permanece intacto com `current_page = 0`.
   O backend até atualiza `last_read` e `is_read` do pai via
   `_sync_parent_read_status`, mas **nunca** o registro `Progress` próprio do pai.
3. No frontend, o `overall_progress` da série volta > 0 (agregado dos filhos),
   então ela passa no primeiro `if` e é "contabilizada como em leitura".
4. Porém o filtro encontra o registro próprio antigo da série (`item.progress.length > 0`)
   com `current_page <= 1` e a **exclui** da seção "Continuar Lendo".

Ou seja: a checagem `current_page <= 1` foi desenhada para itens de arquivo único
(livro/capítulo avulso), mas é aplicada também a **séries**, cujo `overall_progress`
não vem do registro próprio, e sim da agregação dos filhos. Um registro próprio
"órfão/desatualizado" faz a série ser descartada indevidamente.

### Por que é contabilizado mas não aparece

A categoria "Lendo" da sidebar usa um filtro diferente e mais simples, apenas por
`overall_progress` (`frontend/js/library.js`, linhas 78–79):

```js
fetchedItems = fetchedItems.filter(item => (item.overall_progress || 0) > 0 && (item.overall_progress || 0) < 100);
```

Sem a checagem de `current_page`, a série é mantida. A seção "Continuar Lendo"
adiciona essa checagem extra e acaba descartando a série.

## Passos para reproduzir

1. Escanear uma pasta que forme uma série (pasta com múltiplos arquivos → série pai
   com capítulos filhos).
2. Abrir a série e marcar como **"Não Lido"** (menu de contexto ou página de detalhes).
3. Abrir um capítulo filho e ler além da 1ª página (salvar progresso).
4. Voltar à biblioteca. Observar:
   - A série aparece em **Lendo** (sidebar) e com barra de progresso parcial no grid;
   - A série **não aparece** em **Continuar Lendo**.

> Observação: sem o passo 2 (série nunca marcada lida/não lida), a série possui
> `item.progress = []` e **aparece** normalmente em "Continuar Lendo" — o que
> confirma que o gatilho é o registro próprio desatualizado com `current_page <= 1`.

## Correções sugeridas

Considerando o comportamento esperado descrito no **Adendo** (exibir o **filho** em
leitura, e não a série):

- **Opção 1 (implementada):** novo endpoint `GET /items/continue-reading` no backend
  que retorna os itens **filhos em andamento** (`progress_pct` entre 0 e 100, além da
  1ª página) com seus dados completos; o frontend renderiza esses filhos na seção
  "Continuar Lendo" com o progresso do próprio capítulo, e o card abre diretamente o
  leitor do arquivo. Ver seção [Implementação](#implementa%C3%A7%C3%A3o).
- **Opção 2 (implementada de forma alinhada ao Adendo):** o filtro do "Continuar
  Lendo" não processa mais séries para a seção (elas ficam de fora), eliminando o
  descarte indevido por `current_page` e a poluição da lista com o pai.
- **Opção 3 (não aplicada — higiene de dados opcional):** quando
  `save_reading_progress` sincronizar o pai (`_sync_parent_read_status`), atualizar
  também o registro `Progress` próprio do pai (ou removê-lo) para que nunca fique com
  `current_page` defasado.
- **Opção 4 (não aplicada — higiene de dados opcional):** alterar
  `_set_item_read_progress` para não criar/gravar registro `Progress` para itens do
  tipo `series` (séries não têm arquivo físico próprio).

## Arquivos e linhas envolvidos

| Local | Descrição |
|-------|-----------|
| `frontend/js/library.js:191-206` | Filtro da seção "Continuar Lendo" com a checagem `current_page <= 1` |
| `frontend/js/library.js:78-84` | Filtro das categorias Lendo/Lidos/Não Lidos (sem checagem de página) |
| `frontend/js/library.js:687-728` | `persistItemAndChildrenReadState` — marca série lida/não lida |
| `frontend/js/library.js:1696,1780` | Chamadas que disparam a marcação lido/não lido na série |
| `backend/main.py:266-289` | `_enrich_item` — agrega `overall_progress` da série a partir dos filhos |
| `backend/main.py:298-329` | `_set_item_read_progress` — cria registro `Progress` próprio (inclusive em séries) |
| `backend/main.py:331-349` | `_sync_parent_read_status` / `_sync_read_status_after_item_change` — atualiza pai, mas não o `Progress` próprio do pai |
| `backend/main.py:1004-1047` | `save_reading_progress` — grava progresso apenas do filho |
| `backend/models.py:166-174` | `ItemResponse` — campos `progress` e `overall_progress` |

## Implementação

Comportamento implementado conforme o **Adendo**: a seção "Continuar Lendo" exibe o
**livro filho em leitura** (capítulo/volume), com seu próprio progresso e capa, e o
card retoma a leitura do arquivo diretamente. A série pai **não** aparece.

### Backend — `backend/main.py`

- Novo endpoint `GET /items/continue-reading` (declarado antes de `GET /items/{id}`
  para evitar conflito de rota).
- Retorna itens em andamento via join com `Progress`, filtrando:
  - `type != "series"` (exclui contêineres — nunca exibe a série pai);
  - `is_read == False`;
  - `progress_pct` entre 0 e 100;
  - `current_page > 1` (consistente com a regra "passou da 1ª página" de
    `_enrich_item`).
- Ordena por `last_read` desc e desduplica por `id` (itens podem ter múltiplos
  registros `Progress`).

### Frontend — `frontend/js/api.js`

- Novo método `LibraryAPI.getContinueReadingItems()` chamando o endpoint acima.

### Frontend — `frontend/js/library.js`

- `renderGrid()` não monta mais o "Continuar Lendo" a partir do filtro local sobre
  `this.items` (que só continha itens de nível raiz); delega para
  `_renderContinueReading()`.
- Novo método `async _renderContinueReading()`:
  - oculta a seção fora da categoria "Minha Biblioteca";
  - busca os itens do endpoint, renderiza os cards e anexa listeners;
  - guarda `this.continueReadingItems` e usa um sequencial de fetch para descartar
    respostas obsoletas.
- `attachCardEventListeners()`:
  - cards dentro de `#continue-reading-grid` **retomam a leitura** via `openReader(item)`
    em vez de abrir os detalhes;
  - lookup de itens (clique/contexto/estrelas) passa a considerar também
    `this.continueReadingItems`, necessário porque os filhos não estão em
    `this.items`.

### Testes — `backend/test_backend.py`

- Novo `test_continue_reading_returns_in_progress_children_and_books` valida que
  capítulo em andamento e livro avulso aparecem, a série não, e capítulo ainda na
  1ª página não aparece.

> **Observação:** a causa raiz descrita na seção "Correções sugeridas" (registro
> `Progress` próprio desatualizado em séries) deixa de afetar a UI porque as séries
> não são mais consideradas na seção; porém as **Opções 3 e 4** (não manter registro
> `Progress` próprio em séries) permanecem como higiene de dados opcional.