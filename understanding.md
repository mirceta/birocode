# Understanding — seamless feature lifecycle (kickoff & closeout)

## The problem (as I understand it)
Both ends of a feature's life are a manual ritual you re-explain every time, and
the agent forgets steps if they aren't restated:

- **Kickoff:** open a `feature/<name>` branch, add the plan file + a `plan.md`
  dashboard entry, write `understanding.md`, then start the build→verify cycle.
- **Closeout:** once it's built/deployed/confirmed, "finish it off per our flow"
  — disarm the rollback, keep-it bookkeeping (mark plan shipped, move to Recently
  shipped), retire `understanding.md`, merge to main + push, tidy the branch.

You want **both** to be seamless — start the next feature and close out the
finished one without re-describing the whole dance.

## Status of this task
**Mapping phase, not building.** You asked me to just scaffold (branch + plan
entry) and said "then we will map our ideas and solve the actual problem." So:
- Branch `feature/feature-kickoff` is open.
- `plans/feature-kickoff.md` captures the problem; **Goal/Design are TBD**.
- No solution chosen yet (could be a CLAUDE.md convention, a skill/slash
  command, an in-app affordance, a checklist file — we'll decide together).

## Next step
Map the ideas with you and pin down what "seamless" should actually mean and
where the logic should live, before writing any design or code.
