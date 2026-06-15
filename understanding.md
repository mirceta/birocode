# Understanding — clarify & make safe how the harness serves a Product

## What you asked for

> "REALLY REALLY CLEAR UP THE UNDERSTANDING ABOUT SERVING EITHER THE LOCAL APP
> OR THE GLOBAL APP THROUGH BIROCODE. It is a dangerous feature right now but it
> really needs to be done right."

You want the two ways the Harness serves a Product to be **unmistakably clear**
and **safe** — today they're easy to confuse and have real danger gaps.

## How I read it (steer me if wrong)

There are **two distinct serving paths**, with *inverted* threat models:

| | **"Global app"** | **"Local app"** |
|---|---|---|
| Mechanism | shared **Preview Port :5200**, iframed by the App tab **and the public homepage** | per-repo **`/api/localview/{repoId}/`** reverse proxy on :5099 |
| Audience | **public / ungated** (`/preview/` is deliberately open) | **private** — behind the IP allowlist + password gate |
| Port | one fixed global port (5200) | per-repo `LocalPort` in `repositories.json` |
| Product contract | the five `/preview/` sub-path traps | bind dual-stack, relative URLs only |

The danger surface I found in the code:
- **SSRF footgun** — the proxy target port is validated only `1..65535`, no
  blacklist; an operator can point a repo's `LocalPort` at 22/445/3389 and the
  Harness will proxy it (behind login, but still).
- **Inverted threat models** — it's easy to put a *private* tool on the *public*
  :5200 by mistake, or expect the public homepage to be gated.
- **Self-Development collisions** — Product = Harness fights over :5099/:5200.
- **IPv6 bind footgun** — an IPv4-only Local product appears "offline".

## What I'll do (this turn = kickoff only)

1. Branch `feature/serving-model-clarity` off a main synced with origin/main. ✅
2. Add a **Proposed** entry to `plan.md` → Active feature plans.
3. Write the detail plan `plans/serving-model-clarity.md` capturing the problem,
   the danger surface, and a sliced approach (canonical doc → UX clarity →
   safety hardening), with full re-architecture (unifying the two paths) called
   out as **out of scope** for now.

I am **not** building anything yet — this is the plan/kickoff.

## Open scope decision (need your call before slice 1 builds)

What must "done right" prioritize: **safety/hardening**, **in-app UX clarity**,
**one canonical doc**, or **actually unifying the two paths**? I've planned for
clarity + safety and parked unification — tell me if you want it reordered or
widened.
