# Detached verification runs — the convention

**Audience:** any agent working in this repo (or on this box) that needs to run
a verification longer than a few minutes — a live-mode loop eval, a long
browser E2E, anything that spends real agent turns. Agent-agnostic, like
`understanding-app-convention.md` and `loop-driven-agent-convention.md`; if
this convention changes, change it **here**.

## The problem

An agent session (Claude Code or otherwise) can be restarted at any moment —
by the operator, a crash, or a context handoff. Two things die with it:

- **foreground commands** — the child process is killed mid-run;
- **in-session watchers** (background monitors, `run_in_background` shells) —
  they are stopped *without leaving a completion record*, so on resume the
  agent sees "stopped / no record" and cannot tell "killed" from "failed".

A 15-minute verification driven either way is a coin-flip: the session
restarts, the evidence is gone, and the run's real agent turns were wasted.

## The rules

1. **Launch the run detached, never as a session child.** On Windows, the
   proven recipe is a `.cmd` wrapper committed next to the script, started
   via `Start-Process cmd.exe /c <wrapper>` (PowerShell) or
   `cmd /c start "" /b <wrapper>` (bash). The wrapper redirects all output to
   a log file. The process then belongs to the OS, not the session.

2. **The script writes its own verdict to the log, machine-greppable.** End
   with a unique terminal marker line carrying the result as JSON, e.g.

   ```
   @@LOOPEVALDOCK@@ {"pass":true,"checks":[...]}
   ```

   Every check line before it should be `ok  - ...` / `FAIL - ...` so a grep
   reconstructs the whole story. The log file *is* the run's memory; the
   session's own transcript is not.

3. **The script cleans up after itself** (kills the instance it booted,
   removes fixtures) — it cannot assume the session that launched it is still
   alive to do teardown.

4. **Watch by polling the log for the marker, not by trusting the watcher.**
   An in-session monitor is a convenience, not the source of truth. If it
   reports "stopped with no completion record" after a session restart, that
   means *check the log file* — the detached run usually finished fine.
   A watcher should also detect the run's process dying before the marker
   appears (e.g. scan the process list for the script name) so a crash is
   loud, not silent.

5. **Verdict evidence goes in the log + screenshots on disk**, so a fresh
   session (or a different agent) can confirm the result without rerunning.

## Reference implementation

`.claudeweb-preview/playwright/verify-loopeval-dock.mjs` +
`run-verify-dock.cmd` (committed on the loop-eval branches): a self-booting
disposable harness instance, a real live eval run, `@@LOOPEVALDOCK@@` marker,
self-teardown, and screenshots — launched detached, verified across three
session restarts without losing a run.

## Relation to the agent dock

The Harness's watchable agent dock answers "**what is the agent doing right
now**" for a human on a phone. This convention answers "**did my long test
finish, and what was the verdict**" for the agent itself across session
boundaries. They complement each other; neither replaces the other.
