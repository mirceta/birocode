# Design — an append-only action audit, attributed to the device identity

## Why this pairs with removing permissions

The resilient-auth change deletes the per-project denylist, so the harness no longer *prevents*
edits, shell, or exfiltration for a passed user — it trusts them. Accountability replaces
prevention: record every action, attributed to *who*, so a compromise is detectable and forensically
reconstructable. The audit is the deliberate trade-off's safety net.

## Identity — who an action is attributed to

The actor is resolved per request, best-available-first, all from `add-resilient-auth`:

1. **Trusted-device name** — the name on the `claudeweb_device` cookie's server-side record
   (e.g. "Girlfriend's phone"). The primary, human-meaningful actor.
2. **Approved-IP guest name** — when the request rode in on an approved IP rather than a cookie.
3. **Session id + source IP** — always recorded as a fallback/correlator.

A small `AuditIdentity` resolver reads these off the request (the same lookups the IP/cookie gate
already does) and stamps every audit entry. If resilient-auth isn't landed yet, the resolver returns
`unknown@<ip>` so the audit is still useful and upgrades cleanly once identity exists.

## Granularity — every prompt + every tool action

Three event kinds, append-only. **Everything is recorded — no sampling, no per-tool filtering.**

- **`prompt`** — actor, project (repo id), lane (chat/ask), timestamp, and the prompt text (every
  message sent to an agent).
- **`tool`** — actor, project, the tool name and its salient args for **every** tool the agent runs,
  **reads included**: `Read`/`Glob`/`Grep`/`LS` as well as `Edit`/`Write`/`Bash`/`WebFetch`/… The
  whole point is a complete record of what each user's agent did.
- **`auth`** — login success/failure, device mint, device/guest revocation, IP approval.

### The key risk: capturing tool actions

Prompt and auth events are trivial — they pass through `ChatController` / `AuthController` already.
Tool-level capture is the real work: the harness must see the **tool-use events** of the `claude -p`
run. The harness already spawns and streams that process (`CliRunnerService`), so the plan is to tap
the existing stream (`--output-format stream-json`) and emit a `tool` audit entry per mutating
`tool_use` block. **Task 0 verifies this is actually available on the live chat path before any UI is
built;** if some path doesn't stream tool calls, that path degrades to `prompt`-level auditing and we
say so explicitly (no silent gap).

## Storage — append-only JSONL, rotated

- One file per day: `%APPDATA%\ClaudeWeb\audit\YYYY-MM-DD.jsonl`, one JSON object per line.
- **Append-only**: opened for append, fsync-batched like `IpAllowlistService`'s throttled flush; no
  rewrite/delete path in code, and **no web endpoint mutates it**.
- Entry shape: `{ ts, kind, actor:{device,guest,ip,session}, repo, lane?, tool?, args?, text? }`.
- Retention: a `AuditRetentionDays` config prunes old daily files (default e.g. 90); pruning is the
  only deletion, and it's whole-file by age.

This mirrors the repo's existing off-repo JSON stores (`ipallow.json`, `sessions.json`) and its
"flush on a throttle, persist important events immediately" pattern.

## Surface — operator-only, read-only

- A desktop **"Activity"** tab (WinForms), like the existing `IpFilterForm`: a list filterable by
  user, date, project, and kind; newest first; never editable.
- The web/phone UI gets **nothing** in v1 (the audit watches the web users; it shouldn't be theirs to
  read or clear). A read-only web view for the Operator is a later, explicitly-scoped follow-up.

## Trade-offs & deferred

- **No hash-chain tamper-proofing in v1.** Append-only + operator-only is enough for the threat model
  (your own machine, vetted friends); cryptographic tamper-evidence is a follow-up, noted not silently
  skipped.
- **Everything is logged, reads included.** The Operator wants a complete record of what each user's
  agent did — not a high-signal summary — so there is no per-tool filtering. Volume is bounded only by
  daily rotation + retention.
- **Prompt text is recorded** by default (it's the most useful forensic field) with a config switch to
  redact, since it can contain whatever the user typed.

## Verification posture

- **Task 0 (gating):** confirm the live chat path streams tool-use events; record the finding.
- Prompt logged on every chat turn with correct actor/project; every tool action logged with tool
  + args (reads included); auth events logged.
- Store is append-only and rotates daily; retention prune removes only old whole files; no web path can
  read or write it.
- Actor attribution shows the device name once `add-resilient-auth` is present, `unknown@<ip>` before.
