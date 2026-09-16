# Design

## Where the toggle lives decides who gets gated

The browser gate (`ChromeGateService`) is a correct single-holder lock: one
native-messaging pipe per Chrome, so one browser-enabled CLI run at a time. The bug was
upstream of it. The 🌐 toggle was one device-wide bit, every dock read that bit, and every
builder send from every dock attached `browser: true` while it was set — so every agent
was put through the gate whether or not the Operator meant it to use Chrome.

The fix moves the toggle to the agent:

| Piece | Before | After |
|---|---|---|
| Storage | `claude-web.browser-mode` = `'1'` (one bit) | `claude-web.browser-mode.agents` = `{ "tab:<dockId>": true, "repo:<repoId>": true }` |
| Agent key | none | `agentKeyFor({ tabId, repoId })`: the dock tab, else the repo (`browserMode.js`) |
| Send | flag on every builder send while the bit is set | `sendCarriesBrowser({ map, agentKey, lane, provider })`: this agent's own key, builder lane, Claude engine |
| Facade (`useChatFor`) | `ctx.browserOn` shared | `ctx.browserOnFor(agentKey)` / `ctx.setBrowserOnFor(agentKey, on)` |
| Main chat | same shared bit | the visible dock tab's key, else the active repo's |
| Legacy bit | read as the toggle | removed on first load (`retireLegacyFlag`), never migrated onto agents |

`browserMode.js` is pure (takes a Storage-like object) so the isolation, reload and
retirement rules are node-tested without a DOM.

## Server: a plain turn never meets the gate

`ChromeGateService.IsBrowserTurn(requested, lane, provider)` is the one statement of
"is this a browser turn": the agent's own request, builder lane, Claude engine.
`ChatController` derives `browser` from it and only then acquires the gate — the
decision is made before any lock, so a turn without the flag cannot be answered
`browser-busy`. The gate now records the holder's repo id (`HolderState`), and
`GET /api/chrome/status` returns `busyRepoId`, so an agent's own toggle hint distinguishes
"held by me" (no hint) from "held by another agent" (named).

## Verification

Isolated instance, two docks in a headless browser (`verify-chrome-per-agent.mjs`,
detached, `@@CHROME-PER-AGENT@@`): the legacy bit is dropped on first load and nobody
starts on; 🌐 on in A leaves B off and the store holds exactly A's key; reload keeps each;
with A's real browser turn holding the gate, B with 🌐 on is refused naming A, B with 🌐
off is accepted and runs, and A's own dock shows no "held by" hint. Real short Claude
turns hold the gate because the gate's lifetime is the CLI run — there is no honest
substitute.
