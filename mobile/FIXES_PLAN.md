# Plano de Correções — Krumer Mobile

Este documento descreve, em fases `F1`, `F2` e `F3`, as três correções solicitadas no app
Android (React Native + Expo) e registra o status da execução. A implementação do F3 usa o
`ActionSheetModal`, componente compartilhado já existente que cumpre o papel do wrapper
`BottomSheetModal` descrito originalmente neste plano.

Arquivos de referência principais:

- `mobile/src/components/BookCard.tsx` — renderização dos cards e barra de progresso.
- `mobile/src/services/coverExtractor.ts` — extração de capa de EPUB/PDF.
- `mobile/src/services/libraryScanner.ts` — escaneamento e descoberta de livros.
- `mobile/src/components/BookListModal.tsx` — modal bottom-sheet (animação de referência).
- `mobile/src/components/ReadingSettingsModal.tsx` — modal bottom-sheet semelhante.
- `mobile/src/components/SettingsModal.tsx` — modal central (estilo diferente).

---

## F1 — Barra de progresso dos cards só com progresso real (1 < x ≤ 100)

### Contexto / problema

Em `BookCard.tsx` (linhas 116–139) a faixa de progresso é **sempre** renderizada no rodapé
do card, independentemente de o livro ter sido lido. Hoje ela aparece mesmo em livros com
`progressPct = 0` (barra vazia) e em livros já concluídos (`progressPct = 100` / `isRead`),
poluindo o grid.

Requisito: a barra deve aparecer **somente** quando o livro tem progresso de fato, ou seja
`progressPct > 1` **e** `progressPct ≤ 100`. (Em outras palavras: iniciado, mas não zerado nem
ainda marcado como 100% vazio.)

### Causa raiz

O bloco da barra de progresso é montado incondicionalmente dentro do `<View>` da capa.
Não existe nenhuma guarda (`if`) que omita o componente quando não há progresso relevante.

### Passos de implementação

1. **Calcular a visibilidade da barra** logo após obter `book.progressPct` (perto da linha 28):

   ```ts
   const progressPct = book.progressPct ?? 0;
   const showProgressBar = progressPct > 1 && progressPct <= 100 && !(book.isRead && progressPct >= 100);
   ```

   > Nota de produto: o critério literal do pedido é `>1 && <=100`. Se o livro estiver
   > `isRead` (progresso 100 "cheio"), avaliar se a barra deve sumir também — alinhar com o
   > comportamento desktop (F1 do desktop esconde quando 0 ou 100). Recomenda-se esconder
   > tanto em `0` quanto em `100`/`isRead`, mostrando só o intervalo `1–99`. Ajustar o
   > operador para `progressPct > 1 && progressPct < 100` conforme definição final.

2. **Envolver o bloco da barra** (linhas 117–139) com a guarda, retornando `null` quando
   `!showProgressBar`. Manter o `<Animated.View>` interno intacto para não quebrar a animação
   de entrada (`animatedProgress`).

3. **Não quebrar a animação existente**: o `useEffect` que anima `animatedProgress`
   (linhas 34–47) pode continuar rodando; ele só não será visualizado quando a barra estiver
   oculta. Opcionalmente, pular o `Animated.timing` quando `!showProgressBar` para economia.

4. **Consistência com `BookCardContinue`** (`mobile/src/components/BookCardContinue.tsx`):
   verificar se esse componente também renderiza barra de progresso e aplicar a mesma regra,
   para manter o "Continuar lendo" coerente.

### Critérios de aceitação

- Card com `progressPct = 0` → sem barra.
- Card com `progressPct = 1` → sem barra (limite inferior exclusivo).
- Card com `1 < progressPct < 100` → barra visível e animada.
- Card com `progressPct = 100` ou `isRead` → sem barra (ou barra cheia, conforme decisão do
  passo 1).

### Verificação (manual)

- Escanear biblioteca, abrir um livro, ler algumas páginas → barra aparece.
- Reiniciar app com livros zerados e concluídos → nenhuma barra nesses cards.

---

## F2 — Capa incorreta de EPUB no escaneamento (ex.: 3º Harry Potter pega capa do 4º)

### Contexto / problema

A extração de capa de EPUB em `coverExtractor.ts` (`extractEpubCover`, linhas 211–346) aplica
uma sequência de estratégias (A→E) e, por fim, dois fallbacks. Em certos EPUBs (relatado com a
série Harry Potter) o livro 3 acaba exibindo a capa do livro 4. Há duas hipóteses principais,
que devem ser investigadas e corrigidas em conjunto.

### Hipótese A — Fallbacks pouco confiáveis escolhem imagem errada

Estratégias frágeis no código atual:

