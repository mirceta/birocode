# Preview Identity — which Product is on the Preview Port?

> **Status (2026-06-10):** Implemented and browser-verified (Playwright:
> `.claudeweb-preview/playwright/verify-preview-identity.mjs`).

## Glossary

(Builds on the CLAUDE.md glossary: Harness, Repo, Product, Preview Port, Operator.)

- **Preview Identity** — the answer to "which Repo's Product is the process currently listening on the Preview Port?"

## Problem

The App tab iframes whatever listens on the Preview Port (5200), but nothing
says *what* that is. The Harness never starts Products itself — Claude launches
them detached — so after switching Repos, or after a stale Product keeps
running, the Operator and End User see "running" with no idea whose app it is.
With multiple agents working across Repos in parallel (Agents tab), this gets
worse: any of them may have (re)started the Product.

## Approach

The Harness backend identifies the listener at the OS level:

1. **Find the PID** listening on the Preview Port (parse `netstat -ano -p tcp`
   output for a `LISTENING` row on that port).
2. **Read the process's command line** (WMI `Win32_Process`, via the
   `System.Management` package) plus executable path and process name.
3. **Match against the repo registry**: a Repo claims the process when the
   command line (or exe path) contains the Repo's registered folder path
   (case-insensitive, both slash styles). This works for products started
   from inside the repo (`node server.js`, `dotnet run`, `python app.py`,
   and the self-dev `.claudeweb-preview/bin/ClaudeWeb.exe`).
4. **Fallback**: no match → identity is "unknown", but pid + process name are
   still returned so the Operator can investigate.

Results are cached for a few seconds — the App tab may poll, and netstat/WMI
are not free.

## API

`GET /api/app/identity` →

```json
{ "running": true, "pid": 12345, "processName": "node",
  "repoId": "abc", "repoName": "my-site", "isSelf": false }
```

`running: false` when nothing listens on the port (other fields null).

## UI

App tab status bar (Advanced-only by virtue of the App tab itself): when
online, the status reads `running — <repoName>`; unmatched processes show
`running — unknown (<processName>)`. Refreshed together with the iframe
liveness check.

## Where it lives

- `ClaudeWeb.App/Services/Run/PreviewIdentity.cs` — port→PID→command line→repo matching + cache
- `ClaudeWeb.App/Controllers/AppController.cs` — `GET /api/app/identity`
- `client/src/pages/AppRun.jsx` — shows the product name next to the liveness dot
- i18n: `apptab.unknownProduct`

## Out of scope

- Starting/stopping the Product from the Harness (convention stays: Claude does it)
- Identifying products behind another proxy hop (only the local listener is inspected)
