# Understanding — slice 2: a "prefill understanding prompt" button

## Goal

Make the understanding panel usable in **Product Repos** without any extra
`claude -p` call (Anthropic cost concern rules out CliRunnerService
system-prompt injection).

## Approach (the user's call)

Add a **button next to the chat** that, when clicked, **inserts a canned
instruction into the chat input box** — the "write your understanding of my
request to `understanding.md` first" prompt. It does **not** auto-send; the
user presses Enter to send it as a normal turn. Cheap (no extra invocation),
works in any selected repo (the agent runs in that repo and writes its
`understanding.md`). Accepted tradeoff: the user must remember to click it.

## What I'll do

1. Reuse the existing composer-prefill pattern (prompt-stash chips fill the
   draft; Exposure-check slice 2 "pre-fills the Project chat") rather than
   invent a new mechanism — `setDraft` from `ChatContext`.
2. Add the button in/near the chat composer, gated by the existing
   `understandingPanel: 'advanced'` capability. i18n en/tr.
3. Decide: clicking with text already in the box should **not** clobber it
   (prepend/append rather than replace) — confirm against the stash pattern.
4. Update `plans/understanding-panel.md` slice 2 from problem-spec → this
   design; browser-verify; then commit.

## Status — built, pending browser-verify

Implemented: a 📝 button in the composer (`ChatInput.jsx`, next to attach/stash),
gated by `understandingPanel`, that appends the canned `understanding.prefillPrompt`
to the draft and focuses the box (no auto-send, no extra `claude -p`). i18n en/tr;
CSS mirrors the stash button. Frontend builds clean. Plan slice 2 updated.
Next: rebuild the :5200 preview and headless-verify the button, then commit.

Minor calls (flag if wrong): button placement (composer, next to attach) and the
canned wording — easy to tweak.
