# Busca de metadados no Krumer Mobile

> Documento de comportamento e implementação. A especificação abaixo registra
> o fluxo desktop e a adaptação Android implementada no mobile.

## 1. O que o Krumer chama de “scraping”

O Krumer não acessa páginas HTML de livrarias ou bases de dados. O fluxo atual
usa o Gemini para interpretar o nome de uma obra e devolver metadados em JSON.
O arquivo PDF/EPUB original não é enviado nem alterado:

1. o usuário escolhe uma obra;
2. o aplicativo transforma o nome do arquivo (ou o título de uma série) em uma
   consulta;
3. o Gemini retorna uma sugestão estruturada;
4. o Krumer mostra uma prévia;
5. somente depois da confirmação os campos internos da biblioteca são
   atualizados.

Portanto, neste documento “scraping” significa **busca assistida de metadados**.

## 2. Fluxo existente no desktop

As referências principais estão em:

- `backend/metadata_service.py`: normalização, prompt, chamada ao Gemini,
  cache, limites e mapeamento de campos;
- `backend/main.py`: rotas HTTP, seleção de itens, SSE e aplicação no SQLite;
- `frontend/js/metadata.js` e `frontend/js/api.js`: seleção, progresso, prévia
  e confirmação no desktop.

### 2.1 Chave da API

O desktop expõe `GET /settings/api-key`, que retorna somente
`{"configured": boolean}`, e `PUT /settings/api-key`, que recebe
`{"api_key": "..."}`. Antes de salvar, o backend testa a chave listando os
modelos Gemini e grava o valor em `.env` como `GEMINI_API_KEY`.

O mobile não deve copiar esse mecanismo: seu fluxo é local-first e a API key
será mantida no dispositivo. A decisão para o mobile é **não validar a chave no
momento do salvamento**; uma chave inválida será identificada na primeira
consulta e apresentada como erro de busca.

### 2.2 Entrada e seleção

O botão desktop “Obter Metadados” primeiro verifica a existência da chave. Em
seguida carrega os itens da biblioteca, exclui itens já traduzidos para o idioma
atual e permite selecionar no máximo 10 obras.

O backend recebe uma lista ordenada de IDs inteiros em `POST /metadata/fetch`.
Itens inexistentes, lista vazia ou mais de 10 itens produzem erro HTTP. A
seleção visual exibe capa, título e quantidade de volumes para séries.

### 2.3 Consulta usada para cada item

Para uma série, o título já está limpo e é usado diretamente como consulta.
Para livro, comic ou graphic novel, o backend usa apenas o basename do arquivo
e remove sua extensão.

`limpar_nome_arquivo` então:

- converte para minúsculas;
- troca `_` e `.` por espaços;
- remove tokens isolados como `pt-br`, `scan`, `hq`, `cbr`, `v1`, `v2`, `ebook`,
  `digital`, `completo` e `revisado`;
- troca hífens por espaços;
- comprime espaços repetidos.

Exemplos cobertos pelos testes desktop:

| Entrada | Consulta |
| --- | --- |
| `castelo_de_areia.epub` | `castelo de areia` |
| `1984_george_orwell_pt-br_scan_v2.pdf` | `1984 george orwell` |
| `O-Senhor-Dos-Aneis.epub` | `o senhor dos aneis` |

### 2.4 Prompt e contrato do Gemini

O prompt desktop pede somente este JSON:

```json
{
  "nome_da_obra": "",
  "autor": "",
  "data_de_lancamento": "",
  "sinopse": ""
}
```

Regras do prompt:

- não retornar texto fora do JSON;
- listar todos os autores relevantes no campo `autor`;
- usar `null` quando um campo não for encontrado;
- escrever a sinopse no idioma configurado.

O idioma é convertido para o nome natural correspondente: português do Brasil,
English, español, français, Deutsch, italiano, japonês, chinês simplificado,
coreano ou russo.

### 2.5 Chamada, fallback e limites

