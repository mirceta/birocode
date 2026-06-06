# Claude Web -- Architecture Decision Analysis

## Problem

A non-technical user writing a business plan on her phone needs a persistent,
organized document workspace where an AI assistant can edit files in place.

### Current Workflow (Broken)

1. She asks an LLM (Gemini/ChatGPT) to create a document
2. She saves the document
3. To revise, she pastes the full document back into the LLM
4. The LLM generates a brand-new document instead of editing the existing one
5. She manually tracks which file is current

### Core Problems

- No in-place editing -- every revision produces a separate output
- Document bloat -- everything collapses into one growing file
- No structured repository -- no navigable collection of related materials
- Manual version management -- confusion about which version is current

### What Has Been Tried (Chronological)

#### Attempt 1: ChatGPT / Gemini -- plain conversational generation

She used ChatGPT and Gemini to generate documents conversationally. The LLM
would produce a document, she would save it. When she wanted revisions, she
had to paste the entire document back into the chat and ask for edits. The
LLM would generate a brand-new document every time rather than editing the
existing one. She ended up with multiple copies, no clear "current" version,
and a constant copy-paste-resave cycle. Everything tended to collapse into
one bloated file because splitting into multiple organized documents meant
even more manual tracking. This was the baseline -- it technically worked
but the friction was unsustainable.

#### Attempt 2: Gemini + Google Drive / Google Docs integration

The idea was to use Gemini's integration with Google Drive and Docs so that
documents would live in one organized place and Gemini could edit them
directly. In practice this was clunky and unreliable. The in-document editing
experience had problems -- edits would not apply correctly, the integration
was flaky, and the experience on a phone was poor. For a non-technical user
this created more frustration than it solved. Several variations of this
approach were tried and none worked smoothly enough.

#### Attempt 3: Claude Code (considered, not viable)

Claude Code is the technically ideal solution -- it maintains a persistent
file repository, can read and write files directly, handles context and
multi-turn conversations natively, and manages the full editing lifecycle.
However, it requires a computer with a terminal, technical installation
(Node.js, npm, CLI setup), and ongoing maintenance. The user only has a
phone and would not be able to install, configure, or troubleshoot any of
this. A GitHub account would also be needed for some workflows, which adds
another layer of complexity she cannot manage. This option was ruled out
for the end user directly, but it became the inspiration for the solution.

#### Why Our Solution Is Different

The breakthrough insight: Claude Code is perfect -- the only problem is
access. Instead of trying to make other tools work (Attempts 1 and 2) or
asking a non-technical user to run developer tools (Attempt 3), we put
Claude Code on a computer that someone technical controls and build a
simple, phone-friendly web interface in front of it. The user gets the
full power of Claude Code's persistent file management without any of the
setup burden. She sees a clean chat interface and a file browser -- not a
terminal, not a CLI, not git commands.

### Constraints

- Phone-only -- no computer in the loop for the end user
- No technical setup -- no CLI, no installation, no GitHub account
- Low friction -- must not recreate the manual copy-paste burden
- Operable by a non-technical person

---

## All Approaches Compared

Rating: [+++] excellent  [++] good  [+] acceptable  [o] neutral  [-] bad  [--] very bad  [---] dealbreaker

### Approaches

- **A: ChatGPT/Gemini plain chat** -- generate docs in conversation, copy-paste to save
- **B: Gemini + Google Drive/Docs** -- use Gemini's Drive integration for in-place editing
- **C: Claude Code directly** -- have the user run Claude Code on a computer
- **D: Extend ClaudeMonitor** -- add web UI to existing ClaudeMonitor project
- **E: Anthropic API + tool_use** -- new app calling API directly with file tools
- **F: New app + Claude CLI** -- new standalone app, spawns CLI, borrows ClaudeMonitor patterns
- **G: Claude Dispatch (Anthropic)** -- pair the Claude mobile app to Claude Code/Cowork
  on your desktop; send tasks from the phone, they run on your machine against local files

Note on G: Anthropic's Dispatch (and its sibling "Remote Control") shipped
around Nov 2025, after our original A-F decision. It is the same core
architecture we chose for F -- a phone driving Claude Code on a desktop you
control -- so it deserves a direct, honest comparison. See the dedicated
section below the table.

### The Table

Reading the table: **W** marks the winner -- the best rating in that row --
shown in place of the rating itself, so winners stand out. When several
approaches tie for the top rating, each tied cell shows W. Every other cell
shows its actual rating. Rows with a single W are the ones that truly separate
the options; rows full of W mean "almost everything is good at this".

