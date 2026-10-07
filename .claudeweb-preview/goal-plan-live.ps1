# openspec goal-step-plan (fleet task 94c722e7): the REAL run. Builds this branch into an
# isolated bin, boots a harness on its own data dir + port (seeded with a copy of the live
# registry; its own arch home), then drives client/tests/ui/e2e-goal-plan.mjs — a real goal
# with a declared 3-step plan on a local repo agent, screenshots of the stepper changing.
# Writes everything to goal-plan-live.log and ends with the marker line
# (docs/detached-verification-convention.md). Run detached from the repo root:
#   Start-Process powershell -ArgumentList '-NoProfile','-File','.claudeweb-preview\goal-plan-live.ps1'
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $repo '.claudeweb-preview\goalplan\bin'
$log = Join-Path $repo '.claudeweb-preview\goal-plan-live.log'
Start-Transcript -Path $log -Force | Out-Null
$port = 5244; $pw = 'iso-goal-plan-4478'; $base = "http://127.0.0.1:$port"
"build: dotnet build -> $bin"
& dotnet build (Join-Path $repo 'ClaudeWeb.App\ClaudeWeb.App.csproj') --nologo -v q -o $bin | Select-String -Pattern 'error|Build succeeded'
if ($LASTEXITCODE -ne 0) { "BUILD FAILED"; "@@GOALPLAN@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
& robocopy (Join-Path $repo 'client\dist') (Join-Path $bin 'client\dist') /MIR /NFL /NDL /NJH /NP | Out-Null
$exe = Join-Path $bin 'ClaudeWeb.exe'
$data = Join-Path $env:TEMP ("cw-goal-plan-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home')
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
if (-not $ok) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; "@@GOALPLAN@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
$code = 1
try {
  $env:BASE = $base; $env:PW = $pw
  Push-Location $repo
  & node client\tests\ui\e2e-goal-plan.mjs
  $code = $LASTEXITCODE
  Pop-Location
} catch {
  "ERROR: $($_.Exception.Message)"
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
  "harness stopped; run exit $code; data dir $data (kept for inspection)"
  "@@GOALPLAN@@ exit=$code"
  Stop-Transcript | Out-Null
}
exit $code
