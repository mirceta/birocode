# Documentation principles

How to structure plans and docs in this repo. Read before editing any
`plans/*.md`. Generalized from a doc set the user maintains elsewhere.

1. **High cohesion: organize by unit of work, not by topic.** Everything
   about one unit (a step, a feature, a module) lives with that unit —
   description, tools, caveats, status. Never create cross-cutting files
   that say a little about every unit (a "tooling" file, a "status"
   file): they force a reader to open everything to understand anything.

2. **Progressive disclosure: split on bloat, per unit.** A unit's entry
   in the index/root document stays short — a few lines. When it
   outgrows that, move the overflow into a detail file for THAT unit and
   leave the short version + a link behind. Thin units get no file until
   they earn one; files on disk cost nothing until opened.

3. **Extract shared mechanisms, like a class (SOLID).** When several
   units depend on the same mechanism, don't paste it into each (DRY
   violation) and don't merge the units (SRP violation). Extract the
   mechanism into its own file and let the units reference it.

4. **Reference, never duplicate, external docs.** If something is
   documented elsewhere (another repo's README, a skill, a guide),
   reference it by name/path. Copying forks it; the copy goes stale
   while the original moves on.

5. **Name references inline, where they are used.** Refer to tools and
   docs by name in the prose, right where they're used — backticked
   names, markdown links to sibling files. No numbered citations or
   footer apparatus; the reader should never jump to the bottom to learn
   what a marker means.

6. **Diagrams are maps, not documents.** Keep node labels to a short
   title (at most one short qualifier line). Full descriptions live in
   the prose, not the boxes — even with a renderer that wraps perfectly,
   a diagram crammed with prose stops being a map.

7. **Match the host repo's character conventions.** Some repos mandate
   ASCII-only (`--`, `->`); this repo's plans use Unicode (—, →, §).
   Follow the local precedent of wherever you're writing.
