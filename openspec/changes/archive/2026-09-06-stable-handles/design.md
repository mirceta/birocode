# Design: stable-handles

- **D1 — Numbers, not slugs, for ideas.** A slug of the first words is neither unique nor
  short for the near-duplicate texts the board holds; a running number is both and reads
  naturally in chat ("#12"). Stored on the note (`Number`, 0 = unassigned), so the ideas
  sync carries it; a remote note without one is numbered on merge. Two boxes creating
  ideas offline can collide on a number; the resolver then reports the ambiguity with
  both ids rather than renumbering (numbers never change).
- **D2 — Repo handles live in the registry.** `RepositoryConfig.Handle` is assigned on add
  and by a one-time backfill on load, in registry order, and never recomputed — so a
  rename or removal cannot shift `prg#2` onto another repo. `Handles.AssignRepoHandles`
  is pure and shared by the backfill, the add path and the hub-side fallback for older
  peers.
- **D3 — One resolver.** `ArchAgentService.ResolveAgentRef(machine, ref)` parses
  `machine/repo`, resolves the machine (existing rule), then the repo by id → handle →
  unique name (`Handles.ResolveRepoRef`, pure). Every tool that names a repo goes through
  it, so the raw id keeps working everywhere.
- **D4 — Label = `<machine>/<handle>`.** The machine part is the label the hub already
  uses for that source (self label for this box), so the same string appears in tools,
  the Status tab, the kanban and the arch card. Dock chips on the dashboard show only the
  `#k` suffix beside the name (the machine is implicit there) with the full label in the
  tooltip.