| Dimension                  | A: ChatGPT | B: Gemini+Drive | C: Claude Code | D: Extend CM | E: API+tools | F: New+CLI | G: Dispatch |
|----------------------------|------------|-----------------|----------------|--------------|--------------|------------|-------------|
| Works on phone             | W          | [++]            | [---]          | [+]          | W            | W          | W           |
| No technical setup for user| W          | [+]             | [---]          | [+]          | W            | W          | [-]         |
| In-place document editing  | [---]      | [-]             | W              | W            | [++]         | W          | W           |
| Multi-document organization| [---]      | [+]             | W              | W            | [++]         | W          | W           |
| No copy-paste burden       | [---]      | [-]             | W              | W            | W            | W          | W           |
| Version history            | [---]      | [o]             | W              | W            | W            | W          | [+]         |
| Cost per token             | [++]       | [++]            | W              | W            | [-]          | W          | [++]        |
| Build effort               | W          | W               | W              | [++]         | [+]          | [+]        | W           |
| Maintenance burden         | W          | W               | [o]            | [-]          | [++]         | [++]       | W           |
| Codebase cleanliness       | n/a        | n/a             | n/a            | [--]         | W            | W          | n/a         |
| Risk to existing tools     | n/a        | n/a             | n/a            | [--]         | W            | W          | W           |
| AI context management      | [--]       | [-]             | W              | W            | [-]          | W          | W           |
| Reliability                | [+]        | [-]             | W              | W            | W            | W          | W           |
| Chat UX polish             | W          | W               | [+]            | [+]          | [+]          | [+]*       | W           |
| User experience overall    | [-]        | [--]            | [--]           | [+]          | W            | W          | [+]         |

*F starts at [+] for chat UX because we build it ourselves. With dedicated
effort (streaming, markdown rendering, typing indicators, tool-use feedback)
it can reach [++] or [+++], but this is additional work that must be planned
for. Native clients like ChatGPT and Gemini have years of polish here.

### Chat UX -- What the Native Clients Do Well (and We Must Match)

This is the one dimension where A and B genuinely excel and F starts behind.
The native ChatGPT and Gemini apps provide:

- Smooth token-by-token streaming with no visible lag
- Rich markdown rendering (headers, lists, bold, code blocks)
- Typing/thinking indicators while the model processes
- Tool-use feedback ("Searching the web...", "Reading file...")
- Message editing and regeneration
- Haptic feedback and native mobile gestures
- Polished animations and transitions

For F to succeed, we need to invest in chat UX as a first-class concern,
not an afterthought. The minimum viable chat experience must include:

- [must] Streaming response rendering (not wait-for-complete)
- [must] Markdown rendering (at least headers, lists, bold, code)
- [must] Visual indicator while Claude is working
- [should] Tool-use feedback ("Editing document...", "Reading file...")
- [should] Smooth scrolling and auto-scroll during streaming
- [nice] Message animations
- [nice] Haptic feedback on send

This is achievable -- it is standard React work, not novel engineering.
But it must be explicitly scoped into the build plan, not discovered late.

### Option G in depth: our app (F) vs Claude Dispatch

Dispatch is the strongest alternative to F, because it is the same idea built
by Anthropic. The honest question is not "is F better" but "for THIS user,
which wins, and what did we give up by not using Dispatch?"

What Dispatch is: install the Claude app on the phone and the Claude Desktop
app on the host; scan a QR to pair them; grant file/connector/computer access;
enable keep-awake. The phone becomes a task-input channel for Claude Code/Cowork
running on the desktop, as one conversation synced across both devices.

#### What is BETTER with Dispatch (where we lost by building our own)

- **Chat UX [+++] vs our [+].** This is the big one. Dispatch IS the native
  Claude app -- best-in-class streaming, thinking/tool indicators, markdown,
  haptics, animations. It is exactly the polish we flagged as F's weak spot
  and have to build ourselves. Dispatch has it for free, today.
- **Zero build effort [+++] vs [+].** We wrote a whole app (backend, frontend,
  auth, SSE, file/git APIs). Dispatch is a shipped product -- nothing to build.
- **Zero maintenance [+++] vs [++].** Anthropic maintains Dispatch. Our app is
  ours to keep working as the CLI, OS, and dependencies change.
- **More capable engine.** Dispatch brings computer-use and connectors, not
  just file editing. If her needs grow beyond documents, it already does more.
- **Continuous cross-device conversation.** Start on desktop, continue on phone,
  synced -- we did not build that.

#### What is BETTER with our app (where F wins for HER specifically)

- **No setup or account for the end user [+++] vs [-].** This is the decisive
  one. F: she opens a URL and types one password. Dispatch: she must install
  the Claude app, sign in to a Claude account, scan a QR to pair, and approve
  file/computer permissions. For a non-technical, phone-only person that is the
  exact friction the whole project exists to remove.
- **She needs no Claude relationship at all.** F runs entirely on YOUR Max
  subscription; she never has an account, never pays, never logs in. Dispatch
  couples the phone to a Claude account -- so either she needs her own paid
  account, or she holds a device logged into yours (awkward and not private).
- **No permission re-prompts mid-task.** Dispatch-spawned Code sessions
  re-request app permissions every ~30 minutes -- a confusing wall for a
  non-technical user. F never prompts her for anything.
- **Purpose-built, jargon-free UX.** F is a document workspace: a clean chat,
  a file browser, and "Save" / "Go back" instead of git. Dispatch wraps a
  developer/agent tool ("Cowork/Code", sessions, computer-use approvals) that
  was not designed for a business-plan writer.
