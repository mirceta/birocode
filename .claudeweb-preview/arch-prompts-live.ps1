# openspec arch-custom-prompts (fleet task ebc91192): the REAL run. Builds this branch into an
# isolated bin, boots a harness on its own data dir + port seeded with copies of this hub's live
# registry, arch scope and prompt library (the live harness is never touched; its own arch
# home), then drives client/tests/ui/e2e-arch-prompts.mjs on the Management dashboard's Arch
# agent tab: seeding from the real Arch examples, placeholder chips, real sends, re-seed, the
# cache_prompt tool. Writes everything to arch-prompts-live.log and ends with the marker line
# (docs/detached-verification-convention.md). Run detached from the repo root:
#   Start-Process powershell -ArgumentList '-NoProfile','-File','.claudeweb-preview\arch-prompts-live.ps1'
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $repo '.claudeweb-preview\archprompts\bin'
$log = Join-Path $repo '.claudeweb-preview\arch-prompts-live.log'
Start-Transcript -Path $log -Force | Out-Null
$port = 5246; $pw = 'iso-arch-prompts-4480'; $base = "http://127.0.0.1:$port"
"build: dotnet build -> $bin"
& dotnet build (Join-Path $repo 'ClaudeWeb.App\ClaudeWeb.App.csproj') --nologo -v q -o $bin | Select-String -Pattern 'error|Build succeeded'
if ($LASTEXITCODE -ne 0) { "BUILD FAILED"; "@@ARCHPROMPTS@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
& robocopy (Join-Path $repo 'client\dist') (Join-Path $bin 'client\dist') /MIR /NFL /NDL /NJH /NP | Out-Null
$exe = Join-Path $bin 'ClaudeWeb.exe'
$data = Join-Path $env:TEMP ("cw-arch-prompts-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
foreach ($f in @('repositories.json', 'arch.json', 'prompts.json')) { if (Test-Path "$env:APPDATA\ClaudeWeb\$f") { Copy-Item "$env:APPDATA\ClaudeWeb\$f" $data } }
# A hub without a repo-agent prompt library gets one chat prompt, so the owner separation is visible.
if (-not (Test-Path (Join-Path $data 'prompts.json'))) { Set-Content -Path (Join-Path $data 'prompts.json') -Value '{"Prompts":[{"Id":"chatseed01","Emoji":"🚀","Label":"kickoff","Text":"start the feature"}]}' -Encoding utf8 }
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home')
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
if (-not $ok) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; "@@ARCHPROMPTS@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
$code = 1
try {
  $env:BASE = $base; $env:PW = $pw
  Push-Location $repo
  & node client\tests\ui\e2e-arch-prompts.mjs
  $code = $LASTEXITCODE
  Pop-Location
} catch {
  "ERROR: $($_.Exception.Message)"
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
  "harness stopped; run exit $code; data dir $data (kept for inspection)"
  "@@ARCHPROMPTS@@ exit=$code"
  Stop-Transcript | Out-Null
}
exit $code
