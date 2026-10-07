// Fleet task 720b3e0c — why "open harness" from a Kanban card could still do nothing after PR #154, and the
// one opener every surface uses now. Transcribed from openspec/changes/open-agent-everywhere.
window.OPEN2_DATA = {
  card: [
    ['Card', '10922cb38c774da88eefcb1cf4f0485f — "Pull personal finances into our app", a tracking card'],
    ['Assignee', 'SourceId null (= this machine, DESKTOP-POAPPP3) · repo f28d758d… = pers-dec'],
    ['On the hub', 'repo registered, dock tab present (Dashboard: on), session present — the target is openable'],
    ['Fresh browser', 'the chip opens /studio?agent=f28d… → the Agent tab shows pers-dec. So the target was never the bug.'],
  ],
  // the five surfaces and what each did BEFORE
  before: [
    ['Status tab', 'focusAgentTab + its own notice (PR #154)', 'worked, and said what happened'],
    ['Kanban card chip', 'focusAgentTab, NO notice', 'an existing tab in another window / no answer / pop-up blocked → silence'],
    ['Kanban card, expanded', 'no open control; title double-click = rename', 'nothing to click'],
    ['Task graph node', 'chips not clickable', 'nothing'],
    ['Repo Agent Requests row', 'no open control', 'nothing'],
    ['Recurring chip', 'own href, only when the fleet knew the agent', 'silent when it did not'],
    ['Dedicated harness-window mode', 'launcher tab closed → "no-launcher" → return', 'nothing, everywhere'],
  ],
  reasons: [
    ['no-fleet', 'the fleet status has not arrived yet', 'says so; try again in a moment'],
    ['unknown-machine', 'no fleet machine has this sourceId (removed / re-registered)', 'says so; fix the card\'s assignee'],
    ['no-address', 'the machine is known but has no address to link to', 'says so'],
    ['unknown-agent', 'the machine does not list that repo', 'says so, offers the harness itself'],
    ['unreachable', 'the machine did not answer the hub\'s last probe', 'warns, opens anyway (a login page beats nothing)'],
    ['opened / steered / renavigated / self-reopened / silent / blocked', 'the tab opener\'s outcomes (PR #154)', 'the same line, now on every tab'],
  ],
  steps: [
    ['Any surface: a click', 'openAgentHarness({ sourceId, repoId, label })'],
    ['Resolve', 'machineOf(fleet, sourceId) — blank or "self" = this machine; address → deep link; agent listed? reachable?'],
    ['Cannot open', 'announce the reason on window → OpenAgentNotice shows it (mounted once, top of the Management App)'],
    ['Can open', 'focusAgentTab(key, url, label): read the tab it finds, open / navigate / steer with ack, announce'],
    ['Dedicated window mode', 'launcher missing or blocked → a tab beside the dashboard instead; outcomes announced too'],
  ],
};
