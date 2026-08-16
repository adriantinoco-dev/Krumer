# Spec: LibraryScreen — Estilo Desktop

**Objetivo:** Reestruturar a tela Biblioteca do mobile para espelhar o layout do desktop, com seções "Continuar Lendo" e "Minha Biblioteca", badges de volume e contadores por seção.

---

## Imagem de referência

O desktop exibe:
1. **"Continuar Lendo"** — seção no topo com scroll horizontal de livros que o usuário começou a ler (a partir da 2ª página).
2. **"Minha Biblioteca"** — grid abaixo com todos os livros. Título da seção com contador "(31 itens)".
3. Separador visual (borda inferior) entre as duas seções.
4. Barra de busca no topo (não implementar neste spec — fica para outro momento).

---

## Mudanças em `mobile/src/screens/LibraryScreen.tsx`

### 1. Estrutura geral

Substituir o FlatList único por um `ScrollView` com duas seções:

```
SafeAreaView
  └─ ScrollView
       ├─ Header (título "Minha Biblioteca" + contador)
       ├─ "Continuar Lendo" (seção condicional, só se houver livros lidos a partir da 2ª pág)
       │    └─ FlatList horizontal (book cards menores)
       ├─ Separador visual (borderBottom)
       └─ "Minha Biblioteca" (grid principal)
            └─ FlatList numColumns (book cards normais)
```

### 2. Header

Posicionar o título "Minha Biblioteca" com o contador de itens ao lado:

```
Minha Biblioteca  (N itens)
```

- Título: `serifFont`, 20px, bold, `textPrimary`
- Contador: `serifFont`, 13px, `textMuted`, marginLeft 8
- Alinhamento: `flexDirection: 'row'`, `alignItems: 'baseline'`
- Padding: `spacing.md` horizontal, `spacing.md` top

### 3. Seção "Continuar Lendo"

**Condição de exibição:** Só aparece se existir pelo menos 1 livro com `progress` diferente de `null`, `'0'` e `'100'` — ou seja, livros que o usuário já começou a ler (a partir da 2ª página).

**Título da seção:**
```
Continuar Lendo  (N itens)
```
- `serifFont`, 17px, bold, `textPrimary`
- Contador: 13px, `textMuted`, marginLeft 8
- Padding horizontal: `spacing.md`
- MarginBottom: `spacing.sm`

**Scroll horizontal:**
- `FlatList` com `horizontal={true}`, `showsHorizontalScrollIndicator={false}`
- `contentContainerStyle: { paddingHorizontal: spacing.md, gap: spacing.md }`
- Cada item: `BookCardContinue` (componente novo, ver §5)
- Altura fixa do card: `220px` (cover 160px + texto 56px)

**Separador inferior:**
- `View` com `borderBottomWidth: 1`, `borderBottomColor: theme.border`
- MarginHorizontal: `spacing.md`
- MarginBottom: `spacing.lg`

### 4. Seção "Minha Biblioteca"

**Título da seção:** (reutiliza o header global — não precisa de título separado)

**Grid:**
- `FlatList` com `numColumns` (3 em phone, 5 em tablet — lógica atual)
- `contentContainerStyle: { paddingBottom: spacing.xl }`
- Cada item: `BookCard` existente (já atualizado no spec anterior)

### 5. Componente `BookCardContinue` (novo)

Criar em `mobile/src/components/BookCardContinue.tsx`.

Estrutura visual:
```
┌──────────────────────┐
│                      │ 
│                      │
│      Capa            │ ← 3/4, borderRadius 16, sem borda
│                      │
└──────────────────────┘
 Título do Livro        ← serif, 12px, bold, textPrimary, 1 linha
 Nome do Autor          ← serif, 11px, textMuted, 1 linha
```

**Props:** `{ book: Book; width: number; onPress: () => void }`

**Detalhes:**
- Largura fixa: `140px` (prop `width` ignorada para manter consistência no scroll)
- Cover: `width: 140`, `height: 187` (proporção 3/4), `borderRadius: 16`, `overflow: 'hidden'`
- Badge: posição `absolute`, top 8, left 8, `backgroundColor: theme.accent`, `borderRadius: 12`, `paddingHorizontal: 8`, `paddingVertical: 4`
- Texto do badge: `serifFont`, 10px, bold, branco (`#ffffff`)
- Texto do badge: `${childrenCount} vol(s)` — onde `childrenCount` é a quantidade de capítulos/volumes da série
- Se `childrenCount` for `undefined`, `null` ou `<= 1`, não exibir badge (livros avulsos não têm badge)
- Título: `numberOfLines={1}`, `ellipsizeMode="tail"`
- Autor: `numberOfLines={1}`, `ellipsizeMode="tail"`, fallback `"Autor desconhecido"`

### 6. Campo `childrenCount` no modelo `Book`

Adicionar campo opcional ao tipo `Book` em `mobile/src/models/item.ts`:

```ts
export type Book = {
  // ...campos existentes
  childrenCount?: number | null; // quantidade de capítulos/volumes (séries)
};
```

Atualizar `libraryScanner.ts` para preencher `childrenCount`:
- Para livros avulsos (arquivo direto): `childrenCount = null`
- Para séries (pasta com capítulos): `childrenCount = <número de arquivos na pasta>`

### 7. Chaves de i18n

Adicionar em `mobile/src/i18n/translations.ts`:

| Chave | pt-br | en | es |
|-------|-------|----|----|
| `library.continueReading` | Continuar Lendo | Continue Reading | Seguir Leyendo |
| `library.items` | itens | items | items |

### 8. Lógica de filtragem

No `LibraryScreen`, derivar:

```ts
// Livros que o usuário começou a ler (a partir da 2ª página)
const continueReading = books.filter(
  (b) => b.progress && b.progress !== '0' && b.progress !== '100'
);
```

Se `continueReading.length === 0`, ocultar toda a seção "Continuar Lendo" (inclusive o título e separador).

---

## Aceitação

- [ ] Header "Minha Biblioteca (N itens)" no topo.
- [ ] Seção "Continuar Lendo" aparece só se houver livros com progresso > 0 e < 100.
- [ ] Scroll horizontal de "Continuar Lendo" com cards menores (140px).
- [ ] Badge laranja no canto superior esquerdo da capa mostrando quantidade de volumes (séries apenas).
- [ ] Livros avulsos não exibem badge de volumes.
- [ ] Separador visual entre as seções.
- [ ] Grid "Minha Biblioteca" abaixo com BookCard existente.
- [ ] Títulos e contadores com tipografia serif.
- [ ] `tsc --noEmit` sem erros.
