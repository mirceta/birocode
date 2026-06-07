# Plan: the "App" tab — preview the running product

## Concept

This app is a **harness**: a phone-accessible web UI for driving Claude Code over
a repository (Chat / Files / History). This feature adds an **App tab** that
shows the application you're building, running live, embedded in the harness.

Key insight: Claude Code already has permission to run commands on the host. So
"start the product" is just something you **tell Claude in chat** ("run the
backend", "yarn start"). The harness does **not** need to build, orchestrate, or
manage the product — it only needs to **show whatever is running on a fixed
preview port**.

Terms:

- **Harness** — this app (the web UI you're using). Serves on `:5099`.
- **Product** — the app in the currently-opened repository, started by Claude.
- **Preview port** — a fixed port (default **5200**) the Product is expected to
  serve on; the App tab iframes it.
- **Self-Development** — open the harness's own repo as the project; the Product
  becomes the harness, so it can preview/improve itself.

## Approach

The App tab is just an `<iframe src="http://<your-host>:5200">` plus a little
chrome. You ask Claude to start the product on `:5200`; the tab shows it.

That's the whole feature. The two things that don't "just work" are handled by
**conventions told to Claude** (via a `CLAUDE.md` in the repo), not by harness
code:

1. **The server must outlive the chat turn.** The harness runs `claude -p`
   (one-shot); a server Claude starts normally dies when the turn ends. Fix:
   Claude launches it **detached** (`Start-Process` on Windows / `nohup … &
   disown` on Unix), bound to `0.0.0.0:5200`.
2. **Self-dev build lock.** When Product = Harness, building/running from the
   same repo collides with the running harness (`MSB3027` locked exe / port
   5099). Fix: for self-dev, Claude builds/runs to an **isolated output dir** on
   `:5200`. (Generic products don't have this problem.)

## What we build (small)

1. **App tab** (4th bottom-nav tab) → `pages/AppRun.jsx`:
   - `<iframe>` to `${location.protocol}//${location.hostname}:<previewPort>`
     (uses the host you're on, so it works from the phone over the LAN).
   - **Refresh** button.
   - **Empty / not-listening state**: "Nothing is running on :5200 yet — ask
     Claude to start the app."
   - A small **listening indicator** (poll whether `:5200` responds).
2. **Configurable preview port** (default 5200) — `appsettings.json` +
   `GET /api/app/preview` so the frontend knows the port. (No start/stop/build
   endpoints.)
3. **Pin the self repo** (`RepositoryRegistry`): a non-removable
   "Claude Web (this app)" entry so "improve this app" is one selection away.
4. **`CLAUDE.md`** in the repo encoding the two conventions above so Claude
   starts previews consistently (detached, `0.0.0.0:5200`, isolated build for
   self-dev).
5. **i18n:** EN + TR strings for the new tab.

## What we explicitly DROP (vs the earlier plan)

`ProductRunner`, `claudeweb.run.json` manifest, build orchestration,
port-injection hooks, and Start/Stop/Restart buttons. Lifecycle is managed by
talking to Claude ("start the app", "kill whatever's on 5200").

## Trade-off accepted

No lifecycle UI — you start/stop/restart the product via chat, and cleaning up
orphaned servers is on you. Fine for a developer dev-loop.

## Verification

0. **De-risk first:** confirm a detached server Claude starts on `:5200`
   survives after the chat turn ends and stays reachable. The whole feature
   depends on this.
1. Ask Claude to start a product on `:5200` → App tab shows it.
2. Edit a file via Chat → ask Claude to restart it → change appears on refresh.
3. Self repo: build/run isolated on `:5200` → App tab shows the app inside the
   app; the outer session is untouched.

## Notes / limitations

- HTTPS would block an `http://:5200` iframe (mixed content) — LAN/`http` only
  for now; a reverse proxy is a later option.
- Security blast radius is unchanged (Claude already runs arbitrary commands);
  keep this a trusted-operator, LAN/localhost tool.

## Rough size

1 new frontend page + nav/i18n edits; 1 small config + endpoint; pin-self-repo
tweak; a `CLAUDE.md`. Much smaller than the multi-repo feature.
