## 1. Slice 1 — deterministic fixes (backend)

- [x] 1.1 SuggestionLoop: mode-aware decision — suggest mode proposes the
      below-threshold best candidate (D1); drive mode unchanged
- [x] 1.2 PromptClassifier: word-boundary deny-list matching + reason names
      the matched term (D4); verdict keeps best label/confidence on the
      no-candidate branches nulled
- [x] 1.3 AutopilotService.Tick: iterate all repos; resolve an active loop on
      a missing repo as error/repo-missing once (D2)
- [x] 1.4 AutopilotController: decision word ungated + reason/label/
      confidence gate-conditional in the /api/autopilot/loops projection (D3)

## 2. Slice 1 — dock UI

- [x] 2.1 DockLoopControl: live "last decision" readout (decision word
      always; reason/confidence when gate open) + i18n (en/tr) + CSS
- [x] 2.2 Pending chip shows confidence for suggestion-kind pendings

## 3. Slice 1 — verify

- [x] 3.1 Build backend to isolated dir + client; run on isolated port with
      its own CLAUDEWEB_DATADIR
- [x] 3.2 Backend e2e: arm suggest-mode suggestion loop on a scratch repo,
      seed a low-confidence-matching assistant message, assert pending
      prompt + confidence appear; assert drive mode still holds below
      threshold (verify-suggestion-inert.mjs, :5227)
- [x] 3.3 Backend e2e: missing-repo resolution (delete scratch folder,
      assert error/repo-missing) and gate-closed nulling of decision
      reason/label (same script — all 30 checks pass)
- [x] 3.4 Playwright: dock popover shows decision readout + pending chip
      (verify-suggestion-dock.mjs, :5228 — "· 42% sure" chip on screen)
- [x] 3.5 openspec validate --strict

## 4. Slice 2 — CLI classifier

- [x] 4.1 CliPromptClassifier: one-shot claude -p JSON classification
      (routine index | abstain, confidence, reason) with timeout + stub
      fallback (D5); CLAUDEWEB_BRAIN_CLI env override for tests
- [x] 4.2 Engine: per-repo single-flight background classification;
      classifying hold; consume cached verdict on a later tick
- [x] 4.3 AutopilotConfigStore: additive Brain field ("stub" | "cli",
      default cli) + BrainModel (default haiku) + config endpoint +
      console toggle
- [x] 4.4 Verify: isolated-port e2e — cli verdict above threshold drives a
      send; kill the CLI path and assert stub fallback reason; no duplicate
      in-flight classification per message
      (verify-suggestion-cli-brain.mjs, :5229 — all 15 checks pass)

## 5. Docs + honesty

- [x] 5.1 Understanding app + autopilot explainer honesty pass for the new
      suggest-mode semantics and decision readout (understanding-app rewrite;
      AutopilotOverviewView / AutopilotMap fences table /
      AutopilotArchitectureView / autopilotArchitectureData brain+deny+cfg
      nodes; PromptClassifier header comment)
- [x] 5.2 Live cleanup note: web-flow-autodev zombie loop self-resolves on
      first deploy tick — REMEMBER to verify on live after ship (dock should
      show error/repo-missing for web-flow-autodev)
