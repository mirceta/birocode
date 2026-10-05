# openspec repo-agent-requests: the API path through the BUILT harness on an isolated instance
# (own data dir, own port): a seeded agent-requests.json is read at boot, the Operator view
# lists it, dismiss persists to disk, the peer routes list local rows only and apply a pushed
# decision, approve posts a user message tagged actor "request" into the @arch conversation
# (then the turn is stopped at once), the row shows deliveredAt, and approving a request AS A GOAL opens a
# goal conversation on the managed self repo (openspec repo-agent-requests-goal-drive). One JSON summary. ASCII only.
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\Administrator\Desktop\playground\birocode'
$exe = "$repo\.selfdev-build\requests\bin\ClaudeWeb.exe"
$port = 5237; $pw = 'iso-req-7731'; $base = "http://127.0.0.1:$port"
$data = Join-Path $env:TEMP ("cw-req-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $data | Out-Null
Set-Content -Path (Join-Path $data 'autopilot-gate.json') -Value '{"enabled":true}' -Encoding ascii
Copy-Item "$env:APPDATA\ClaudeWeb\repositories.json" $data
# the self repo is put in the arch scope so a request from it can be approved AS A GOAL (openspec repo-agent-requests-goal-drive)
$repos = Get-Content (Join-Path $data 'repositories.json') -Raw | ConvertFrom-Json
$selfRepo = ($repos | Where-Object { $_.IsSelf -eq $true } | Select-Object -First 1)
$selfId = $selfRepo.Id; $selfHandle = $selfRepo.Handle; if (-not $selfHandle) { $selfHandle = $selfRepo.Name }
Set-Content -Path (Join-Path $data 'arch.json') -Value ('{"AcceptFleetSends":true,"ManagedRepoIds":["' + $selfId + '"]}') -Encoding ascii
$machine = $env:COMPUTERNAME
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$seed = @"
{"Requests":[
 {"Id":"r-a","SourceId":null,"Machine":"e2e","RepoId":"r-prg","Agent":"prg#1","Title":"Need the staging DB","Text":"E2E: please have web#1 upload prod.bak to the hub.","CreatedAt":$now,"Status":"pending"},
 {"Id":"r-b","SourceId":null,"Machine":"e2e","RepoId":"r-prg","Agent":"prg#1","Title":null,"Text":"E2E: may I delete old fixtures?","CreatedAt":$now,"Status":"pending"},
 {"Id":"r-d","SourceId":null,"Machine":"e2e","RepoId":"r-web","Agent":"web#1","Title":null,"Text":"E2E: decided by a hub","CreatedAt":$now,"Status":"pending"},
 {"Id":"r-c","SourceId":"src-x","Machine":"X","RepoId":"r-x","Agent":"x#1","Title":null,"Text":"E2E: pulled copy","CreatedAt":$now,"Status":"pending"},
 {"Id":"r-g","SourceId":null,"Machine":"$machine","RepoId":"$selfId","Agent":"$selfHandle","Title":"Coordination","Text":"E2E: please have web#1 upload prod.bak, transfer it here, and tell me when it is down.","CreatedAt":$now,"Status":"pending"}
]}
"@
Set-Content -Path (Join-Path $data 'agent-requests.json') -Value $seed -Encoding ascii
$env:CLAUDEWEB_DATADIR = $data; $env:CLAUDEWEB_PORT = "$port"; $env:CLAUDEWEB_AUTHPASSWORD = $pw; $env:CLAUDEWEB_LANBYPASSCIDRS__0 = ''; $env:CLAUDEWEB_ARCHHOMEDIR = (Join-Path $data "arch-home")
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) { Start-Sleep -Milliseconds 500; try { $null = Invoke-WebRequest "$base/api/health" -UseBasicParsing -TimeoutSec 2; $ok = $true; break } catch {} }
$result = [ordered]@{ booted = $ok; pid = $p.Id }
try {
  if (-not $ok) { throw "the isolated harness did not answer on $port" }
  $hdr = "X-Auth-Password: $pw"
  $json = "Content-Type: application/json"
  # 1. the seeded file is read at boot and the Operator view lists it
  $v = curl.exe -sS -H $hdr "$base/api/arch/requests" | Out-String
  $result.viewListsSeed = ($v -match '"id":"r-a"') -and ($v -match '"id":"r-b"') -and ($v -match '"id":"r-c"') -and ($v -match '"available":true')
  $result.viewPending = ($v -match '"pending":5')
  # 2. dismiss r-b persists to disk
  $d = curl.exe -sS -X POST -H $hdr -H $json -d '{}' "$base/api/arch/requests/r-b/dismiss" | Out-String
  $result.dismissOk = ($d -match '"status":"dismissed"')
  Start-Sleep -Milliseconds 300
  $file = Get-Content (Join-Path $data 'agent-requests.json') -Raw
  $result.dismissOnDisk = ($file -match '"Id": "r-b"') -and ($file -match '"Status": "dismissed"')
  $d2 = curl.exe -sS -X POST -H $hdr -H $json -d '{}' "$base/api/arch/requests/r-b/approve" | Out-String
  $result.decisionFinal = ($d2 -match 'already dismissed')
  # 3. the peer routes: local rows only; a pushed decision applies to a local row, not to a pulled one
  $pl = curl.exe -sS -H $hdr "$base/api/arch/peer/requests" | Out-String
  $result.peerListsLocalOnly = ($pl -match '"id":"r-a"') -and ($pl -match '"id":"r-d"') -and (-not ($pl -match '"id":"r-c"'))
  $b1 = Join-Path $data 'd1.json'; Set-Content -Path $b1 -Value '{"id":"r-d","status":"dismissed","from":"hubX","decidedAt":123}' -Encoding ascii
  $pd = curl.exe -sS -X POST -H $hdr -H $json -d "@$b1" "$base/api/arch/peer/requests/decision" | Out-String
  $result.peerDecisionReply = ($pd -replace '\s+', ' ')
  $result.peerDecisionApplied = ($pd -match '"ok":true') -and ($pd -match 'operator@hubX')
  $b2 = Join-Path $data 'd2.json'; Set-Content -Path $b2 -Value '{"id":"r-c","status":"dismissed","from":"hubX"}' -Encoding ascii
  $pc = curl.exe -sS -X POST -H $hdr -H $json -d "@$b2" "$base/api/arch/peer/requests/decision" | Out-String
  $result.peerRefuseReply = ($pc -replace '\s+', ' ')
  $result.peerRefusesPulledRow = ($pc -match 'not recorded on this harness')
  # 4. approve r-a: the arch is idle, so the request is posted into @arch at once as actor "request"
  $a = curl.exe -sS -X POST -H $hdr -H $json -d '{}' "$base/api/arch/requests/r-a/approve" | Out-String
  $result.approveReply = ($a -replace '\s+', ' ').Substring(0, [Math]::Min(300, $a.Length))
  $result.approveDelivered = ($a -match '"status":"approved-delivered"')
  $stream = curl.exe -sS --max-time 4 -H $hdr "$base/api/arch/stream?after=0" | Out-String
  $null = curl.exe -sS -X POST -H $hdr -H $json -d '{}' "$base/api/arch/stop-turn"
  $result.streamHasRequestActor = ($stream -match '"actor":"request"') -and ($stream -match 'Request from repo agent e2e/prg#1') -and ($stream -match 'approved by the Operator: Need the staging DB')
  $v2 = curl.exe -sS -H $hdr "$base/api/arch/requests?refresh=false" | Out-String
  $result.rowShowsDelivered = ($v2 -match '"id":"r-a","sourceId":null,"machine":"e2e","repoId":"r-prg","agent":"prg#1","title":"Need the staging DB","text":"E2E: please have web#1 upload prod.bak to the hub.","createdAt":\d+,"status":"approved","decidedAt":\d+,"decidedBy":"[^"]+","deliveredAt":\d+')
  # 5. approve r-g AS A GOAL (openspec repo-agent-requests-goal-drive): a goal conversation opens on the managed self repo; the row shows mode goal + the goal id; approving again is refused; the goal is stopped
  $bg = Join-Path $data 'g.json'; Set-Content -Path $bg -Value '{"drive":true,"maxIterations":3}' -Encoding ascii
  $g = curl.exe -sS -X POST -H $hdr -H $json -d "@$bg" "$base/api/arch/requests/r-g/approve" | Out-String
  $result.approveGoalReply = ($g -replace '\s+', ' ').Substring(0, [Math]::Min(400, $g.Length))
  $result.approveGoalStarted = ($g -match '"status":"approved-goal"') -and ($g -match '"mode":"goal"') -and ($g -match '"goalId":"')
  $goalId = $null; if ($g -match '"goalId":"([^"]+)"') { $goalId = $Matches[1] }
  $goals = curl.exe -sS -H $hdr "$base/api/arch/goals" | Out-String
  $result.goalOwnsSelfRepo = ($goals -match ('"id":"' + $goalId + '"')) -and ($goals -match '"state":"running"') -and ($goals -match ('"key":"' + $selfId + '"')) -and ($goals -match '"startedBy":"operator"') -and ($goals -match '"maxIterations":3')
  $g2 = curl.exe -sS -X POST -H $hdr -H $json -d "@$bg" "$base/api/arch/requests/r-g/approve" | Out-String
  $result.approveGoalTwiceRefused = ($g2 -match 'already driven by goal')
  $v3 = curl.exe -sS -H $hdr "$base/api/arch/requests?refresh=false" | Out-String
  $result.viewShowsGoalState = ($v3 -match '"request":\{"id":"r-g"') -and ($v3 -match ('"goal":\{"id":"' + $goalId + '","state":"running"'))
  if ($goalId) { $null = curl.exe -sS -X POST -H $hdr -H $json -d '{}' "$base/api/arch/goals/$goalId/stop" }
  $goals2 = curl.exe -sS -H $hdr "$base/api/arch/goals" | Out-String
  $result.goalStopped = ($goals2 -match '"state":"stopped"')
  $result.pass = $result.approveGoalStarted -and $result.goalOwnsSelfRepo -and $result.approveGoalTwiceRefused -and $result.viewShowsGoalState -and $result.goalStopped -and $result.viewListsSeed -and $result.viewPending -and $result.dismissOk -and $result.dismissOnDisk -and $result.decisionFinal -and $result.peerListsLocalOnly -and $result.peerDecisionApplied -and $result.peerRefusesPulledRow -and $result.approveDelivered -and $result.streamHasRequestActor -and $result.rowShowsDelivered
} catch {
  $result.error = $_.Exception.Message
} finally {
  try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
  Start-Sleep -Milliseconds 500
  try { Remove-Item -Recurse -Force $data -ErrorAction SilentlyContinue } catch {}
}
$result | ConvertTo-Json -Depth 3
