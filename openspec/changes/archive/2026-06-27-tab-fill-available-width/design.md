# Design — tab-fill-available-width

## Correction (after first live test)

The original diagnosis below — page CSS caps centering content in a wide pane —
is real but secondary. The **primary** bug is in `PaneStrip.jsx#useMultiPane`:
when a tab's span consumes the whole pane budget, no neighbours fit, `lo === hi`,
and the hook returned `multi: false`. `Layout.jsx` then renders the classic
single view inside `.app-frame`, which is capped at `--max-width: 720px` and
centered — so a full-span tab never enters multi-pane at all, and the page CSS
fix can't apply. Fix: when `lo === hi` and the tab was intentionally widened
(`weight > 1`), return `multi: true` with a lone pane so it renders in the
uncapped strip and fills. The `@container` CSS below remains needed for panes
wider than a page's own reading cap (e.g. Settings at 560px, or Cockpit/Terminal
on a very wide screen).

## Context

The multi-pane strip (`client/src/layout/PaneStrip.jsx`) renders each visible
tab as `<section class="pane">`; a tab with span > 1 gets inline
`style={{ flexGrow: span }}`, so the **pane itself already stretches** to fill
its tab-spaces. Inside each pane, `<div class="app-content">` holds the page,
and `.app-content` already declares `container-type: inline-size`
(`global.css:325`) — its own comment states the intent: *"a stretched pane gets
wider content, not side margin."*

The gutter bug is purely in the **page roots**, which cap and center themselves:

- `pages/cockpit.css` — `.ck { max-width: 1200px; margin: 0 auto }`
- `pages/settings.css` — `.settings-page { max-width: 560px; margin: 0 auto }`
- `pages/terminal.css` — `.terminal-page { max-width: 1100px; margin: 0 auto }`

`margin: 0 auto` centers the content only when there is free space, i.e. only
when the pane's content area is **wider than the cap**. That is exactly — and
only — when a spanned/wide tab produces empty side gutters.

## Goals / Non-Goals

**Goals**
- A pane wider than the page's reading cap fills its full width (no gutters).
- A pane at/under the cap is byte-for-byte unchanged.
- Each pane decides independently, from its own rendered width.

**Non-Goals**
- No change to the span model, the 1–4 range, the `tabWidths` store, the
  `PUT /settings/ui` contract, or the `pane__span` ± controls.
- No backend / API / data changes.
- No tiered "comfortable" intermediate widths (the request is to *fill* the
  available space, not to grow in steps). Tiers are explicitly out of scope.

## Decision

Use a **per-page CSS `@container` query** keyed on the page's existing reading
cap. Because `.app-content` is the size container, the query resolves against the
pane's own content width:

```css
/* cockpit.css */
@container (min-width: 1200px) { .ck { max-width: none; } }

/* settings.css */
@container (min-width: 560px) { .settings-page { max-width: none; } }

/* terminal.css */
@container (min-width: 1100px) { .terminal-page { max-width: none; } }
```

When the pane's content area is at least as wide as the cap, the cap is removed
so the content fills; `margin: 0 auto` then has no free space to distribute, so
it collapses to zero with no extra rule needed. Below the threshold the page is
untouched — the `@container` block simply doesn't apply.

Each rule lives **in its own page's CSS file**, beside the cap it overrides, so
the override is obvious and local to the page that owns the cap.

### Why not a `pane--wide` class hook?

An alternative is to add a `pane--wide` modifier in `PaneStrip.jsx` (when
`pane.width > 1`) and target `.pane--wide .app-content > *`. Rejected because:
it adds JS for what is a pure presentation concern; it keys off *span* rather
than *rendered width*, so it can't tell whether a pane is actually wider than the
cap (the only condition that produces a gutter); and it ignores the
`container-type: inline-size` infrastructure that already exists for exactly
this. The `@container` approach is CSS-only and fills precisely when — and only
when — a gutter would otherwise appear.

## Scope of affected pages

Only the three page roots that combine `max-width` + `margin: 0 auto` exhibit
the centered-gutter symptom: `.ck`, `.settings-page`, `.terminal-page`.
`dashboard.css`'s `margin: auto` is on an inner empty-state element
(`.evc__empty`), not a page root, and is out of scope. Any future page that
adopts the same cap-and-center pattern should add the same one-line
`@container` override.

## Risks / Trade-offs

- **Very wide forms**: filling the Settings page on a very wide span yields
  full-width form fields. This is the explicit ask ("fill the whole horizontal
  space"); if it reads poorly in practice we can later reintroduce a generous
  upper cap or tiers — but not in this change.
- **Browser support**: CSS container queries are required. Modern Chromium
  Webview / current evergreen browsers support them; the harness targets these.
- **Threshold vs padding**: `.app-content` has 16px padding, so the query fires
  a few px before the child literally overflows the cap. The effect is
  negligible (the cap removal is idempotent when content already fit).

## Verification

- Build the frontend (`npm --prefix client run build`) — must compile clean.
- Live check (Advanced UI, multi-pane): set a tab's span to fill the strip and
  confirm content fills with no side gutters; set it back to 1 and confirm the
  reading width is unchanged. (Needs a host eyeball / headless browser, per
  `docs/claude-web/browser-testing.md`.)
