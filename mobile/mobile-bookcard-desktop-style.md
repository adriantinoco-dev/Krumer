# Spec: BookCard — Estilo Desktop

**Objetivo:** Alinhar o card de livro do mobile ao estilo visual do desktop, conforme a imagem de referência.

---

## Imagem de referência

Cards do desktop (`frontend/styles/library.css`):

- Capa com `border-radius: 16px`, sem borda/outline.
- Título abaixo da capa, serif bold, 1 linha com ellipsis, alinhado à esquerda.
- Autor abaixo do título, menor, cor muted (#888888), 1 linha com ellipsis.
- Estrelas abaixo do autor, alinhadas à esquerda, sem fundo/pill — apenas ícones Star em sequência.
- Se não houver autor, exibir `"autor desconhecido"` (traduzido por idioma).

---

## Mudanças em `mobile/src/components/BookCard.tsx`

### 1. Remover a barra de avaliação sobreposta na capa

Remover todo o `<View>` com `position: 'absolute'` (linhas 69-95) que contém a pill `RATING_BG` e as estrelas.

Remover as constantes não utilizadas:
- `RATING_BG`
- `RATING_HEIGHT`

### 2. Adicionar estrelas abaixo do autor

Adicionar um novo bloco de estrelas **abaixo do texto do autor** (ou abaixo do título se não houver autor).

Estrutura do card após mudança:

```
┌─────────────────────┐
│                     │
│      Capa           │
│   (3/4, radius 20)  │
│                     │
└─────────────────────┘
 Título do Livro        ← serif bold, 12px, textPrimary
 Nome do Autor          ← serif, 11px, textMuted (ou "autor desconhecido")
 ★★★★☆                 ← 5 ícones Star, alinhados à esquerda
```

Posicionamento das estrelas:
- `flexDirection: 'row'`
- `marginTop: 4`
- `alignItems: 'center'`
- Tamanho fixo de cada estrela: `14`
- Cores: `STAR_FILLED` (#ffda4d) e `STAR_EMPTY` (#414141ff)
- Sem fundo/pill — apenas os ícones
- Espaço horizontal entre estrelas: `marginHorizontal: 1`

### 3. Fallback de autor

Quando `book.author` for vazio, nulo ou `''`, exibir o texto traduzido `t('library.unknownAuthor')`.

Substituir:
```tsx
{Boolean(book.author) && (
  <Text ...>{book.author}</Text>
)}
```

Por:
```tsx
<Text ...>{book.author || t('library.unknownAuthor')}</Text>
```

### 4. Ajustar `starSize` para tamanho fixo

Remover o cálculo dinâmico de `starSize`. Usar valor fixo `14` (conforme desktop `.book-rating svg { width: 14px; height: 14px }`).

---

## Chave de i18n

Adicionar `'library.unknownAuthor'` em `mobile/src/i18n/translations.ts`:

| Código | Texto |
|--------|-------|
| `pt-br` | Autor desconhecido |
| `en` | Unknown author |
| `es` | Autor desconhecido |

---

## Aceitação

- [ ] Sem borda/outline na capa.
- [ ] Título serif bold abaixo da capa, 1 linha, ellipsis.
- [ ] Autor abaixo do título, muted, 1 linha, ellipsis.
- [ ] Se sem autor → exibe "Autor desconhecido" (traduzido).
- [ ] Estrelas abaixo do autor, alinhadas à esquerda, sem pill de fundo.
- [ ] `tsc --noEmit` sem erros.
