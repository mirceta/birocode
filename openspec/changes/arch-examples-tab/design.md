# Design — arch-examples-tab

## D1 · Rules, not a model

The clustering is an ordered list of regex rules in a committed JSON, not an LLM pass: it is
deterministic, re-runnable in half a second, reviewable in a diff, and a newcomer can add a
category by adding a rule. First match wins, so the specific rules (tracking card, fleet update,
provision) sit above the broad ones (delegate a task, investigate). The "other" bucket is shown
with samples so the rules can grow from what they miss.

## D2 · Only the Operator's words

A user turn in the arch's transcript is the Operator only when the harness did not write it: the
wake-ups, loop briefings, goal summaries, repo-agent request posts, context roll-overs and the
policeman prompt are dropped by their prefixes; a queued-instructions block is unwrapped to its
body. Goal texts the arch started itself are counted in the sources but are not requests. The
repo-agent requests are a category by nature (the Operator's approval is the ask).

## D3 · Examples that teach

Per category the examples are the most TYPICAL phrasings — the ones matching the most of the
category's rules — of medium length, without profanity, distinct, scrubbed of tokens, passwords
and e-mail addresses, clipped at 360 characters, in time order. Machine, repo and task names stay:
they are what make an example useful.

## D4 · Hub data, snapshot elsewhere

The miner reads this machine's arch transcripts; only the hub has them. The report is written to
the data dir and a copy is committed as `management/arch-examples.json`, so every harness's tab
shows the catalogue and says where it came from. Re-mine is offered only where mining can run.
