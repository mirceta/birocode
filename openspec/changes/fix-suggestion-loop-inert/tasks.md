## 1. Slice 1 — deterministic fixes (backend)

- [ ] 1.1 SuggestionLoop: mode-aware decision — suggest mode proposes the
      below-threshold best candidate (D1); drive mode unchanged
- [ ] 1.2 PromptClassifier: word-boundary deny-list matching + reason names
      the matched term (D4); verdict keeps best label/confidence on the
      no-candidate branches nulled
- [ ] 1.3 AutopilotService.Tick: iterate all repos; resolve an active loop on
      a missing repo as error/repo-missing once (D2)
- [ ] 1.4 AutopilotController: decision word ungated + reason/label/
      confidence gate-conditional in the /api/autopilot/loops projection (D3)

## 2. Slice 1 — dock UI

- [ ] 2.1 DockLoopControl: live "last decision" readout (decision word
      always; reason/confidence when gate open) + i18n (en/tr) + CSS
- [ ] 2.2 Pending chip shows confidence for suggestion-kind pendings

## 3. Slice 1 — verify

- [ ] 3.1 Build backend to isolated dir + client; run on isolated port with
      its own CLAUDEWEB_DATADIR
- [ ] 3.2 Backend e2e: arm suggest-mode suggestion loop on a scratch repo,
      seed a low-confidence-matching assistant message, assert pending
      prompt + confidence appear; assert drive mode still holds below
      threshold
- [ ] 3.3 Backend e2e: missing-repo resolution (delete scratch folder,
      assert error/repo-missing) and gate-closed nulling of decision
      reason/label
- [ ] 3.4 Playwright: dock popover shows decision readout + pending chip
- [ ] 3.5 openspec validate --strict

## 4. Slice 2 — CLI classifier

- [ ] 4.1 CliPromptClassifier: one-shot claude -p JSON classification
      (routine index | abstain, confidence, reason) with timeout + stub
      fallback (D5)
- [ ] 4.2 Engine: per-repo single-flight background classification;
      classifying hold; consume cached verdict on a later tick
- [ ] 4.3 AutopilotConfigStore: additive Brain field ("stub" | "cli") +
      config endpoint + console toggle
- [ ] 4.4 Verify: isolated-port e2e — cli verdict above threshold drives a
      send; kill the CLI path and assert stub fallback reason; no duplicate
      in-flight classification per message

## 5. Docs + honesty

- [ ] 5.1 Understanding app + autopilot explainer honesty pass for the new
      suggest-mode semantics and decision readout
- [ ] 5.2 Live cleanup note: web-flow-autodev zombie loop self-resolves on
      first deploy tick (verify on live after ship)
