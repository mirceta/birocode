# Claude Web

Phone-accessible document workspace powered by Claude Code. A non-technical,
phone-only user opens a URL and gets a clean chat that drives the real `claude`
CLI on a host computer -- editing files in place, with a file browser and
git-backed "Save" / "Go back" presented in plain language (no git/CLI jargon).

The host runs a small C# .NET 8 WinForms app with an embedded web server
(Kestrel). The operator sees a monitoring GUI; the end user sees a React web
app served by the same process.

See [PLAN.md](PLAN.md) for architecture and module details and
[ANALYSIS.md](ANALYSIS.md) for the design decision (including a comparison to
Anthropic's Claude Dispatch).

## Prerequisites

These must be present on the host computer for the app to work:

- Windows 10 or 11.
- .NET 8 Desktop Runtime -- to run the app (it is WinForms). The .NET 8 SDK
  is required only to build from source.
- Node.js 18+ and npm -- to build the React frontend. Build-time only; once
  `client/dist` exists, running the app does not need Node.
- git -- used by the Save / History feature and required inside the working
  directory.
- Claude Code CLI (`claude`) installed AND signed in to a Claude account
  (a Max plan makes usage free). The app runs `claude` with no API key, so it
  uses the signed-in session. If the CLI is not authenticated, chat fails.
  This replaces the usual ClaudeMonitor gateway prerequisite -- Claude Web
  talks to the CLI directly and does NOT depend on ClaudeMonitor.
- A working directory that exists and is a git repository (run `git init`
  there once). This is the folder Claude reads and edits.

## Quick Start

```
cd claude-web/client
npm install
npm run build
cd ..
dotnet run --project ClaudeWeb.App
```

Then open http://localhost:5099 on the host (or http://<host-lan-ip>:5099 from
a phone on the same network) and enter the access code (`AuthPassword`).

## Install

Frontend dependencies (the backend restores its own on build):

```
cd claude-web/client
npm install
```

## Build

```
cd claude-web/client
npm run build                         # outputs client/dist (served by the app)

cd ..
dotnet build ClaudeWeb.sln            # builds the backend
```

## Run

```
dotnet run --project ClaudeWeb.App
```

The monitoring GUI opens and Kestrel listens on the configured port
(default 5099). Open http://localhost:5099 and enter the access code.

## Configuration

`ClaudeWeb.App/appsettings.json`:

- `WorkingDirectory` -- the folder Claude edits. Must exist and be a git repo.
  Can also be changed at runtime from the GUI.
- `Port` -- the web server port (default 5099).
- `AuthPassword` -- the shared access code the user enters (default `changeme`;
  change it before exposing the app beyond your own machine).

## Deploy

- Local / LAN: run the app on the host and keep the machine on. Anyone on the
  same network can reach it at `http://<host-lan-ip>:<port>`.
- Remote phone access (future, optional): expose the port through a tunnel
  (Cloudflare Tunnel, ngrok, or Tailscale) and change `AuthPassword` from the
  default first. This is not automated yet -- see PLAN.md "Still Open".