- **Estratégia E** (linhas 291–303): usa o **primeiro item do `<spine>`** como capa. Em muitos
  EPUBs o primeiro `itemref` é a página de rosto/conteúdo e não a capa de fato; se essa página
  referencia uma imagem, ela é usada como capa.
- **Fallback "maior imagem do ZIP"** (linhas 318–339): pega a imagem com maior `byteLength`.
  EPUBs de box/omnibus ou com imagens internas de alta resolução (ex.: ilustrações, mapas, ou
  até capas de outros volumes embutidas no mesmo arquivo) vencem a "capa real". É a causa mais
  provável do caso Harry Potter 3 → 4: o EPUB contém múltiplas capas e a maior é a do vol. 4.

### Hipótese B — Cache de capa instável por `bookId`

As capas são salvas em `cover_${bookId}.${ext}` (linha 193) onde `bookId = createBookId(filePath)`
(`libraryScanner.ts`, linhas 29–36) — um hash do **caminho completo** do arquivo. Se o URI muda
entre escaneamentos (prefixo `file://`, encode diferente, etc.), o `bookId` muda e
`getExistingCoverPath` (linhas 181–189) pode não encontrar a capa já salva, forçando
re-extração, ou então reaproveitar arquivo de outro livro em casos de colisão de hash. O
`fingerprint` (`libraryScanner.ts`, linhas 62–65: `file|basename|tamanho`) é **estável** e seria
uma chave de cache muito melhor.

### Passos de implementação

1. **Fortalecer a ordem e a confiabilidade das estratégias** em `extractEpubCover`:

   - Manter **A** (EPUB3 `properties="cover-image"`) e **B** (EPUB2 `<meta name="cover">`) como
     prioridade máxima — são declarativas e quase nunca erram.
   - Manter **C** (guide `type="cover"`) como reforço.
   - **Remover ou despromover a Estratégia E** (primeiro `itemref` do spine). Ela deve ser usada
     **somente** se o XHTML resultante contiver uma única `<img>` centralizada e de proporção de
     capa (ex.: largura ≥ altura ou relação próxima de 2:3), senão ignorar.
   - **Remover o fallback "maior imagem do ZIP"** (linhas 318–339). Substituir por um fallback
     que aceite **apenas** imagens cujo nome de arquivo seja explicitamente `cover`/`capa`/
     `cover_image` (já parcialmente coberto em linhas 307–316) e, se nada disso existir, retornar
     `null` (livro fica sem capa) em vez de chutar a maior imagem.

2. **Adicionar validação de proporção/dimensões** antes de aceitar uma imagem como capa:
   decodificar apenas o cabeçalho da imagem para obter largura/altura e exigir uma proporção
   razoável de capa de livro (ex.: `0.5 ≤ w/h ≤ 0.8` para retrato). Rejeitar imagens que claramente
   são internas (quadradas, muito largas, minúsculas).

3. **Usar `fingerprint` estável como chave de cache** em vez de `bookId`:
   - Em `libraryScanner.ts`, propagar o `fingerprint` até a extração (ou passá-lo para
     `extractCover`/`extractEpubCover`).
   - Em `coverExtractor.ts`, salvar/ler capas como `cover_${fingerprint}.${ext}` em
     `saveCoverData` e em `getExistingCoverPath`. Isso garante reuso correto entre scans e evita
     colisão/confusão de capas entre livros.
   - Manter `getExistingCoverPath` recebendo o fingerprint para checagem prévia.

4. **Logging de diagnóstico**: ao final das estratégias, caso nenhuma capa seja encontrada,
   manter o `console.warn` já existente (linha 343) incluindo o `bookId`/`fingerprint` e a
   estratégia vencedora quando houver, para facilitar depuração de outros EPUBs problemáticos.

5. **Teste com os EPUBs reais**: colocar os volumes 3 e 4 de Harry Potter na pasta de teste e
   confirmar que cada card exibe sua própria capa.

### Critérios de aceitação

- Cada EPUB exibe sua própria capa (vol. 3 ≠ vol. 4).
- EPUBs sem capa declarada ficam sem capa (placeholder de título) em vez de exibir imagem
  interna errada.
- Re-scan reaproveita a capa correta (sem re-extrair nem misturar).

### Verificação

- `npx expo prebuild && npx expo run:android` (necessário por causa de módulos nativos, embora
  esta correção seja JS puro no `coverExtractor`).
- Testar manualmente com a biblioteca que reproduz o bug.

---

## F3 — Reutilizar as animações do `BookListModal` em modais semelhantes `[x]`

### Contexto / problema

`BookListModal.tsx` implementa uma animação de bottom-sheet de alta qualidade (linhas 37–99):