O desktop usa `google-genai` com `generate_content`,
`response_mime_type="application/json"`, um `response_schema` explícito e uma
instrução de sistema exigindo JSON. No desktop, o JSON é decodificado antes do
cache; no mobile, a resposta também é validada localmente contra o contrato.

Embora a página geral de modelos ainda liste a família Gemini 2.5, a API
respondeu para a chave em uso que `gemini-2.5-flash` não está disponível para
novos usuários. Por isso, a ordem padrão atualizada para desktop e Android é:

1. `gemini-3.6-flash`;
2. `gemini-3.5-flash-lite`.

O caminho padrão é compatível com o Free Tier de texto e **não envia Google
Search**: a tabela de preços atual informa que Search/grounding não está
disponível no Free Tier dos modelos Gemini 3.x. Sem uma ferramenta integrada,
o `response_schema` pode ser enviado normalmente e reduz respostas fora do
contrato. Search pode ser reavaliado em uma configuração paga/explicitamente
habilitada, mas não deve ser presumido no fluxo local-first.

A mesma página de modelos pode apresentar versões Gemini 3.x mais novas (por
exemplo, `gemini-3.7-flash`) antes que estejam liberadas para todas as chaves.
Neste caso, a mensagem 404 específica da conta tem precedência: o padrão fica
em `gemini-3.6-flash`, exatamente o endpoint recomendado pela API, com
`gemini-3.5-flash-lite` como fallback.

`gemini-2.0-flash` foi removido porque está desligado e o alias
`gemini-flash-latest` não é usado para evitar mudanças silenciosas de versão.
Se a política da conta mudar, a lista de modelos deve ser verificada antes de
alterar o código.

Erro `404`/`NOT_FOUND` avança para o próximo modelo. Erro
`429`/`RESOURCE_EXHAUSTED` registra que houve rate limit; se nenhum modelo
funcionar, o usuário recebe a mensagem de limite. Outros erros também tornam a
tentativa atual inválida e são tratados como falha da consulta.

O lote é sequencial e aguarda 2,5 segundos entre itens. Nenhuma plataforma
mantém um contador local fixo: a cota efetiva (incluindo o limite de grounding)
é controlada pela API/conta Gemini e deve ser exibida como erro quando excedida.
Não há contador local de consultas. O limite efetivo de texto, Search (quando
habilitado) e taxa de requisições é controlado pela API e pela conta/projeto;
erros `429` são apresentados ao usuário. O número de 500 RPD de Search
publicado para Gemini 2.5 não deve ser usado para estimar a capacidade do
caminho Gemini 3 padrão, que não usa Search no Free Tier.

### 2.6 Cache desktop

O cache desktop fica em `metadados_cache.json`, indexado pelo nome da consulta.
Cada entrada encontrada armazena a consulta limpa, idioma e o JSON retornado.
Um resultado positivo do cache é usado somente quando o idioma coincide.

Resultados `not_found` ou com `metadados: null` são removidos pela limpeza de
cache e não ficam armazenados como falha permanente. Isso permite tentar a
mesma obra novamente.

### 2.7 Progresso e eventos

`POST /metadata/fetch` retorna `text/event-stream`. Para cada item, o desktop
recebe:

```text
data: {"type":"progress","atual":1,"total":3}

data: {"type":"result","data":{...}}

data: {"type":"done"}
```

Se o lote falhar, o stream emite `{"type":"error","message":"..."}`.

O cliente desktop lê o `ReadableStream`, acumula linhas incompletas e trata
somente linhas iniciadas por `data: `. O React Native não precisa reproduzir
SSE: a adaptação mobile fará uma chamada HTTP não-streaming por item e emitirá
progresso por callback local.

### 2.8 Prévia e aplicação

Depois do lote, a interface mostra uma lista de encontrados e não encontrados.
Cada encontrado pode ser selecionado para visualizar capa atual, título, autor,
data de lançamento e sinopse.

`POST /metadata/apply` recebe somente os resultados que têm metadados. O backend
converte:

