# greetkit — one-file task repo

A deliberately tiny repo: the only work is creating one file. No dependencies,
no build step.

The task: create `GREETING.md` at the repo root containing exactly the line

    Hello from the loop.

## Acceptance check

`node task-check.mjs` is the single source of truth for "done". Run it to see
exactly what is expected; it must exit 0 with `ALL CHECKS PASS`.

## Conventions

- Do not touch `LOOPEVAL-BRIEFING-FIXTURE.txt` or `task-check.mjs`.
- Commit your work when the check passes. Do NOT push — there is no remote.
