## Context

Each agent dock (`PinnedAgent.jsx`) renders `<span className="phone__dot" />` as the first
child of the `phone__bar` header button. `dashboard.css` styles it as a 9px circle: grey
(`#aaa`) by default, green with a `dash-pulse` animation under `.phone--running`, blue under
`.phone--done`, red under `.phone--error`. The `status` prop (values `idle | running | done |
error`) already drives the `phone--<status>` class on the root, so all state needed for the new
indicator is present — this is a presentation-only change.

The color reference is the chat composer: `.chat-input__send` is `--color-accent` (#c96442,
warm terracotta — the "orange") at rest, and while streaming it becomes `.chat-input__stop`
with `background: var(--color-text)` (#2b2b29, near-black). The operator already reads
"orange = ready, black = busy" there; the dock indicator adopts the same language.

## Goals / Non-Goals

**Goals:**
- Busy vs at-rest state of every dock readable at a glance from across the dashboard.
- One color language shared with the send button: orange at rest, black while processing.
- Error stays a distinct red.

**Non-Goals:**
- No change to how `status` is computed or delivered (no backend, no ChatContext changes).
- No change to the other status surfaces (the `phone__status` text label, dashboard summary
  cells, Agents-tab rows) — only the dock header's top-left indicator.
- No new user-facing toggle; the indicator is not gated (the dock itself already is).

## Decisions

- **D1 — CSS-first, keep the single `phone__dot` element.** The `phone--<status>` root class
  already encodes everything; restyle `.phone__dot` and its status variants rather than adding
  markup or props. Alternative (a new component reading `status`) adds surface for zero
  behavior gain.
- **D2 — Status → color mapping:** `idle` and `done` → `var(--color-accent)`; `running` →
  `var(--color-text)`; `error` → keep the existing red (`#ef4444`). `done` deliberately folds
  into the at-rest orange — mirroring the send button, which simply returns to orange after a
  send; the "Done" text label in the header keeps carrying that nuance. This removes the blue
  done-dot and the grey idle-dot.
- **D3 — Size/shape:** grow the indicator to a clearly visible pill/round shape (roughly
  double the current diameter, on the order of 16–18px) sized so the header row height doesn't
  jump. Exact value tuned visually during implementation; the spec requirement is "visibly
  larger than 9px and legible at a glance", not a pixel constant.
- **D4 — Motion:** keep a subtle pulse on the busy (black) state so "working" reads as alive,
  not stuck — reusing the existing `dash-pulse` keyframes. The at-rest orange is static.
  Rationale: the user's complaint is about the *flicker being the only signal* on a tiny dot,
  not about motion per se; color + size carry the signal now, the pulse is reinforcement.
- **D5 — Dark theme:** `--color-text` flips to a light color under the dark theme, exactly as
  the Stop button does — inheriting the tokens keeps the two surfaces consistent in both
  themes for free. No theme-specific overrides.

## Risks / Trade-offs

- [Blue `done` dot disappears] → The header's status text still says "Done"; if the operator
  misses the blue cue, a `done`-specific accent can be reintroduced as a follow-up without
  touching the busy scheme.
- [Merge overlap with `add-dock-openspec-lane`] → That in-flight change also edits
  `PinnedAgent.jsx` / `dashboard.css`. This change touches only the `.phone__dot` rules and
  (at most) one line of markup, so conflicts should be trivial; rebase whichever lands second.
- [Orange dot vs orange agent-color accents] → Docks can carry a per-agent `--agent-color`;
  a terracotta-colored agent could make the at-rest dot blend into its header tint. Accept for
  now — busy (black) remains unambiguous, which is the signal that matters.
