---
name: defined-terms
description: Define a compact glossary of canonical terms for a text's recurring concepts BEFORE describing them, so the result reads short and ordered instead of a repetitive wall of text -- AND know when NOT to, since it helps some text and hurts other text. Use whenever writing or cleaning up a problem statement, spec, requirements doc, design doc, schema, API surface, bug report, or onboarding doc that keeps repeating the same multi-word concepts (e.g. "the private project's own dedicated remote"). Trigger when a description grows long, repetitive, or dense; when the user complains of "too much text," a "wall of text," or a "long sausage of text"; when they ask to make something "more succinct," "formal," "tighter," "clearer," or "more ordered"; or any time naming the moving parts up front would tighten the rest. Apply proactively when text leans on the same compound noun phrases repeatedly -- but consult the noun/logic test below before forcing it onto argument-heavy or narrative text, where it can backfire.
---

# Defined Terms

## The core idea

Text gets long for the same reason code gets long: the same concept is spelled out in full, inline, over and over. "The private project's own dedicated git remote, separate from the monorepo's upstream" is fine the first time. By the fourth time it has turned the page into a sausage the reader has to chew through.

The fix is the prose equivalent of extract-variable: name each recurring concept once, up front, then refer to it by that short name everywhere after. This is what contracts do with capitalized Defined Terms ("the Disclosing Party") and what technical RFCs do with a Terminology section.

The output is two parts: a small glossary mapping each concept to a short canonical name, and a tightened text that uses those names. The glossary is overhead the reader pays once; the rewrite is where it pays off.

Why it actually speeds up understanding: a name turns a sprawling concept into a single chunk. Working memory only holds a handful of chunks at a time, so collapsing a repeated five-word phrase into one term frees the reader's capacity for the reasoning instead of re-parsing the same nouns.

Two distinct payoffs, both matter for the decision below:

1. **Deduplication** -- reuse. Name it once, refer cheaply many times. Pays off when a concept recurs.
2. **Leveling** -- letting the top level read at one altitude, detail tucked out of sight. Pays off even for a concept used only once, the same way extracting a well-named helper makes `main()` readable.

## When to chunk and when NOT to: the noun/logic split

This is the most important section. The technique is not universally good -- it helps some text and actively harms other text, and the dividing line is sharp.

**Abstract the nouns, not the logic.** Good abstraction in code factors entities (data and the operations on them) into named units, while the reasoning -- the sequencing, the conditionals, the "because this, therefore that" -- stays legible in the orchestrating method. You don't cram control flow into a class name. The same holds for prose.

Sort the text before compressing:

- **Entity-heavy text -> chunk it.** Specs, requirements, domain models, schemas, API surfaces, regulations, config, system descriptions. These are mostly nouns with thin logic connecting them. Factoring the nouns into a glossary leaves a clean, short "main." This is where the technique shines, and via Leveling it helps even when a term is used only once.

- **Logic-heavy text -> mostly leave alone.** Arguments, proofs, derivations, narratives, any passage whose value is the movement from point to point. Here the meaning lives in the connective tissue ("but," "so," "because"), which a glossary cannot hold. Trying to name reasoning steps (a term like "The Relocation" for "the meaning moved into the glossary") produces a cryptic label that forces a lookup every time and strips out the very logic that made it an argument. That is the prose version of jamming control flow into class names.

**The practical rule.** Identify the recurring concepts and ask whether they are *things* or *moves*. Promote the things. Leave the moves in the prose. A text that is all things compresses beautifully; a text that is all moves should usually be left as careful prose, perhaps with only its two or three central entities named.

**The one-line test, applied to the whole job.** Does naming things up front make this both shorter and clearer? If the honest answer is no, do not force it. Being able to tell when not to use this is as valuable as using it.

## Know your reader

Terseness is reader-relative. A short rewrite is only short for a reader who already holds the definitions; for everyone else, every term is a forward reference they must stop and resolve. "Fast for experts" and "opaque to newcomers" are the same sentence -- the learning sciences call this the expertise-reversal effect.

Before compressing, picture the actual audience:

- **Shared-context reader** (teammate in the same domain, your future self): chunk aggressively. The glossary is a one-time tax they happily pay, and everything after reads faster.
- **Novice or mixed audience**: either keep the glossary genuinely self-sufficient (definitions a newcomer can fully cash without outside knowledge) or compress less. A dense glossary-first text handed to a beginner is slower, not faster.

