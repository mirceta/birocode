## 1. Backend — classify rejections

- [x] 1.1 Replace `IsUnauthorized` with a `Classify(resp, hasStoredCredential)` helper returning (status, detail): 403 → `ip-blocked`, 401 → `needs-credential`/`bad-credential` by stored credential, 429 → `throttled` (detail from `Retry-After`/body when present)
- [x] 1.2 Best-effort parse of the 403 JSON body's `ip` field (bounded read, swallow failures) to enrich the `ip-blocked` detail: "blocked by the harness's IP gate (your IP {ip} is not approved)"; bare 403 → "refused by an access gate (HTTP 403)"
- [x] 1.3 Use the helper in both `PollOnce` and the add-time probe so the first status after "Add harness" is already distinguished
- [x] 1.4 Update the `Source.Status` taxonomy comment; keep all new states `alive: true` and keep credential scrubbing on every detail

## 2. Frontend — events-app

- [x] 2.1 Map `ip-blocked`, `bad-credential`, `throttled` to the amber (connecting/warn) dot class alongside `needs-credential`
- [x] 2.2 Distinct labels: "alive · blocked by IP gate" (+ rejected IP from lastError), "alive · needs credential", "alive · credential rejected", "alive · throttled"

## 3. Verify & document

- [x] 3.1 `openspec validate distinguish-source-auth-failures --strict` passes
- [ ] 3.2 dotnet build clean; manual check against a real harness: unapproved IP shows ip-blocked (with the rejected IP), wrong credential shows credential rejected, no credential shows needs credential
- [x] 3.3 Update the events-app Understanding app to show the split failure taxonomy
