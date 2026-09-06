## 1. Build

- [x] 1.1 `ArchStateStore`: `Conversations` records (id, name, session, watermark, standing
      loop); default `@arch` migrated from the legacy fields and mirrored on save;
      add/rename/remove; keyed watermark/session/standing-loop overloads.
- [x] 1.2 `ArchAgentService`: `IsArchKey`/`KeyOrDefault`, `HomeInfoFor`, per-key
      `ComposeWake`/`CommitWake` drafts, `ResolveArchSessionId(conv)`, `NoteArchSession(conv,…)`,
      `SendToArch(conv,…)`, `Arm/Disarm/Resume/Restore(conv)`, conversation CRUD,
      `ArmedOrRefusal` = any armed conversation; `IArchWakeSource.ComposeWake(key)`.
- [x] 1.3 Engine + controllers: tick every conversation with a loop slot; `IsArchKey` in
      the policy hook, commit-wake, no-session guard, MCP config, restore; `?conv=` on the
      arch endpoints; `/api/arch/conversations` CRUD; autopilot controller, message actors
      and the repository resolver prefix-aware.
- [x] 1.4 Client: `Arch` `conv` prop (all calls, stream, driven row), Loops lane, split
      toggle + lane chips as column pickers, editable name + remove; `view="cards"` =
      fleet-wide cards only; `ArchHistoryPanel conv`; `useArchStream` query-safe path.
- [x] 1.5 Management App: dynamic `arch:<id>` sibling tabs after Arch, labels = names,
      ＋ new conversation, rename/remove follow-through, order/hidden/weights learn new
      keys; i18n en + tr; CSS.
- [x] 1.6 Tests: `ArchConversationsTests` (key shape, store CRUD + persistence, per-
      conversation fields, legacy migration + mirror, per-key loop slots, ArchLoop passes
      its key); `FakeWake` updated. Suite 249 passing.

## 2. Verify

- [x] 2.1 Detached browser check (`verify-arch-conversations.mjs`, `@@ARCHCONV@@`): API
      CRUD + 404 + default undeletable; loop isolation (arm one conversation in suggest
      mode, the default stays unarmed, projection lists the key); sibling tab after Arch
      with the name; lanes Chat · Tools · History · Loops; Loops lane holds both loop
      cards; split on/off with chip add/remove and reload persistence; rename at the top
      renames the tab and persists; Status tab has no loop cards; panes layout slot; ＋
      creates and opens; remove drops the tab and falls back to Arch; a goal armed on the
      conversation key takes its slot and stopping it restores that conversation's wake loop.
      DONE 2026-09-06 11:10 — `@@ARCHCONV@@ pass:true, 43 checks` (log
      `.claudeweb-preview/out-arch-conversations.log`, evidence stamp 2026-09-06T09-10-12).

## 3. Ship

- [ ] 3.1 Commit on `feature/arch-conversations`; deploy/merge on the Operator's word.