A quiet hazard when iterating with one person: each round you build more shared vocabulary, so the text gets terser for the two of you and steadily less legible to any outsider. That is fine if you mean to write for that audience -- just notice when you are doing it.

**Use it as a living glossary, not a one-shot.** The strongest version of this technique is a persistent glossary kept across an ongoing collaboration: a long document, a multi-message thread, an agent reporting on the same codebase over time. When the vocabulary is fixed and shared, nobody gets re-onboarded each turn. Term drift -- the same thing called three different things across three messages -- is a hidden tax, and a shared glossary removes it.

## The procedure

### 1. Find the recurring concepts, and classify them

Mark every noun phrase that:
- appears more than once,
- is central even if stated only once,
- or is long and clumsy to repeat.

Then apply the noun/logic split: which are things (promote) and which are moves (leave in prose). Do not over-collect -- promoting a one-off, self-explanatory phrase just adds a lookup nobody needed. Aim for the handful the text actually pivots around, typically 4-8.

### 2. Name each concept

Good names are:

- **Short** -- one or two words.
- **Capitalized** (e.g. `Secret Remote`) so the reader sees them as defined terms.
- **Self-sufficient, not cryptic.** A good name needs no lookup the way a well-named function does (`Mount Path` -- you basically know it without checking), while a bad name forces a lookup every time (`The Relocation`, or a class called `Handler`). If a candidate name does not carry its meaning, either rename it or do not promote that concept.
- **Mutually distinct** -- names should not blur together.
- **Noun phrases** -- they stand in for things.

### 3. Write the glossary

A two-column table is clearest: `Term | Definition`, one sentence each, ordered from most foundational to most derived so each definition can lean on the ones above it.

```
| Term | Definition |
|------|------------|
| **Foo** | One-sentence definition. |
| **Bar** | One sentence that may reference Foo. |
```

### 4. Rewrite using the terms

Restate the text using only the defined names; bold them on use so the reader can trace each back to the glossary. If you find yourself re-explaining a concept in the rewrite, that concept either needs a term or its definition is too weak.

Then sanity-check against the one-line test: is the whole thing now shorter and clearer? If not, roll back.

## Worked examples

### A win -- entity-heavy text

Raw:

> I have a git monorepo with lots of projects, but one needs to be secret, so I want to keep it out of the monorepo's history while it still physically lives inside the monorepo folder so my tools can see its dependencies, but it shouldn't get pushed to the shared remote where everyone sees it, and it has its own separate repo with its own remote I want to push to from inside its folder, and a new authorized person needs to know exactly where to clone it...

Glossary:

| Term | Definition |
|------|------------|
| **Monorepo** | The outer git repository of many projects, with a shared upstream everyone can see. |
| **Secret Project** | The private project that must stay invisible to general Monorepo users. |
| **Secret Remote** | The Secret Project's own git remote, separate from the Monorepo's upstream. |
| **Mount Path** | The fixed path inside the Monorepo's tree where the Secret Project must live. |
| **Ignored** | The Mount Path being in the Monorepo's `.gitignore`, so the Monorepo never tracks it. |
| **Secret Group** | The people authorized to access the Secret Project. |

Rewrite:

> The **Secret Project** lives at the **Mount Path** inside the **Monorepo** and is kept **Ignored**, so it never reaches the **Monorepo**'s upstream -- while remaining independently pushable to its **Secret Remote**. Onboarding a new **Secret Group** member is just: clone the **Secret Project** to the exact **Mount Path**.

Two sentences carry what took a breathless paragraph, and every term is unambiguous. This works because the text was almost all things.

### A miss -- logic-heavy text

Trying the same move on an argument ("the cut words did not vanish, they relocated, so it is really deduplication, but it depends on shared context...") fails: the concepts each appear once, and naming the reasoning steps ("The Relocation," "The Mechanism") produces cryptic labels that force constant lookups and delete the "but/so/because" logic that was the content. Correct call: leave it as prose, maybe naming only its one or two central entities.

## Tone

Do not announce the machinery ("I will now extract defined terms"). Present the glossary, then the tightened text, and let the result speak -- the reader should feel the text get shorter and sharper, not watch you narrate the technique.
