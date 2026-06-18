# "Paste this into the other agent's chat" for the Local-exposure topic

> **Status (2026-06-18):** Built + browser-verified on an isolated homepage port
> (both topics' paste blocks render, Copy writes the right pointer text, no console
> errors). Not yet deployed to the live harness (:5099). On
> `feature/exposure-paste-pointer`.
> Structured per [doc-principles.md](doc-principles.md).

## Goal

The homepage's **"📦 Use the Understanding app in any agent"** topic
(`homepage/assets/understanding-topic.js`) carries a **🚀 Paste this into the
other agent's chat** block: a one-click **Copy** button over a short prompt that
sets another on-box agent up to follow a Claude Web convention. Give the
**"🛰️ Local exposure, done right"** topic (`homepage/assets/exposure-topic.js`)
the same affordance — so the operator can drop a paste into *another* agent's
chat and have it expose its own Product on the Local tab correctly, the same way
the Understanding paste bootstraps the Understanding-app convention.

## How the existing paste works (the pattern we mirror)

In `understanding-topic.js`:

- `PROMPT_TEXT` is a **pointer, not a copy** — it names the absolute on-disk path
  of `docs/understanding-app-convention.md` and tells the other agent to *read
  that file and follow it*. Because the other agent runs on **this same box**, it
  reads the canonical convention straight off disk: one source of truth, no pasted
  copy left to drift.
- The UI is a `.ut-prompt` block — a head (`🚀` title + **Copy** button) over a
  `<pre class="ut-code ut-prompt__body">`, with a `.ut-note` underneath explaining
  *why* it's a pointer. The Copy handler uses `navigator.clipboard.writeText` with
  an `execCommand('copy')` range-selection fallback for non-secure LAN/HTTP
  contexts, and flashes `Copied ✓` / `Press ⌘/Ctrl+C`.

We reuse this shape verbatim so the two topics read consistently.

## Key difference from the Understanding paste — and the design call it forces

The Understanding paste installs an **ongoing habit** ("from *now on*, whenever
you explain something non-trivial, also ship an Understanding app"), and the
harness *auto-serves* that folder — the other agent never runs a server.

Local exposure is different: it's a **one-shot setup task** against a **real
Product the other agent runs itself**. The contract it must satisfy is the
exposure contract the topic already animates:

- bind **one loopback port** (the app's Local port; `0.0.0.0`/`127.0.0.1`),
- **relative URLs only** (a leading `/` escapes the proxy sub-path and 404s),
- then the operator registers that port so the harness reverse-proxies the app at
  `/api/localview/<repo>/app/<appId>/` (bare path = the default/first app).

So the paste is **task-framed** ("reconfigure *this* app for the Claude Web Local
tab"), not habit-framed. And it needs its **own** canonical doc to point at —
there is no exposure equivalent of `understanding-app-convention.md` today
(`docs/networking.md` is the harness-internal map; `plans/local-app-proxy.md` is a
plan; the in-app Local setup form holds prose that can drift).

**Design call:** add a new agent-agnostic doc
**`docs/local-exposure-convention.md`** — modelled on
`docs/understanding-app-convention.md` — as the single source of truth the paste
points at. This is the same single-source-of-truth move the Understanding topic
already made; following it here keeps the convention out of the JS paste string.

## Plan

1. **`docs/local-exposure-convention.md`** (new) — the canonical, agent-agnostic
   statement of the Local-tab exposure contract: one loopback port, relative URLs,
   how the harness proxies it (`/api/localview/<repo>/app/<appId>/`), and the
   "broken is visibly broken" framing. Written so an agent in *another* repo can
   read it off disk and reconfigure its app with no further context.
2. **`homepage/assets/exposure-topic.js`** — add a `.ut-prompt` paste block
   (🚀 title + Copy button + `.ut-note`) above the variant switcher, with a
   task-framed prompt that points at the doc's absolute path. Reuse the
   exact copy-handler (clipboard + `execCommand` fallback + flash) from
   `understanding-topic.js`.
   - **Service picker (2026-06-18):** a target repo may run **several** web apps,
     so the prompt isn't a fixed string — a `.ut-prompt__field` input ("Which
     service should it expose?") sits in the card and `buildPrompt(service)`
     **injects the named service** live as the operator types (empty → a
     grammatical generic fallback). Copy copies the customized prompt. The prompt
     also states up front that the repo may run several apps, so the other agent
     reconfigures only the one named.
3. **Styling** — the `.ut-prompt` / `.ut-code` / `.ut-note` classes already live
   in `homepage/assets/styles.css` (the Understanding topic uses them); reuse them
   as-is so the two paste blocks match. Add only what's genuinely missing.
4. **Anti-drift** — point CLAUDE.md's exposure references and (later) the in-app
   Local setup-form instructions at the new doc, so the contract is stated once.
   Do this only as far as keeps things honest; don't duplicate the doc's text.

## Verify

Build-less static folder — no app build. Browser-verify on an isolated homepage
port (the `homepage/serve.mjs` dual-stack server, `CLAUDEWEB_PREVIEW_PORT`-style
override): both topics show their paste block, Copy writes the expected pointer
text to the clipboard, and the fallback path flashes correctly. Screenshot both
tabs side by side to confirm they read consistently.

## Out of scope

- No change to the four animated exposure-viz variants themselves.
- Not auto-registering the other app's Local port for it — the paste tells the
  agent + operator what to do; registration stays the operator's deliberate step
  (mirrors how the Understanding paste doesn't touch the other repo either).
