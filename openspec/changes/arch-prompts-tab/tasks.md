# Tasks — arch-prompts-tab

- [x] Prompts tab: grouped, searchable library; origin filter; template placeholders as chips; hint, origin, tools (Arch examples), usage.
- [x] Library actions moved over unchanged: add, edit, duplicate, reorder, delete, re-seed (missing categories only), first-use seed.
- [x] Use sheet: placeholders pick from live machines / agents / branches / cards; preview; Send to the arch; Open in Arch chat (hand-off).
- [x] Arch chat: remove the in-chat panel; one 📋 Prompts picker in the composer row (most used first, link to the tab); placeholder chips kept.
- [x] Usage tracking: `Uses` / `LastUsedAt`, `POST /api/prompts/{id}/used`; store, seeding and arch tools otherwise unchanged.
- [x] Tests: .NET (usage), node (segments / usage / fillAll / byUse, hand-off); full suites green.
- [x] Lab: before / after screenshots, a prompt filled and sent with a real arch turn, the cleaned-up chat.
- [x] Understanding app.
- [ ] Operator: try the tab after merge + deploy; delete or re-word the seeded prompts you never use.
