# Proposal: sofa-mode — use the harness from the living-room sofa

Fleet task `68090860b8684594a52c0b254f80c217` (Operator, 2026-10-08). **Status: APPROVED
2026-10-08, in implementation** — every open question answered (design.md D8, tasks.md 0.4):
design D-C; the big screen hosted by a WebView2 presenter in the living-room projector window
(H3) built on the plain Chrome-tab listener's parts (H1); the remote in the harness as a plain
phone-fitted web page (no PWA, no push); a pairing PIN; no live typing (Wispr Flow on the
phone); Android; end to end in one go — one harness PR, one living-room PR. A cross-repo effort: this repo
(the harness, the driver) and `living-room` (the home-entertainment app with the *daljinski*
phone remote, the driven leg). The understanding of both sides is rendered in
`understanding-app/` (Local tab → Understanding).

## Why

The living-room PC drives a projector over HDMI and runs this harness. Today the Operator uses
the harness sitting at that PC with keyboard and mouse. The wish, in the Operator's words: lie
on the sofa, hold only the phone, look at the projector, "look and do stuff within our
harness".

Two things already exist and nearly meet:

- **The harness is already reachable from the phone.** `http://192.168.1.105:5099/` passes
  the IP gate through the LAN bypass range (`LanBypassCidrs 192.168.1.0/24`) and the whole UI
  works there. But reading a conversation on a phone is the thing the Operator wants to stop
  doing — the projector is the screen.
- **The daljinski remote already types and points at the PC.** `LivingRoom.App` (.NET 10
  WinForms + Kestrel on `0.0.0.0:5077`, no auth) serves a phone page whose controls all go
  through `POST /commands {type,args}`: relative `mouse-move`, left/right click, drag
  (down/up), `type-text` (Unicode via `SendInput`, newline = Enter), `press-key` (only
  `backspace` and `paste`), YouTube play/pause/seek/volume inside its own WebView2 projector
  window, `show-projector`. It has **no scroll wheel, no Tab/Esc/arrows**, and it knows
  nothing about which window it is typing into.

What is missing is the link between them: nothing can tell the harness tab on the projector
*what to open* (a browser tab's active agent is its own sessionStorage; the Kanban chip opens
an agent, but only from inside that browser), and nothing on the phone shows the harness in a
thumb-sized form (pick an agent, type a prompt, answer a question) instead of a mouse pointer.

**Revised 2026-10-08 on the Operator's steer:** the projector already shows the real harness
in Chrome and that is the view wanted — the Agent tab as a Kanban card's agent chip opens it,
the Kanban, the Arch tab. No new projector view; the phone sends that tab commands.

**Decided 2026-10-08 (Operator):** design **D-C** — "the correct way to frame it". D-A is not
a candidate but the status quo: the Operator already drives the harness from the sofa with
daljinski's mouse and keyboard, "better than nothing, but too much work". So there is no M0;
the plan starts at M1.

## What this change proposes (the recommended design, D-C in design.md)

1. **Remote commands.** `POST /api/remote/commands { type, args }` — the same shape daljinski
   uses — into a short per-harness ring buffer with a `seq`, readable at
   `GET /api/remote/commands?after=`, published as `remote.command` on the event feed.
   M1 types: `open-agent`, `open-view`, `scroll`, `zoom`. Behind the normal `/api` gates
   (IP + password), like every write a device may do here.
2. **The listening tab (projector).** One new header pill, **"📺 big screen"**, remembered per
   browser (or `?screen=1`). While on, the *normal* harness tab polls the commands and
   executes each with the code the UI already has: `open-agent` → `openAgentHarness` (exactly
   the Kanban chip's click), `open-view` → the header-tab navigation, `scroll` → the active
   dock's message list, `zoom` → document zoom. It heartbeats what it shows to
   `/api/remote/screens`, so the phone can say "projector is showing: Agent · pers-dec" or
   "no screen is listening". Nothing new is rendered. Capability-map default: Advanced.
3. **The Remote view (phone).** A route `/remote`, phone-sized: a view row (Kanban · Status ·
   Arch · Fleet), the dock list from `GET /api/dock` with busy / waiting / unseen badges (tap
   = `open-agent`), a composer that `POST /api/chat`s to the opened agent with the right
   `X-Repo-Id` and lane (or to the arch's Operator conversation when the Arch view is open),
   Stop, Page up / Page down / Latest, zoom ±, and (M2) the opened agent's `AskUserQuestion`
   options as big buttons that send the chosen option as the next message (exactly what
   `AskQuestionCard` does today). The phone *types and points*; the harness tab *obeys and
   shows*.
4. **The living-room leg (daljinski).** A **Harness** tab in the phone page that embeds (or
   links) `http://<this-pc>:5099/remote`, a `show-harness` command that brings Chrome with
   the harness to the front (via the host-input plugin, the way `show-projector` raises its
   own window). Optional nicety for the fallback the Operator uses today: a `mouse-scroll
   {dy}` command and `press-key` for `tab`, `escape`, `enter`, `up/down/left/right`,
   `pageup/pagedown`.
5. **Security stance (to confirm — see questions).** The harness side rides the existing
   trust model: on the LAN the IP gate admits the phone, the password session (once per
   device, 180-day cookie) protects `/api`. The remote adds no new credential and no bypass;
   a command can open any agent and the composer can prompt it — the same power a LAN browser
   has today. Daljinski stays "trusted LAN, no auth" as it is today; its Harness tab only
   *opens* the harness, it does not proxy its API.

## Milestones

- **M0 — today (status quo, nothing to build).** The Operator already mouse-and-types the
  harness from the sofa with daljinski — the pain points of that are M1's brief.
- **M1 — open an agent from the phone, send a prompt.** Remote commands + screens heartbeat,
  the big-screen pill and listener (`open-agent`, `open-view`, `scroll`, `zoom`), `/remote`
  (view row, agent list, composer, Stop, ▲ ▼ Latest, zoom). Daljinski: Harness tab that opens
  the Remote, `show-harness`. *Done when:* the Operator taps an agent on the phone, the
  harness tab on the projector opens it exactly like the Kanban chip does, and a prompt typed
  on the phone streams in that dock.
- **M2 — a whole sofa session.** Question cards mirrored as phone buttons; "needs you"
  badges; vibration; `lane` / `stop` commands; tool-call ticker on the phone from the stream;
  the composer targets the arch's Operator conversation when the Arch view is open; "peek".
- **M3 — more screens, more input.** `open-view` for every management view (Status, Fleet,
  Recurring, Deploys); voice dictation in the composer (browser speech API); a fleet picker
  on the remote that commands the hub's listening tab (its own harness, same API).
- **M4 — one app.** Daljinski's Harness-tab controls forward `{type,args}` as remote
  commands if preferred over the iframe, pairing PIN for the Remote when the LAN bypass is
  off, a PWA icon for the phone.

Each milestone = one branch per repo, one PR per branch; the driver drives
`living room/living-room` for its side (`report_leg`).

## Out of scope

A new projector-sized rendering of anything (dropped design D-B). Remote control of the
*hub's* harness (DESKTOP-POAPPP3) before M3. Mirroring the projector onto the phone
(screenshots) — the Screen tab already exists for that and it is the opposite of the wish.
Any change to the living-room app's media features.

## Open questions for the Operator

See the "Open questions" view of the Understanding app; repeated in the closing report.
