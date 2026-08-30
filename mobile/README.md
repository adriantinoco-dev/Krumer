# Krumer Mobile

Versao Android do Krumer em React Native / Expo.

Este app vive no mesmo repositorio do desktop, mas mantem dependencias e codigo separados em `mobile/`. A UI principal e 100% nativa React Native; WebView e usada apenas dentro do leitor EPUB.

## Estado atual

- Onboarding em 3 passos: idioma/tema, pasta da biblioteca e chave Gemini.
- Navegacao principal por abas: Biblioteca, Listas e Configuracoes.
- Biblioteca com grid responsivo de capas.
- Configuracoes agrupadas com subtelas de Geral, Tema, API Key e Sobre.
- Scanner local de `.epub` e `.pdf` com progresso visual.
- Extracao de capa EPUB via ZIP/OPF e thumbnail PDF via modulo nativo.
- Leitor EPUB com WebView + epub.js e leitor PDF com `react-native-pdf`.
- Busca de metadados via Gemini REST, individual e em lote de até 10 obras,
  com prévia e aplicação explícita.
- Supabase Auth e sincronizacao offline-first estão preparados no código, mas congelados durante o beta; o acesso à conta exibe um aviso e os dados permanecem locais.

## Desenvolvimento

Algumas dependencias sao nativas (`react-native-pdf`, `react-native-webview` e `@react-native-google-signin/google-signin`). Por isso, use development build; Expo Go nao suporta esse fluxo:

```bash
npm install
npx expo prebuild
npm run android
```

O script `npm run android` reaplica automaticamente a compatibilidade do NetInfo
12.0.1 com Gradle 9. O mesmo ajuste roda apos cada `npm install`, evitando que a
falha de Codegen volte quando `node_modules` for recriado.

## Leitor EPUB F1

- Runtime web local com JSZip 3.10.1 e epub.js 0.3.93 vendorizados.
- Bridge JSON v1 limitada aos eventos/comandos `READY`, `OPEN_BOOK`, `BOOK_OPENED`, `NEXT`, `PREVIOUS`, `LINK_PRESSED`, `CLOSE_BOOK` e `ERROR`.
- EPUB copiado para `Paths.document/reader-books` antes da abertura; a WebView recebe somente os bytes do livro selecionado.
- Leitura integral limitada a 16 MiB, com estimativa de pico de memoria registrada no log. Arquivos maiores sao recusados de forma controlada ate a estrategia de I/O da F7.
- WebView sem acesso generico a arquivos, sem navegacao remota e com CSP local; links externos sao entregues ao shell nativo.

Antes do build, copie `.env.example` para `.env.local` e configure `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` com o OAuth Client ID do tipo **Web application**. O projeto Google tambem precisa de um OAuth Client ID Android para o package `com.adriantinoco.krumer` e os SHA-1 de desenvolvimento/producao. O passo a passo completo fica em `../docs/arquitetura-sync-supabase.md`.

## Estrutura

```text
mobile/
├── android/              # Projeto Android nativo quando o React Native for inicializado
├── ios/                  # Reservado pelo template RN, sem prioridade agora
├── assets/               # Assets especificos do app mobile
└── src/
    ├── api/              # Cliente HTTP e chamadas para o backend FastAPI
    ├── components/       # Componentes reutilizaveis
    ├── i18n/             # Traducoes adaptadas do desktop
    ├── models/           # Tipos/contratos baseados no backend
    ├── navigation/       # Navegacao entre telas
    ├── readers/          # Leitores PDF/EPUB
    ├── screens/          # Telas principais
    ├── storage/          # Preferencias locais do Android
    ├── sync/             # Outbox, conectividade e push/pull Supabase
    └── theme/            # Cores, espacamentos e tokens visuais
```

## Persistencia local

- Preferencias, onboarding e pasta ficam no AsyncStorage; a chave Gemini fica
  no `expo-secure-store` e o AsyncStorage mantém somente o indicador de
  configuração.
- A biblioteca escaneada e salva como lista de livros no AsyncStorage.
- Capas ficam como arquivos locais; o storage guarda apenas o path.
- Progresso, listas e favoritos sao gravados no AsyncStorage; a sincronizacao em background fica desativada durante o beta.
- PDF/EPUB e capas nao sao enviados ao Supabase.

## Identidade entre dispositivos

O vinculo usa `file|nome-sem-extensao|tamanho` (ou `series|nome-da-pasta`). Renomear ou reencodar um arquivo altera esse fingerprint e, por isso, pode criar uma nova identidade remota. Um novo scan migra automaticamente livros antigos do storage para o formato atual sempre que o caminho ainda estiver acessivel.

