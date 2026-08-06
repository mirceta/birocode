## 1. Composer-only chat mode

- [x] 1.1 Add a `composerOnly` prop to `Chat` (`client/src/pages/Chat.jsx`) that applies a `chat--composer-only` class to the chat root
- [x] 1.2 Add CSS for `chat--composer-only` (in `client/src/components/chat/chat.css` or `client/src/pages/dashboard.css`) hiding `.chat__bar` and `.chat__body` so only `.chat-input` renders, with clean composer-only styling in the dock
- [x] 1.3 Guard any chat effects that misbehave when the body is `display: none` (e.g. autoscroll measuring a hidden list) on the `composerOnly` prop

## 2. Dock layout change

- [x] 2.1 In `client/src/components/dashboard/PinnedAgent.jsx`, introduce a single `altViewActive` condition (`openApp || showConsole || showFiles`) and restructure the `.phone__screen` conditional so the active alternate view renders above one shared `<Chat embedded composerOnly>` instead of replacing the chat
- [x] 2.2 Verify the chat instance stays mounted (no remount) when switching directly between alternate views (e.g. Console → Files → local app) and when toggling any view open/closed
- [x] 2.3 Adjust `.phone__screen` / view / composer flex sizing in `client/src/pages/dashboard.css` so each alternate view (app frame, Event Console, Files browser) takes the remaining height above the natural-height composer, and check each view's bottom chrome reads cleanly against the composer strip

## 3. Verify

- [x] 3.1 Build the frontend (`npm --prefix client run build`) with no errors
- [x] 3.2 Browser-verify per `docs/claude-web/browser-testing.md`, for each alternate view (local app, Event Console, Files): view covers bar + messages, composer visible below; type and Send while the view is open — prompt sends, view stays open; close the view — full chat restored with the streamed turn present
- [x] 3.3 Verify the standalone Local tab still renders the app full-body (unchanged)
- [x] 3.4 Run `openspec validate --strict` for this change
