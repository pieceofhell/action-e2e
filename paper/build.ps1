[CmdletBinding()]
param([string]$Compiler=$env:E2P_TECTONIC)
$ErrorActionPreference='Stop'
if (-not $Compiler) {
  $bundled=Join-Path $PSScriptRoot '../../runtimes/tectonic-0.17.0/tectonic.exe'
  $Compiler=if (Test-Path -LiteralPath $bundled) { $bundled } else { (Get-Command tectonic -ErrorAction Stop).Source }
}
& $Compiler --keep-logs --keep-intermediates (Join-Path $PSScriptRoot 'current/main.tex')
if ($LASTEXITCODE -ne 0) { throw 'Paper compilation failed.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'current/main.pdf') -Destination (Join-Path $PSScriptRoot 'current/article.pdf') -Force
Write-Output (Join-Path $PSScriptRoot 'current/article.pdf')
