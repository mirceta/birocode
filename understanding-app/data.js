// Fleet task 608f281a — why "open" on pers-dec did nothing, and what the opener does now with the
// tab it finds. Transcribed from openspec/changes/status-open-agent-anywhere.
window.OPEN_DATA = {
  facts: [
    ['pers-dec on the hub', 'has a dock tab (Dashboard: on, a session), a repoId, a sendable machine — the target was never missing'],
    ['the opener', 'window.open("", "birocode-agent-_<repoId>"): finds the agent\'s named tab in any window without reloading it, or creates one'],
    ['what "found" meant before', 'a handle came back → done. Whatever the tab showed, wherever it was — including when the handle was the dashboard itself'],
    ['why other agents "worked"', 'they had no tab yet — the one case the old code handled (a fresh tab, navigated to /studio?agent=…)'],
    ['why pers-dec did not', 'it is the Operator\'s most-used agent: its tab existed — navigated elsewhere, in another window, or the very tab the dashboard was loaded in'],
  ],
  // what window.open('', name) can hand back, and what happens with it now
  handles: [
    { id: 'none', name: 'no handle', sub: 'the pop-up blocker', before: 'nothing, silently', now: 'notice: "the browser blocked the pop-up … allow pop-ups, or open in a new tab ↗"', cls: 'bad' },
    { id: 'self', name: 'the dashboard itself', sub: 'the Management App was loaded in the tab reserved for the agent', before: 'nothing — the handle was the caller', now: 'the dashboard gives the name back (birocode-dashboard) and opens the agent in a fresh tab beside it', cls: 'ok' },
    { id: 'fresh', name: 'a brand-new tab', sub: 'about:blank', before: 'navigated to /studio?agent=… (the one working case)', now: 'the same; notice "Opened pers-dec in a new tab"', cls: 'ok' },
    { id: 'parked', name: 'a tab parked on another page', sub: 'same origin, not the studio (e.g. /api/health, a Local-tab app)', before: '"focused as-is, never renavigated" — stayed there', now: 'navigated back to the agent; notice "was showing another page — back on the agent"', cls: 'ok' },
    { id: 'studio', name: 'the studio, showing another agent', sub: 'same origin, /studio…', before: 'focus() only — the dock did not switch; in another window nothing moved', now: 'a window message "birocode:open-agent"; the harness switches its dock to the agent and acks; notice says switched — or "did not come to the front (another window)" with a link', cls: 'ok' },
    { id: 'peer', name: 'another machine\'s harness', sub: 'cross-origin: the href cannot be read', before: 'focus() only', now: 'the same message; a peer on this build switches and acks; an older peer stays silent → the line says so with "open in a new tab ↗"', cls: 'warn' },
  ],
  steps: [
    ['Status tab: double-click (or the details\' Open harness)', 'focusAgentTab(key, url, label)'],
    ['window.open("", name) → handle', 'openPlan({ handle, self, href }) decides: blocked · self · fresh · renavigate · steer'],
    ['harness tab: DockContext receives the message', 'steerToAgent(agent): activate the dock tab (open one if the repo has none), land on the Agent tab, post the ack'],
    ['opener: ack within 900 ms? did this page lose the foreground?', 'announce birocode:agent-open {result, raised}'],
    ['Status tab: OpenNotice', 'quiet outcomes fade in 7 s; the doubtful ones stay with a real link (no pop-up blocker)'],
  ],
  verified: [
    ['A · fresh', 'a new named tab, /studio/agent, pers-dec active · "Opened pers-dec in a new tab."'],
    ['B · tab exists, showing another agent', 'no second tab; the tab switches back to pers-dec; notice "steered"'],
    ['C · dashboard inside the agent\'s named tab', 'before: nothing. Now: a new tab with pers-dec; the dashboard renamed and untouched'],
    ['D · tab parked on /api/health', 'no new tab; the tab is back on pers-dec; notice "renavigated"'],
    ['E · the details\' Open harness button', 'same path, same result'],
    ['F · another local agent / a remote machine', 'a new tab each; a second open on an old-build peer → "did not answer" with the link'],
  ],
};
