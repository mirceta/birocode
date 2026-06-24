# Add +/- span buttons to each tab's top bar

## My understanding of the request (restated for confirmation)

**Goal.** In the multi-pane tabview, when the screen is wide enough that **at least
two tabs are visible side by side**, put a **"+"** and a **"−"** button in each
visible tab's **top bar** (the strip that today shows only the tab's name label).
"+" makes that tab occupy **one more tab-space** than it currently does; "−" does the
reverse. This reuses the *exact* width mechanism the Settings tab already exposes — a
per-tab span of 1–4 stored in `tabWidths` — so the buttons are a second front-end onto
an existing feature, not a new one.

**Where this lives in the code (what I found):**

- The side-by-side layout is the **multi-pane** mode in
  `client/src/layout/PaneStrip.jsx`. It activates only when the `multiPane` feature is
  on **and** the viewport is wide enough (`paneCountNow()` ≥ 2, i.e.
  `window.innerWidth / 420 ≥ 2`) **and** at least two tabs actually fit the slot budget
  (`lo !== hi`). When those don't hold, the app falls back to a single full-width view
  that does **not** use `PaneStrip` at all. **So "at least two tabs visible" is already
  exactly the condition under which `PaneStrip` renders** — the gating the user asked
  for comes for free; I do not need a separate width check.
- Each pane's top bar is one line — `PaneStrip.jsx:77`:
  `<Link to={pane.path} className="pane__bar">{t(pane.labelKey)}</Link>` — the label and
  nothing else. This is where the two buttons go.
- The width per tab is `tabWidths[key]` (1–4, absent ⇒ 1), read in `PaneStrip.jsx:43`
  via `weight()` and applied as `flexGrow` (`PaneStrip.jsx:75`). It is read/written
  through `useUiSettings()` → `saveTabWidths(order, widths)`
  (`client/src/context/UiSettingsContext.jsx`), which optimistically updates state and
  PUTs `/settings/ui`. The Settings tab already drives this with `setWidth(key, v)` and
  −/+ steppers clamped to 1–4 (`client/src/pages/Settings.jsx:92` and `:157–177`). The
  new buttons will call the **same** `saveTabWidths` with the **same** 1–4 clamp and the
  same sparse-map rule (delete the key when it drops to 1).

## Concrete steps I'll take (after you confirm)

1. **Register the feature flag.** Add `paneSpanButtons: 'advanced'` to the `FEATURES`
   map in `client/src/context/UiModeContext.jsx` (new UI features default to Advanced
   per the repo convention; multi-pane is already Advanced, so this is consistent).
2. **Render the buttons in the pane bar.** In `PaneStrip.jsx`, pull
   `tabWidths`/`saveTabWidths` from `useUiSettings()`, the current tab order, and
   `useFeature('paneSpanButtons')`. Beside the label in `.pane__bar`, render a "−" and a
   "+" button (gated on the feature flag), with `aria-label`s and i18n keys. Clicking
   computes the next width via the existing sparse-map + 1–4 clamp and calls
   `saveTabWidths(order, next)` — no new persistence path.
3. **Reuse / factor the stepper logic.** Mirror Settings' `setWidth` so the rule lives
   in one obvious place (extract a tiny shared helper if it reads cleanly; otherwise
   duplicate the few lines with a comment pointing at Settings). "−" disabled at 1, "+"
   disabled at 4.
4. **Style.** Give `.pane__bar` a flex layout so the label sits left and the buttons sit
   right; reuse existing button styling where possible (`global.css`).
5. **i18n.** Add the two button labels to the language files alongside the existing
   `settings.widthInc` / `settings.widthDec` keys.
6. **Verify in a real browser** (headless Playwright per `docs/claude-web/browser-testing.md`):
   wide viewport shows ≥2 panes with working +/−; narrow viewport (single pane) shows no
   buttons; values round-trip through `/settings/ui` and agree with the Settings tab.
7. **Understanding app.** Author `understanding-app/index.html` visualizing the slot-budget
   layout and how +/− shifts the visible window.

## Open questions / assumptions (please confirm or correct)

- **A1 — Clamp stays 1–4.** I'll keep the existing 1–4 range so the two UIs agree. "+"
  is a no-op/disabled at 4. *(Alternative: let the pane buttons exceed 4. I don't
  recommend it — it would diverge from Settings.)*
- **A2 — Growing can collapse the strip.** Because width spends a shared slot budget,
  pressing "+" enough can push every neighbour out, at which point multi-pane collapses
  to the single-pane view and the buttons disappear (you'd shrink again from Settings).
  I plan to **accept this** as existing layout behavior rather than add special casing.
  Flagging because it's a real edge.
- **A3 — Scope is multi-pane only.** No buttons in the single-pane/narrow view (matches
  your "at least two tabs visible" gate). The Settings stepper remains the way to set
  width when only one tab is visible.
- **A4 — Advanced mode only**, consistent with multi-pane itself.

## Why

The per-tab span is useful *while you're looking at the panes*, but today the only place
to change it is buried in the Settings tab. Surfacing −/+ directly on each pane's bar
makes the existing feature reachable in context, with zero new state or storage.

## What changes

- `client/src/layout/PaneStrip.jsx` — render gated −/+ buttons in `.pane__bar`, wired to
  `saveTabWidths` with the existing 1–4 clamp.
- `client/src/context/UiModeContext.jsx` — new `paneSpanButtons: 'advanced'` capability.
- `client/src/styles/global.css` — `.pane__bar` flex layout + button styling.
- i18n language files — two new button-label keys.
- `understanding-app/index.html` — companion visualization.

## Impact

- Affected spec: `multi-pane` (ADDED: "In-pane span controls" requirement).
- Affected code: the four client files above plus i18n; no server/API change (reuses the
  existing `/settings/ui` PUT).
