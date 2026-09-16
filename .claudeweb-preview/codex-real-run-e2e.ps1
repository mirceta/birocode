# Board task 9aaf5da2 (openspec codex-real-run): isolated instance (its own data dir, a copy
# of the live registry PLUS a throwaway git repo whose engine is codex), one builder turn
# driven through the REAL codex-cli binary, then check-codex-runner.mjs reads the stream,
# the event feed and the harness log. Cleans the temp repo up afterwards.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\p3check\bin\ClaudeWeb.exe"
$port = 5224; $pw = 'iso-codex-4474'; $base = "http://127.0.0.1:$port"
$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$data = Join-Path $env:TEMP ("cw-codex-" + $tag)
$tmpRepo = Join-Path $env:TEMP ("cw-codex-repo-" + $tag)
New-Item -ItemType Directory -Force $data | Out-Null
New-Item -ItemType Directory -Force $tmpRepo | Out-Null
& git -C $tmpRepo init -q
& git -C $tmpRepo -c user.email=iso@example.invalid -c user.name=iso commit -q --allow-empty -m init

# Registry: the live repos (read-only here) + the throwaway repo with Provider = codex.
$regPath = "$env:APPDATA\ClaudeWeb\repositories.json"
$reg = Get-Content $regPath -Raw | ConvertFrom-Json
$repoId = ('c0dec0de' + $tag + '0000000000000000').Substring(0, 32)
$entry = [pscustomobject]@{ Id = $repoId; Name = "codex-scratch-$tag"; Path = $tmpRepo; Handle = "codex-scratch-$tag"; IsSelf = $false; Visibility = 'advanced'; AutoUnderstanding = $false; LocalPort = $null; LocalApps = @(); Provider = 'codex' }
$all = @($reg) + @($entry)
ConvertTo-Json -Depth 8 $all | Out-File -Encoding utf8 (Join-Path $data 'repositories.json')

$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data repo=$tmpRepo id=$repoId"
# The harness logs beside its exe (Logger.cs), not in the data dir.
$log = Get-ChildItem (Join-Path (Split-Path $exe) 'logs') -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Push-Location "$repo\.claudeweb-preview\playwright"
$env:PORT = "$port"; $env:PW = $pw; $env:REPO_ID = $repoId; $env:REPO_PATH = $tmpRepo
if ($log) { $env:LOG = $log.FullName } else { $env:LOG = '' }
& node check-codex-runner.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $p.Id -Force
Start-Sleep -Milliseconds 800
Remove-Item -Recurse -Force $tmpRepo -ErrorAction SilentlyContinue
"harness stopped; check exit $code"
exit $code
