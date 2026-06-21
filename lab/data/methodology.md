# How I test a pattern or principle

A pattern earns its place in the **Repository** only by surviving contact with
real work. The loop I run:

## 1. Name it and state the hypothesis
Give the pattern a short name and write one sentence: *"I believe doing X causes
Y."* If I can't state the expected payoff, it isn't ready to test.

## 2. Define what good and bad look like — up front
Before trying it, decide what evidence would **confirm** it and what would
**refute** it. Deciding this afterward is how you fool yourself.

## 3. Try it on a real feature, not a toy
Patterns that only work in isolation don't count. The test bed is an actual
feature on its own branch, shipped the normal way.

## 4. Record evidence as it happens
Every time the pattern helps or hurts, note it on the pattern's card
(`evidence[]`). Concrete incidents beat remembered impressions.

## 5. Promote or demote
- **Enough confirming evidence →** mark it **good** and lean on it by default.
- **It backfired →** mark it **bad**, write the anti-pattern entry, and record
  *why* so the lesson outlives the memory.
- **Still ambiguous →** keep it **testing** and keep gathering evidence.

## 6. Cross-link the verdict
An entry (Learned / Found / Bad / Good) and the pattern it concerns should point
at each other, so the story — *observation → pattern → verdict* — is traceable.

---

### Standing rules this loop has already produced
- **Verify in a real browser, not just curl** — bytes served ≠ page renders.
- **Prove it on an isolated preview before the live swap** — self-dev is risky.
- **No silent fallback** — a broken thing must be visibly broken.
- **One feature per branch** — keep merges atomic and reversible.
