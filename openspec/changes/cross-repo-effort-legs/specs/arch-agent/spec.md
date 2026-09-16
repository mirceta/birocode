## ADDED Requirements

### Requirement: The arch models cross-repo efforts as typed legs and never finishes a card off one leg
`list_tasks` SHALL return, per assignee, `role`, `agentless`, `path`, `merged` and
`mergeState`, and per task an `effort` object (`crossRepo`, `legs`, `merged`,
`partiallyMerged`, `allMerged`, `drivers`, `driven`, `unmerged`, `mismatch`). The arch SHALL
have `add_leg` (a repo agent by machine + repoId / handle, or an agentless checkout by
`path` on a machine; role driver | driven; optional branch and PR), `remove_leg`,
`set_leg_role`, and `assign_task` SHALL accept `role`. `update_task` SHALL accept an
agentless leg's path or path tail as `assignee`. `dispatch_task` SHALL ping only legs with
an agent and answer status `agentless` when nothing pingable remains; the brief SHALL list
every leg with its role, checkout, branch, PR and merge state, state that the card is done
only when every leg's PR is verified merged, and name the `report_leg` / `my_effort` tools.
The role prompt SHALL teach all of this and forbid moving a cross-repo card to pr-merged /
done off one leg's PR.

#### Scenario: Adding the prg leg
- **WHEN** the arch calls `add_leg` with the card, role driven, path `C:\prgcopies\copy1\prg`, branch `knjiga-poste` and PR #166
- **THEN** the card has two legs, `list_tasks` shows the new leg `agentless: true` with its path and "PR recorded, not verified", the effort reads 0 of 2 merged, and `dispatch_task` naming that leg answers `agentless`

#### Scenario: Relaying a closing line for a driven checkout
- **WHEN** the arch calls `update_task` with `assignee: "copy1/prg"`, status committed and a branch
- **THEN** that leg's state and branch move, the card re-aggregates, and the driver leg is untouched

### Requirement: The policeman checks every leg and flags a cross-repo mismatch at once
The policeman's sweep SHALL neither read the transcript of nor trace pull requests through
an agentless leg (the verifier checks it from its checkout), and SHALL flag a card whose
column claims merged while a leg is not verified merged on the same pass, with the reason
naming every leg and its merge state — never silently done.

#### Scenario: A driver merged, a driven leg not
- **WHEN** the card claims done, PR #21 is merged and PR #166 is open
- **THEN** the sweep stamps 🆘 with "cross-repo effort: 1 of 2 legs merged on GitHub (…); not merged: copy1/prg (no agent) — PR #166 open, not merged — the card is not done until every leg is merged"
