# openspec codex-account-and-models: isolated instance (own data dir, copy of the live
# registry + a throwaway git repo with engine codex, harness built from the branch into
# .selfdev-build\p3check\bin with a fresh client bundle), then check-codex-account-models.mjs
# (Playwright): the Codex chip in the status strip, the two-family model picker, the
# Engine flip, one real codex turn with --model, and the mismatched-model guard.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\p3check\bin\ClaudeWeb.exe"
$port = 5226; $pw = 'iso-codex-acct-4474'; $base = "http://127.0.0.1:$port"
$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$data = Join-Path $env:TEMP ("cw-codexacct-" + $tag)
$tmpRepo = Join-Path $env:TEMP ("cw-codexacct-repo-" + $tag)
New-Item -ItemType Directory -Force $data | Out-Null
New-Item -ItemType Directory -Force $tmpRepo | Out-Null
& git -C $tmpRepo init -q
& git -C $tmpRepo -c user.email=iso@example.invalid -c user.name=iso commit -q --allow-empty -m init
$reg = Get-Content "$env:APPDATA\ClaudeWeb\repositories.json" -Raw | ConvertFrom-Json
$repoId = ('c0deacc7' + $tag + '0000000000000000').Substring(0, 32)
$entry = [pscustomobject]@{ Id = $repoId; Name = "codex-acct-$tag"; Path = $tmpRepo; Handle = "codex-acct-$tag"; IsSelf = $false; Visibility = 'advanced'; AutoUnderstanding = $false; LocalPort = $null; LocalApps = @(); Provider = 'codex' }
ConvertTo-Json -Depth 8 (@($reg) + @($entry)) | Out-File -Encoding utf8 (Join-Path $data 'repositories.json')
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
"booted pid $($p.Id) health=$ok data=$data repo=$tmpRepo id=$repoId"
$log = Get-ChildItem (Join-Path (Split-Path $exe) 'logs') -Filter *.log -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Push-Location "$repo\.claudeweb-preview\playwright"
$env:PORT = "$port"; $env:PW = $pw; $env:REPO_ID = $repoId
if ($log) { $env:LOG = $log.FullName } else { $env:LOG = '' }
& node check-codex-account-models.mjs
$code = $LASTEXITCODE
Pop-Location
Stop-Process -Id $p.Id -Force
Start-Sleep -Milliseconds 800
Remove-Item -Recurse -Force $tmpRepo -ErrorAction SilentlyContinue
"harness stopped; check exit $code"
exit $code
