# openspec goal-app: the REAL run. Boots an isolated harness (own data dir seeded with the
# live registry) from the goalcheck build and drives playwright/run-goal-live.mjs — three
# real chat turns + three real Update-goal subagent runs against this repo's goal-app/.
# Writes everything to goal-app-live-run.log and ends with the marker line.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $repo '.claudeweb-preview\goalcheck\bin'
$log = Join-Path $repo '.claudeweb-preview\goal-app-live-run.log'
Start-Transcript -Path $log -Force | Out-Null
$port = 5232; $pw = 'iso-goal-live-4476'; $base = "http://127.0.0.1:$port"
"build: dotnet build -> $bin"
& dotnet build (Join-Path $repo 'ClaudeWeb.App\ClaudeWeb.App.csproj') --nologo -v q -o $bin | Select-String -Pattern 'error|Build succeeded'
if ($LASTEXITCODE -ne 0) { "BUILD FAILED"; "@@GOALLIVE@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
& robocopy (Join-Path $repo 'client\dist') (Join-Path $bin 'client\dist') /MIR /NFL /NDL /NJH /NP | Out-Null
$exe = Join-Path $bin 'ClaudeWeb.exe'
$data = Join-Path $env:TEMP ("cw-goal-live-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home')
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
if (-not $ok) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; "@@GOALLIVE@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
Push-Location (Join-Path $repo '.claudeweb-preview\playwright')
$env:PORT = "$port"; $env:PW = $pw
& node run-goal-live.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $p.Id -Force
"harness stopped; run exit $code"
"@@GOALLIVE@@ exit=$code"
Stop-Transcript | Out-Null
exit $code
