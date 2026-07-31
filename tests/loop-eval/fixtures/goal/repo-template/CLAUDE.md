# qtodo — tiny todo CLI

A minimal Node.js CLI. Plain ESM, no dependencies, no build step. State lives
in `todos.json` next to `todo.mjs` (override with the `TODO_FILE` env var).

Commands:

    node todo.mjs add <text>     # add an item
    node todo.mjs list           # print items, one per line
    node todo.mjs done <id>      # mark an item done   <-- NOT IMPLEMENTED YET

## Acceptance check

`node goal-check.mjs` is the single source of truth for "done". Run it to see
exactly what is expected; it must exit 0 with `ALL CHECKS PASS`.

## Conventions

- Keep the existing code style (small, plain, dependency-free).
- Commit your work when the check passes. Do NOT push — there is no remote.
