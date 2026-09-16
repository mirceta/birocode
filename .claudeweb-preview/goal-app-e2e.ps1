# openspec goal-app: build an isolated harness (own bin, own data dir seeded with a copy of
# the live registry), boot it on a spare port, then playwright/check-goal-app.mjs verifies
# the Goal app end to end (local app, slot, endpoints, Auto flag, dock row) and screenshots
# the dock. Run from the repo root:  powershell -File .claudeweb-preview\goal-app-e2e.ps1
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $repo '.claudeweb-preview\goalcheck\bin'
$port = 5231; $pw = 'iso-goal-4475'; $base = "http://127.0.0.1:$port"
"build: dotnet build -> $bin"
& dotnet build (Join-Path $repo 'ClaudeWeb.App\ClaudeWeb.App.csproj') --nologo -v q -o $bin | Select-String -Pattern 'error|Build succeeded'
if ($LASTEXITCODE -ne 0) { "BUILD FAILED"; exit 1 }
& robocopy (Join-Path $repo 'client\dist') (Join-Path $bin 'client\dist') /MIR /NFL /NDL /NJH /NP | Out-Null
$exe = Join-Path $bin 'ClaudeWeb.exe'
$data = Join-Path $env:TEMP ("cw-goal-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
if (Test-Path "$env:APPDATA\ClaudeWeb\repositories.json") { Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data }
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home')
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
if (-not $ok) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; "HARNESS DID NOT BOOT"; exit 1 }
Push-Location (Join-Path $repo '.claudeweb-preview\playwright')
$env:PORT = "$port"; $env:PW = $pw; $env:DATA = $data
& node check-goal-app.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $p.Id -Force
"harness stopped; check exit $code"
exit $code
