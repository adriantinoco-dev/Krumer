[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'
$resolvedOutputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path

$groups = @(
    [PSCustomObject]@{
        Label = 'instalador NSIS'
        Files = @(Get-ChildItem -LiteralPath $resolvedOutputDirectory -File -Filter '*.exe')
    },
    [PSCustomObject]@{
        Label = 'executavel principal'
        Files = @(
            Get-ChildItem -LiteralPath $resolvedOutputDirectory -Recurse -File -Filter 'Krumer.exe' |
                Where-Object { $_.FullName -match '[\\/]win-unpacked[\\/]' }
        )
    },
    [PSCustomObject]@{
        Label = 'backend PyInstaller'
        Files = @(Get-ChildItem -LiteralPath $resolvedOutputDirectory -Recurse -File -Filter 'krumer-backend.exe')
    }
)

$verifiedPaths = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
$signerThumbprints = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)

foreach ($group in $groups) {
    if ($group.Files.Count -eq 0) {
        throw "Nao foi encontrado o $($group.Label) em '$resolvedOutputDirectory'."
    }

    foreach ($file in $group.Files) {
        if (-not $verifiedPaths.Add($file.FullName)) {
            continue
        }

        $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
        if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
            throw "Assinatura invalida em '$($file.FullName)': $($signature.Status) - $($signature.StatusMessage)"
        }

        if (-not $signature.SignerCertificate) {
            throw "O arquivo '$($file.FullName)' nao possui certificado de assinatura."
        }

        if (-not $signature.TimeStamperCertificate) {
            throw "O arquivo '$($file.FullName)' nao possui timestamp Authenticode."
        }

        $signerThumbprints.Add($signature.SignerCertificate.Thumbprint) | Out-Null

        Write-Host "Assinatura valida: $($file.FullName)"
        Write-Host "Editor: $($signature.SignerCertificate.Subject)"
        Write-Host "Thumbprint: $($signature.SignerCertificate.Thumbprint)"
    }
}

if ($signerThumbprints.Count -ne 1) {
    throw "Os executaveis obrigatorios nao usam a mesma identidade de assinatura."
}

Write-Host "Todas as $($verifiedPaths.Count) assinaturas obrigatorias foram validadas."
