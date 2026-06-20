# Chat system-test hub

A tiny **build-less** web app that keeps the `tests/chat-systest` suite
**understandable** and **under control** — one page to see what each scenario
covers, run any suite with a click and watch PASS/FAIL stream live, review the
known findings, and (optionally) build/launch/tear down the isolated instance
the tests run against. So the feature doesn't get forgotten.

It is a *real product you run* — exposed on the Claude Web **Local tab** per
[`docs/local-exposure-convention.md`](../../../docs/local-exposure-convention.md)
(dual-stack bind, serve at root, relative URLs). It touches **no production C#**.

## Files

| File | Role |
|------|------|
| `server.mjs` | zero-dependency Node HTTP server: serves the SPA, streams suite runs + instance lifecycle as SSE, keeps a run history |
| `instance.mjs` | isolated-instance orchestration (`up`/`down`/`status`) — automates the manual dance in [`../README.md`](../README.md) |
| `suites.json` | the catalog the page renders: suites, the 14 scenarios, token cost, known findings |
| `public/` | the SPA (`index.html` + `app.js` + `styles.css`), relative URLs only |
| `.state/` | runtime only (gitignored): `instance.json`, `history.json` |

## Run it

```bash
node tests/chat-systest/hub/server.mjs       # → http://localhost:5320/  (HUB_PORT to change)
```

Open it and:

1. **Launch instance** — builds the backend, copies binaries outside the repo,
   starts `ClaudeWeb.exe` on `:5310` with a fresh `CLAUDEWEB_DATADIR` + seed
   password, registers a throwaway scratch repo, and records it in
   `.state/instance.json`. (Needs `dotnet` + `git` on PATH. Or launch one
   yourself per [`../README.md`](../README.md) — the hub picks up `BASE/RID/PW/
   MODEL/SCRATCH` env vars too.)
2. **Run** any suite, two ways — both show the **live step list**, where each
   step streams a plain-language `→` activity feed (from the test's `say()`
   calls) plus its checks as it runs:
   - **Run headless** — the suite runs end-to-end and you read the verdict
     (`N/M passed`); the step list is read-only (no controls). This is how an
     agent runs it.
   - **Step through** — interactive: the list lights up pending → running →
     pass/fail and you advance with **Next step** / **Skip** / **Run the rest**
     / **Abort**. Output also streams into the console; the run lands in
     **Recent runs**.
3. **Tear down** — kills the instance tree and deletes its scratch root. Your
   live `:5099` store is never touched (separate datadir).

The hub itself is just a viewer/runner — it shells out to the *same*
`behavioural/smoke/realrun/badinput.mjs` scripts, so what you see here matches
what CI would run.

## Expose it on the Local tab (Operator step)

Per the local-exposure convention, wiring a port to the Local tab is the
Operator's deliberate step: in the Local setup form, register port **5320**
(or your `HUB_PORT`) as a Local app for this repo. It then appears at
`/api/localview/<repo>/app/<appId>/`. The app already satisfies the three-rule
contract (dual-stack bind, serves at `/`, relative URLs), so the embed just works.