| Campo Gemini | Campo da biblioteca |
| --- | --- |
| `nome_da_obra` | `title` e `metadata_title` |
| `autor` | `author` |
| ano extraído de `data_de_lancamento` | `year` |
| `sinopse` | `description` |

O ano é o primeiro número de quatro dígitos entre 1900 e 2099. Rating, tags,
capa, progresso e estado de leitura não fazem parte dessa aplicação.

Exceção: quando o item é uma série (obra pai com capítulos/filhos),
`nome_da_obra` aparece na prévia, mas não substitui `title` nem
`metadata_title` do pai. Apenas autor, ano e sinopse podem ser aplicados. O
título retornado pode representar o primeiro capítulo/volume e quebrar o nome
da série.

O arquivo original nunca é regravado. A atualização altera somente o registro
interno do banco.

### 2.9 Relação com rescan

O scanner preserva metadados já obtidos ou editados manualmente. Uma nova
varredura não deve apagar título, autor, ano, descrição, tags, avaliação ou capa
customizada. A busca de metadados também não será executada automaticamente
durante o scan.

## 3. Estado atual do mobile

O mobile possui a busca Gemini local-first implementada nestes subsistemas:

- `mobile/src/models/item.ts` define `Book` com título, autor, ano, descrição,
  tags, rating, capa, progresso, `fingerprint` e filhos;
- os IDs de `Book` são strings locais; não são os IDs inteiros do SQLite desktop;
- `AppContext.updateBookMetadata` persiste o livro localmente e enfileira uma
  atualização de sincronização;
- `BookDetailScreen` já edita título, autor, ano, sinopse, rating, tags e capa;
- o botão de três pontos abre as ações “Buscar metadados” e “Editar
  manualmente”;
- `SettingsScreen` exibe “Buscar metadados” na seção Biblioteca, com introdução
  na primeira utilização e seleção em lote nas seguintes;
- `SettingsGroupScreen`/onboarding permitem informar uma chave Gemini sem
  validação antecipada;
- a chave é migrada automaticamente para `expo-secure-store`; o AsyncStorage
  mantém apenas `hasGeminiApiKey` e `metadataIntroSeen`;
- `mobile/src/services/metadataService.ts` executa normalização, chamada REST,
  fallback, parsing, cache positivo, classificação de erros e lote sequencial;
- `MetadataBatchModal`, `MetadataIntroModal` e `MetadataActionModal` compõem a
  experiência de seleção, revisão e busca individual;
- `mobile/src/api` possui um cliente genérico apontando por padrão para
  `http://localhost:8765`, mas não possui módulo de metadados e não deve ser
  usado para esta primeira versão local-first;
- o scanner e o processamento de capas não devem disparar chamadas Gemini.

## 4. Experiência mobile acordada

### 4.1 Entrada pelas Configurações

Adicionar a linha **Buscar metadados** na seção **Biblioteca**, abaixo de
Idioma e Pasta dos livros. A linha usa o mesmo componente visual das demais
preferências e um ícone de brilho/metadata.

Na primeira abertura, mostrar uma subtela explicativa com:

1. um ícone de destaque e explicação curta de que o Gemini sugere metadados;
2. um tópico sobre a chave ser usada no dispositivo e enviada somente à API;
3. um tópico dizendo que nada é salvo antes da revisão/confirmação.

O botão **Entendi, continuar** registra uma flag local de introdução concluída.
Se não houver chave configurada, a ação seguinte mostra um aviso com botão para
abrir a configuração da API. Se já houver chave, abre a seleção em lote.

Após a primeira utilização, tocar na linha abre diretamente a seleção em lote.

### 4.2 Busca em lote

O lote usa um modal em tela cheia com três etapas:

1. **Seleção**: grid de capas e campo de busca por título/autor;
2. **Processamento**: progresso por obra;
3. **Resultados**: lista de status e prévias.

#### Itens elegíveis

Mostrar somente itens raiz: livros independentes e séries, não capítulos/filhos
individuais. Uma obra é considerada completa quando possui simultaneamente:

