# Loop drafts — the fill-the-loop contract (agent-agnostic)

This is the single source of truth for **loop drafts**: the per-repo scratch
space inside the Claude Web harness where task text is built up **before** it
becomes real loop parameters (a queued-prompt sequence or a goal definition).
Any agent on this box — in any repo, driven by any harness — can read this file
off disk and follow it. If the contract changes, change it **here**, not by
re-describing it elsewhere.

The harness shows these drafts in its Autopilot console under the **📝 Drafts**
tab; a human and any number of pasted agents edit the same draft through the
same API.

## The address: one draft per (repo, type)

A draft is addressed by **repo id** and **draft type**. Each address holds
exactly one plain-text draft — saving replaces the whole text. There are three
types, and the content shape is part of the contract:

| Type | What belongs in it |
|------|--------------------|
| `queue-plan` | A **sequence of self-contained prompts** destined for the queued-prompts loop. One prompt per block, blocks separated by a line containing only `---`. Each block must stand alone — the loop sends blocks one at a time to an agent with no other context. |
| `goal` | **One coherent goal definition** for a goal-based loop: the end state to reach and how to tell it's reached. One goal, not a list. |
| `freestyle` | Anything. Raw task ideas, half-sorted notes — text that is not yet ready to be split into a queue plan or condensed into a goal. |

## The API: how to read and write a draft

The harness serves HTTP on its port (default `5099`; the operator gives you the
base URL). All calls need a session cookie; there is no anonymous or
file-on-disk path. The drafts endpoints are deliberately **not** fenced by the
operator's autopilot gate — drafting works even while loops are disabled.

```bash
BASE=http://localhost:5099    # from the operator
CODE=<access code>            # from the operator
REPO=<repo id>                # GET $BASE/api/repos lists registered ids
TYPE=queue-plan               # or: goal | freestyle

# 1. Log in once — stores the session cookie in a jar
curl -s -c jar -X POST $BASE/api/auth/login \
     -H "Content-Type: application/json" -d "{\"password\":\"$CODE\"}"

# 2. Read the current draft (empty text + savedAt 0 if never saved)
curl -s -b jar $BASE/api/autopilot/drafts/$REPO/$TYPE

# 3. Write the draft — the FULL text, JSON-encoded; returns the new savedAt
curl -s -b jar -X PUT $BASE/api/autopilot/drafts/$REPO/$TYPE \
     -H "Content-Type: application/json" \
     -d '{"text":"first prompt\n---\nsecond prompt"}'

# Optional: which drafts exist across all repos (badges + stamps)
curl -s -b jar $BASE/api/autopilot/drafts
```

An unknown repo id or type is a `400` with the reason; a draft is capped at
256 KB. `savedAt` is Unix milliseconds, `0` = never saved.

## Etiquette: read, integrate, then rewrite

PUT replaces the **whole** draft and the last write wins, so never write blind:

1. **GET the current text first.** The human or another agent may have edited it.
2. **Integrate** — keep what's there and merge your contribution into it
   (append, reorder, tighten), unless your instructions explicitly say to
   replace the draft.
3. **PUT the complete result**, respecting the type's content shape above.

Do not write loop *parameters* (recipes, sentinels, arming) anywhere from here —
a draft is text for a human to later turn into a loop, nothing more.
