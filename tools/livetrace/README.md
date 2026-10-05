# livetrace

A read-only request tracer for a **running** harness. It attaches to the process over the
.NET diagnostics channel (EventPipe), listens to Kestrel's own request events for N seconds
and reports every request the process served under its real traffic: path, duration, remote
address. Nothing is sent to the process and no login is involved, so it measures the live
hub — where a "slow board" actually happens — without a browser session.

```
dotnet run -c Release --project tools/livetrace -- <pid> <seconds> [out.jsonl]
```

The pid of the live harness:

```
powershell -NoProfile -Command "(Get-Process ClaudeWeb | Where-Object { $_.Path -like '*run-bin*' }).Id"
```

It prints a table of paths by total server time (count, p50, p95, max, total seconds) and
writes one JSON line per request. Requests still open at the end are listed; the event
streams are expected there. Added for openspec `board-load-live` (fleet task 1a17afbe); the
project is deliberately not part of `ClaudeWeb.sln`.
