# Action audit — record what every gate-passed user does

> **Pending two assumed decisions** (a dismissed prompt): *audit detail = tool-level + prompts*,
> and *structure = a separate change dependent on `add-resilient-auth`*. Both are easy to revise.

## Why

`add-resilient-auth` removes the per-project permission system: anyone who clears the two gates is
fully trusted and unrestricted, bounded only by the OS account. The natural counterweight to *not
restricting* trusted users is to *record* what they do — **trust-but-verify accountability**, and a
forensic trail if a device or password is ever compromised.

This is only meaningful now because `add-resilient-auth` gives each device a **named identity** (the
trusted-device cookie carries the friend's name). Before it, all the harness could attribute an
action to was an IP; with it, an audit line can name the *person* ("Girlfriend's phone ran
`git push`"). Auditing therefore depends on, and completes, the resilient-auth access model.

## What Changes

- **An append-only audit trail** of every action by every identity that cleared both gates.
- **Tool-level + prompts** granularity:
  - each **chat prompt** submitted (actor, project, lane, text);
  - **every tool action** the agent runs inside that turn — reads included (Read/Glob/Grep/LS as
    well as Edit/Write/Bash/WebFetch/…) — captured from the `claude -p` tool-use stream;
  - **auth events** — login, device approval, device/guest revocation.
- **Attribution** to the trusted-device name + approved IP + session id (from `add-resilient-auth`).
- **Storage**: append-only JSONL under `%APPDATA%\ClaudeWeb\audit\`, daily-rotated, never writable
  from the web.
- **Surface**: a read-only desktop **"Activity"** tab (filter by user / date / project). A web
  read-only view is a deliberate later follow-up.

## Impact

- **Affected specs:** `action-audit` (new capability, seeded by this change's delta).
- **Depends on:** `add-resilient-auth` — supplies the per-device identity the audit attributes to,
  and the auth events it records. Buildable in parallel against a stubbed identity, but only lands
  meaningfully once resilient-auth does.
- **Affected code (new):** an `AuditService` + append-only JSONL store + rotation; a desktop
  "Activity" UI tab; `Models/AppConfig.cs` (retention days).
- **Affected code (edited):** `ClaudeWeb.App/Controllers/ChatController.cs` (log the prompt);
  `ClaudeWeb.App/Services/Chat/CliRunnerService.cs` (log every tool-use event from the stream);
  `ClaudeWeb.App/Controllers/AuthController.cs` + `Services/IpFilter/IpAllowlistService.cs` (log auth
  events).
- **Key implementation risk (see `design.md`):** tool-level capture requires the `claude -p` run to
  emit tool-use events the harness can read (`--output-format stream-json`). If a given path doesn't
  stream tool calls, that path degrades to prompt-level only — verified first, before building the UI.
- **Security / privacy note (surfaced per the repo's first convention):** the log records prompt
  **text** and executed actions. It is **operator-only**, **append-only**, and **never web-writable**.
  It records the Operator's own vetted users on the Operator's own machine; retention is bounded by
  rotation/config. Prompt-text capture can be redacted via config if wanted.
- **Out of scope (v1):** a web-facing audit view; cryptographic tamper-proofing (hash-chained
  entries) — both noted as follow-ups.
