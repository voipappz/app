param(
  [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$requiredRoot = @(
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY"
)

$optionalRoot = @(
  "VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
)

$requiredApi = @(
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FIREBERRY_TOKEN"
)

$optionalApi = @(
  "PORT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "DOCUSEAL_API_KEY",
  "DOCUSEAL_BASE_URL",
  "DOCUSEAL_WEBHOOK_SECRET_KEY",
  "DOCUSEAL_WEBHOOK_SECRET"
)

function Read-EnvNames {
  param([string]$Path)

  $names = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $names
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) {
      return
    }
    if ($line -match "^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=") {
      $names[$Matches[1]] = $true
    }
  }
  return $names
}

function Report-Group {
  param(
    [string]$Title,
    [hashtable]$Names,
    [string[]]$Required,
    [string[]]$Optional
  )

  Write-Host ""
  Write-Host $Title
  Write-Host ("-" * $Title.Length)

  foreach ($name in $Required) {
    $status = if ($Names.ContainsKey($name)) { "present" } else { "MISSING" }
    Write-Host "$name`: $status"
  }

  foreach ($name in $Optional) {
    $status = if ($Names.ContainsKey($name)) { "present" } else { "not set" }
    Write-Host "$name`: $status"
  }
}

$rootEnv = Read-EnvNames -Path (Join-Path $Root ".env")
$apiEnv = Read-EnvNames -Path (Join-Path $Root "api\.env")

Write-Host "Environment key check only. Values are not printed."
Report-Group -Title "Frontend .env" -Names $rootEnv -Required $requiredRoot -Optional $optionalRoot
Report-Group -Title "API api\.env" -Names $apiEnv -Required $requiredApi -Optional $optionalApi
