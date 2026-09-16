# Proposal: stable-handles — short, stable handles for ideas and repo agents

## Why

Telling the arch agent which idea to delegate to which agent is clumsy: ideas are
identified only by a 32-char id or by free text (68 entries, near-duplicates, vague
texts); agents by machine + repo name, but names repeat on a machine (two "prg" on
spacex), so "prg on spacex" is ambiguous.

## What

- **Ideas** get a running number, shown as `#12` in the Ideas list and on Kanban cards
  (💡 #12 on a card promoted from an idea). Allocated on creation, never changed; older
  ideas are backfilled once, in creation order.
- **Repo agents** get a handle: a slug of the name plus `#2`, `#3`… when the slug repeats
  on that machine; presented as `<machine>/<handle>` ("spacex/prg#2") on the fleet Status
  tab, the kanban assignee picker, the Arch managed-agents card, and as a `#k` suffix on
  the dashboard dock chips (full label in the tooltip). Assigned once (persisted in the
  registry, backfilled on first load), never changed.
- **Tools**: `list_ideas` returns `handle`; `list_agents`, `list_machines` and the fleet
  status return `handle`; `idea_to_task` accepts `#12` / `12`; `send_task`, `git_state`,
  `read_transcript`, `assign_task`, `create_task` accept a handle (`spacex/prg#2` — the
  machine part may then be omitted — or `prg#2` with `machine`), a unique name, or the raw
  id. Ambiguity is reported with the handles to use, never guessed.
- **Peer describe** carries `handle`; a peer on an older build gets the same slug#k
  assignment computed by the hub over its list.

## Non-goals

A "delegate to…" UI button; changes to idea text or priorities; `dispatch_task` still
takes a task id (tasks have their own ids on the board).
