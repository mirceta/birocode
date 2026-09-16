# Verifier startup: let the web host come up before the first pass

## Why

The deploy of main 352fdd13 to this hub on 2026-09-16 18:46 restored last-good: the
deploy's health check could not connect to the new build for 86 seconds, although the
harness had logged "Kestrel running" and was visibly working (policeman observations,
ideas sync). Reproduced on an isolated instance: the first loopback answer came after
74 seconds.

Root cause: `TaskVerificationPoller.ExecuteAsync` runs its first `VerifyOnce` before its
first `await`. `BackgroundService.StartAsync` returns only when `ExecuteAsync` first
awaits, and the web host binds Kestrel only after every hosted service has started. So
the whole first pass ran inside host startup, with the harness off the network. That was
harmless while a pass was git and PR facts; since the policeman joined the pass (PR #100,
#105, #112: a GitHub trace per assignee and a model question per card, answered
synchronously) it takes over a minute on a 50-card board — longer than the deploy's
health window.

## What changes

- `TaskVerificationPoller.ExecuteAsync` yields (`await Task.Yield()`) before the first
  pass. The pass itself is unchanged; it runs right after the host is up. Measured: first
  loopback answer 74 s → under 1 s on the same board.
- A regression test (`VerifierStartupTests`) starts the poller with a slow PR probe and a
  remote card with a PR: `StartAsync` must return within 1.5 s and the pass must still run
  afterwards. It fails on the previous code, passes now.

## Non-goals

No change to what a pass does, how often it runs, or the deploy's health window. Making
the policeman's model questions asynchronous is a separate improvement.
