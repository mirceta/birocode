## 1. Build

- [x] 1.1 `TaskVerificationPoller.ExecuteAsync`: `await Task.Yield()` before the first pass,
      with the reason in a comment.
- [x] 1.2 `VerifierStartupTests`: slow PR probe + remote card with a PR → `StartAsync` returns
      within 1.5 s and the pass still runs. Fails on the previous code.

## 2. Verify

- [x] 2.1 .NET suite green (563); the new test fails with the yield removed and passes with
      it; isolated instance built from this tree answers loopback in under 1 s where the
      previous build took 74 s, and the verifier pass still logs afterwards.
      DONE 2026-09-16 19:00.
- [ ] 2.2 Deploy of this fix on the hub passes the health check and the harness answers
      within the deploy's window.

## 3. Ship

- [ ] 3.1 Push `fix/verifier-startup-yield`, open the PR against main; merge and deploy on the
      Operator's word (the sync request that found this said "do not push").
