# The one-shot pickup for task 9aaf5da2: as soon as a Codex credential exists on this box,
# run the whole proof without any further human action -
#   1. build feature/codex-real-run into the isolated dir (.selfdev-build\p3check\bin),
#   2. the unauthenticated-path evidence (codex-real-run-e2e.ps1, still valid when logged in? no -
#      it EXPECTS "not logged in", so it is skipped once a credential exists),
#   3. the authenticated proof (codex-authenticated-e2e.ps1: real turn -> commit, resume, ask, MCP).
# Prints BLOCKED and exits 2 when `codex login status` still says not logged in.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
Set-Location $repo
"=== credential state"
& codex --version
$status = & codex login status 2>&1; "$status (exit $LASTEXITCODE)"
if ($LASTEXITCODE -ne 0) { "BLOCKED: codex is not logged in on this box as $env:USERNAME (home: $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { "$env:USERPROFILE\.codex" }))"; exit 2 }
"=== branch"
& git rev-parse --abbrev-ref HEAD
if ((& git rev-parse --abbrev-ref HEAD) -ne 'feature/codex-real-run') { "not on feature/codex-real-run - checkout first"; exit 1 }
"=== build (analyzers off; retry once on the flaky Roslyn crash)"
$built = $false
for ($i = 0; $i -lt 2 -and -not $built; $i++) {
  $env:RunAnalyzers = 'false'
  & dotnet build ClaudeWeb.App -c Release -o .selfdev-build\p3check\bin -p:RunAnalyzers=false 2>&1 | Select-String -Pattern 'Build succeeded| error ' | ForEach-Object { $_.Line }
  $built = $LASTEXITCODE -eq 0
}
if (-not $built) { "build failed"; exit 1 }
& npm --prefix client run build 2>&1 | Select-String -Pattern 'built in|error' | ForEach-Object { $_.Line }
Remove-Item -Recurse -Force .selfdev-build\p3check\bin\client\dist -ErrorAction SilentlyContinue
Copy-Item -Recurse client\dist .selfdev-build\p3check\bin\client\dist
"=== authenticated proof"
& powershell -NoProfile -ExecutionPolicy Bypass -File .claudeweb-preview\codex-authenticated-e2e.ps1
exit $LASTEXITCODE
