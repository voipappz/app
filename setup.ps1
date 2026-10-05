# Windows setup, the same steps as `make setup` on Linux and macOS:
# Node 22 or newer, the dependencies, then the login wizard.
#
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Afterwards `npm start` checks the login and starts http://localhost:3000.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Get-NodeMajor {
  try { [int]((node --version) -replace '^v(\d+).*', '$1') } catch { 0 }
}

if ((Get-NodeMajor) -lt 22) {
  Write-Host 'Node 22 or newer is needed; installing Node.js LTS with winget...'
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host 'winget is not available. Install Node.js LTS from https://nodejs.org, then run this again.'
    exit 1
  }
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  # The installer adds node to PATH for new shells; pick it up in this one.
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
  if ((Get-NodeMajor) -lt 22) {
    Write-Host 'Node was installed but this window cannot see it yet. Open a new PowerShell and run .\setup.ps1 again.'
    exit 1
  }
}
Write-Host "node $(node --version)"

npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node bin/onboard.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Ready:  npm start'
