# Benchmark dos motores PDF

A Fase 5 compara `react-native-pdf` e PDF.js/foliate-js no mesmo aparelho e com
as mesmas obras. O WebView só pode virar candidato a piloto depois dos gates
abaixo; o motor nativo continua sendo o rollback.

## Coleta

Use uma development build, um aparelho/emulador Android e fixtures de 1, 5, 50
e 300 páginas (texto, digitalizado, HQ grande e dimensões variadas). Para cada
engine, escolha o motor em **Configurações → Leitura → Motor de PDF**, limpe o
logcat e execute o mesmo roteiro. Faça pelo menos cinco aberturas frias e cinco
quentes, além de 30 trocas sequenciais de página:

```powershell
adb logcat -c
# abrir os PDFs, trocar páginas/modos, girar, aplicar zoom, links, marcadores e notas
npm run benchmark:pdf-engines -- --engine native --out native.json

adb logcat -c
# repetir exatamente o mesmo roteiro com WebView
npm run benchmark:pdf-engines -- --engine webview --out webview.json

npm run benchmark:pdf-engines -- --compare native.json webview.json
```

Para medir esta otimização contra o commit-base (o relatório antigo na primeira
posição), use:

```powershell
npm run benchmark:pdf-engines -- --compare-baseline webview-before.json webview-after.json
```

O comparador de baseline exige redução de 30% no p50 da primeira imagem e da
troca visual, nenhum aumento no p95, PSS até 10% acima do baseline e no máximo
5% dos frames acima de 24 ms durante o hold de volume. Relatórios no schema 1
continuam aceitos como baseline; novas coletas usam o schema 2.

Também é possível analisar um logcat já exportado:

```powershell
adb logcat -d -v brief > webview.log
npm run benchmark:pdf-engines -- --engine webview --log webview.log --snapshot --out webview.json
```

### A/B da camada de composição Android

O WebView permanece em `androidLayerType="none"` por padrão. A alternativa
`hardware` existe somente como chave de benchmark e deve ser testada no mesmo
aparelho, PDF e roteiro. Reinicie o Metro entre as duas coletas:

```powershell
$env:EXPO_PUBLIC_PDF_WEBVIEW_LAYER_TYPE='none'
npx expo start --dev-client --clear
# execute o roteiro, em outro terminal:
npm run benchmark:pdf-engines -- --engine webview --layer none --out layer-none.json

$env:EXPO_PUBLIC_PDF_WEBVIEW_LAYER_TYPE='hardware'
npx expo start --dev-client --clear
# repita exatamente o roteiro:
npm run benchmark:pdf-engines -- --engine webview --layer hardware --out layer-hardware.json
```

O relatório registra o valor realmente emitido pelo runtime em
`androidLayerType` e avisa se ele divergir de `--layer`. Compare primeira página,
zoom, troca de página, PSS, CPU, temperatura e estabilidade; `hardware` não vira
padrão automaticamente. Em builds de produção, a variável `EXPO_PUBLIC_` é
incorporada ao bundle e cada variante exige sua própria build.

O relatório separa runtime pronto, documento aberto, preview visível, qualidade
final e camadas interativas prontas. Também contém latências p50/p95 de
navegação e zoom, acertos de preload, ranges/bytes WebView, frames lentos no
scroll por volume, PSS, CPU, temperatura e indicadores de ANR, crash e OOM.
Os eventos de métrica são emitidos somente em `__DEV__` e não contêm caminho ou
bytes do PDF.

## Gate de decisão

- WebView deve ficar em até aproximadamente `1,5×` o nativo para primeira
  página, troca de página, zoom e PSS.
- Cada engine precisa de pelo menos 5 aberturas, 30 amostras de navegação e 5
  amostras de zoom; ambos os relatórios precisam conter PSS.
- Não pode haver OOM, ANR, crash nem crescimento contínuo de PSS após percorrer
  100 páginas.
- Persistência, rotação, links, marcadores, notas e troca scroll/paginado devem
  permanecer funcionais.

O comando retorna `eligible-for-pilot`, `insufficient-measurements` ou
`keep-webview-experimental`. Mesmo com `eligible-for-pilot`, a decisão não
remove `react-native-pdf` nem altera automaticamente o padrão nativo; isso é
uma etapa posterior, separada e autorizada.

## Resultado desta implementação

Os validadores automatizados, a geração determinística do runtime e a
compilação TypeScript foram executados no ambiente de desenvolvimento. A coleta
de latência/PSS em aparelho permanece pendente porque este ambiente não possui
um dispositivo Android/ADB conectado; portanto nenhum ganho percentual foi
inventado. Use os comandos acima no mesmo aparelho e nos mesmos PDFs para
preencher o aceite quantitativo.

O runtime agora é um asset HTML local cacheável, preparado em paralelo ao PDF;
o bridge usa `postMessage`, mantém um único handle de arquivo por sessão e a
abertura não espera metadados, outline ou page labels. A navegação confirma o
preview antes do refinamento final, reaproveita preloads em andamento e deixa
texto/anotações para uma troca atômica em segundo plano. No modo scroll, métricas
de layout cacheadas e busca binária substituem leituras geométricas por página a
cada evento, enquanto o hold de volume usa uma única animação temporal.
