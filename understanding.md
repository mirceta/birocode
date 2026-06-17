# Understanding — build the real autopilot (Slice 3: auto-advance)

## What you asked for

"Just build it" — make the autopilot actually *act*, not just observe. Until now
the engine only classified an idle agent's last message into a routine prompt or
"escalate" and **surfaced** it (suggest-only). The missing piece was the part that
**sends** the prompt on your behalf so an agent loops forward through your routine
replies without you pressing send each time.

## What I built

- **`AutoAdvance` switch** in `AutopilotConfigStore` — the new mode flag, **off by
  default** (so behaviour is unchanged until you opt in).
- **Engine auto-send** (`AutopilotService.TrySend`) — when an armed, idle agent's
  verdict is a **confident, non-risky** suggestion *and* auto-advance is on, the
  engine resumes that agent's session and sends the routine prompt through the same
  `CliRunnerService` path the chat UI uses. A per-repo guard + the run single-flight
  gate prevent double-sends.
- **Append-only audit log** (`AutopilotAuditLog` → `autopilot-audit.jsonl`) — every
  real send records when / which agent / the prompt / confidence / the message it
  answered. This is safety fence #3 from `plans/loop-autopilot-safety.md`.
- **API + UI** — `autoAdvance` is settable via `POST /api/autopilot/config` and
  shown on the dashboard as a second (warm-coloured) toggle; a new **Audit** tab
  lists what was auto-sent; a **sent** badge appears on agents the engine advanced.

## Fences kept (all pre-existing, unchanged)

Operator gate (host-only, default off) → kill switch → confidence threshold →
risky-action deny-list (`deploy`/`push`/`force`/…) → escalate-by-default. Auto-send
only ever fires a verdict that already cleared all of them.

## What's still NOT done (called out honestly)

- The **brain is still the keyword stub** — not the real LLM classifier, and its
  **accuracy gate is not cleared**, so leaving auto-advance on unattended is not yet
  trustworthy. Off-by-default is deliberate.
- **No end-to-end browser verification yet**: the operator gate is host-only, so a
  headless preview returns 403; flipping it touches the shared gate file the live
  `:5099` reads, which I won't do without your say-so.
- The **scoped capability token** (engine holds it, brain never does) from the
  safety doc is still future work.
