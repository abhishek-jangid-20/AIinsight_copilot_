# start-dev.ps1  -  Native Dev Launcher for AIInsight Copilot
# ---------------------------------------------------------------
# Runs all services WITHOUT Docker using:
#   services/.venv   (Python microservices)
#   node_modules     (Node gateway + Vite client)
#
# Usage:
#   .\start-dev.ps1          - Start all 8 services
#   .\start-dev.ps1 -Stop    - Close all service windows
# ---------------------------------------------------------------

param([switch]$Stop)

$Root    = $PSScriptRoot
$VenvUvi = "$Root\services\.venv\Scripts\uvicorn.exe"
$VenvPy  = "$Root\services\.venv\Scripts\python.exe"
$Svc     = "$Root\services"
$EnvFile = "$Root\.env"

# -- Stop mode ---------------------------------------------------------------
if ($Stop) {
    Write-Host "Stopping all AIInsight service windows..." -ForegroundColor Yellow
    $titles = @("parser-svc","embedding-svc","rag-svc","docs-svc","analysis-svc","minigpt-svc","node-gateway","vite-client")
    foreach ($t in $titles) {
        Get-Process powershell,cmd -ErrorAction SilentlyContinue | Where-Object {
            try { $_.MainWindowTitle -eq $t } catch { $false }
        } | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Done." -ForegroundColor Green
    exit 0
}

# -- Load .env ---------------------------------------------------------------
$E = @{}
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | Where-Object { ($_ -notmatch "^\s*#") -and ($_ -match "=") } | ForEach-Object {
        $p = $_ -split "=", 2
        $k = $p[0].Trim()
        $v = $p[1].Trim()
        $E[$k] = $v
        [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
    Write-Host "Loaded $($E.Count) env vars from .env" -ForegroundColor DarkGray
}

function Get-Env([string]$k, [string]$d) {
    if ($E.ContainsKey($k) -and $E[$k]) { return $E[$k] } else { return $d }
}

# -- Check prerequisites -----------------------------------------------------
$mongoOk = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 27017 }
if (-not $mongoOk) {
    Write-Host "WARNING: MongoDB not found on port 27017. Start it before using the app." -ForegroundColor Yellow
}
if (-not (Test-Path $VenvPy)) {
    Write-Host "ERROR: Python venv not found at services/.venv" -ForegroundColor Red
    Write-Host "  Run: python -m venv services\.venv"
    Write-Host "       services\.venv\Scripts\pip install -r services\requirements.txt"
    exit 1
}

Write-Host ""
Write-Host "AIInsight Copilot - Native Dev Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# -- Open a new titled PowerShell window -------------------------------------
function Open-Win([string]$Title, [string]$Dir, [string]$Cmd) {
    $arg = "`$host.UI.RawUI.WindowTitle = '" + $Title + "'; Set-Location '" + $Dir + "'; " + $Cmd
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $arg -WindowStyle Normal
}

# -- Build env preamble for Python services ----------------------------------
function Make-Preamble([hashtable]$Extra) {
    $lines = @(
        "`$env:PYTHONPATH = '$Svc'",
        "`$env:CHROMA_PATH = '$Root\chroma'",
        "`$env:CHROMA_HOST = ''"
    )
    foreach ($pair in $Extra.GetEnumerator()) {
        $lines += "`$env:$($pair.Key) = '$($pair.Value)'"
    }
    return ($lines -join "; ")
}

# -- Start a Python uvicorn service ------------------------------------------
function Start-PySvc([string]$Title, [string]$SvcDir, [int]$Port, [hashtable]$Extra) {
    $pre = Make-Preamble -Extra $Extra
    $cmd = $pre + "; & '" + $VenvUvi + "' main:app --host 0.0.0.0 --port " + $Port + " --reload"
    Open-Win -Title $Title -Dir ($Svc + "\" + $SvcDir) -Cmd $cmd
}

# -- Env value sets ----------------------------------------------------------
$llm = @{
    LLM_PROVIDER       = (Get-Env "LLM_PROVIDER"       "groq")
    GROQ_API_KEY       = (Get-Env "GROQ_API_KEY"       "")
    GROQ_MODEL         = (Get-Env "GROQ_MODEL"         "llama-3.3-70b-versatile")
    GEMINI_API_KEY     = (Get-Env "GEMINI_API_KEY"     "")
    GEMINI_MODEL       = (Get-Env "GEMINI_MODEL"       "gemini-1.5-pro")
    OPENROUTER_API_KEY = (Get-Env "OPENROUTER_API_KEY" "")
    OPENROUTER_MODEL   = (Get-Env "OPENROUTER_MODEL"   "anthropic/claude-3.5-sonnet")
}
$emb = @{
    EMBEDDING_MODEL = (Get-Env "EMBEDDING_MODEL" "all-MiniLM-L6-v2")
}
$ragEnv = @{}
foreach ($kv in $llm.GetEnumerator()) { $ragEnv[$kv.Key] = $kv.Value }
foreach ($kv in $emb.GetEnumerator()) { $ragEnv[$kv.Key] = $kv.Value }

# -- Launch Python services --------------------------------------------------
Write-Host "[1/6] repository-parser-service  -> :8101" -ForegroundColor Green
Start-PySvc "parser-svc"    "repository-parser-service" 8101 @{}
Start-Sleep -Milliseconds 400

Write-Host "[2/6] embedding-service          -> :8102" -ForegroundColor Green
Start-PySvc "embedding-svc" "embedding-service"         8102 $emb
Start-Sleep -Milliseconds 400

Write-Host "[3/6] rag-service                -> :8103" -ForegroundColor Green
Start-PySvc "rag-svc"       "rag-service"               8103 $ragEnv
Start-Sleep -Milliseconds 400

Write-Host "[4/6] documentation-service      -> :8104" -ForegroundColor Green
Start-PySvc "docs-svc"      "documentation-service"     8104 $llm
Start-Sleep -Milliseconds 400

Write-Host "[5/6] analysis-service           -> :8105" -ForegroundColor Green
Start-PySvc "analysis-svc"  "analysis-service"          8105 @{}
Start-Sleep -Milliseconds 400

Write-Host "[6/6] minigpt-service            -> :8106" -ForegroundColor Green
Start-PySvc "minigpt-svc"   "minigpt-service"           8106 @{}
Start-Sleep -Milliseconds 800

# -- Launch Node services ----------------------------------------------------
Write-Host "[7/8] Node gateway               -> :8080" -ForegroundColor Green
Open-Win "node-gateway" "$Root\server" "npm run dev"
Start-Sleep -Milliseconds 1500

Write-Host "[8/8] Vite client                -> :5173" -ForegroundColor Green
Open-Win "vite-client"  "$Root\client" "npm run dev"

# -- Done --------------------------------------------------------------------
Write-Host ""
Write-Host "All 8 services launched!" -ForegroundColor Cyan
Write-Host ""
Write-Host "  App:     http://localhost:5173" -ForegroundColor White
Write-Host "  API:     http://localhost:8080" -ForegroundColor White
Write-Host "  Health:  http://localhost:8080/health" -ForegroundColor White
Write-Host ""
Write-Host "  To stop all windows: .\start-dev.ps1 -Stop" -ForegroundColor DarkGray
Write-Host ""