- `author` preenchido;
- `year` preenchido;
- `description` preenchida.

O título não participa dessa regra. Séries ou livros com qualquer um desses
campos ausente permanecem elegíveis. A busca individual nos detalhes continua
permitida mesmo para obras completas.

A elegibilidade é recalculada a partir do estado atual da biblioteca sempre que
o modal é aberto e novamente antes de iniciar o lote. Assim, uma edição manual,
sincronização ou aplicação feita enquanto a seleção está aberta remove o item
da seleção antes de qualquer nova requisição. O predicado também normaliza anos
persistidos como texto, anos retornados pelo Gemini como número e anos
históricos de quatro dígitos (como 1320). Uma resposta
sem nenhum campo aplicável (por exemplo, apenas um título de capítulo para uma
série) não é contabilizada como obra atualizada.

A seleção começa vazia e aceita no máximo 10 obras. A quantidade de colunas do
grid deve reutilizar `preferences.booksPerRow`. Ao atingir o limite, os cartões
não selecionados ficam desabilitados e o contador mostra `n/10`.

#### Processamento

- fechar a etapa de seleção e manter o modal aberto;
- processar as obras em ordem, uma por vez;
- usar a consulta de série ou filename normalizado descrita na seção desktop;
- respeitar o idioma ativo;
- mostrar item atual, total e percentual;
- não oferecer cancelamento nesta primeira versão;
- preservar resultados já obtidos se uma chamada posterior falhar.

#### Resultados

Mostrar uma lista com indicador encontrado/não encontrado. Em tela estreita,
tocar em um item abre sua prévia completa dentro do mesmo modal; um botão voltar
retorna à lista.

A prévia pode mostrar capa local, título, autor, lançamento e sinopse. Para
séries, o título exibido é sempre o título local do item pai, mesmo que o
Gemini retorne o nome de um capítulo/volume. Capas não são buscadas pelo
Gemini nesta versão; a capa exibida é a existente no dispositivo.

O botão **Aplicar encontrados** substitui, para cada resultado válido, título,
autor, ano e sinopse. Para séries, preserva o título do item pai e aplica
somente autor, ano e sinopse. A aplicação é explícita e acontece uma única vez
após a revisão. Rating, tags, capa, progresso e leitura permanecem intactos.
Depois de aplicar, fechar o modal e mostrar a quantidade de obras atualizadas.

### 4.3 Busca individual nos Detalhes

O botão de três pontos da tela de detalhes passa a abrir um modal central com:

- **Buscar metadados**;
- **Editar manualmente**.

“Buscar metadados” fica disponível sempre, inclusive para obras completas. Essa
ação é uma reconsulta explícita: por isso ela pode chamar o Gemini mesmo quando
autor, ano e sinopse já estão preenchidos. A busca individual não é disparada
automaticamente pela abertura dos detalhes.

Ao iniciar:

1. fechar o menu de ações;
2. abrir modal central com indicador de progresso e nome da obra;
3. executar a consulta individual;
4. preencher o formulário de edição com título, autor, ano e sinopse se houver
   resultado; em séries, manter o título original do pai;
5. exigir que o usuário revise e toque em Salvar.

A consulta individual não grava automaticamente. O formulário preserva rating,
tags, capa, progresso, estado de leitura e campos que o Gemini não retornou.

Chave ausente, offline, rate limit, modelo indisponível, JSON inválido e obra
não encontrada aparecem em um diálogo explicativo com **Tentar novamente** e
**Fechar**.

## 5. Arquitetura recomendada

### 5.1 Chamada direta REST

O mobile consulta o Gemini diretamente com `fetch`. Isso evita depender de um
backend desktop rodando em `localhost` e evita tentar converter `Book.id` local
em ID SQLite. A implementação está em
`mobile/src/services/metadataService.ts` e não adiciona o SDK JavaScript do
Gemini.

Endpoint conceitual:

```text
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
x-goog-api-key: <chave do usuário>
Content-Type: application/json
```

