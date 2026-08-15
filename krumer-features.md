# Krumer — Novas Features

> Features ordenadas da mais simples à mais complexa. Cada tópico inclui objetivo, comportamento esperado, detalhes de implementação e critérios de conclusão.

---

## F1 — Contador de itens na Biblioteca conta livros dentro de pastas

**Objetivo:** O contador exibido ao lado de "Minha Biblioteca" na página principal deve refletir o total real de livros, incluindo os que estão dentro de subpastas/coleções.

**Comportamento esperado:**
- O número exibido soma todos os livros independente de estarem soltos ou agrupados em pastas/coleções.
- Ao expandir ou recolher uma pasta, o contador não muda — ele reflete o total global.
- O contador atualiza sempre que a biblioteca for recarregada ou o rescan for executado.

**Implementação:**
- Localizar a função que alimenta o contador atual.
- Substituir a contagem superficial (apenas itens raiz) por uma contagem recursiva que percorre os filhos de cada pasta.
- Se a estrutura de dados for uma árvore, usar travessia DFS/BFS para somar todos os nós folha do tipo `book`.

**Critério de conclusão:**
- [ ] Contador exibe o número correto com livros dentro de pastas.
- [ ] Contador atualiza corretamente após rescan.

---

## F2 — Menu de Atalhos nas Configurações

**Objetivo:** Adicionar uma seção "Atalhos" nas Configurações do app que lista todos os atalhos de teclado disponíveis no Krumer de forma organizada e legível.

**Comportamento esperado:**
- A seção exibe uma tabela ou lista com duas colunas: ação e combinação de teclas.
- Os atalhos são agrupados por contexto (ex: Leitura, Navegação, Biblioteca, Geral).
- A seção é somente leitura — não há edição de atalhos nesta fase.

**Implementação:**
- Criar um array/objeto centralizado com todos os atalhos registrados no app (`shortcutsMap`).
- Renderizar esse mapa na tela de Configurações em uma nova aba ou seção "Atalhos".
- Garantir que qualquer novo atalho adicionado futuramente só precise ser registrado no `shortcutsMap` para aparecer automaticamente.

**Critério de conclusão:**
- [ ] Seção "Atalhos" visível nas Configurações.
- [ ] Todos os atalhos existentes do app listados e agrupados por contexto.
- [ ] Layout limpo, consistente com o design atual do Krumer.

---

## F3 — Restaurar capa original na janela de editar metadados

**Objetivo:** Na janela de edição de metadados de um livro, permitir que o usuário restaure a capa extraída originalmente do arquivo (primeira capa encontrada no EPUB/PDF), caso tenha alterado a imagem manualmente.

**Comportamento esperado:**
- Um botão "Restaurar capa original" aparece na seção de capa da janela de edição.
- Ao clicar, a capa é substituída pela imagem extraída originalmente do arquivo do livro.
- O botão fica desabilitado (ou oculto) se a capa atual já for a original, ou se o arquivo não possuir capa embutida.

**Implementação:**
- Verificar se a capa original extraída do arquivo já está cacheada/armazenada separadamente da capa editada. Se não, implementar lógica para re-extrair sob demanda.
- Guardar referência à capa original no banco de dados (campo `cover_original_path` separado de `cover_path`).
- Ao restaurar, atualizar `cover_path` para apontar para `cover_original_path` e recarregar a exibição.

**Critério de conclusão:**
- [ ] Botão "Restaurar capa original" presente e funcional na edição de metadados.
- [ ] Capa restaurada corretamente após confirmação.
- [ ] Botão desabilitado quando não aplicável.

---

## F4 — Rescan automático ao sair de leitura ou mudar de aba

**Objetivo:** O app deve verificar automaticamente se livros foram adicionados ou removidos da pasta monitorada, sem que o usuário precise acionar o rescan manualmente.

**Comportamento esperado:**
- Ao fechar uma sessão de leitura e retornar à biblioteca, o rescan é executado em background.
- Ao mudar de aba dentro do app, o rescan é disparado silenciosamente.
- Livros removidos da pasta somem da biblioteca; novos livros aparecem automaticamente.
- O rescan não deve travar a UI — deve ser assíncrono.
- Se nenhuma mudança for detectada, nada acontece visualmente (sem notificação desnecessária).

**Implementação:**
- Criar um hook/evento `onLibraryFocus` disparado nos momentos descritos acima.
- No backend (FastAPI), implementar endpoint de rescan incremental: comparar arquivos em disco com registros no SQLite usando hash ou `mtime`.
- Retornar apenas diff (adicionados/removidos) para o frontend aplicar.
- Evitar rescan duplicado se outro já estiver em andamento (flag de lock ou debounce).

**Critério de conclusão:**
- [ ] Rescan ocorre automaticamente ao sair de leitura.
- [ ] Rescan ocorre automaticamente ao mudar de aba.
- [ ] Novos livros aparecem sem ação manual.
- [ ] Livros removidos somem da biblioteca.
- [ ] UI não trava durante o rescan.

---

## F5 — Seleção de idioma no Onboarding

**Objetivo:** Durante o fluxo de onboarding (primeiro uso), permitir que o usuário escolha o idioma do app antes de configurar a biblioteca.
  
**Comportamento esperado:**
- Uma tela de seleção de idioma é exibida como primeiro passo do onboarding.
- Opções disponíveis: Português (BR), English (e outros idiomas suportados).
- Ao selecionar, toda a interface já é exibida no idioma escolhido dali em diante.
- A escolha é salva e aplicada automaticamente nas sessões seguintes.
- A seleção de idioma também fica acessível nas Configurações para alteração posterior.