- **A real version timeline [++] vs [+].** F gives her a friendly Save/History
  list with one-tap restore. Dispatch has no equivalent surfaced to her; she
  would have to ask Claude in chat to "save" or "undo".
- **Full control of the experience.** We can shape every screen to her exact
  workflow; Dispatch is general-purpose and we cannot change it.

#### Wash (same tradeoff either way)

- Both run on your own machine against local files, on your compute.
- Both require the host to stay on/awake.
- Both are powered by Claude Code under the hood.

#### Verdict

Dispatch validates our architecture -- Anthropic shipped essentially the same
phone-to-desktop model. If the user were even mildly technical, or willing to
keep a Claude account and tolerate pairing plus periodic permission prompts,
**Dispatch would likely be the smarter choice: no build, no maintenance, better
chat UX, more capability.** We would seriously consider it for ourselves.

But our defining constraint is a non-technical, phone-only person who should
have NO account, NO setup, NO permission prompts, and a gentle document-focused
UI. On those exact requirements Dispatch scores [-] where F scores [+++], and
no amount of its superior polish fixes that. So F remains the right call FOR
HER -- while we acknowledge plainly that the chat-UX gap is real and is the
price we pay for the bespoke, frictionless access Dispatch cannot give her.

### Scorecard

| Approach | Good [+] | Neutral [o] | Bad [-] | Dealbreaker [---]? | Verdict |
|----------|----------|-------------|---------|---------------------|---------|
| A: ChatGPT/Gemini     | 6 | 0 | 5 | YES (no in-place editing) | REJECTED |
| B: Gemini+Drive        | 5 | 1 | 5 | NO but too many [-]       | REJECTED |
| C: Claude Code direct  | 7 | 0 | 3 | YES (not phone-usable)    | REJECTED |
| D: Extend ClaudeMonitor| 7 | 0 | 3 | NO but risks existing tools | REJECTED |
| E: API + tool_use      | 9 | 0 | 2 | NO but costs money        | VIABLE |
| F: New app + CLI       | 10| 0 | 0 | NO (chat UX needs work*)  | CHOSEN  |
| G: Claude Dispatch     | 10| 0 | 1 | NO (setup/account on user) | STRONG ALT |

*F has no bad ratings but chat UX is flagged [+] -- acceptable today,
needs investment to reach the polish level of native clients. This is
a known cost, not a risk.

G is the strongest alternative and would win for a semi-technical user. It is
rejected for THIS user on one decisive dimension: it forces app install, a
Claude account, pairing, and recurring permission prompts onto exactly the
person who cannot handle them. F trades chat-UX polish for zero-friction,
account-less access -- the right trade for her.

---

## Decision: F -- New Standalone App Using Claude CLI

### Why F wins

F is the only approach with zero bad ratings. It solves every core problem:

- In-place editing [+++] -- Claude Code edits files directly
- Multi-document organization [+++] -- files in a structured folder
- No copy-paste [+++] -- she just talks, Claude writes
- Works on phone [+++] -- React web app, mobile-first
- No setup for user [+++] -- she opens a URL, that's it
- Free [+++] -- Max subscription covers all usage
- Clean codebase [++] -- standalone project, no risk to existing tools
- Great UX [+++] -- purpose-built for this user, not a repurposed dev tool

### Why E (API) was the runner-up but lost

E is viable and has one advantage (deployable to cloud, computer can be off).
But it costs money per token, and for an ongoing business plan project with
heavy back-and-forth, that adds up. It also requires building tool orchestration
(multi-turn tool loops, retries, context management) that Claude Code gives
for free.

### Why A, B, C, D were rejected

- **A (ChatGPT/Gemini):** Fundamentally broken -- no persistence, copy-paste hell
- **B (Gemini+Drive):** Right idea, terrible execution -- flaky, clunky on phone
- **C (Claude Code direct):** Perfect tool, wrong user -- requires computer + setup
- **D (Extend ClaudeMonitor):** Pollutes a working dev tool with unrelated concerns

### The one accepted tradeoff

The host computer must be on. This is acceptable because the developer
managing the setup controls that machine. If it ever becomes a problem,
the codebase is clean enough that swapping the CLI backend for an API
backend (Option E) is a contained change.

---

## Research: Conversation Branching

During development of the ClaudeMonitor conversation manager (which informs this
project's session management), we researched whether conversation branching and
forking is a recognized practice in the AI industry.

**Conclusion: Yes, widely recognized.**

- Anthropic published "Effective context engineering for AI agents" and Claude
  Code implements fork subagents
- OpenAI Codex has first-class /fork support
- Academic papers formalize it (arxiv 2512.13914: "Context Branching for LLM
  Conversations", arxiv 2603.21278: "Conversation Tree Architecture")
- Open source tools exist (Forky, GitChat, Lanes)

**Key finding for this project:** For repetitive tasks across many documents
(e.g., applying the same structure to multiple business plan sections), branching
a "primed" conversation is more efficient than starting fresh each time. However,
research warns that raw conversation branches can degrade quality -- distilling
the approach into a concise summary before branching produces better results.
