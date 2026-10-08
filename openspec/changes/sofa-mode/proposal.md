# Proposal: sofa-mode — use the harness from the living-room sofa

Fleet task `68090860b8684594a52c0b254f80c217` (Operator, 2026-10-08). **Status: PLAN, awaiting the
Operator's approval** — nothing in this change is built yet. A cross-repo effort: this repo
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

What is missing is the link between them: nothing tells the screen on the projector *which
agent to show and where to look*, and nothing on the phone shows the harness in a thumb-sized
form (pick an agent, type a prompt, answer a question) instead of a mouse pointer.

## What this change proposes (the recommended design, D-C in design.md)

1. **A server-side Stage.** One small record per harness, `GET/PUT /api/stage`:
   `{ dockId, lane, follow, fontScale, view }` — "what the big screen shows". Stored in the
   data dir, changed by the phone, read by the projector. Behind the normal `/api` gates (IP +
   password), like every write a device may do here.
2. **The Stage view (projector).** A route of the existing client, `/stage`, that renders
   *one* agent's conversation full-bleed at living-room distance: large type, no dock chrome,
   auto-follow of the streaming reply (reusing the chat stream the dock uses), the agent's
   name and run state on a thin strip, and — when idle — the URL/QR of the Remote so a phone
   can join. It polls the Stage record and switches agent / lane / scroll mode when the phone
   changes it. Capability-map default: Advanced.
3. **The Remote view (phone).** A route `/remote`, phone-sized: the dock list from
   `GET /api/dock` with busy / waiting / unseen badges (tap = `PUT /api/stage`), a composer
   that `POST /api/chat`s to the staged agent with the right `X-Repo-Id` and lane, a Stop
   button, Follow / Page up / Page down / Latest, font ± , and — when the staged agent's
   last message is an `AskUserQuestion` — the options as big buttons that send the chosen
   option as the next message (exactly what `AskQuestionCard` does today). The phone *types*;
   the projector *shows*.
4. **The living-room leg (daljinski).** A **Harness** tab in the phone page that embeds (or
   links) `http://<this-pc>:5077 → http://<this-pc>:5099/remote`, a `show-harness` command
   that brings the browser with the Stage to the front (via the host-input plugin, the way
   `show-projector` raises its own window), plus the two quick wins the Operator can use on
   day one with no harness change: a `mouse-scroll {dy}` command and `press-key` for
   `tab`, `escape`, `enter`, `up/down/left/right`, `pageup/pagedown`.
5. **Security stance (to confirm — see questions).** The harness side rides the existing
   trust model: on the LAN the IP gate admits the phone, the password session (once per
   device, 180-day cookie) protects `/api`. The Stage/Remote add no new credential and no
   bypass. Daljinski stays "trusted LAN, no auth" as it is today; its Harness tab only *opens*
   the harness, it does not proxy its API.

## Milestones

- **M0 — sofa today (living-room only, optional).** Scroll wheel + the named keys in
  daljinski; the Operator zooms Chrome on the projector to 150 % by hand. Mouse-and-type the
  harness from the sofa with what exists.
- **M1 — read on the projector, send from the phone.** Stage record + `/stage` + `/remote`
  (agent list, composer, Stop, follow). Daljinski: Harness tab that opens the Remote.
  *Done when:* the Operator picks an agent on the phone, the projector switches to it, a
  prompt typed on the phone appears and streams on the projector.
- **M2 — a whole sofa session.** Question cards as phone buttons; scroll/page/latest and
  font controls; lane switch (Builder / Ask); run status + tool-call ticker on the strip;
  "needs you" badges on the agent list; phone vibration when the staged agent asks.
- **M3 — beyond one agent.** Management views on the Stage (Status, Kanban, Fleet) picked
  from the phone; two-up stage; the arch's Operator chat from the phone; voice dictation in
  the composer (browser speech API on the phone).
- **M4 — one app.** Daljinski's Harness tab becomes a native tab (its own `CONTROLS`
  entries calling the harness API with the stored password), pairing PIN for the Remote when
  the LAN bypass is off, a PWA icon for the phone.

Each milestone = one branch per repo, one PR per branch; the driver drives
`living room/living-room` for its side (`report_leg`).

## Out of scope

Remote control of the *hub's* harness (DESKTOP-POAPPP3) from the sofa — the Stage is per
harness; the fleet case is a later question. Mirroring the projector onto the phone
(screenshots) — the Screen tab already exists for that and it is the opposite of the wish.
Any change to the living-room app's media features.

## Open questions for the Operator

See the "Open questions" view of the Understanding app; repeated in the closing report.
