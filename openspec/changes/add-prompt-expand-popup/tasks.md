# Tasks

## 1. UI-mode capability + i18n

- [x] 1.1 Add a `promptExpand` capability to the map in
      `client/src/context/UiModeContext.jsx`, defaulting to `'advanced'`.
- [x] 1.2 Add i18n strings for the expand button (label + aria/title) and the popup (title,
      close/done, textarea aria) alongside the existing `chat.*` keys in the language catalog.

## 2. Popup component

- [x] 2.1 Add a `PromptExpandModal` component under `client/src/components/chat/` that portals
      to `<body>`, renders a backdrop + large editor card with a single `textarea` bound to
      `value`/`onChange`, and closes on Done button, backdrop click, and Esc.
- [x] 2.2 Focus the popup `textarea` on open; restore focus to the composer on close.
- [x] 2.3 Add popup styles to `client/src/components/chat/chat.css` using viewport-relative
      sizing so it stays usable with the mobile keyboard up (editor scrolls, not clipped).

## 3. Wire into the composer

- [x] 3.1 In `ChatInput.jsx`, add the expand toolbar button in `chat-input__row`, gated on the
      `promptExpand` capability, that toggles the popup open.
- [x] 3.2 Pass the existing `value`/`onChange` into the popup (no local copy); confirm queued
      chips / Prompts-modal appends stay consistent while the popup is open.

## 4. Verify + ship

- [x] 4.1 `npm --prefix client run build` clean.
- [ ] 4.2 Browser-verify (phone-width viewport, Playwright per `docs/claude-web/browser-testing.md`):
      open popup, edit a long draft, close via each of button/backdrop/Esc, confirm the edit
      survives and Send sends the edited text. Verify nothing sends on close.
- [ ] 4.3 Deploy to live `:5099` via `swap.ps1` and re-verify.
