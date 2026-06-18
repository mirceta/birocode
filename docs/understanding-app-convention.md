# The Understanding-app convention

This is the **canonical, agent-agnostic statement** of the convention. It is meant to be
read directly off disk by any agent on this box — including agents working in *other*
repos. Point an agent here once and it can ship Understanding apps from then on.

> The Claude Web harness and its own `CLAUDE.md` reference this file as the single source
> of truth. If the convention changes, change it **here** — don't re-describe it elsewhere.

## What to do

Whenever you explain something **non-trivial** to the user (a flow, an architecture, how a
few pieces fit together — not a one-line answer), also **build a small single-page app that
visualizes it**, on top of replying in prose. The app is a companion, not a replacement.

## The four-line contract

1. **Build-less & self-contained.** A folder of static assets — `index.html` plus its own
   JS/CSS, any **vendored** libraries, and data files. No CDN, no `node_modules`, no build
   step.
2. **Relative URLs only.** Reference assets as `./app.js`, never `/app.js`. The harness
   serves you under a proxy sub-path; a leading slash escapes it and 404s.
3. **Overwrite the rolling-latest entry.** The entry point is always
   `understanding-app/index.html` at the repo root. Overwrite that same file each time your
   explanation changes — don't version filenames.
4. **Let the harness serve it.** You don't run a server. The harness serves the folder
   `no-store` in the Local tab's always-on **Understanding** slot
   (`GET /api/localview/<repo>/app/understanding/`), so every overwrite shows up on reload.

## No fallback — broken is visibly broken

There is no Mermaid (or any) fallback renderer. A missing `index.html` is an explicit empty
state; a wrong (absolute) URL is a plain 404. So a tiny correct app beats a clever fragile
one — you can't silently mask a mistake.

Reach for interaction / animation / multiple views when it aids understanding — a richer app
is the point, not a static diagram.
