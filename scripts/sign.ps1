# Assina um .exe com o certificado de assinatura de código (Authenticode).
# Usado pela Action de release quando o secret WINDOWS_CERTIFICATE existe.
#   WINDOWS_PFX_PATH      caminho do .pfx (a Action cria a partir do secret)
#   WINDOWS_PFX_PASSWORD  senha do .pfx
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = 'Stop'

$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' |
  Sort-Object FullName | Select-Object -Last 1
if (-not $signtool) { throw 'signtool.exe não encontrado (Windows SDK).' }

& $signtool.FullName sign /fd SHA256 /td SHA256 /tr 'http://timestamp.digicert.com' `
  /d 'Forbidden Series' /f $env:WINDOWS_PFX_PATH /p $env:WINDOWS_PFX_PASSWORD $File
if ($LASTEXITCODE -ne 0) { throw "Falha ao assinar $File" }
Write-Host "Assinado: $File"
