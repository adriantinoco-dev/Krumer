# Assinatura dos builds Windows

Releases Windows do Krumer precisam ser assinadas com Authenticode por uma identidade
confiável. O build bloqueia a geração do instalador quando o certificado não está
configurado e valida o instalador, o executável Electron e o backend PyInstaller.

## Certificado necessário

Use um certificado de assinatura de código emitido por uma autoridade certificadora
confiável pelo Windows. Certificados autoassinados servem apenas para máquinas nas quais
a raiz foi instalada manualmente e não resolvem o SmartScreen para distribuição pública.

Mantenha a mesma identidade de assinatura entre releases. O SmartScreen usa essa
identidade, além do hash do arquivo, para construir reputação do editor.

## Secrets do GitHub Actions

Cadastre estes secrets em `Settings > Secrets and variables > Actions`:

- `WIN_CSC_LINK`: arquivo PFX convertido integralmente para Base64;
- `WIN_CSC_KEY_PASSWORD`: senha do arquivo PFX.

Para gerar o conteúdo Base64 no PowerShell sem alterar o certificado:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path '.\certificado.pfx')))
```

Nunca versione o PFX, sua senha ou o texto Base64. O `electron-builder` materializa o
certificado apenas no runner temporário, assina os executáveis com SHA-256 e adiciona
timestamp RFC 3161.

O nome do editor não é fixado no `package.json`: ele é lido do certificado. Isso mantém
a verificação de assinatura do `electron-updater` alinhada ao certificado realmente usado.

O comando `npm run pack` continua disponível para inspeção local e desativa essa exigência
somente no pacote de desenvolvimento. A saída desse comando não deve ser distribuída. Os
instaladores gerados por `npm run build` e pelo GitHub Actions sempre exigem assinatura.

## Verificação local de um artefato

```powershell
Get-AuthenticodeSignature '.\Krumer-win-v1.3.5.exe' |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

O campo `Status` precisa ser `Valid`, e `SignerCertificate` deve mostrar a identidade
esperada. O workflow executa `scripts/verify-windows-signatures.ps1` automaticamente
para os três executáveis obrigatórios.

## Limite do SmartScreen

Uma assinatura válida identifica o editor e permite que a reputação seja preservada
entre versões. Ela reduz fortemente os alertas, mas uma identidade nova ainda pode
receber o aviso de aplicativo pouco conhecido até acumular instalações sem incidentes.
Uma detecção com nome de ameaça deve ser enviada como falso positivo ao portal Microsoft
Security Intelligence; não se deve contornar a detecção alterando aleatoriamente o binário.
