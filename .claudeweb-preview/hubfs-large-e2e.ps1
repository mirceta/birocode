# openspec hubfs-large-files-tree: a REAL multi-GB round trip through the built harness — an
# isolated instance (own data dir, own port), the peer push route fed a 2.5 GB file by curl as a
# raw streamed body, the Operator download route and the peer content route streamed back to
# disk, hashes compared, and the harness's PEAK WORKING SET watched so "streamed, not buffered"
# is measured, not assumed. Prints one JSON summary. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\hubfs\bin\ClaudeWeb.exe"
$port = 5233; $pw = 'iso-hubfs-4412'; $base = "http://127.0.0.1:$port"
$data = Join-Path $env:TEMP ("cw-hubfs-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$work = Join-Path $env:TEMP ("cw-hubfs-files-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data, $work | Out-Null
# the Operator gate is closed on a fresh instance and only the host GUI opens it: seed it open, as the arch e2e runs do
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii
# the receiving-side opt-in (accept fleet sends) seeded in the arch state file as well, so the run does not hinge on the gated endpoint
Set-Content -Path (Join-Path $data 'arch.json') -Value '{"AcceptFleetSends":true}' -Encoding ascii
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
$result = [ordered]@{ booted = $ok; pid = $p.Id }
try {
  if (-not $ok) { throw "the isolated harness did not answer on $port" }
  $hdr = "X-Auth-Password: $pw"
  # 1. the receiving side's opt-in (the same switch task sends need) was seeded in arch.json above;
  #    confirm the instance reads it back (the peer describe reports acceptsSends)
  $describe = curl.exe -sS -H $hdr "$base/api/arch/peer"
  $result.optIn = (($describe -join ' ') -match '"acceptsSends":true')
  # 2. a 2.5 GB file (past 2^31, so any int-sized buffer or length would break)
  $big = Join-Path $work 'big.bak'
  $bytes = 2684354560
  $null = fsutil file createnew $big $bytes
  # a recognisable head and tail so a truncated or zero-filled copy cannot pass by accident
  $fs = [System.IO.File]::Open($big, 'Open', 'ReadWrite'); $head = [System.Text.Encoding]::ASCII.GetBytes('HUBFS-HEAD-' + (Get-Date -Format o)); $fs.Write($head, 0, $head.Length); $fs.Seek(-32, 'End') | Out-Null; $tail = [System.Text.Encoding]::ASCII.GetBytes('HUBFS-TAIL-0123456789-END-OF-FILE'); $fs.Write($tail, 0, [Math]::Min(32, $tail.Length)); $fs.Close()
  $result.sourceBytes = (Get-Item $big).Length
  $srcHash = (Get-FileHash $big -Algorithm SHA256).Hash.ToLower()
  $wsBefore = (Get-Process -Id $p.Id).PeakWorkingSet64
  # 3. upload: the peer push route, raw body streamed by curl (-T never loads the file)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $up = curl.exe -sS -X POST -T $big -H $hdr -H "Content-Type: application/octet-stream" "$base/api/arch/peer/files?path=big/db.bak&from=e2e-hub&uploadedBy=e2e%2Fprg%231&machine=e2e-hub&note=e2e"
  $sw.Stop()
  $result.uploadSeconds = [int]$sw.Elapsed.TotalSeconds
  $result.uploadReply = $up
  $result.uploadStored = ($up -match '"status":"stored"')
  $wsAfterUpload = (Get-Process -Id $p.Id).PeakWorkingSet64
  # 4. the listing sees it with the right size and hash
  $list = curl.exe -sS -H $hdr "$base/api/hubfs"
  $result.listedSize = ($list -match ('"size":' + $bytes))
  $result.listedSha = ($list -match $srcHash)
  # 5. download twice: the Operator route (ranges allowed) and the peer content route (raw + provenance headers)
  $dl1 = Join-Path $work 'dl-operator.bak'; $dl2 = Join-Path $work 'dl-peer.bak'
  $sw.Restart()
  curl.exe -sS -o $dl1 -H $hdr "$base/api/hubfs/file?path=big/db.bak"
  $sw.Stop(); $result.downloadOperatorSeconds = [int]$sw.Elapsed.TotalSeconds
  $sw.Restart()
  $hdrs = curl.exe -sS -D - -o $dl2 -H $hdr "$base/api/arch/peer/files/content?path=big/db.bak"
  $sw.Stop(); $result.downloadPeerSeconds = [int]$sw.Elapsed.TotalSeconds
  $result.peerHeaders = ($hdrs -join ' ') -replace '\s+', ' '
  $result.peerHeaderProvenance = (($hdrs -join ' ') -match 'X-Hub-UploadedBy: e2e%2Fprg%231') -and (($hdrs -join ' ') -match ('X-Hub-Size: ' + $bytes))
  $wsAfterDownload = (Get-Process -Id $p.Id).PeakWorkingSet64
  $result.operatorBytes = (Get-Item $dl1).Length
  $result.peerBytes = (Get-Item $dl2).Length
  $result.operatorHashMatches = ((Get-FileHash $dl1 -Algorithm SHA256).Hash.ToLower() -eq $srcHash)
  $result.peerHashMatches = ((Get-FileHash $dl2 -Algorithm SHA256).Hash.ToLower() -eq $srcHash)
  # 6. memory: the harness never held the file — its peak working set stays far below the file size
  $result.peakWorkingSetMB = [int]($wsAfterDownload / 1MB)
  $result.peakBeforeMB = [int]($wsBefore / 1MB)
  $result.peakAfterUploadMB = [int]($wsAfterUpload / 1MB)
  $result.streamedNotBuffered = ($wsAfterDownload -lt ($bytes / 4))
  # 7. a range request on the Operator route (the tab's browser download can resume)
  $range = curl.exe -sS -r 0-15 -H $hdr "$base/api/hubfs/file?path=big/db.bak"
  $result.rangeHead = $range
  $result.rangeWorks = ($range -like 'HUBFS-HEAD-*')
  # 8. delete via the Operator route and confirm it is gone
  $del = curl.exe -sS -X DELETE -H $hdr "$base/api/hubfs/file?path=big/db.bak"
  $result.deleted = ($del -match '"ok":true') -and (-not (Test-Path (Join-Path $data 'hubfs\files\big\db.bak')))
  $result.pass = $result.optIn -and $result.uploadStored -and $result.listedSize -and $result.listedSha -and $result.operatorHashMatches -and $result.peerHashMatches -and $result.peerHeaderProvenance -and $result.streamedNotBuffered -and $result.rangeWorks -and $result.deleted
} catch {
  $result.error = $_.Exception.Message
  $result.pass = $false
} finally {
  try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Seconds 1
  try { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue } catch {}
  try { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue } catch {}
}
$result | ConvertTo-Json -Depth 3
