# Setup da Evolution API — PowerShell 5.1 compativel
# Execute: powershell -ExecutionPolicy Bypass -File evolution\setup.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir   = Split-Path -Parent $ScriptDir

# 1. Verificar Docker
Write-Host "[1/6] Verificando Docker Desktop..." -ForegroundColor Cyan
try {
    $v = & docker --version 2>&1
    Write-Host "      OK: $v" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Docker nao encontrado. Instale em https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    exit 1
}
try {
    & docker info 2>&1 | Out-Null
    Write-Host "      Daemon: RODANDO" -ForegroundColor Green
} catch {
    Write-Host "ERRO: Docker Desktop nao esta rodando. Abra-o e tente novamente." -ForegroundColor Red
    exit 1
}

# 2. Gerar ou reutilizar chave
Write-Host "[2/6] Gerando chave de API..." -ForegroundColor Cyan
$envFile = Join-Path $ScriptDir ".env"
$ApiKey  = $null

if (Test-Path $envFile) {
    $existing = Get-Content $envFile -Raw
    if ($existing -match 'AUTHENTICATION_API_KEY=([a-f0-9]{32,})') {
        $ApiKey = $Matches[1]
        Write-Host "      Chave existente reutilizada." -ForegroundColor Yellow
    }
}

if (-not $ApiKey) {
    $rng   = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    $ApiKey = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    Write-Host "      Nova chave: $($ApiKey.Substring(0,8))..." -ForegroundColor Green
}

# 3. Criar evolution/.env
Write-Host "[3/6] Criando evolution/.env..." -ForegroundColor Cyan
$example = Join-Path $ScriptDir ".env.example"
if (-not (Test-Path $example)) {
    Write-Host "ERRO: .env.example nao encontrado" -ForegroundColor Red
    exit 1
}
$content = Get-Content $example -Raw
$content = $content -replace 'SUBSTITUA_PELA_CHAVE_GERADA', $ApiKey
[System.IO.File]::WriteAllText($envFile, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "      evolution/.env criado." -ForegroundColor Green

# 4. Atualizar .env do CRM
Write-Host "[4/6] Atualizando .env do CRM..." -ForegroundColor Cyan
$crmEnv = Join-Path $RootDir ".env"
if (Test-Path $crmEnv) {
    $c = [System.IO.File]::ReadAllText($crmEnv)

    if ($c -match 'EVOLUTION_API_URL=') {
        $c = [System.Text.RegularExpressions.Regex]::Replace($c, 'EVOLUTION_API_URL=[^\r\n]*', 'EVOLUTION_API_URL=http://localhost:8080')
    } else {
        $c = $c + "`nEVOLUTION_API_URL=http://localhost:8080"
    }

    if ($c -match 'EVOLUTION_API_KEY=') {
        $c = [System.Text.RegularExpressions.Regex]::Replace($c, 'EVOLUTION_API_KEY=[^\r\n]*', "EVOLUTION_API_KEY=$ApiKey")
    } else {
        $c = $c + "`nEVOLUTION_API_KEY=$ApiKey"
    }

    if ($c -match 'EVOLUTION_WEBHOOK_URL=') {
        $c = [System.Text.RegularExpressions.Regex]::Replace($c, 'EVOLUTION_WEBHOOK_URL=[^\r\n]*', 'EVOLUTION_WEBHOOK_URL=http://host.docker.internal:3000/api/webhook/evolution')
    } else {
        $c = $c + "`nEVOLUTION_WEBHOOK_URL=http://host.docker.internal:3000/api/webhook/evolution"
    }

    [System.IO.File]::WriteAllText($crmEnv, $c, [System.Text.UTF8Encoding]::new($false))
    Write-Host "      .env do CRM atualizado." -ForegroundColor Green
} else {
    Write-Host "      AVISO: .env do CRM nao encontrado. Adicione manualmente:" -ForegroundColor Yellow
    Write-Host "      EVOLUTION_API_URL=http://localhost:8080" -ForegroundColor Yellow
    Write-Host "      EVOLUTION_API_KEY=$ApiKey" -ForegroundColor Yellow
    Write-Host "      EVOLUTION_WEBHOOK_URL=http://host.docker.internal:3000/api/webhook/evolution" -ForegroundColor Yellow
}

# 5. Subir containers
Write-Host "[5/6] Subindo containers..." -ForegroundColor Cyan
Set-Location $ScriptDir
& docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERRO: Falha ao subir containers." -ForegroundColor Red
    exit 1
}
Write-Host "      Containers iniciados." -ForegroundColor Green

# 6. Aguardar Evolution API
Write-Host "[6/6] Aguardando Evolution API (aguarde ate 60s)..." -ForegroundColor Cyan
$waited = 0
$ready  = $false
while ($waited -lt 60) {
    Start-Sleep -Seconds 3
    $waited += 3
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8080" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($r -and $r.StatusCode -lt 500) {
            $ready = $true
            break
        }
    } catch { }
    Write-Host "      Aguardando... $waited s" -ForegroundColor DarkGray
}

if ($ready) {
    Write-Host "      Evolution API: ONLINE" -ForegroundColor Green
} else {
    Write-Host "      AVISO: Evolution API ainda inicializando. Aguarde e verifique: docker logs evolution_api" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Evolution API   : http://localhost:8080" -ForegroundColor White
Write-Host "  API Key         : $ApiKey" -ForegroundColor White
Write-Host "  Manager UI      : http://localhost:8080/manager" -ForegroundColor White
Write-Host "  Webhook CRM     : http://host.docker.internal:3000/api/webhook/evolution" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Logs     : docker logs -f evolution_api" -ForegroundColor DarkGray
Write-Host "  Parar    : docker compose down" -ForegroundColor DarkGray
Write-Host "  Reiniciar: docker compose restart evolution" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Proximo passo: npm run dev" -ForegroundColor Green
Write-Host ""
