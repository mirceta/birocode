# Tasks

> Implements **tool-level + prompts** auditing as a **separate change dependent on
> `add-resilient-auth`** (which supplies the actor identity). Confirm those two assumptions before
> heavy work.

## 0. De-risk: can we capture tool-level actions?

- [ ] 0.1 Confirm the live chat path runs `claude -p` with a tool-use-emitting stream
      (`--output-format stream-json`) the harness can read in `CliRunnerService`. Record the finding.
- [ ] 0.2 If a path doesn't stream tool calls, document that it degrades to `prompt`-level auditing
      (no silent gap).

## 1. Audit store + service

- [ ] 1.1 `AuditService` — append a JSON line to `%APPDATA%\ClaudeWeb\audit\YYYY-MM-DD.jsonl`;
      throttled flush like `IpAllowlistService`; no rewrite/delete API.
- [ ] 1.2 Entry shape `{ ts, kind, actor:{device,guest,ip,session}, repo, lane?, tool?, args?, text? }`.
- [ ] 1.3 Daily rotation + `AuditRetentionDays` prune (whole-file, by age) in `Models/AppConfig.cs`.

## 2. Identity resolver

- [ ] 2.1 `AuditIdentity` — resolve actor from the `claudeweb_device` record name, else approved-IP
      guest name, always stamping session id + source IP (reuses resilient-auth lookups).
- [ ] 2.2 Fallback to `unknown@<ip>` when no named identity (so it works before resilient-auth lands).

## 3. Capture points

- [ ] 3.1 `ChatController` — emit a `prompt` entry per chat turn (actor, repo, lane, text).
- [ ] 3.2 `CliRunnerService` — emit a `tool` entry per **mutating** tool-use event from the stream
      (edits, shell, network); skip reads/searches unless read-logging is on.
- [ ] 3.3 `AuthController` / `IpAllowlistService` — emit `auth` entries (login, device mint, IP
      approval, device/guest revocation).

## 4. Operator surface

- [ ] 4.1 Desktop **"Activity"** tab (read-only, like `IpFilterForm`): list newest-first, filter by
      user / date / project / kind; no edit or delete control.
- [ ] 4.2 Confirm no web/phone endpoint reads or mutates the audit store.

## 5. Config

- [ ] 5.1 `AuditRetentionDays` (default 90), `AuditLogReads` (default false), `AuditRedactPromptText`
      (default false) in `Models/AppConfig.cs` + `appsettings.json`.

## 6. Verify

- [ ] 6.1 Prompt logged per turn with correct actor/project; mutating tool actions logged with
      tool+args; reads not logged by default; auth events logged.
- [ ] 6.2 Store is append-only, rotates daily, survives restart; retention prune removes only old whole
      files; no web path can read or write it.
- [ ] 6.3 Actor shows the device name with `add-resilient-auth` present, `unknown@<ip>` before it.