- `backdropAnim` (fade in/out do overlay, `rgba(0,0,0,0.55)`).
- `slideAnim` (translateY 450 → 0 na entrada, 0 → 450 na saída, com `Easing.out/in(Easing.cubic)`).
- `mounted`/`renderedBook`/`isClosing` para manter o componente montado durante a animação de
  saída (fechamento suave, sem "piscar"), e `pointerEvents` desligado durante o fechamento.

Já `ReadingSettingsModal.tsx` (linhas 61–216) é **também um bottom-sheet**, mas usa apenas
`animationType="slide"` (nativo, sem fade no backdrop e sem o mesmo controle de saída), e
`SettingsModal.tsx` usa `animationType="fade"` central. Há duplicação de padrão e inconsistência
visual entre modais semelhantes.

### Objetivo

Extrair a lógica de animação do `BookListModal` para um **hook/componente reutilizável** e
aplicá-lo a `ReadingSettingsModal` (e, opcionalmente, a `SettingsModal` se fizer sentido como
bottom-sheet ou como modal central com o mesmo padrão de fade).

### Passos de implementação

1. **Criar `mobile/src/components/BottomSheetModal.tsx`** — um componente wrapper que encapsula:

   - Os `Animated.Value` `backdropAnim` e `slideAnim`.
   - O efeito `useEffect` de entrada/saída (paralelo fade + slide) exatamente como em
     `BookListModal` linhas 50–99.
   - O estado `mounted`/`isClosing`/`renderedChildren` para manter montagem durante a saída.
   - O overlay `TouchableWithoutFeedback` com backdrop animado.
   - O `Animated.View` do sheet (raio superior, `maxHeight`, `padding`) recebendo `children`.
   - Props: `visible`, `onClose`, `children` (e talvez `maxHeight`, `renderHandle`).

   ```tsx
   export function BottomSheetModal({ visible, onClose, children, maxHeight = '60%' }: Props) { ... }
   ```

2. **Refatorar `BookListModal.tsx`** para usar `BottomSheetModal`, movendo apenas o conteúdo
   interno (handle, título, lista de ações) para `children`. A animação passa a vir do wrapper,
   eliminando o código duplicado das linhas 37–99 e 142–166.

3. **Refatorar `ReadingSettingsModal.tsx`** para usar `BottomSheetModal` no lugar do
   `Modal animationType="slide"` + `Pressable` manual. Remover o `Pressable` de fechamento
   manual e o `animationType="slide"`; o backdrop e o slide passam a ser idênticos ao
   `BookListModal`. Manter todo o conteúdo de configurações de leitura como `children`, incluindo
   o handle (ou deixar o wrapper renderizar o handle).

4. **(Opcional) `SettingsModal.tsx`**: avaliar se faz sentido torná-lo também bottom-sheet
   (reaproveitando `BottomSheetModal`) ou manter central por ser semanticamente diferente. Se
   mantido central, extrair ao menos o padrão de fade do backdrop para um `CenterModal` similar,
   garantindo consistência de timing/easing com o `BookListModal`.

5. **Criar hook `useBottomSheetAnimation` (opcional)**: se preferir não criar componente wrapper,
   extrair a lógica de animação para um hook que retorna `{ backdropAnim, slideAnim, mounted,
   isClosing, rendered, setRendered }` e usá-lo em ambos os modais. O componente wrapper (passo 1)
   é a abordagem recomendada por reduzir mais duplicação.

### Critérios de aceitação

- `BookListModal` e `ReadingSettingsModal` abrem/fecham com exatamente a mesma animação
  (fade do backdrop + slide do sheet, tempos e easings iguais).
- Nenhum "piscar" no fechamento (estado `mounted`/`isClosing` preservado).
- Sem duplicação da lógica de `Animated.timing` entre os modais.
- Onboarding e demais telas não são afetados.

### Verificação

- Abrir/fechar o modal de lista (long-press num card) e o modal de configurações de leitura
  (leitor) e comparar visualmente a animação.
- `npx expo run:android` para validar em device/emulador.

---

## Ordem sugerida de execução

1. **F1** — baixo risco, isolado em `BookCard.tsx`.
2. **F3** — refatoração de UI, melhora manutenibilidade (pode ser feito antes do F2).
3. **F2** — correção de bug mais sensível; exigir teste com os EPUBs reais (Harry Potter 3/4).

## Checklist de PR

- [ ] Atualizar `CHANGELOG.md` com as três correções (convenção do projeto).
- [ ] Rodar lint/typecheck do `mobile/` (ex.: `npx tsc --noEmit` ou o script do package.json).
- [ ] Testar em Android via `npx expo prebuild && npx expo run:android`.
- [ ] Nenhum comportamento de desktop afetado (alterações restritas a `mobile/`).
