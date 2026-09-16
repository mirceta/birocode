# Design: agent-badge-identity

## D1 — Identity, not order

The hue slots are assigned first-seen and persisted per device, so they are stable on
one device but can differ between devices. The mark must not: it is derived only from
the agent's identity. `agentKey(machineKey, repoKey)` is the same pair both views
already compute (`self`/sourceId and the normalised remote URL or `id:<repoId>`), so an
agent has one key however it is reached. `glyphOf` = FNV-1a hash of that key modulo 16
shapes; `monogramOf` = `abbrMachine(label)/abbrRepo(handle)`. No storage, no React.

## D2 — The monogram scheme

- Machine: first letter + first consonant after it (vowels only when nothing else),
  two letters: `razvoj2016 → rz`, `living room → lv`, `laptop → lp`, `MONSTER → mn`.
- Repo: the repo part of the handle (`machine/slug#k` → `slug#k`); a single word keeps
  its first three letters, a multi-word slug its initials (max 3), plus the handle
  index: `prg → prg`, `prg#2 → prg2`, `game-arcade → ga`, `web → web`.
- Together `rz/prg2`, `lv/web`. Unique across the fleet in practice (the handle index
  already disambiguates same-slug repos on one machine); the glyph and the hue cover the
  residual case, and the full handle is always in the title.

## D3 — The glyph set

16 shapes that render alike in system symbol fonts and stay distinct at 11 px: ● ■ ▲ ◆
★ ✚ ⬟ ⬢ ✦ ◐ ◑ ◩ ◪ ▼ ⬖ ✖. A hash spreads agents over them; with the hue and the
monogram it only has to break ties, so 16 is ample headroom for the current fleet.

## D4 — One component, two views

`AgentMark` renders `{glyph}{monogram}` with `title` + `aria-label` = full handle and
`data-agent-mark` / `data-glyph` / `data-monogram` for tests. Fleet Status passes
`colors.mark(mk, rk, m.machine, a.handle || a.name)`; the Kanban board passes
`colors.mark(mkOf(a), rkOf(a), machine, handle)` from its fleet lookup — the same
labels the fleet reports, so the two views agree letter for letter. The mark leads the
chip text, before the 🏛 scope marker (Fleet) or the handle (Kanban); the 👤 prefix on
Kanban chips is replaced by the mark, which says more.

## D5 — Tests

`agentIdentity.test.mjs` (node --test): the monogram scheme on the brief's examples,
glyph determinism and independence from order/persistence, a synthetic 6×6 fleet where
every repo hue repeats six times yet every hue+glyph+monogram token is unique and every
monogram is unique, the mark's stability across "reloads" with different slot maps, and
parity between a Fleet Status-shaped input and a Kanban-shaped input for one agent,
including the hue-wrap case. A headless screenshot of both views with same-hue agents
is the visual evidence for the PR.
