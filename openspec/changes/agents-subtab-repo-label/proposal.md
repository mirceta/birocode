# Proposal: agents-subtab-repo-label — Status → Agents chips name the repo agent only

## Why

In the Management App's Status tab (Agents subtab) every repo agent chip is labelled
with its full fleet handle, `<machine>/<handle>`. The machine is already the header of
the section the chip sits under, so the prefix repeats what is one line above — and on
a long machine name it eats the chip's width, so the part that actually tells agents
apart (`prg#2`, `claude-web-this-app`) collapses to "…". The Operator asked for the
chip to show just the repo agent (fleet task 1dc2812c).

## What

- The Agents-subtab chip's **visible label** is the repo-agent part of the handle alone
  (`prg#2`), with the machine prefix stripped. The machine header stays where it is.
- The **full handle** is unchanged everywhere else: it stays on the chip's `data-handle`
  and in its hover title, in the agent detail row, on the Kanban assignee chips, in the
  arch tools (`list_agents`, `send_task`, …), the board and the peer describe.
- Presentation only, client only: no change to `GET /api/arch/fleet/status`.

## Out of scope

The dock chips (they already show only the `#k` suffix), the Kanban assignee chips
(machine and repo are both needed there — a card can span machines), and any change
to how handles are assigned or resolved.
