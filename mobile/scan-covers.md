# Scan mobile: capas e metadados iniciais

## Objetivo

Ao escanear uma pasta no app mobile, o Krumer deve cadastrar livros de forma rapida e previsivel:

- usar o nome do arquivo como titulo do livro;
- nao buscar metadados completos durante o scan;
- extrair apenas a capa original do EPUB, quando existir;
- extrair a primeira pagina do PDF para usar como capa;
- manter `author` vazio no cadastro inicial;
- deixar a busca/edicao de metadados para uma acao posterior do usuario.

## Problema atual

A extracao de capa de EPUB esta funcionando corretamente no mobile.

A extracao de capa de PDF ainda nao esta confiavel: ao escanear a pasta, todos PDFs entram sem capa, mesmo que a primeira pagina pudesse ser renderizada como thumbnail.

## Comportamento esperado

### EPUB

Durante o scan:

1. Ler o arquivo EPUB apenas o suficiente para encontrar a capa.
2. Procurar a capa pelo OPF/manifest:
   - `properties="cover-image"`;
   - `meta name="cover"`;
   - fallback para imagem com nome/id parecido com `cover` ou `capa`;
   - fallback final para a primeira imagem do manifest.
3. Salvar a imagem em `FileSystem.documentDirectory/covers/`.
4. Usar esse arquivo local como `coverPath`.
5. Nao preencher titulo/autor a partir dos metadados internos do EPUB.

### PDF

Durante o scan:

1. Abrir o PDF local ou `content://` selecionado pelo Android.
2. Renderizar a pagina `0` usando `PdfRenderer` no modulo nativo Android.
3. Gerar uma imagem JPG temporaria da primeira pagina.
4. Mover/copiar essa imagem para `FileSystem.documentDirectory/covers/`.
5. Usar esse arquivo local como `coverPath`.
6. Se a capa falhar, cadastrar o livro mesmo assim com `coverPath: null`.

## Regras de titulo e metadados

O titulo inicial deve vir sempre do nome do arquivo, sem a extensao:

- `Watchmen.pdf` vira `Watchmen`;
- `O Hobbit.epub` vira `O Hobbit`;
- `Batman - Ano Um.pdf` vira `Batman - Ano Um`.

Durante o scan mobile, nao devemos:

- buscar metadados no Gemini;
- preencher autor pelo EPUB/PDF;
- preencher ano, sinopse, editora, tags ou avaliacao;
- sobrescrever dados editados manualmente em scans futuros.

## Fluxo tecnico atual

Arquivos envolvidos:

- `mobile/src/services/libraryScanner.ts`
  - percorre a pasta selecionada;
  - detecta `.epub` e `.pdf`;
  - cria o item local;
  - chama `extractCover(filePath, id, format)`.

- `mobile/src/services/coverExtractor.ts`
  - extrai capa de EPUB via `JSZip`;
  - prepara uma copia temporaria quando necessario;
  - chama o modulo nativo Android para PDF.

- `mobile/android/app/src/main/java/com/adriantinoco/krumer/pdf/KrumerPdfThumbnailModule.kt`
  - abre o PDF;
  - renderiza a primeira pagina;
  - salva um JPG temporario.

## Hipoteses para corrigir PDF

A correcao deve investigar especialmente:

1. Se o modulo nativo esta disponivel em `NativeModules.KrumerPdfThumbnail` no development build.
2. Se caminhos `content://` vindos do seletor Android continuam acessiveis durante a geracao da capa.
3. Se a copia temporaria feita antes da extracao preserva uma URI que o `PdfRenderer` consegue abrir.
4. Se `FileSystem.moveAsync` esta lidando corretamente com a URI `file://` retornada pelo modulo nativo.
5. Se o app tem permissao persistente para ler os documentos selecionados apos escolher a pasta.

## Plano de implementacao

1. Adicionar logs controlados no fluxo de PDF para identificar onde a extracao falha:
   - modulo nativo ausente;
   - erro ao copiar o PDF para cache;
   - erro ao abrir descriptor;
   - erro ao renderizar a pagina;
   - erro ao mover a imagem final.
2. Ajustar `prepareSourceFile` para garantir que PDFs selecionados via `content://` sejam copiados para um arquivo local legivel antes de chamar o modulo nativo.
3. Ajustar `extractPdfCover` para aceitar com seguranca a URI retornada pelo modulo nativo e salvar a capa final em `documentDirectory/covers/`.
4. Manter o fallback silencioso: se a capa do PDF falhar, o livro ainda aparece na biblioteca.
5. Confirmar que o scan continua sem buscar metadados completos.
6. Testar com:
   - PDF simples de uma pagina;
   - PDF grande;
   - PDF dentro de subpasta;
   - PDF com nome contendo espacos e acentos;
   - EPUB com capa;
   - EPUB sem capa.

## Criterios de aceite

- Ao escanear uma pasta com PDFs, cada PDF valido mostra como capa a primeira pagina renderizada.
- EPUBs continuam usando a capa interna correta.
- O titulo exibido vem do nome do arquivo, nao dos metadados internos.
- Autor fica vazio apos o scan.
- Nenhuma chamada ao Gemini acontece durante o scan.
- PDFs sem capa gerada nao quebram o scan da pasta.
- Reescanear a pasta nao apaga metadados/capas editados manualmente pelo usuario.

## Erro atual observado

Durante o teste no Android, ao escanear um PDF, apareceu o aviso:

```text
WARN  [Krumer covers] Native PDF thumbnail module is unavailable for 8cgxy2. Rebuild the Android development app after native changes.
```

Resultado observado:

- a capa do PDF nao apareceu;
- o livro foi cadastrado mesmo assim;
- a extracao de EPUB continuou fora desse problema.

Interpretacao:

Esse erro indica que o JavaScript nao encontrou o modulo nativo `KrumerPdfThumbnail`. Portanto, o app ainda nem chegou a abrir/renderizar a primeira pagina do PDF. A falha acontece antes da chamada ao `PdfRenderer`.

Pontos para a proxima investigacao:

1. Confirmar se o APK/dev build instalado no aparelho foi realmente reconstruido depois das alteracoes nativas.
2. Confirmar se `mobile/android/gradle.properties` esta com `newArchEnabled=false`, pois o modulo atual foi implementado como modulo legado (`ReactContextBaseJavaModule`).
3. Confirmar se `KrumerPdfThumbnailPackage()` esta sendo adicionado em `MainApplication.kt`.
4. Confirmar se `NativeModules.KrumerPdfThumbnail` aparece disponivel no runtime Android.
5. Se o modulo continuar indisponivel mesmo apos rebuild, considerar migrar `KrumerPdfThumbnailModule` para Expo Modules API e acessar via `requireOptionalNativeModule`.

Comando esperado para rebuild/reinstalacao do app Android:

```bash
npx expo run:android
```

Observacao importante:

Reload do Metro/JavaScript nao resolve esse tipo de erro, porque `KrumerPdfThumbnail` e codigo nativo Android. E necessario reinstalar uma development build/APK que contenha o modulo compilado.

## Fora de escopo por enquanto

- Buscar metadados completos automaticamente no scan.
- Sincronizacao com desktop/backend.
- Firebase.
- Leitor PDF nativo diferente do fluxo atual.
- Edicao de editora no mobile.
