# Tasks

## 1. Promote the Local tab to Basic

- [ ] 1.1 In `client/src/context/UiModeContext.jsx:42`, change `localAppTab: 'advanced'`
      to `localAppTab: 'basic'` and update the trailing comment to note the promotion
      (date + "view-only in Basic; authoring stays Advanced").
- [ ] 1.2 Confirm `client/src/layout/tabRegistry.jsx` (Local entry `:37`, gate `:57`)
      now surfaces the tab in Basic with no further change.

## 2. Make the Basic Local tab view-only

- [ ] 2.1 In `client/src/pages/LocalApp.jsx`, read an Advanced gate (e.g.
      `const canAuthor = useFeature('localAppTab')` is now basic — instead use
      `useUiMode().isAdvanced`, or a dedicated advanced-only capability) and use it to
      hide the authoring surface in Basic: the "+ Add app" button (`:125-129`), the
      add-app form / setup block (`:157-200`), the per-app remove `×` (`:114-122`), and
      the Expose-verify button + `ExposeCheck` panel (`:141-149`, `:155`).
- [ ] 2.2 Suppress the auto-open-form effect in Basic: the
      `setAdding(repoApps.length === 0)` effect (`:35-41`) SHALL NOT open the form when
      not Advanced.
- [ ] 2.3 Add a Basic empty state for "no repo app yet" so the page is clean (the
      always-on Understanding app still renders behind/as the fallback view). Add any
      new i18n key(s) to the locale files used by `useT()`.
- [ ] 2.4 Keep the viewing surface intact in both modes: app switcher (`:102-131`),
      `ProductFrame` (`:203`), Refresh (`:136-138`), open-in-new `↗` (`:135`).

## 3. Verify (headless browser)

- [ ] 3.1 Basic + a project with a local app: Local tab is visible, embeds the product,
      shows the switcher / Refresh / open-in-new, and shows NO add/remove/verify/how
      controls.
- [ ] 3.2 Basic + a project with no real app: no auto-opened form; friendly empty state;
      Understanding app still viewable.
- [ ] 3.3 Advanced (unchanged): all authoring controls present; add-form auto-opens when
      the project has no real app.
- [ ] 3.4 Toggle Advanced → Basic while on the Local tab: authoring controls disappear,
      viewing surface remains.
- [ ] 3.5 No page errors.

## 4. Understanding app (if warranted)

- [ ] 4.1 If the mode → tab-visibility → view-only-controls flow is worth visualizing,
      author/refresh `understanding-app/index.html` (build-less, relative URLs) per
      `docs/understanding-app-convention.md`; otherwise note why prose + verification
      suffice.
