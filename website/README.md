# Krumer — landing page

Página estática em português, com HTML, CSS e JavaScript vanilla. Sem bundler,
backend, instalação de dependências ou publicação automática. A implementação
fica isolada dos aplicativos desktop e mobile.

## Prévia local

Com Node.js 20+ disponível, execute dentro de `website/`:

```sh
npm run dev
```

Abra `http://127.0.0.1:4173`. Para outra porta, configure `KRUMER_SITE_PORT`.
Também é possível abrir `index.html` diretamente; se o navegador impedir a
consulta à API nesse contexto, os links levam às Releases.

## Verificação e pacote estático

```sh
npm test
npm run build
```

O build copia apenas HTML, CSS, JavaScript e os dois assets da marca para
`website/dist/`. Essa é a pasta a publicar futuramente em uma hospedagem estática.
Nenhum arquivo de configuração ou teste é incluído. Não execute o build Electron
da raiz para gerar este site.

Com a prévia rodando e o Playwright já instalado no repositório:

```sh
npm run test:browser
```

Os testes de navegador usam respostas simuladas (sem baixar instaladores) e salvam
capturas em `test-results/`, ignorada pelo Git. É necessário ter o Chromium do
Playwright disponível. `KRUMER_SITE_URL` permite testar outra URL local.
Para reutilizar um navegador instalado, configure `KRUMER_BROWSER_CHANNEL=msedge`
ou `chrome` antes de executar os testes. No PowerShell:
`$env:KRUMER_BROWSER_CHANNEL='msedge'`.

## Downloads

`downloads.js` consulta uma vez por carregamento a API pública:
`https://api.github.com/repos/adriantinoco-dev/Krumer/releases/latest`.
O limite da consulta é de oito segundos. Não usa tokens, cookies, armazenamento
local nem analytics. O endpoint retorna a última release estável, não prereleases;
o rótulo beta do Android descreve o produto, não muda a seleção de release.

São selecionados `.exe`, `.AppImage`, `.deb` e `.apk`. Se houver várias arquiteturas,
a seleção prioriza universal, x64/amd64, nome sem arquitetura e depois demais
arquiteturas; o nome real do arquivo aparece no cartão. Executáveis de backend,
uninstallers e builds debug são excluídos. O site aceita URLs HTTPS de assets
do próprio repositório. Metadados são inseridos como texto, nunca como HTML.

Na falta de um asset, erro HTTP, JSON inválido ou timeout, os respectivos botões
levam a `https://github.com/adriantinoco-dev/Krumer/releases`. Os links já estão
presentes no HTML e funcionam mesmo sem JavaScript. Não se adivinham URLs de APKs
nem se procura silenciosamente uma versão antiga.

Na verificação em 08/09/2026, a release v1.3.2 tinha instaladores desktop e não
incluía APK. Quando um APK for incluído na última release, o link direto será
resolvido automaticamente.

## Conteúdo e identidade

- Paleta em `styles.css`: preto `#111110`, bege `#efe7d4`, laranja `#e87c2a`.
- Logo e ícone são cópias dos assets originais do app; nenhuma fonte externa.
- As interfaces desktop e Android são mockups HTML/CSS ilustrativos dentro de uma
  moldura de monitor e de telefone, rotulados como tais e resumidos para leitores
  de tela. O conteúdo das telas está isolado para futura substituição por
  screenshots reais do app. Os títulos de livros são exemplos; o trecho de Dom
  Casmurro é de domínio público. Não são capturas reais do app.
- FAQ com `details/summary` nativo, foco visível, link de pular conteúdo e preferência
  por movimento reduzido. A tipografia reduzida dos mockups é apenas ilustrativa.
- O conteúdo não anuncia sincronização ativa, catálogo de livros ou macOS.

Referência da integração: [GitHub REST API — Releases](https://docs.github.com/en/rest/releases/releases#get-the-latest-release).
