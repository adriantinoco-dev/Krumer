# Ações de seleção de texto no leitor EPUB mobile

## Objetivo e escopo

Implementar no Krumer Mobile uma barra contextual própria para **Selecionar tudo** e **Copiar**, além de uma escolha de ação instantânea no topo do leitor. A paleta aplica highlights diretamente à seleção. A barra acompanha a seleção e usa cores compatíveis com os temas dark, claro e sépia.

Não incluir busca, tradução, dicionário, leitura em voz alta, compartilhamento, estilos de sublinhado ou outros comandos.

## Referência Readest e adaptação

O Readest separa a ação rápida escolhida no cabeçalho da barra mostrada junto à seleção. Esse fluxo está em `QuickActionMenu.tsx`/`HeaderBar.tsx`; a captura `Range`/CFI e o posicionamento da barra estão em `useTextSelector.ts`, `Annotator.tsx` e `AnnotationPopup.tsx`. No Android, `SelectionMenuSuppressor.kt` intercepta o `ActionMode` para conservar a seleção e suas alças sem exibir o menu do sistema.

O leitor do Krumer usa epub.js em uma WebView, com CFIs para persistir highlights. A implementação usará o texto, o `Range` e o CFI já produzidos pelo runtime do Krumer; a posição será convertida do documento XHTML/iframe para o viewport da WebView. A prop `menuItems={[]}` do `react-native-webview` será aplicada somente ao leitor EPUB para ocultar o menu nativo mantendo a seleção DOM.

## Comportamento

- Ao concluir long-press ou ajuste das alças, o runtime publica um snapshot da seleção com texto, CFI, retângulo visível e dimensões do viewport. O snapshot é enviado após o gesto, não a cada alteração intermediária do `Range`.
- No modo normal, uma barra flutuante junto à seleção oferece Selecionar tudo e Copiar, além de cinco cores de highlight: vermelho, amarelo, verde, azul e roxo. Amarelo é o padrão.
- Selecionar tudo amplia a seleção somente até os CFIs inicial e final da localização visível do epub.js; não seleciona o capítulo ou o livro inteiro.
- Tocar em uma cor aplica imediatamente o highlight à seleção inteira atual e salva essa cor como a preferência para os próximos highlights. Não há um botão separado de Destacar.
- Cada highlight continua salvando sua própria cor junto ao CFI e ao trecho no SQLite existente.
- O botão de ação rápida no topo abre apenas Copiar instantâneo e Destacar instantâneo. Tocar na ação ativa novamente a desativa. Com uma ação ativa, executá-la uma vez quando a seleção estiver concluída; a seleção e a barra contextual permanecem disponíveis.
- Toque fora e navegação limpam a seleção e fecham a barra conforme o fluxo atual. A posição do leitor, a rendition e a WebView não podem mudar como efeito da seleção.
- Em modo paginado, texto, CFI e retângulo permanecem dentro da localização visível. Em modo scroll, usar o retângulo visível no viewport atual.

## Contratos e persistência

- `SELECTION_READY` inclui o retângulo da seleção em coordenadas CSS do viewport externo e a largura/altura desse viewport. O parser valida números finitos e dimensões positivas.
- A camada React Native escala essas coordenadas para a área medida do leitor e limita a barra às bordas disponíveis, posicionando-a acima da seleção ou abaixo quando faltar espaço.
- A ação instantânea e a cor escolhida são preferências globais em AsyncStorage. Preferências antigas sem cor continuam válidas e recebem amarelo.
- Cores usam identificadores estáveis (`red`, `yellow`, `green`, `blue`, `purple`); o runtime os converte em preenchimentos visuais. Highlights existentes em amarelo permanecem compatíveis, sem migração de banco.
- O menu nativo é suprimido somente na WebView EPUB. As alças e a seleção nativa do texto permanecem disponíveis.

## Critérios de validação

- Verificar seleção de palavra e trecho longo, ajuste das alças, Selecionar tudo dentro da página visível, cópia fiel, highlight imediato ao tocar em uma cor, troca de cor e persistência após reabrir o livro.
- Verificar capítulos e apresentação, modos paginado e scroll, seleções próximas às bordas, temas dark/claro/sépia e menu nativo ausente com alças visíveis.
- Confirmar que a seleção não vira página, não oscila o viewport, não chama `rendition.resize()` e não remonta/recarrega a WebView.
