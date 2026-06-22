# Global exposure

## ADDED Requirements

### Requirement: Canonical global-exposure contract

The system SHALL provide a single agent-agnostic document
(`docs/global-exposure-convention.md`) defining the contract a product must satisfy to be
exposed on the public Homepage through the off-box IIS/ARR proxy at `/preview/` → `:5200`. The
document SHALL state all five rules — (1) bind `0.0.0.0:5200`, (2) serve at root, (3) carry
the `/preview/` base on every asset and runtime fetch URL, (4) send a body on every POST, (5)
defeat ARR's GET output cache — and SHALL be the single source of truth that paste-prompts
point to rather than restating the contract.

#### Scenario: An agent reads the contract off disk

- **WHEN** an on-box agent is pointed at `docs/global-exposure-convention.md`
- **THEN** it can make a product satisfy all five rules without any other context, and any change to the convention is made in that one file

### Requirement: Homepage explainer topic for global exposure

The system SHALL present a "Global exposure" topic on the homepage explainer SPA, alongside
the Local-exposure topic, that walks through the five-rule public path (browser → IIS/ARR
`/preview/` → product `:5200`) using the same shared visualization variants. It SHALL
distinguish the two rules that exist only for the public proxy (body-ful POST, ARR cache) from
the three shared with local. Adding it SHALL NOT remove or alter the Local-exposure topic.

#### Scenario: View the global path

- **WHEN** the End User opens the homepage explainer and selects the Global-exposure topic
- **THEN** the public request path and all five rules are shown, the two global-only rules are marked as such, and the Local-exposure topic remains available

### Requirement: Delegate global exposure via a copy-paste prompt

The Global-exposure homepage topic AND the worked-example product SHALL each provide a
copy-paste prompt the operator pastes into another on-box agent's chat so that agent makes its
own product satisfy the five rules. The prompt SHALL be a pointer to
`docs/global-exposure-convention.md` (read off disk), not a copy of the contract, and SHALL
let the operator name which service to expose so the named service is injected into the prompt.

#### Scenario: Copy a targeted prompt

- **WHEN** the operator names a service and copies the prompt
- **THEN** the copied text names that service and instructs the other agent to read the convention doc and satisfy all five rules

### Requirement: Worked-example global app

The system SHALL include a minimal, build-less, dependency-free product (`global-example/`)
that itself satisfies all five rules and can be run on `0.0.0.0:5200` and reached through
`/preview/`, serving as the copyable reference (the public twin of `homepage/`). It SHALL
serve its page at the root with relative asset URLs, SHALL return a real 404 for a missing
file rather than HTML, and SHALL tolerate the `/preview/` prefix arriving both stripped
(behind ARR) and intact (direct-LAN).

#### Scenario: Run and reach the example

- **WHEN** the example is started on `:5200` and `GET /` is requested, with or without the `/preview/` prefix
- **THEN** it returns the page HTML whose relative asset URLs resolve under the proxy sub-path, and a request for a missing file returns a real 404 rather than HTML

### Requirement: The example exercises the two global-only rules live

The worked-example product SHALL include a minimal stateful API — a mutating POST and a state
GET — so it demonstrates the two rules that distinguish global from local: the client SHALL
send a body on the POST (so IIS/ARR does not return `411`) and SHALL cache-bust every GET (so
ARR's output cache cannot serve stale state), and the server SHALL also mark API responses
`no-store`.

#### Scenario: Mutate then read fresh state

- **WHEN** the page issues a body-ful `POST /api/bump` followed by a cache-busted `GET /api/state`
- **THEN** the POST is accepted (no `411`) and the GET returns the updated count rather than a cached prior value
