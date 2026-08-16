# Restyle mobile: onboarding e tipografia

## Objetivo

Reestruturar o visual do app mobile alinhando-o ao padrão visual do desktop:

- usar `Krumer-icon.png` como ícone do app no onboarding, **sem** o texto "KRUMER";
- exibir os textos dos livros (título/autor) igual ao desktop, **alinhados à esquerda**;
- usar tipografia **100% serif** em todo o app;
- usar as cores padrão do desktop (`frontend/styles/library.css` + `main.css`) no tema mobile.

## Fora de escopo (não mexer)

- A **capa** do livro (imagem, placeholder, moldura, overlay).
- A **proporção da capa** (`aspect-ratio 3/4` do `BookCard`).
- A **visualização das estrelas** (barra inferior sobre a capa no mobile).
- Extração de capas PDF/EPUB (fluxo já implementado).
- Navegação, leitores PDF (conteúdo próprio) e lógica de scan.

---

## Cores padrão (fonte: `frontend/styles/main.css`)

Valores canônicos que devem ser usados no tema mobile (`mobile/src/theme/colors.ts`).

### Dark (padrão do app)
| Token mobile | Valor |
|---|---|
| `bg` (--bg-primary) | `#111111` |
| `surface` (--bg-secondary) | `#161616` |
| `card` (--bg-card) | `#202020` |
| `cardHover` (--bg-card-hover) | `#262626` |
| `border` | `#2e2e2e` |
| `textPrimary` | `#f1f1f1` |
| `textSecondary` | `#cccccc` |
| `textMuted` (--text-muted) | `#888888` |
| `accent` | `#f97316` |

### Light
| Token mobile | Valor |
|---|---|
| `bg` | `#ffffff` |
| `surface` | `#f5f5f5` |
| `card` | `#ffffff` |
| `cardHover` | `#ececec` |
| `border` | `#e0e0e0` |
| `textPrimary` | `#1a1a1a` |
| `textSecondary` | `#4a4a4a` |
| `textMuted` | `#777777` |
| `accent` | `#f97316` |

### Sepia
| Token mobile | Valor |
|---|---|
| `bg` | `#f4ecd8` |
| `surface` | `#ece2c8` |
| `card` | `#f0e6cc` |
| `cardHover` | `#e6dab8` |
| `border` | `#d8c9a3` |
| `textPrimary` | `#3b2f1e` |
| `textSecondary` | `#5c4c33` |
| `textMuted` | `#8a7a5c` |
| `accent` | `#f97316` |

> O acento do desktop é `#f97316` (laranja). O tema mobile hoje usa `#c8a96e` (dourado) — alinhar ao laranja padrão.

---

## Tipografia serif

### Token de fonte
Criar `mobile/src/theme/typography.ts` com:

```ts
import { Platform } from 'react-native';

export const serifFont = Platform.select({
  ios: 'Georgia',   // igual ao desktop
  default: 'serif', // Noto Serif no Android
});
```

- No iOS usa `Georgia` (fonte serif do desktop).
- No Android usa a família genérica `serif` (Noto Serif), já que Georgia não existe no sistema.

### Aplicação
Aplicar `fontFamily: serifFont` em **todos** os `Text` do app:

- `BookCard` (título + autor abaixo da capa);
- `KrumerLogo` (label do logo);
- `OnboardingScreen` (slides setup/library/api);
- `LibraryScreen`, `ListsScreen`, `SettingsScreen`, `SettingsGroupScreen`;
- `ReaderScreen` (barra superior, % e modal de ajustes);
- componentes: `LangPicker`, `ListCard`, `ScanProgress`, `ThemeCard`, `SettingsRow`, `FolderPickerField`, `ApiKeyInput`;
- `App.tsx` (tela de loading + labels das tabs via `tabBarLabelStyle`).

### Exceções deliberadas (mono técnico)
Manter monospace (`Courier`) apenas em campos técnicos:
- `ApiKeyInput` (chave Gemini);
- nome do arquivo no `ScanProgress`.

> Decisão a confirmar: se preferir, essas duas exceções também podem virar serif.

### Leitura EPUB (webview)
No `EpubReader`, definir a fonte padrão do epub.js como serif no `openBook`:

```js
rendition.themes.default({
  body: { 'font-family': 'Georgia, serif' }
});
```

---

## Onboarding

### Ícone do app
- Substituir `<KrumerLogo compact />` por apenas o ícone `Krumer-icon.png` **sem o texto "KRUMER"**.
- Adicionar prop `hideLabel` em `KrumerLogo` (default `false`) para ocultar o texto e renderizar só o `Image`.
- Tamanho sugerido no slide setup: `104x104` (ícone de app, contém).
- Manter o layout dos 3 slides (setup → library → api) e a navegação atual.

### Tipografia das telas
- Títulos usam serif (token acima), tamanho atual (`24` no onboarding, `26` nas telas) mantido.
- Textos de apoio, labels e botões herdam serif.

---

## Títulos dos livros (BookCard) — igual ao desktop

Referência desktop (`library.css`):

```css
.book-title { font-size: 12px; font-weight: 600; color: var(--text-primary);
  margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.book-meta { font-size: 11px; color: var(--text-muted); font-weight: 700;
  margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

### Mudanças no `BookCard`
- **Título** (abaixo da capa): `textAlign: 'left'`, `fontFamily: serif`, `fontSize: 12`, `fontWeight: '600'`, `color: textPrimary`, `numberOfLines: 1`, `ellipsizeMode: 'tail'`, `marginTop: 8`.
- **Autor**: `textAlign: 'left'`, `fontFamily: serif`, `fontSize: 11`, `fontWeight: '700'`, `color: textMuted` (novo token), `numberOfLines: 1`, `ellipsizeMode: 'tail'`, `marginTop: 2`.
- O texto do **placeholder da capa** (fallback) **não muda**.
- A **barra de estrelas** **não muda**.

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `mobile/src/theme/colors.ts` | Paleta alinhada ao desktop + token `textMuted` |
| `mobile/src/theme/typography.ts` | **novo** — token serif |
| `mobile/src/theme/index.ts` | export do typography |
| `mobile/src/components/BookCard.tsx` | título/autor à esquerda + serif |
| `mobile/src/components/KrumerLogo.tsx` | prop `hideLabel` |
| `mobile/src/screens/OnboardingScreen.tsx` | ícone sem texto + serif |
| `mobile/src/readers/EpubReader.tsx` | fonte serif no epub.js |
| `mobile/src/screens/*` + `App.tsx` | `fontFamily` serif em todos os `Text` |
| `mobile/src/components/*` | `fontFamily` serif (exceto exceções mono) |

---

## Critérios de aceite

- Onboarding mostra apenas o ícone (`Krumer-icon.png`), sem "KRUMER".
- Títulos dos livros aparecem alinhados à esquerda, com ellipsis em 1 linha, como no desktop.
- Todo texto do app usa fonte serif (exceto as exceções mono documentadas).
- Capa, proporção da capa e estrelas permanecem intactas.
- Cores seguem o padrão desktop (acento `#f97316`, fundos/textos por tema).
- `npx tsc --noEmit` passa sem erros.
- App compila e roda via `npx expo run:android` sem regressão visual nas capas.