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

## Desenvolvimento

Algumas dependencias sao nativas (`react-native-pdf`, `react-native-pdf-thumbnail`, `react-native-webview`). Por isso, use development build:

```bash
npm install
npx expo prebuild
npx expo run:android
```

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
    └── theme/            # Cores, espacamentos e tokens visuais
```

## Persistencia local

- Preferencias, onboarding, pasta e chave Gemini ficam no AsyncStorage.
- A biblioteca escaneada e salva como lista de livros no AsyncStorage.
- Capas ficam como arquivos locais; o storage guarda apenas o path.

