# Proposal: claimed-operator-override — "the operator explicitly asked" lifts the claimed rule

## Why

A repo agent on a branch that is not its default (and not one the arch assigned) is
**claimed**: the arch leaves it alone so a remote arch can never interrupt a person
mid-work. The rule has no notion of the operator asking for exactly that — "tell the
birocode agent on MONSTER to push its work" was refused as `claimed` by MONSTER even
though the operator typed it. The operator wants that case to work.

## What

- `send_task` gains `operatorAsked: "true"`, allowed ONLY when the Operator's own
  message in the arch conversation explicitly asked to reach that repo although it is
  on someone's branch (role prompt rule 6b). The hub lifts its own claimed check and
  audits `claimed-override`.
- The fleet send carries `override: true`; the receiving harness lifts its claimed check
  for that send and audits `claimed-override from <machine>`. The trust is unchanged:
  the hub's operator already allowed sends to that machine and the peer's operator
  already accepts fleet sends. Older peers ignore the field and keep answering
  `claimed`.
- The kanban's operator Ping (a person pressing a button on a card they assigned) also
  passes the override; the arch's own `dispatch_task` does not.

## Out of scope

Overriding `busy` (a running turn is never interrupted) or `unmanaged` (scope stays the
peer operator's decision).
