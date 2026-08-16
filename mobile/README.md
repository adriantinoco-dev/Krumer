# Krumer Mobile

Versao Android do Krumer em React Native.

Este app vive no mesmo repositorio do desktop, mas deve manter dependencias e codigo separados em `mobile/`. A integracao principal e feita pela mesma API FastAPI usada pelo Electron.

## Direcao inicial

- React Native para Android.
- Backend FastAPI como fonte da verdade.
- UI mobile propria, reaproveitando contratos, modelos, traducoes e identidade visual do Krumer.
- Primeiro ciclo consumindo backend em rede local ou `localhost` configuravel.

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

## MVP sugerido

1. Configurar URL do backend.
2. Listar biblioteca via `/items`.
3. Exibir detalhes e capas.
4. Abrir leitor PDF/EPUB.
5. Salvar progresso de leitura.
6. Sincronizar status lido/nao lido, listas e configuracoes.

