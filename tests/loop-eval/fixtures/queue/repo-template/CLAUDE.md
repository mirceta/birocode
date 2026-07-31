# qmath — tiny math utility library (being built task by task)

A minimal Node.js ESM library. No dependencies, no build step. Tests use the
built-in `node:test` runner: `node --test test/`.

## Conventions

- Plain ESM modules under `src/`, one function per file, exported by name.
- Keep everything small and dependency-free.
- Commit after completing each task. Do NOT push — there is no remote.
