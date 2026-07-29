# add-loop-debug-handoff — tasks

## 1. Backend

- [x] 1.1 `LoopConfigStore` + `AutopilotAuditLog`: expose `FilePath`.
- [x] 1.2 `AutopilotService.DebugSnapshot(repoId)`: busy flag, current
  `AgentState`, dedup guards (`_lastDriveSent`, `_suggestWait`, `_armGen`,
  `_lastIntercepted`), repo-filtered intercepts and (by repo name) log rows.
- [x] 1.3 `AutopilotController`: `GET /api/autopilot/loops/{repoId}/debug` —
  session-auth, ungated; compose bundle (gate, kill switch, threshold, deny
  list, repo, loop record, engine snapshot, repo-filtered audit, file paths,
  agent hint); redact prompt-bearing fields while the gate is closed.

## 2. Frontend

- [x] 2.1 `DockLoopControl.jsx`: copy-for-debugging button (always rendered in
  the popover) — fetch bundle, build header + fenced-JSON block, clipboard
  write with execCommand fallback, read-only textarea on double failure.
- [x] 2.2 i18n keys (en + tr) + `dashboard.css` for the fallback textarea.

## 3. Verify

- [x] 3.1 Isolated-port e2e: gate OFF → debug 200 + redaction marker; gate ON
  → arm recipe loop → full bundle with guards + file paths; no-loop repo →
  null loop, still 200.
- [x] 3.2 Playwright: dock popover → copy → clipboard content asserted;
  screenshot read.
- [x] 3.3 `openspec validate add-loop-debug-handoff --strict`.
