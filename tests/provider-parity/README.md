# Provider reconciliation verification

Run from the repository root on Windows. All builds and harness data are isolated under `.claudeweb-preview`; neither script deploys to the production harness. Both scripts terminate only the harness process they start and preserve evidence.

## Offline checks and isolated build

```powershell
$env:DOTNET_PROCESSOR_COUNT='2'
$env:CLAUDEWEB_DATADIR=Join-Path $PWD '.claudeweb-preview/parity-test-data'
dotnet test tests/ClaudeWeb.Tests/ClaudeWeb.Tests.csproj --artifacts-path .claudeweb-preview/parity-test-artifacts -p:UseSharedCompilation=false -m:1 --verbosity quiet
npm --prefix client test
npm --prefix client run build
```

The processor limit avoids an intermittent .NET 9 Roslyn analyzer process crash observed on this host; analyzers remain enabled. The backend suite includes provider transcript/runner fixtures. `CodexRealRunTests` replays captured events; it is not the authenticated live test.

## Real CLI and browser test

Prerequisites: both CLIs installed and already authenticated; Node, Git, Playwright and Chromium available. The script uses installed CLI defaults, including the Codex model configured in the fixture. These tests spend real model turns, create new native test sessions, and reuse existing login without changing account configuration. The MCP server receives a fake token.

Build the isolated executable expected by `verify.mjs`:

```powershell
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj --artifacts-path .claudeweb-preview/parity-artifacts -p:UseSharedCompilation=false -m:1 --verbosity quiet
robocopy client/dist .claudeweb-preview/parity-artifacts/bin/ClaudeWeb.App/debug/client/dist /MIR /NFL /NDL /NJH /NJS /NP
Start-Process cmd.exe -ArgumentList '/c tests\provider-parity\run.cmd' -WindowStyle Hidden
```

The robocopy destination must remain exactly inside the isolated artifact directory. Robocopy success exit codes are 0–7. Port 5238 must be free (`PARITY_PORT` overrides it). Playwright is loaded from the client install or `.claudeweb-preview/playwright`; install it locally if neither exists.

Poll `.claudeweb-preview/provider-parity-live.log` for `@@PROVIDER_PARITY@@`. The final JSON must say `pass:true`; missing marker is not a pass. The timestamped `parity-live-*` directory contains `verdict.json`, individual turn events, test repository/data and a browser screenshot.

Checks cover both-direction engine handoffs, native Codex resume, instruction fallback, durable messages and tools, stdio MCP, Ask filesystem denial, loop tools/sentinel completion, discovery, Understanding, ephemeral helpers and browser reload. Provider/model behavior can vary by account and CLI version; failed assertions retain their evidence.

## UI-only regression

After a successful live run, copy the latest client build into the offline test executable directory and run:

```powershell
robocopy client/dist .claudeweb-preview/parity-test-artifacts/bin/ClaudeWeb.App/debug/client/dist /MIR /NFL /NDL /NJH /NJS /NP
Start-Process cmd.exe -ArgumentList '/c tests\provider-parity\ui.cmd' -WindowStyle Hidden
```

This uses port 5239 and a fresh copy of the successful live fixture's harness data. `PARITY_EVIDENCE` can name a specific successful evidence directory. It makes no model calls. It tests separate dashboard model selections, engine/model consistency, reload after external configuration changes, capability guidance, unsupported browser errors and missing-history errors. The source test repository and native transcripts must still exist.

Poll `.claudeweb-preview/provider-parity-ui.log` for `@@PROVIDER_UI@@` with `pass:true`. Evidence and screenshots are stored under `parity-ui-*`.