**Implementação:**
- Verificar se o Krumer já possui sistema de i18n (ex: `i18next`). Se não, implementar estrutura base com arquivos de tradução por idioma (`locales/pt-BR.json`, `locales/en.json`).
- Adicionar tela de seleção de idioma como `step 0` do onboarding.
- Persistir a escolha em `localStorage` ou nas configurações do app via Electron (`electron-store` ou equivalente).
- Garantir que a mudança de idioma nas Configurações recarregue as strings sem reiniciar o app (ou com reinício mínimo aceitável).

**Critério de conclusão:**
- [ ] Tela de seleção de idioma exibida no onboarding.
- [ ] Idioma aplicado corretamente em toda a interface.
- [ ] Escolha persistida entre sessões.
- [ ] Configuração de idioma acessível nas Configurações.

---

## F6 — Novo estilo de visualização de capítulos (Título ou Título + Capa)

**Objetivo:** Nas Configurações (seção "Geral"), adicionar um botão que altera o modo de exibição dos capítulos de um livro, podendo ser somente pelo título ou com título e capa, similar à visualização de livros na página inicial.

**Comportamento esperado:**
- Dois modos disponíveis:
  - **Somente Título:** lista simples com o nome do capítulo.
  - **Título + Capa:** grid/lista com miniatura da capa do volume + título, no mesmo estilo visual dos livros na biblioteca principal.
- No modo Título + Capa, os livros/volumes permanecem organizados dentro de sua `detail view` (coleção/série), mantendo a hierarquia.
- A preferência é salva e aplicada na próxima abertura.

**Implementação:**
- Adicionar toggle/botão de alternância de modo na seção "Geral" das Configurações.
- Persistir a preferência (`chapter_view_mode: 'title' | 'title+cover'`).
- No componente de lista de capítulos/volumes, aplicar renderização condicional com base na preferência salva.
- Para o modo Título + Capa: reutilizar o componente de card de livro da biblioteca principal, mas dentro do contexto de `detail view` da coleção.

**Critério de conclusão:**
- [ ] Toggle de modo presente nas Configurações > Geral.
- [ ] Modo "Somente Título" funcional.
- [ ] Modo "Título + Capa" funcional, com visual consistente à biblioteca principal.
- [ ] Hierarquia de coleção preservada no modo Título + Capa.
- [ ] Preferência salva entre sessões.

---

## F7 — Tela de atualização com changelog de novas features

**Objetivo:** Refatorar a tela de atualização para exibir uma mensagem contextual sobre o que foi implementado na nova versão, similar ao estilo do HydraLauncher, ao invés de apenas informar que há uma atualização disponível.

**Comportamento esperado:**
- Ao detectar uma nova versão disponível, a tela de atualização exibe:
  - Número da nova versão.
  - Título/subtítulo da release (ex: "Krumer 1.3.0 — Novas Features & Correções").
  - Lista de novas features e correções em formato amigável (não técnico).
  - Botão de atualizar e botão de dispensar/lembrar depois.
- As informações de changelog são buscadas dinamicamente (ex: via GitHub Releases API) para sempre refletir a release mais recente.
- O visual é consistente com a identidade do Krumer (dark, tipografia atual).

**Implementação:**
- Localizar o componente/tela de notificação de atualização atual.
- Criar chamada à GitHub Releases API (`GET /repos/{owner}/{repo}/releases/latest`) para buscar `tag_name`, `name` e `body` da release.
- Parsear o campo `body` (Markdown) e renderizá-lo formatado na tela.
- Implementar estados de loading e fallback (caso a API não responda, exibir mensagem genérica como hoje).
- Garantir que a tela só apareça uma vez por versão (salvar versão já notificada).

**Critério de conclusão:**
- [x] Tela de atualização exibe changelog da nova versão.
- [x] Dados buscados dinamicamente via GitHub Releases API.
- [x] Markdown do body renderizado corretamente.
- [x] Fallback funcional em caso de falha de rede.
- [x] Notificação exibida apenas uma vez por versão.

---

## F8 — Plano de fundo customizável (imagem) [Em observação]

**Objetivo:** Permitir que o usuário escolha uma imagem como plano de fundo do aplicativo, configurável nas Configurações.

**Comportamento esperado:**
- Nas Configurações, uma nova seção "Aparência" (ou dentro da existente) oferece a opção de definir uma imagem de fundo.
- O usuário pode:
  - Selecionar uma imagem do sistema de arquivos.
  - Remover a imagem e voltar ao fundo padrão.
- A imagem é aplicada como background do app com opacidade/overlay ajustável para não comprometer a legibilidade.
- A escolha persiste entre sessões.

**Implementação:**
- Adicionar botão "Escolher imagem" que abre o dialog nativo do Electron (`dialog.showOpenDialog`) filtrado por formatos de imagem (`.jpg`, `.png`, `.webp`).
- Copiar a imagem selecionada para o diretório de dados do app (evitar dependência do caminho original).
- Salvar o path da imagem copiada nas configurações do app.
- No CSS global, aplicar a imagem via variável CSS (`--bg-image`) com `background-image` + overlay semitransparente para manter contraste.
- Botão "Remover fundo" limpa a variável e restaura o padrão.

**Critério de conclusão:**
- [ ] Seleção de imagem via dialog nativo funcional.
- [ ] Imagem aplicada como plano de fundo em todo o app.
- [ ] Overlay/opacidade garante legibilidade da interface.
- [ ] Opção de remover o fundo personalizado.
- [ ] Escolha persistida entre sessões.
