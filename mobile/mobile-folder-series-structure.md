# Spec: Estrutura de pastas — "livro pai" e "livros filho"

**Objetivo:** Fazer o app mobile ler a biblioteca conforme a estrutura descrita no `README.md`, tratando pastas como o **livro pai** (coleção) e os arquivos dentro delas como **livros filho**, com a capa do livro pai vinda do **primeiro capítulo** e um badge de quantidade de volumes no card.

---

## Imagem de referência

Estrutura definida no `README.md` (seção "Como organizar sua biblioteca"):

```
Minha Biblioteca/
│
├── livro-avulso.pdf          →  📘 Livro
├── outro-livro.epub          →  📘 Livro
│
└── Nome da Serie/            →  🗂️ Pasta
    ├── 1. capitulo.pdf       →  📚 Série  (capítulos agrupados)
    ├── 2. capitulo.pdf
    └── 3. capitulo.epub
```

---

## Interpretação no mobile

- **Pasta** = livro pai (coleção/série). Ex.: `Nome da Serie/`.
- **Arquivos dentro da pasta** = livros filho (capítulos/volumes). Ex.: `1. capitulo.pdf`, `2. capitulo.pdf`, `3. capitulo.epub`.
- **Livros avulsos** (arquivos direto na raiz da pasta escaneada) continuam sendo livros únicos, sem pai/filho.
- O pai **não é um arquivo real** — é a pasta. Ele existe apenas como agrupador na biblioteca.

### Modelo de dados

Dois níveis:

```
Book (pai / coleção)   ← folder_path, children = [Book...]
└─ Book (filho / capítulo)   ← cada arquivo dentro da pasta
```

- O filho precisa referenciar o pai (ex.: `parentId`/`collectionId`).
- O pai precisa expor a lista de filhos (ou pelo menos `childrenCount`).

---

## Capa do livro pai

A capa da coleção é a capa do **primeiro capítulo** (o primeiro livro filho, na ordem de nome/leitura dentro da pasta):

1. Ordenar os filhos da pasta por nome de arquivo.
2. O primeiro filho da ordem é o "primeiro capítulo".
3. A capa do pai = capa extraída do primeiro filho (mesma lógica de extração de capa já usada: 1ª página do PDF / capa interna do EPUB).
4. Se a extração falhar, o pai fica sem capa (`coverPath: null`) e usa o fallback de título, sem quebrar a biblioteca.

---

## Badge de volumes no card

No canto **superior direito** do card do livro pai, exibir o marcador de exemplo:

```
2 vol's
```

Regras:

- Texto: `<N> vol's` (ex.: `2 vol's`, `5 vol's`).
- Exibido apenas em cards de **livro pai** (coleções).
- Não exibir em livros avulsos nem em livros filho.
- `N` = quantidade de livros filho dentro da pasta.
- Posição: `absolute`, `top` e `right` sobre a capa, seguindo o padrão de badge já usado no `BookCardContinue`.

### Estrutura visual do card pai

> Proporção do card no mobile: **5/7** (largura : altura).

```
┌─────────────────────┐
│                  ⚠  │  ← badge "2 vol's" (canto superior direito)
│      Capa           │     (capa = 1º capítulo)
│   (5/7, radius 20)  │
│                     │
└─────────────────────┘
 Título da Coleção      ← nome da pasta
 Nome do Autor          ← ou "Autor desconhecido"
 ★★★★☆
```

---

## Arquivos provavelmente envolvidos

> Apenas referência para implementação futura — nenhuma mudança de código neste momento.

- `mobile/src/services/libraryScanner.ts` — hoje já detecta pastas recursivamente, mas **achata** todos os arquivos numa lista única (`scanDirectory` faz `result.push(...nested)`). Precisa passar a distinguir: arquivo direto na raiz (livro avulso) vs. arquivo dentro de pasta (filho de um pai).
- `mobile/src/models/item.ts` — o tipo `Book` precisa de um campo para referenciar o pai (ex.: `parentId?: string | null`) e, no pai, os filhos (ex.: `children?: Book[]` ou o `childrenCount` já existente).
- `mobile/src/components/BookCard.tsx` — precisa do badge "N vol's" no canto superior direito (hoje o card não tem badge; o `BookCardContinue` já tem padrão de badge no canto **superior esquerdo**).
- `mobile/src/components/BookCardContinue.tsx` — referência visual de badge (posição `absolute`, pill arredondada).

---

## Lógica do scanner (comportamento esperado)

Ao escanear `Minha Biblioteca/`:

1. Para cada **arquivo** direto na raiz → criar `Book` avulso (`parentId: null`, sem badge).
2. Para cada **pasta**:
   - criar um `Book` pai com `title` = nome da pasta;
   - `childrenCount` = quantidade de arquivos de livro dentro dela;
   - para cada arquivo dentro da pasta → criar um `Book` filho com `parentId` = id do pai;
   - `childrenCount` dos filhos = `null` (filhos não têm badge).
3. Capa do pai: após a extração das capas dos filhos, usar a capa do **primeiro filho** da ordem de nomes.
4. Reescanear a pasta não deve sobrescrever dados editados manualmente (mesma regra dos specs de scan anteriores).

---

## Chaves de i18n

Adicionar em `mobile/src/i18n/translations.ts`:

| Chave | pt-br | en | es |
|-------|-------|----|----|
| `library.volumesShort` | vol's | vol's | vol's |

> Texto mantido como marcação de exemplo (`2 vol's`), mesmo nos demais idiomas, conforme pedido.

---

## Aceitação

- [ ] Pastas viram o **livro pai** e os arquivos internos viram **livros filho**.
- [ ] A capa do livro pai é a capa do **primeiro capítulo**.
- [ ] Badge no canto **superior direito** do card do pai com `N vol's` (quantidade de livros na coleção).
- [ ] Livros avulsos e livros filho não exibem badge.
- [ ] Reescanear não sobrescreve capas/metadados editados manualmente.
- [ ] `tsc --noEmit` sem erros.