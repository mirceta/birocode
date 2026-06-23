# Make the Control Room's target repository configurable

## Why

The OpenSpec Control Room (`openspec-port-app/`) is a standalone, zero-dependency
local app — and that independence from the harness is the point. But it binds to a
single repo by location: `REPO_ROOT = dirname(ROOT)`, i.e. "the repo I'm copied into."
To inspect a second repo you had to copy the whole folder into it. That forced a
choice between N copies or folding the thing into the harness — both wrong.

The right fix keeps it a local app and makes the **target a configuration value**:
one instance can point at any repo on the host via an environment variable, with the
copy-into-the-repo default preserved for backward compatibility. No harness coupling,
no per-repo copies.

## What Changes

- **`OPENSPEC_REPO_ROOT` overrides the inspected repo.** `serve.mjs` resolves
  `const REPO_ROOT = process.env.OPENSPEC_REPO_ROOT || dirname(ROOT)`. Set the env var
  and one running instance inspects that repo's `openspec/`; unset, it falls back to the
  folder that contains the app — so existing deployments behave identically.
- **Startup log shows the resolved target** (and whether it came from the env var), and
  the run-header documents the new usage. Still Node built-ins only; still a local app.

## Capabilities

### Modified Capabilities

- `openspec-cockpit`: the Control Room's inspected repository is now **configurable** via
  `OPENSPEC_REPO_ROOT`, defaulting to the containing folder. Everything the Cockpit/Console
  do is unchanged — only *which repo* they target becomes a runtime setting.

## Impact

- **One file**: `openspec-port-app/serve.mjs` (the `REPO_ROOT` line + header/log text).
- **No harness change, no new repo, no extraction.** The app stays exactly where it is and
  keeps running independently of the harness on its own port.
- **Backward compatible**: with `OPENSPEC_REPO_ROOT` unset, behaviour is byte-for-byte the
  prior default (inspect the app's parent repo).
- **Usage**: `OPENSPEC_REPO_ROOT=C:\path\to\repo PORT=53xx node serve.mjs` runs one instance
  against any repo; register that port as a Local app for that repo as before.
