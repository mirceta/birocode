# Tasks

## 1. Promote the Local tab to Basic

- [x] 1.1 In `client/src/context/UiModeContext.jsx:42`, change `localAppTab: 'advanced'`
      to `localAppTab: 'basic'` and update the trailing comment to note the promotion
      (date + "view-only in Basic; authoring stays Advanced").
- [x] 1.2 Confirm `client/src/layout/tabRegistry.jsx` (Local entry `:37`, gate `:57`)
      now surfaces the tab in Basic with no further change.

## 2. Make the Basic Local tab view-only

- [x] 2.1 In `client/src/pages/LocalApp.jsx`, read an Advanced gate
      (`const { isAdvanced: canAuthor } = useUiMode()`) and use it to hide the authoring
      surface in Basic: the "+ Add app" button, the add-app form / setup block, the
      per-app remove `×`, and the Expose-verify button + `ExposeCheck` panel.
- [x] 2.2 Suppress the auto-open-form effect in Basic: the
      `setAdding(canAuthor && repoApps.length === 0)` effect no longer opens the form
      when not Advanced (and `showForm = adding && canAuthor` belt-and-suspenders).
- [x] 2.3 Add a Basic empty state for "no repo app yet" so the page is clean (the
      always-on Understanding app still renders as the fallback view) — slim
      `localapp__empty` note + `localapp.basicEmpty` key in `en.json`/`tr.json`.
- [x] 2.4 Keep the viewing surface intact in both modes: app switcher,
      `ProductFrame`, Refresh, open-in-new `↗`.

## 3. Verify (headless browser)

- [x] 3.1 Basic + a project with a local app (kekik-topluyoruz): Local tab visible,
      embeds the product, switcher/Refresh/open-in-new present, NO add/remove/verify/how.
- [x] 3.2 Basic + a project with no real app (Project Alpha): no auto-opened form;
      friendly empty state (`localapp.basicEmpty`); Understanding app still viewable.
- [x] 3.3 Advanced (unchanged): add-form auto-opens (form + how) when the project has no
      real app.
- [x] 3.4 Toggle Advanced → Basic while on the Local tab: authoring controls disappear
      (add/remove/verify), viewing surface remains.
- [x] 3.5 No page errors (console clean across all scenarios).

> Verified with a headless Playwright run against an isolated preview harness
> (`CLAUDEWEB_DATADIR` + `CLAUDEWEB_PORT=5350`, password `changeme`), seeded with a
> copy of the repo store; driver + screenshots under `.claudeweb-preview/`
> (gitignored). Each scenario asserts the actually-selected project matches intent.

## 4. Understanding app (if warranted)

- [x] 4.1 Authored `understanding-app/index.html` (build-less, fully self-contained,
      relative/inline only) — interactive mode × has-app toggles render a simulated Local
      tab plus a live "what decides this view" code-path panel (UiModeContext → tabRegistry
      → LocalApp.canAuthor → RepoContext self-repo safety). Successor to the
      hide-self-repo-from-basic app; orphaned map assets removed.
