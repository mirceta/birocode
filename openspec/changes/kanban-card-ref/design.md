# Design — Kanban card reference

## D1. The reference is derived, never stored

`TaskGraphService.ShortId(id)` = the first 8 characters of the id; `CardRef(id)` =
`"#" + ShortId`. Task ids are `Guid.NewGuid().ToString("N")` (32 hex), so the prefix is
stable for the card's life and needs no migration, no counter and no sync field.

## D2. What is copied is what resolves

The copy button puts `task <full id>` on the clipboard: the id is what every arch tool
takes and what `list_tasks` returns, so the pasted text resolves to exactly that card
with no lookup rule at all. The short code is display only — but it resolves too (D3),
so a reference typed by hand from the card works as well.

## D3. One resolver for every reference

`TaskGraphService.ResolveTaskRef(reference)`: trims, strips a leading `task ` and `#`,
takes an exact id as is; otherwise a hex prefix of at least 6 characters that matches
exactly one card resolves to that card; an ambiguous prefix is refused with the
candidates (`#ref title, …`), a shorter or unknown one with "no task …". Used by
`update_task`, `assign_task`, `dispatch_task` (the arch's task tools) and by
`create_task`'s `dependsOn`, and by the board's PATCH / assign / dispatch routes.
Delete stays exact-id only.

## D4. The card

A `kb__ref` block floats right of the title: a muted mono `#5cc3e900` and a `⧉` button
with `draggable={false}`, `onMouseDown` and `onClick` stopping propagation (the card is
draggable and click-to-open). The button reads "✓ copied" for 1.5 s. The detail view's
id line gets the same button. Clipboard through `navigator.clipboard`, with the
textarea/execCommand fallback for plain-HTTP LAN pages.

## D5. Tests

`TaskBoardTests`: the reference is the 8-char prefix; every pasteable form resolves to
the exact card; too short / unknown / blank refused; an ambiguous prefix is refused
naming both candidates and one more character disambiguates. Browser check: every card
shows `#ref`, copy puts `task <id>` on the clipboard, feedback appears, the card does
not open, PATCH by `#ref` updates that card.
