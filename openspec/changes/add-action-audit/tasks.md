# Tasks

> Implements **tool-level + prompts** auditing as a **separate change dependent on
> `add-resilient-auth`** (which supplies the actor identity). Confirm those two assumptions before
> heavy work.

## 0. De-risk: can we capture tool-level actions?

- [x] 0.1 **Confirmed.** `CliRunnerService` runs `claude -p --output-format stream-json` and
      `HandleAssistant` already iterates every `tool_use` block with its `name` + full `input`
      (emits `{type:"tool", name, status:"input", summary, detail}`). That method is the single
      capture point for tool-level audit — no degradation needed.
- [x] 0.2 N/A — the live chat path streams tool calls; no path degrades to prompt-only.

## 1. Audit store + service

- [x] 1.1 `AuditService` — `File.AppendAllText` a JSON line to
      `%APPDATA%\ClaudeWeb\audit\YYYY-MM-DD.jsonl` under a lock (append-only; durable per-event, no
      throttle so nothing is lost on crash); no rewrite/delete API.
- [x] 1.2 Entry shape `{ ts, kind, actor, device, guest, ip, session, repo, lane?, tool?, args?, text?, event? }`
      (`AuditEntry`/`AuditActor` in `Services/Audit/AuditTypes.cs`); null fields omitted on write.
- [x] 1.3 Daily file rotation + `AuditRetentionDays` whole-file prune by age (runs on startup).

## 2. Identity resolver

- [x] 2.1 `AuditService.ResolveActor(HttpContext)` — actor from the `claudeweb_device` record name,
      else approved-IP guest name, always stamping source IP + a short session correlator
      (reuses `DeviceTokenService` + `IpAllowlistService`).
- [x] 2.2 Falls back to `unknown@<ip>` when no named identity (`AuditActor.Display`).

## 3. Capture points

- [x] 3.1 `ChatController` — resolves the actor on the request thread (before the detached `Task.Run`),
      logs a `prompt` entry (actor, repo, lane, text), and threads an `AuditContext` into the run.
- [x] 3.2 `CliRunnerService.HandleAssistant` — logs a `tool` entry per `tool_use` block, every tool
      (reads included); no per-tool filtering.
- [x] 3.3 `AuthController` (login, device-mint) + desktop `IpFilterForm` (guest-approve, guest-remove,
      device-revoke as operator events). Logged at callers to avoid a circular dep on `AuditService`.

## 4. Operator surface

- [x] 4.1 Desktop **"Activity"** form (`ActivityForm`, opened from a MainForm button): read-only list,
      filter by date / kind / user; no edit or delete control.
- [x] 4.2 No controller exposes the audit store — the desktop form is the only reader (by construction).

## 5. Config

- [x] 5.1 `AuditRetentionDays` (90), `AuditRedactPromptText` (false) in `Models/AppConfig.cs` +
      `appsettings.json`. (No read-logging toggle — everything is logged.)

## 6. Verify

- [~] 6.1 Auth events **runtime-verified** (isolated instance: login + device-mint appended, correctly
      attributed). Prompt + tool capture are code-verified and use the same machinery; observable in the
      Activity tab on the first live chat turn.
- [~] 6.2 Append + file-creation **runtime-verified**; append-only/no-web-surface by construction;
      rotation + retention prune code-verified (startup prune, per-day filename).
- [x] 6.3 Actor resolves to the named identity (smoke test showed actor "localhost"); `unknown@<ip>`
      fallback in `AuditActor.Display`.
