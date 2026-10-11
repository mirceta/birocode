# openspec repo-agent-subagents (fleet task 5872a223): the REAL run on an isolated harness
# (own data dir + port + password; the live :5099 is never touched) over a THROWAWAY git repo in
# %TEMP%. Builds this branch, boots, runs client/tests/ui/e2e-repo-subagents.mjs, stops the
# instance. Log + marker per docs/detached-verification-convention.md. Launch detached:
#   Start-Process powershell -ArgumentList '-NoProfile','-File','.claudeweb-preview\subagents-live.ps1'
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $repo '.selfdev-build\subagents-live\bin'
$log = Join-Path $repo '.claudeweb-preview\subagents-live.log'
Start-Transcript -Path $log -Force | Out-Null
$port = 5246; $pw = 'iso-subagents-4481'; $base = "http://127.0.0.1:$port"
"build: dotnet build -> $bin"
& dotnet build (Join-Path $repo 'ClaudeWeb.App\ClaudeWeb.App.csproj') -c Release --nologo -v q -o $bin -p:RunAnalyzers=false | Select-String -Pattern ' error |Build succeeded'
if ($LASTEXITCODE -ne 0) { "BUILD FAILED"; "@@SUBAGENTS@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
& robocopy (Join-Path $repo 'client\dist') (Join-Path $bin 'client\dist') /MIR /NFL /NDL /NJH /NP | Out-Null
$exe = Join-Path $bin 'ClaudeWeb.exe'
$data = Join-Path $env:TEMP ("cw-subagents-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii
# The throwaway checkout the parent agent and its subagent work in.
$work = Join-Path $env:TEMP ("subagent-e2e-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $work | Out-Null
Set-Content -Path (Join-Path $work 'README.md') -Value "# subagent e2e`nA throwaway repo for the repo-agent subagents end-to-end." -Encoding ascii
& git -C $work init -q -b main
& git -C $work -c user.email=e2e@claude-web.local -c user.name=e2e add -A
& git -C $work -c user.email=e2e@claude-web.local -c user.name=e2e commit -q -m "init"
& git -C $work config user.email e2e@claude-web.local
& git -C $work config user.name "subagent e2e"
"throwaway repo $work"
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data 'arch-home')
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data"
if (-not $ok) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; "@@SUBAGENTS@@ exit=1"; Stop-Transcript | Out-Null; exit 1 }
$code = 1
try {
  $env:BASE = $base; $env:PW = $pw; $env:REPO_PATH = $work
  Push-Location (Join-Path $repo 'client')
  & node tests\ui\e2e-repo-subagents.mjs
  $code = $LASTEXITCODE
  Pop-Location
  "--- the throwaway repo's log:"
  & git -C $work log --oneline -5
  & git -C $work status --short
} catch {
  "ERROR: $($_.Exception.Message)"
} finally {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
  "harness stopped; run exit $code; data dir $data; repo $work (kept for inspection)"
  "@@SUBAGENTS@@ exit=$code"
  Stop-Transcript | Out-Null
}
exit $code
