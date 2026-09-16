## 1. Build

- [x] 1.1 `PrTrace` (pure): ranked tracing of a PR to a card; `PrListItem`.
- [x] 1.2 `IPrFactsProbe.ListPrs` (default empty) + `gh pr list` implementation.
- [x] 1.3 `ToolListPullRequests`, `ToolSyncCard` on `ArchAgentService.Policeman`; catalogue entries;
      `ArchPoliceman.AllowedTools` + refusal + prompt steps.
- [x] 1.4 Client wording (Policeman subtab empty state, Tools lane intro); evidence counts 15 of 29.

## 2. Verify

- [x] 2.1 `PrTraceTests`: order of evidence, scoping, ties, delivered/manual skipped, and the
      link-then-one-pass mechanism (Doing → PR open, never back on a closed PR).
- [x] 2.2 `ArchPolicemanTests`: the two tools allowed; the prompt names them and "forward only".
- [x] 2.3 Full backend suite, client suite, policeman evidence script green; bundle rebuilt.

## 3. Ship

- [ ] 3.1 PR (stacked on `fix/policeman-tool-surface`); merge + deploy on the Operator's word.
