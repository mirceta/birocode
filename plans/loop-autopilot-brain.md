# Loop autopilot — the brain (discover the set, then predict)

> Subdoc of **[loop-autopilot.md](loop-autopilot.md)**. The decision-maker: how we
> find the user's ~7 recurring prompts, and how we pick the next one (or escalate)
> at each agent turn.

## Discover {#discover}

The whole thing rests on knowing the user's recurring prompt set. Two sources:

- **The custom-prompts list** ([custom-prompts.md](custom-prompts.md)) — the user
  already curates named prompts; these are strong candidates for the set.
- **The sent-message history** — which of those (and which free-typed repeats)
  actually recur, and *what agent situation preceded each*.

So step zero is **capturing labelled pairs**: every time the user replies to an
agent, log `(agent's last message / state) → (prompt sent)`. We don't log this
today — start now, append-only, like the scoreboard's `activity.jsonl`. If past
transcripts are still on disk, backfill from them to bootstrap.

**Output of Phase 1:** a short, user-confirmed list — each entry is *a routine
prompt* + *the situations that trigger it* + *how often it recurred*. The user
edits it (add/remove/rename). This list is the brain's label space.

## Predict {#predict}

At each idle agent, classify its last message into **one of the ~7 routine
prompts, or `escalate`**:

- **Constrained label set.** The model never writes a new prompt — it only picks
  an existing routine prompt or says "hard decision." That constraint is what
  makes this accurate and safe.
- **LLM in-context, not a trained model.** Few-shot the classifier with the
  user's own labelled pairs (optionally retrieving the most similar past
  situations). Returns `label` + `confidence`.
- **Confidence + escalate.** Below the user's threshold → `escalate`. Ambiguity
  defaults to escalate — a wrong auto-send is worse than a needless pause.

### Why this brain (vs the alternatives), 5★ = best

| Brain | Data needed¹ | Accuracy ceiling | Cold-start² | Dev effort³ | Explainable | Low upkeep | Total |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Classic trained ML model | ★☆☆☆☆ | ★★★☆☆ | ★☆☆☆☆ | ★★☆☆☆ | ★★☆☆☆ | ★★☆☆☆ | **11/30** |
| **LLM classifier over fixed set** | ★★★★☆ | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★★☆ | **25/30** |
| Hand-written rules / triggers | ★★★★★ | ★★☆☆☆ | ★★★★★ | ★★★★☆ | ★★★★★ | ★★☆☆☆ | **23/30** |

¹ 5★ = works with least data. ² 5★ = useful on day one. ³ 5★ = easiest to ship.

The **fixed-label constraint lifts the LLM's accuracy ceiling to 5★** vs the
open-ended prediction in the old "learn my replies" sketch — picking from 7 known
options is far easier than guessing free text, and it's auditable (the user can
see which label + why).

## The accuracy gate {#gate}

The user's bar — *"if it does very well, let it talk to agents"* — is a number, and
it's measured **before** any acting:

- **Offline replay (Phase 1→2):** run the classifier over held-out history; report
  **top-1 accuracy** on routine turns and **escalate precision/recall** (does it
  catch the hard decisions?). Missing a hard decision is the costly error, so we
  optimise escalate-recall first.
- **Live, suggest-only (Slice 2):** track how often the user accepts the
  pre-filled prediction. Auto-advance (Slice 3) unlocks only once that clears a
  threshold the user sets.
