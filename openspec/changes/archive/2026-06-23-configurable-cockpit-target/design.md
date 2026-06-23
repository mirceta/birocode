## Context

`openspec-port-app/serve.mjs` runs every OpenSpec/git command with `cwd: REPO_ROOT`
and reads `openspec/` under it. `REPO_ROOT` was hard-bound to `dirname(ROOT)` — the
app's own parent folder — which is why inspecting another repo meant copying the app
into it. The app is otherwise already perfectly standalone (Node built-ins only, its
own port, dual-stack loopback), so the only thing blocking "point it at any repo" is
that one binding.

## Decisions

- **Env var, not a CLI flag or request param.** `OPENSPEC_REPO_ROOT` is read once at
  startup. An env var fits how the app is launched (alongside `PORT`), keeps the target
  fixed for the life of a process (one instance = one repo, matching how it's registered
  as a Local app), and adds no request-time surface that could let a client redirect the
  exec whitelist at another repo.
- **Default preserved.** `process.env.OPENSPEC_REPO_ROOT || dirname(ROOT)` — unset means
  the exact prior behaviour, so every existing deployment is unaffected and a copy dropped
  into a repo still "just works".
- **Stay a local app; do NOT fold into the harness and do NOT extract to its own repo.**
  This change is deliberately the minimum that delivers "one app, point it anywhere": a
  single line plus log/doc text. Extraction to a standalone repository is explicitly out of
  scope.
- **Make the target visible.** The startup log prints the resolved `REPO_ROOT` and whether
  it came from the env var, so an operator can confirm which repo a given instance inspects.

## Risks / Trade-offs

- **No path validation of the env var.** If `OPENSPEC_REPO_ROOT` points somewhere without an
  `openspec/` dir, the Cockpit's reads simply come back empty / error per command — the same
  behaviour as running the app in a non-OpenSpec folder today. Acceptable; not worth a
  guard in a loopback-only operator tool.
- **One repo per process.** Inspecting several repos means several instances on different
  ports — consistent with the existing Local-app registration model (one port per app).
