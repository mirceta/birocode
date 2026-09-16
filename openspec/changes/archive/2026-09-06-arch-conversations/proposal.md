# arch-conversations — several arch conversations, each with its own loop space

## Why

The arch agent had exactly one conversation (`@arch`): one session, one watermark, one
loop slot. The Operator wants to run several threads with it at once — a deploy train, a
refactor campaign, a fleet chore — each with its own standing wake loop or goal, without
the threads talking over each other in one transcript. At the same time the loop cards
had drifted onto the Management App's Status tab, away from the conversation they drive,
and the Arch tab could show only one lane at a time (chat OR the tool-call history).

## What changes

- **Conversations.** The arch state keeps a record per conversation (id, name, session,
  watermark, remembered standing loop). The default keeps the reserved id `@arch` and
  migrates from the legacy fields; further conversations are `@arch:<8 hex>`. Every
  conversation runs in the same home repo with the same tools and the same scope, but
  has its own run slot, loop slot, session and watermark — two armed conversations each
  see every managed repo turn once.
- **API.** `GET/POST /api/arch/conversations`, `PATCH/DELETE /api/arch/conversations/{id}`;
  `?conv=` on state, messages, tool-calls, send, stream, stop-turn and loop (omitted =
  default; unknown = 404). The autopilot loop endpoints accept any conversation key as
  the repoId.
- **Arch tab.** A **Loops** lane per conversation holds the standing wake loop and the
  driven loop cards; a **split** toggle turns the lane chips into column pickers (up to
  three lanes side by side, e.g. chat beside the tool-call history); the conversation's
  **name is editable at the top**; a non-default conversation can be removed there.
- **Management App.** Each further conversation is a sibling tab (`arch:<id>`) after
  Arch, labelled with its name; a **＋** in the tab strip creates one (named up front)
  and opens it; the Status tab keeps only the fleet-wide cards (Managed agents, Fleet,
  Home repo).

## Non-goals

- Per-conversation scope or fleet consent — those stay harness-wide.
- Moving or merging transcripts between conversations.
