# Claude in Chrome per agent: one agent's browser mode never blocks another

## Why

Turning on browser mode (the 🌐 toggle) for one repo agent silently turns it on for
every repo agent. The toggle is one device-global flag (`claude-web.browser-mode` in
localStorage, `ChatContext.jsx`), and every builder-lane send from any dock attaches
`browser: true` while it is set. On the server, `ChatController` claims the global
single-holder browser gate (`ChromeGateService`) for every such send. So while agent A
drives Chrome, a prompt to agent B — about something unrelated, with no browser work
intended — arrives flagged as a browser turn, hits the gate and is refused with
HTTP 409 "The browser is in use by another agent (A)". The Operator cannot prompt any
other agent until A's run ends: with browser mode on, the harness collapses to one
usable agent at a time.

The constraint is an accident of where the toggle lives, not of the browser. The
single-holder gate itself is fine (one native-messaging pipe per Chrome); what is wrong
is that agents that never asked for the browser are put through it.

## What changes

- **Browser mode is a per-agent choice.** The 🌐 toggle belongs to the agent it is
  flipped on (the dock tab, or the main chat's repo) and is stored per agent, not per
  device. Flipping it on for A leaves B, C and every other agent off. Only the agent
  whose toggle is on sends `browser: true`.
- **An agent that did not ask for the browser is never gated by it.** Sends without
  the flag never touch the browser gate (true today, made explicit in the spec); the
  server also refuses to treat a flag as a browser request unless it came from the
  agent's own toggle state (defense in depth against a stale device-global flag from an
  older client).
- **The busy case is explained where it happens.** When A holds the browser and the
  Operator turns 🌐 on for B, B's toggle shows "held by A" and its send says so; every
  other agent is unaffected. `GET /api/chrome/status` keeps naming the holder.
- **Migration.** A device that still carries the old global flag gets it retired on
  first load: it is dropped, not copied onto every agent, so nobody wakes up with
  browser mode on everywhere.

## Non-goals

No change to the CLI spawn contract (`--chrome` on builder-lane browser turns only,
Claude engine only), to the single-holder gate for genuinely concurrent browser turns,
or to what browser mode does inside a turn. Multi-Chrome / multi-pipe is out of scope.

## Goal (for the goal loop)

Browser mode (Claude in Chrome) is a per-agent setting: turning 🌐 on for one repo
agent turns it on for that agent only, other agents keep prompting normally while it
uses Chrome, and only a second agent that itself has 🌐 on is told the browser is held.
Done when: two docks side by side, A with 🌐 on and mid-browser-run, B with 🌐 off,
B accepts and runs a prompt; B with 🌐 on is refused with the holder named; reload
keeps each agent's own toggle; the old device-global flag is retired on first load;
.NET + client suites green; verified in a headless browser against an isolated
instance; PR opened against main.
