# Design — repo-agent-local-apps

## D1 · Read from where the panel reads

The tool reads the same two stores the Local Apps panel reads — the registry's list and the
discovery cache — and probes liveness the same way. Nothing is copied or cached in the tool, so
the answer can never disagree with the Local tab.

## D2 · The join is pure

`LocalAppCatalog.Build(repo, registered, cached, isListening, harnessPort)` is a pure function
over the two lists: every registered app becomes a row; a registered repo app whose port has a
finding takes the finding's folder and commands; a finding nobody registered becomes an
unregistered row (`port-<n>`); harness apps get their well-known folder (`understanding-app/`,
`goal-app/`) or "served from the harness's own build". A finding's folder is resolved under the
repo and refused when it would leave it. `Resolve(apps, key)` accepts an id, a name or a port.

## D3 · How-to-run is always a sentence

Every row says how to run it, including the negative cases in words: registered but never
discovered (run Discover or import findings), no start command known (the evidence says how it
was found), the cache pointing outside the repo. The agent never gets an empty field and a guess.

## D4 · Start / stop reuse the panel's runner and guards

`ILocalAppOps` is the small runtime surface; `RunnerOps` binds it to `LocalAppRunner` with the
panel's rules — the resolved PID is refused when it is the harness or an ancestor; restart waits
up to 10 s for the port to free before relaunching; harness-served apps are never started or
stopped. Tests fake `ILocalAppOps`. Events go to the repo's Event Console under the same ops the
panel uses (`run` / `stop` / `restart`) with "(agent)" in the title, and to the autopilot audit
as the other agent tools do.

## D5 · No new endpoint, no client change

The tool joins the server's catalogue; the Tools lane lists it because the lane reads
`tools/list`. The only client edit is the UI test's fixture and expectation.