O corpo deve conter `contents` com o prompt e
`generationConfig.responseMimeType: "application/json"` junto de um
`generationConfig.responseSchema` explícito. O caminho padrão usa
`gemini-3.6-flash` com fallback para `gemini-3.5-flash-lite` e não inclui
`tools.google_search`, pois Search/grounding não está disponível no Free Tier
dos modelos Gemini 3.x. O serviço ainda aplica o mesmo contrato localmente
depois do `JSON.parse`, rejeitando respostas sem título ou campos com tipos
inválidos antes de exibir/aplicar.

Uma configuração futura paga pode habilitar Search separadamente, desde que a
disponibilidade, o preço e a compatibilidade de Structured Outputs sejam
confirmados. Ela não deve alterar silenciosamente o caminho Free Tier.

Referências oficiais usadas para esta decisão:

- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Gemini API overview](https://ai.google.dev/gemini-api/docs/api-overview)
- [Modelos Gemini e endpoints](https://ai.google.dev/gemini-api/docs/models)
- [Preços e disponibilidade do Free Tier](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini tools e Structured Outputs](https://ai.google.dev/gemini-api/docs/tools)

Não adicionar `@google/genai` ao mobile. O `fetch` nativo já é suficiente.
`expo-secure-store` foi adicionado como dependência nativa; validar a mudança em
development build (`npx expo prebuild` + `npx expo run:android`).

### 5.2 Organização sugerida

Manter responsabilidades separadas:

| Área | Responsabilidade |
| --- | --- |
| `mobile/src/models/metadata.ts` | tipos de contrato e estados |
| `mobile/src/services/metadataService.ts` | request REST, normalização, fallback, parsing, cache, lote e callbacks |
| `mobile/src/storage/secureCredentials.ts` | leitura, gravação, migração e remoção da chave |
| `mobile/src/components/MetadataIntroModal.tsx` | subtela da primeira utilização |
| `mobile/src/components/MetadataBatchModal.tsx` | seleção, progresso e resultados |
| `mobile/src/components/MetadataActionModal.tsx` | ações dos três pontos |
| `SettingsScreen` | linha “Buscar metadados” e primeira abertura |
| `BookDetailScreen` | ação individual e preenchimento do editor |

Os componentes devem reutilizar tema, espaçamento, `SettingsRow`, `PrimaryButton`,
grid de capas e padrões de modal já existentes. Não criar um padrão visual
genérico de template Expo.

### 5.3 Tipos públicos do fluxo

Os nomes abaixo são o contrato recomendado; os tipos podem ser ajustados apenas
para acomodar os tipos `Book` existentes, sem mudar seu significado:

```ts
export type MetadataCandidate = {
  nome_da_obra: string | null;
  autor: string | null;
  data_de_lancamento: string | null;
  sinopse: string | null;
};

export type MetadataSearchResult = {
  bookId: string;
  fingerprint: string;
  query: string;
  candidate: MetadataCandidate | null;
  status: 'found' | 'not_found' | 'error';
  fromCache: boolean;
  errorCode?: MetadataError['code'];
};

export type MetadataBatchProgress = {
  current: number;
  total: number;
  bookId: string;
};

export type MetadataFlowState =
  | 'intro' | 'selection' | 'loading' | 'results'
  | 'preview' | 'error' | 'closed';

export type MetadataError = {
  code:
    | 'missing_key'
    | 'invalid_key'
    | 'offline'
    | 'timeout'
    | 'invalid_json'
    | 'safety_block'
    | 'rate_limit'
    | 'model_unavailable'
    | 'not_found'
    | 'network'
    | 'unknown';
  message: string;
  retryable: boolean;
};
```

O estado da interface deve distinguir `intro`, `selection`, `loading`,
`results`, `preview`, `error` e `closed`. Um resultado parcial não deve ser
convertido em `not_found` silenciosamente: ele continua `found` quando possui
um candidato parseável, mas não é elegível para cache completo.

### 5.4 Normalização e validação

Reimplementar a normalização desktop em TypeScript com testes equivalentes. A
função deve receber apenas o nome do arquivo para livros; para séries, receber
uma consulta direta e não normalizá-la como filename.

Depois do response Gemini:

1. localizar o texto do primeiro candidato;
2. remover cercas Markdown caso apareçam;
3. fazer `JSON.parse`;
4. normalizar `undefined`, string vazia e `null` para uma representação única;
5. validar a presença de `nome_da_obra` para considerar o candidato aplicável;
6. extrair o primeiro ano válido de `data_de_lancamento`;
7. manter a data original somente para a prévia.

Uma resposta sem título, JSON inválido ou bloqueada pelo Gemini não pode alterar
o livro.

### 5.5 Fallback e erros HTTP

Usar a mesma ordem explícita de modelos do desktop
(`gemini-3.6-flash` e `gemini-3.5-flash-lite`) em uma constante configurável e
avançar quando a API responder modelo inexistente. O serviço deve diferenciar:

| Situação | Código | Comportamento |
| --- | --- | --- |
| chave ausente | `missing_key` | abrir configuração/diálogo |
| 400/401/403 de chave ou permissão | `invalid_key` | pedir correção da chave |
| aparelho sem rede | `offline` | permitir tentar novamente |
| timeout | `timeout` | permitir tentar novamente |
| bloqueio de segurança | `safety_block` | informar que o conteúdo não foi retornado |
| 429 | `rate_limit` | informar limite e não repetir imediatamente |
| 404/`NOT_FOUND` de modelo | `model_unavailable` | tentar próximo modelo |
| resposta sem JSON | `invalid_json` | descartar apenas aquele resultado |
| 5xx ou falha transitória | `network` | manter resultados anteriores e informar falha parcial |

Não expor a chave em logs, mensagens, cache ou payload de sincronização.

### 5.6 Chave no dispositivo

Usar `expo-secure-store` para o valor da chave. A documentação Expo recomenda o
SecureStore para valores sensíveis em plataformas nativas, com
`setItemAsync`, `getItemAsync` e `deleteItemAsync`.

Migração na hidratação das preferências:

1. ler o valor legado `geminiApiKey` do AsyncStorage, se existir;
2. gravá-lo no SecureStore;
3. remover `geminiApiKey` do objeto salvo em `krumer.preferences`;
4. manter somente `hasGeminiApiKey` (ou equivalente) no estado persistido;
5. se a migração falhar, não apagar o legado antes de confirmar a gravação;
6. oferecer ao serviço uma operação de remoção que use
   `SecureStore.deleteItemAsync` e limpe o indicador.

O código deve proteger chamadas ao SecureStore em builds web. Não usar
AsyncStorage como fallback silencioso para a chave em uma plataforma onde o
SecureStore não está disponível.

SecureStore reduz a exposição em repouso, mas uma chave usada por um aplicativo
cliente ainda pode ser extraída do dispositivo ou do runtime. A subtela deve
explicar isso de forma simples e o documento não deve prometer que a chave
jamais poderá ser compartilhada.

### 5.7 Cache mobile

Usar uma chave própria de AsyncStorage, por exemplo
`krumer.metadata.cache.v1`, com entradas indexadas por:

```text
<fingerprint>|<language>
```

Armazenar somente candidatos completos (`author`, `year` e `description` não
vazios, com título válido). Não armazenar `not_found`, JSON inválido, erro,
resultado parcial ou resposta bloqueada. Uma busca explícita individual pode
usar o cache completo; uma futura opção de “buscar novamente” deve ignorá-lo.

O cache não contém a chave Gemini e não é enviado à sincronização.

## 6. Sequência de implementação

Esta foi a ordem usada para transformar o documento em código:

1. Criar tipos, predicado de metadados completos, normalizador, extrator de ano
   e armazenamento seguro/migração.
2. Criar cliente REST Gemini sem SDK, schema JSON, parsing, fallback, timeout,
   classificação de erros e cache.
3. Criar a linha nas Configurações, subtela de primeira utilização e fluxo sem
   chave.
4. Criar o modal de seleção em tela cheia com busca textual, grid, contador,
   limite e etapa de progresso.
5. Criar a etapa de resultados com lista, prévia navegável e aplicação explícita.
6. Alterar o botão de três pontos dos Detalhes para o modal central de ações e
   integrar a busca individual ao editor existente.
7. Adicionar todas as strings ao sistema i18n existente; não criar arquivos de
   locale separados.
8. Validar TypeScript, testes do serviço e o checklist Android.

## 7. Testes

### 7.1 Unidade

- normalizar os nomes de arquivo dos casos desktop;
- manter título de série sem passar pelo normalizador de filename;
- extrair anos de datas completas, textos e valores ausentes;
- validar JSON correto, cercas Markdown, campos nulos e resposta sem título;
- classificar 400/401/403, offline, timeout, 429, 404, 5xx, bloqueio e JSON
  inválido;
- avançar no fallback somente para erros de modelo e preservar a mensagem
  correta quando todos falharem;
- considerar completa somente uma obra com autor, ano e sinopse;
- usar cache quando fingerprint e idioma coincidirem;
- não salvar ou reutilizar resultados parciais, negativos ou inválidos;
- processar lote sequencial e emitir progresso `1..total`.

O script `mobile/scripts/validate-metadata-service.cjs` cobre normalização,
extração de ano, migração da chave, cache positivo, ausência de cache negativo,
JSON inválido e limite de lote. A validação estática é feita com
`tsc --noEmit -p mobile/tsconfig.json`; os cenários restantes dependem do
development build Android e estão listados no checklist manual.

### 7.2 Persistência e integração

- migrar chave legada para SecureStore e remover o valor antigo depois de uma
  gravação confirmada;
- não incluir a chave em AsyncStorage final, logs ou payload de sync;
- persistir a flag da subtela e não exibi-la novamente após “Entendi, continuar”;
- abrir o diálogo de configuração quando a busca for acionada sem chave;
- aplicar título, autor, ano e sinopse sem alterar rating, tags, capa,
  progresso ou estado de leitura;
- persistir a edição após reiniciar o aplicativo;
- garantir que nenhum PDF/EPUB seja escrito ou enviado ao Gemini.

### 7.3 Checklist manual Android

- Configurações > Biblioteca > Buscar metadados na primeira utilização;
- subtela com três tópicos e botão “Entendi, continuar”;
- abertura direta da seleção nas utilizações seguintes;
- comportamento sem chave e retorno para a configuração;
- seleção de 0, 1, 10 e tentativa de 11 obras;
- filtro por título/autor e grid respeitando `booksPerRow`;
- série, livro independente e lote misto;
- progresso e resultados parciais;
- lista de resultados, abrir prévia, voltar e aplicar encontrados;
- substituição dos quatro campos previstos e preservação dos demais;
- Detalhes > três pontos > busca individual;
- busca individual em obra completa e incompleta;
- modal de progresso, resultado que preenche o editor e salvamento manual;
- chave inválida, modo avião, timeout, rate limit e modelo indisponível;
- rescan posterior sem apagar metadados;
- reinício do app com chave segura e cache preservado.

## 8. Decisões e limites

- A primeira versão é Android/local-first.
- A entrada do lote fica nas Configurações, seção Biblioteca; não haverá botão
  adicional no cabeçalho principal da Biblioteca.
- A busca individual fica no menu central dos três pontos dos Detalhes.
- A primeira versão não permite cancelar um lote em andamento.
- A aplicação em lote sempre exige confirmação explícita.
- O título retornado substitui o título local apenas em livros avulsos; séries
  preservam o nome do item pai no lote e na busca individual.
- O Gemini não busca capas, tags, rating ou progresso.
- O backend desktop não participa da busca mobile nesta fase.
- Firebase, sincronização remota da chave e alterações nos leitores estão fora
  do escopo.
