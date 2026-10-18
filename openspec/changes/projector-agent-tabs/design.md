# Design — projector-agent-tabs

## Where the reload came from

```
phone: tap agent X ─► POST /api/remote/commands {open-agent, screenOn}
  RemoteRelay.PlanCommand
    X on this harness, screen here      ─► open-agent ─► studio: DockContext.steerToAgent ─► AgentView
                                             AgentView rendered <Dashboard solo={active}/>: ONE dock, keyed by tab id
                                             → switching = unmount A + mount B (transcript refetch, iframes reload)
    X on peer P, screen on P            ─► navigate HopUrl(P, new PIN) ─► full page load   ← fixed: open-agent on P
    X on peer P, screen elsewhere       ─► navigate (unchanged: another origin, another login)
```

## Keep-alive

```
AgentView: kept = nextKept(kept, activeId, existingTabIds)   // MRU, max 6, closed tabs dropped
  <Dashboard solo={active} keep={kept}>
    solo mode renders every kept tab with renderDock, in dock order, keyed by tab id:
      shown  ─► visible, remoteActive
      others ─► <div hidden data-kept-dock>, remoteActive=false
```

React keeps each `PinnedAgent` instance because the keys and the order are stable, so a return only flips `hidden`.
Display-none iframes keep their documents in Chromium and WebView2.

While a dock is kept, `remoteActive=false` gates three things in `PinnedAgent`: the `lane` listener, the unnamed
`layout` / `push-app` match, and the `DOCK_LAYOUT_EVENT` report. The report's effect depends on `remoteActive`, so
the dock re-announces its layout when it is shown again. `pickScroller` already picks the largest visible scroller.

## Cost

Each kept dock keeps its chat state and polls, just as the Agent Dashboard wall does with every dock. The cap of six
bounds it.

## Evidence

- Node: `agentKeepAlive.test.mjs` (4). Client 345/345.
- .NET: `RemoteRelayTests`, including the new case: a same-peer pick is an in-place `open-agent`, without
  `sourceId` and without minting a PIN. Full suite green.
- Lab on this hub (`.claudeweb-preview/tabslab/lab.ps1`): an isolated harness on :5303 with copies of the live
  stores. Commands go through `POST /api/remote/commands` to a `?screen=projector` page. **13/13**:
  - the first open-agent loads;
  - switching keeps the same document;
  - returning is the SAME dock element, with no transcript refetch;
  - an unnamed `lane ask` reaches only the shown dock;
  - four agents stay kept.
