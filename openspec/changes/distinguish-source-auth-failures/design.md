## Context

The watched harness already answers the two failures distinctly: `IpFilterMiddleware` (first
in its pipeline) rejects unapproved IPs with **403** plus a JSON body `{ error, ip }` naming
the rejected IP; `PasswordAuthMiddleware` rejects missing/wrong credentials with **401**
(JSON `{ error }`), and its brute-force throttle answers **429**. The collector collapses all
rejections in `IsUnauthorized` (`CollectorService.cs:310`, matches 401 **or** 403) → status
`needs-credential`, detail "alive — requires a credential", in both the poll path and the
add-time probe path. The events-app maps that one status to one amber label.

Related in-flight change: `name-source-in-host-voice` also touches `CollectorService`, but a
different requirement; this change **adds** a new requirement rather than modifying the
register requirement, so the two archive cleanly in either order.

## Goals / Non-Goals

**Goals:**
- Split the collapsed state into `ip-blocked` / `needs-credential` / `bad-credential`, plus
  distinct handling for 429, in both the poll and the probe paths.
- Enrich the `ip-blocked` detail with the rejected IP parsed from the 403 JSON body when present.
- Render the new statuses distinctly in the events-app (all amber/alive, never dead-red).

**Non-Goals:**
- Changing anything the watched harness returns — its 403/401/429 are already correct, and
  the collector stays strictly read-only.
- Retrying, backoff changes, or auto-recovery — status reporting only.
- Persisting the new statuses (status stays runtime-only, as today).

## Decisions

- **Classification is a pure function of (status code, has-credential):** replace
  `IsUnauthorized(resp)` with a `Classify(resp, hasCred)` step used identically by
  `PollOnce` and the add-time probe, so the two paths can't drift. 403 → `ip-blocked`;
  401 → `needs-credential` when `ProtectedCredential is null`, else `bad-credential`;
  429 → `throttled` (detail carries `Retry-After`/body reason when present); other non-success
  stays the existing `error` status.
- **Reading the 403 body is best-effort:** attempt to parse `{ ip }` from the JSON body
  (bounded read, swallow all parse failures) purely to enrich the detail line —
  "blocked by the harness's IP gate (your IP x.x.x.x is not approved)". The status never
  depends on the body, so older/foreign harnesses that return a bare 403 still classify
  correctly.
- **`bad-credential` when a credential exists but is undecryptable** (key rotation makes
  `Unprotect` return null): the pull then goes out credential-less and gets 401. We classify
  by *stored* credential (`ProtectedCredential is not null`), not by what was sent — for the
  operator, "re-enter the credential" is exactly the right cue in that case too.
- **Status taxonomy is extended, not remapped:** existing values keep their meaning;
  `needs-credential` simply becomes accurate. The events-app treats the three auth states +
  `throttled` as amber "alive" states with distinct labels: "alive · blocked by IP gate",
  "alive · needs credential", "alive · credential rejected", "alive · throttled". Unknown
  statuses in an older frontend fall into the existing default styling — acceptable since
  frontend and backend deploy together.
- **Update the taxonomy comment** on `Source.Status` (`CollectorService.cs:76-81`) in the
  same commit — it is the de-facto registry of allowed statuses.

## Risks / Trade-offs

- **Credential-presence inference, not proof:** a 401 with a stored credential could in
  principle be "harness requires auth *and* ignored the header" (e.g. a non-ClaudeWeb
  endpoint). The detail wording says "credential rejected", which remains a truthful
  operator cue (re-enter/verify it). Accepted.
- **403 from something other than the IP gate** (a proxy in front of the harness): we'd
  label it `ip-blocked`. Detail text says "blocked by the harness's IP gate" only when the
  body carries the recognizable `ip` field; a bare 403 gets the softer "refused by an access
  gate (HTTP 403)". Keeps the status simple while the wording stays honest.
- **Body read on an error response** adds one small read per failed poll — bounded (few KB)
  and only on 403s, negligible.
