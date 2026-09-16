// Understanding app — the proposed per-agent Goal app laid over the existing "Ask for
// understanding" feature (fleet task f7224e55; a START + design pass, no implementation).
// Build-less, relative URLs only; cytoscape is vendored. Every node is a real piece of
// the harness, with the file it lives in; the Goal tab tags each piece reuse / clone / new.

const $ = (s) => document.querySelector(s);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// who: human | code | model | file   tag (goal tab): reuse | clone | new
const N = (id, x, y, label, sub, who, detail, file, tag, cls = '') => ({ data: { id, label, sub, who, detail, file, tag }, position: { x, y }, classes: `${who} ${tag || ''} ${cls}`.trim() });
const E = (s, t, label, cls = '') => ({ data: { id: `${s}->${t}`, source: s, target: t, label }, classes: cls });

// ---------- Tab 0: today ----------
const TODAY = [
  N('btn', 0, 0, '🧠 Ask for understanding', 'dock button · PinnedAgent.jsx', 'human',
    'The second agentic dock button, beside Discover. Advanced-mode only (capability understandingAgent in UiModeContext.jsx). Disabled until the builder lane has a conversation (tab.sessionId); the Ask lane never has one. On click it POSTs /api/understanding/ask with that sessionId and then polls /status every 5 s until the run is terminal.',
    'client/src/components/dashboard/PinnedAgent.jsx:669-711'),
  N('auto', 0, 190, 'Auto ☑', 'per-repo flag · RepositoryConfig.AutoUnderstanding', 'human',
    'A checkbox next to the button. It views/flips a SERVER-persisted per-repo flag (repositories.json) through GET/POST /api/understanding/auto — persisted server-side because the trigger fires with no browser attached. Default off: every turn would be a paid agentic run.',
    'ClaudeWeb.App/Models/RepositoryConfig.cs:48 · RepositoryRegistry.SetAutoUnderstanding'),
  N('turn', 0, 380, 'a builder turn ends', 'RunSessionService.RunCompleted (repoId, lane, status, sessionId)', 'code',
    'Every way of running a chat turn (user send, autopilot, loops) creates a RunSession; when it completes, the service raises ONE event. This is the single choke point the auto hook listens to, so new run starters inherit the hook for free.',
    'ClaudeWeb.App/Services/Chat/RunSessionService.cs:236,351'),
  N('poll', 400, -150, 'status poll', 'GET /api/understanding/status · every 5 s · never starts a run', 'code',
    'Reattach-only: on mount / repo change the dock asks for the repo\'s latest job (idle | running | done | error) and, when auto is on and the chat stream just went done, nudges the poll 1.5 s later so the spinner appears without a refresh.',
    'PinnedAgent.jsx:324-399 · UnderstandingController.Status'),
  N('api', 400, 0, 'POST /api/understanding/ask', 'UnderstandingController · repo from X-Repo-Id · body { sessionId }', 'code',
    'Validates the repo and the session id, resolves WHO pressed (request-scoped identity for the audit trail) and hands off to the jobs registry. Returns the job state immediately; the request never owns the run.',
    'ClaudeWeb.App/Controllers/UnderstandingController.cs'),
  N('trig', 400, 380, 'AutoUnderstandingTrigger', 'hosted service · fires when lane=builder ∧ status=done ∧ sessionId ∧ flag on', 'code',
    'Subscribes to RunCompleted at startup (dependency direction understanding → chat, the chat module knows nothing about it). Never throws: a broken trigger must never fail a chat turn. Recursion is impossible: the understanding run is not a RunSession.',
    'ClaudeWeb.App/Services/Understanding/AutoUnderstandingTrigger.cs'),
  N('jobs', 820, 190, 'UnderstandingJobs', 'one job per repo · latest-only · own CancellationToken · one pending slot (coalesce)', 'code',
    'Backend-owned registry. StartOrJoin (manual): running → join, terminal → replace. EnqueueLatest (auto): running → overwrite the single pending slot with the NEWEST session, chained when the run ends; intermediate turns are dropped, never queued. Survives a phone refresh; a harness restart just means "no recent run".',
    'ClaudeWeb.App/Services/Understanding/UnderstandingJobs.cs'),
  N('events', 820, 440, 'Console + audit', 'RepoEventLog op=understanding started/done/error · AgenticAuditLog "ask-for-understanding"', 'code',
    'Progress lands in the per-repo Event Console lane (same lane as Discover, no UI change) and as a durable agentic-audit entry (actor = the presser, or "auto"). Only a real start emits "started"; a join does not.',
    'UnderstandingJobs.StartNew · Services/AgenticAudit'),
  N('ask', 1240, 190, 'UnderstandingAsk.BuildAsync', 'transcript → prompt → one subagent run in the repo root', 'code',
    'Loads the builder transcript (SessionService.GetMessages), exports it to a file when it is long, and builds ONE prompt = the conversation (12 000-char budget, full history path attached) + the build instruction. Then runs it once, ephemeral, with the repo\'s own engine. Legacy fallback: fork the transcript through Claude Monitor snapshot-resume.',
    'ClaudeWeb.App/Services/Understanding/UnderstandingAsk.cs:51-101'),
  N('prompt', 1240, -60, 'the prompt', '"explain your MOST RECENT reply · read the convention doc · overwrite understanding-app/ · relative URLs · touch nothing else"', 'model',
    'The visualization architecture lives HERE: the prompt points the subagent at docs/understanding-app-convention.md (resolved by absolute path via the playground/birocode ancestor, so it works from any repo) and scopes the write to understanding-app/. The model decides what to draw; the contract (build-less, self-contained, relative URLs, rolling latest) is fixed text.',
    'UnderstandingAsk.BuildPrompt · ResolveConventionDoc · docs/understanding-app-convention.md'),
  N('engine', 1240, 440, 'AgentHelperRunner', 'ephemeral run · repo\'s engine (claude | codex) · readOnly=false · never touches the live session', 'code',
    'The subagent: the repo\'s configured CLI, run once with no session id (so the live conversation is never resumed or locked), write-capable because it must author files. Working directory = the repo root, which is what bounds the blast radius.',
    'ClaudeWeb.App/Services/Chat/AgentHelperRunner.cs'),
  N('folder', 1660, 190, 'understanding-app/', 'index.html + app.js/css + vendored libs · at the repo root · rolling latest', 'file',
    'The output. There is no separate store: the app IS the understanding. Overwritten on every run. On birocode it is committed (self-development), elsewhere it is whatever the repo does with it.',
    '<repo>/understanding-app/index.html'),
  N('reg', 2080, -60, 'synthetic local app "Understanding"', 'kind:harness · appended to EVERY repo · RepositoryRegistry.ToInfo', 'code',
    'Not persisted, not a process: the registry appends an always-on LocalAppInfo(id "understanding", port 0, kind harness) to every repo. The Lab and the event-feed apps are the same mechanism, attached to the self repo only.',
    'ClaudeWeb.App/Services/Repositories/RepositoryRegistry.cs:432,453'),
  N('serve', 2080, 190, 'UnderstandingApp.Serve', 'HarnessStaticApp · no-store · /api/localview/{repo}/app/understanding/', 'code',
    'LocalProxyController dispatches kind:harness apps by id to a server-side static folder server (no loopback port). Missing index.html = an explicit empty state; a missing asset = a plain 404; no fallback renderer, so broken is visibly broken.',
    'ClaudeWeb.App/Services/Understanding/UnderstandingApp.cs · Controllers/LocalProxyController.cs:71-79'),
  N('ui', 2080, 440, 'Local tab + dock app switcher', 'reload shows the new app', 'human',
    'The app appears as a button in the dock\'s local-app switcher and as the Local tab\'s always-on Understanding slot. The done message says "reload the Local tab\'s Understanding app".',
    'PinnedAgent.jsx:601-605 · Local tab'),
];
const TODAY_E = [
  E('btn', 'api', 'click · { sessionId }'), E('api', 'jobs', 'StartOrJoin'), E('api', 'poll', 'then poll'),
  E('auto', 'trig', 'the flag it reads'), E('turn', 'trig', 'RunCompleted'), E('trig', 'jobs', 'EnqueueLatest (coalesce)'),
  E('poll', 'jobs', 'Get(repoId)'), E('jobs', 'ask', 'background task, own token'), E('jobs', 'events', 'started / done / error'),
  E('ask', 'prompt', 'conversation + instruction', 'model'), E('ask', 'engine', 'RunAsync(prompt, repoRoot)'), E('prompt', 'engine', '', 'model'),
  E('engine', 'folder', 'writes'), E('folder', 'serve', 'served from'), E('reg', 'serve', 'id "understanding" → dispatch'), E('serve', 'ui', 'iframe'),
];

// ---------- Tab 1: the Goal app, mirrored ----------
const GOAL = [
  N('g-btn', 0, 0, '🎯 Update goal', 'NEW dock button, right next to 🧠 · same row', 'human',
    'Mirror of the Ask button: same disabled rule (needs a builder sessionId), same busy/done/error messages with goal wording, POSTs /api/goal/ask. Open question Q7: reuse the understandingAgent capability gate or add a goalAgent one (both Advanced).',
    'PinnedAgent.jsx (clone of lines 669-711) · i18n dashboard.goal*', 'clone'),
  N('g-auto', 0, 190, 'Auto ☑ (goal)', 'RepositoryConfig.AutoGoal · GET/POST /api/goal/auto', 'human',
    'A second server-persisted per-repo flag, default off, same reasons. The two checkboxes are independent: an Operator may want the understanding refreshed every turn but the goal only on demand, or the reverse.',
    'RepositoryConfig.cs (+1 bool) · RepositoryRegistry.SetAutoGoal', 'clone'),
  N('g-chat', 0, 380, '"we want to create a goal …"', 'the Operator, in the agent\'s chat · the transcript is the only record', 'human',
    'There is NO code path that detects this sentence. It lands in the builder transcript like any other message. The goal subagent reads the transcript later and decides that a goal was set or changed. Open question Q3: is model judgement enough, or do we also want a deterministic marker / a dock field?',
    'the builder transcript (SessionService.GetMessages)', 'new'),
  N('g-turn', 400, 380, 'a builder turn ends', 'RunSessionService.RunCompleted', 'code',
    'Unchanged. The same event feeds both hooks.', 'RunSessionService.cs', 'reuse'),
  N('g-api', 400, 0, 'POST /api/goal/ask · /status · /auto', 'GoalController, or a second route family on one controller', 'code',
    'Same three endpoints, same shapes, same X-Repo-Id resolution and audit-actor resolution. Open question Q8: a copy of UnderstandingController, or one controller parameterised by kind.',
    'Controllers/UnderstandingController.cs → GoalController.cs', 'clone'),
  N('g-trig', 400, 190, 'one trigger, two flags', 'AutoUnderstandingTrigger reads AutoUnderstanding AND AutoGoal', 'code',
    'The existing hosted service already sits on the choke point; it grows one branch: if repo.AutoGoal, EnqueueLatest on the goal jobs. Same conditions (builder, done, sessionId). No second subscription needed.',
    'AutoUnderstandingTrigger.cs (+4 lines)', 'reuse'),
  N('g-jobs', 820, 190, 'jobs registry keyed by kind', 'UnderstandingJobs → one registry, kind = understanding | goal', 'code',
    'Recommendation: generalise the registry (map key = repoId + kind, audit feature name and Console op passed in) instead of copying it. Coalescing, latest-only, own token, pending slot: all inherited. Goal and understanding runs for one repo then run independently and can run at the same time.',
    'Services/Understanding/UnderstandingJobs.cs (generalise)', 'reuse'),
  N('g-events', 820, 440, 'Console + audit', 'op=goal started/done/error · audit "update-goal"', 'code',
    'Same event log and audit trail, new op / feature names so the Console lane and the audit page tell the two runs apart.', 'UnderstandingJobs.StartNew (parameterised)', 'clone'),
  N('g-ask', 1240, 190, 'GoalAsk.BuildAsync', 'transcript → GOAL prompt → the same subagent runner', 'code',
    'Same loading and export of the transcript, same runner. The difference is the prompt and, possibly, a pre-check: the goal changes rarely, so a run that first decides "did anything change?" and stops when nothing did would save most of the cost of Auto. Open question Q4.',
    'Services/Understanding/GoalAsk.cs (new, ~80 lines)', 'new'),
  N('g-prompt', 1240, -60, 'the goal prompt', '"read the conversation · did the latest turn(s) SET or CHANGE the goal? · if yes rewrite goal-app/ · if no, say so and touch nothing"', 'model',
    'The genuinely new text. It keeps the visualization architecture verbatim (the same convention: build-less, self-contained, relative URLs, rolling latest, the doc resolved the same way) and swaps the subject: not "explain the latest reply" but "what is the goal now, and what changed". Open questions Q1/Q2: whether it also writes a machine-readable goal.json and keeps a history.',
    'GoalAsk.BuildPrompt · docs/understanding-app-convention.md (+ a Goal section, Q6)', 'new'),
  N('g-engine', 1240, 440, 'AgentHelperRunner', 'unchanged', 'code', 'The same ephemeral, write-capable run in the repo root with the repo\'s engine.', 'AgentHelperRunner.cs', 'reuse'),
  N('g-folder', 1660, 190, 'goal-app/', 'index.html … at the repo root · + goal.json?', 'file',
    'A sibling folder to understanding-app/, same four-line contract. The open question is whether the app is the ONLY store of the goal (like understanding) or whether a small goal.json (text, updatedAt, history[]) sits beside it so the dock, the arch and the board can read the goal without parsing HTML. Q1, Q2.',
    '<repo>/goal-app/index.html (+ goal.json?)', 'new'),
  N('g-reg', 2080, -60, 'synthetic local app "Goal"', 'kind:harness · id "goal" · on every repo', 'code',
    'One more LocalAppInfo appended in RepositoryRegistry.ToInfo, exactly like "understanding". It then shows up in the dock switcher and the Local tab by itself.', 'RepositoryRegistry.cs (+1 const, +1 line)', 'clone'),
  N('g-serve', 2080, 190, 'GoalApp.Serve', 'HarnessStaticApp over goal-app/ · /api/localview/{repo}/app/goal/', 'code',
    'A copy of UnderstandingApp.cs with the folder name and the empty-state text changed, plus one dispatch branch in LocalProxyController. HarnessStaticApp itself is reused untouched.', 'Services/Understanding/GoalApp.cs · LocalProxyController.cs (+2 lines)', 'clone'),
  N('g-ui', 2080, 440, 'Local tab + dock app switcher', 'a "Goal" button appears beside "Understanding"', 'human',
    'No client change needed for the app to appear: the switcher renders whatever local apps the repo reports.', 'PinnedAgent.jsx:601-605', 'reuse'),
  N('g-board', 1660, 520, '🎯 Board goal · arch goals', 'a DIFFERENT goal: PATCH /taskgraph/goal (one per board) · ArchStateStore.ArchGoal (per arch conversation)', 'code',
    'Two goal concepts already exist and neither is per repo agent: the board goal is the Operator\'s reference for the whole Kanban (read by the policeman), the arch goal is what one arch conversation drives. The agent goal is a third. Open question Q5: keep them independent, or let the agent goal feed upward.',
    'Controllers/TaskGraphController.cs:100 · Services/Arch/ArchStateStore.cs:90', 'new', 'outside'),
];
const GOAL_E = [
  E('g-btn', 'g-api', 'click · { sessionId }'), E('g-api', 'g-jobs', 'StartOrJoin(kind=goal)'),
  E('g-auto', 'g-trig', 'the second flag'), E('g-turn', 'g-trig', 'RunCompleted'), E('g-trig', 'g-jobs', 'EnqueueLatest(kind=goal)'),
  E('g-chat', 'g-ask', 'read later, in the transcript', 'model'),
  E('g-jobs', 'g-ask', 'background task'), E('g-jobs', 'g-events', 'op=goal'),
  E('g-ask', 'g-prompt', 'conversation + goal instruction', 'model'), E('g-ask', 'g-engine', 'RunAsync'), E('g-prompt', 'g-engine', '', 'model'),
  E('g-engine', 'g-folder', 'writes (only when the goal changed?)'), E('g-folder', 'g-serve', 'served from'), E('g-reg', 'g-serve', 'id "goal"'), E('g-serve', 'g-ui', 'iframe'),
  E('g-folder', 'g-board', 'Q5: feeds upward? or independent', 'model'),
];

// ---------- Tab 2: the questions ----------
const QUESTIONS = [
  { n: 'Q1', node: 'g-folder', title: 'Where does the goal TEXT live?',
    why: 'The understanding has no store: the app is the understanding. A goal is different — the dock, the arch and the board may want to read it as text.',
    options: ['Only inside goal-app/ (the visualization is the store, exactly like understanding).', 'goal-app/goal.json beside the app: { text, updatedAt, setBy, history[] } — the subagent writes both, the harness can read the JSON.', 'A field on RepositoryConfig (repositories.json), set by the subagent through an endpoint.'],
    rec: 'Option 2. It keeps the "folder at the repo root, agent-authored" shape, needs no new endpoint, and makes the goal readable by code later (dock chip, list_agents) without parsing HTML.' },
  { n: 'Q2', node: 'g-folder', title: 'One current goal per agent, or a history?',
    why: 'The Operator may redirect the goal several times in a conversation. A rolling-latest app loses the trail.',
    options: ['Current goal only (rolling latest, overwrite).', 'Current goal + an append-only history in goal.json that the app can show as a timeline.'],
    rec: 'Option 2, cheaply: the app shows the current goal big and the history small. The subagent appends one entry per detected change.' },
  { n: 'Q3', node: 'g-chat', title: 'How is "set a goal from chat" detected?',
    why: 'Today nothing parses chat. "We want to create a goal …" is just a message in the transcript; only the goal subagent, reading the conversation later, can notice it.',
    options: ['Model judgement only: the subagent reads the transcript and decides whether the latest turn(s) set or changed the goal (mirrors understanding exactly).', 'Model judgement plus a deterministic marker the Operator can use ("GOAL: …" at the start of a message) that the prompt is told to treat as authoritative.', 'Additionally a small text field in the dock to set the goal by hand, written to goal.json directly.'],
    rec: 'Option 2. Pure model judgement is what the brief asks for and works, but one optional marker makes an explicit goal unambiguous at zero cost.' },
  { n: 'Q4', node: 'g-ask', title: 'What does a run do when the turn said nothing about the goal?',
    why: 'With Auto on, most turns will not change the goal. The understanding run always rebuilds; a goal run that always rebuilds wastes a paid run per turn.',
    options: ['Always rebuild (simplest, mirrors understanding).', 'One run, but the prompt says: if nothing changed, reply "unchanged" and touch nothing (the run still costs a model call, but no file churn).', 'A cheap read-only pre-check run ("did the latest turns set or change the goal? yes/no") and only then the full build.'],
    rec: 'Option 2 to start; Option 3 if Auto proves expensive in practice.' },
  { n: 'Q5', node: 'g-board', title: 'How does the agent goal compose with the board goal and the arch goals?',
    why: 'The board goal (PATCH /taskgraph/goal) is one per Kanban and the policeman reads it; an arch goal is what one arch conversation drives. The agent goal would be a third, per repo agent.',
    options: ['Independent: the agent goal is only the agent\'s own reference; nothing reads it.', 'Read-only upward: list_agents and the Fleet Status detail show each agent\'s current goal from goal.json.', 'The arch can set an agent\'s goal when it dispatches a task (writes goal.json), so board work and the agent\'s goal agree.'],
    rec: 'Option 1 for this change, with goal.json shaped so Option 2 is a later, separate change.' },
  { n: 'Q6', node: 'g-prompt', title: 'Where does the Goal-app convention live?',
    why: 'The subagent is pointed at docs/understanding-app-convention.md by absolute path. The goal app has the same four-line contract but a different folder and a different content rule.',
    options: ['A "Goal app" section appended to the existing convention doc (one file, same resolver).', 'A sibling docs/goal-app-convention.md, resolved the same way.'],
    rec: 'Option 1: one doc, one resolver, and the shared contract stays literally shared.' },
  { n: 'Q7', node: 'g-btn', title: 'Capability gate and Auto cadence',
    why: 'The understanding button and its Auto box are gated by understandingAgent (Advanced). Auto fires on every completed builder turn, coalesced to one pending run.',
    options: ['Reuse the understandingAgent gate and the exact same cadence.', 'A separate goalAgent capability (Advanced by default) so the two buttons can be shown independently.'],
    rec: 'Option 1 for the cadence; a separate goalAgent capability is cheap and keeps the UI-mode map honest, so Option 2 for the gate.' },
  { n: 'Q8', node: 'g-jobs', title: 'Clone the understanding module, or generalise it?',
    why: 'UnderstandingJobs, the controller, the trigger and the static-app server are all keyed on "understanding" by name (op, audit feature, folder, app id).',
    options: ['Clone: GoalJobs, GoalController, GoalApp, AutoGoalTrigger (fast, ~4 copies to keep in step).', 'Generalise: one jobs registry and one trigger keyed by kind, one static-app server taking a folder name; only the ask (prompt) and the endpoints differ.'],
    rec: 'Option 2 for the registry, the trigger and the static server; a separate small GoalAsk for the prompt. Probably one OpenSpec change "goal-app" that MODIFIES ask-for-understanding rather than a new capability from scratch.' },
  { n: 'Q9', node: 'g-folder', title: 'Self-development: is goal-app/ committed on birocode?',
    why: 'understanding-app/ is committed here and rewritten by every PR, which is why it conflicts constantly. A goal-app/ would add a second such folder.',
    options: ['Commit it like understanding-app/.', 'Gitignore goal-app/ on birocode (it is per-machine, per-agent state anyway).'],
    rec: 'Option 2, and worth considering the same for understanding-app/ separately.' },
];

// ---------- rendering ----------
const STYLE = [
  { selector: 'node', style: { label: (n) => n.data('label') + '\n' + (n.data('sub') || ''), 'text-wrap': 'wrap', 'text-max-width': 250, 'font-size': 14, 'font-weight': 700, color: css('--text'), 'text-valign': 'center', 'text-halign': 'center', shape: 'round-rectangle', width: 290, height: 96, 'background-color': css('--surface'), 'border-width': 2, 'border-color': css('--border') } },
  { selector: 'node.human', style: { 'border-color': css('--accent'), 'border-style': 'dotted', 'border-width': 3 } },
  { selector: 'node.code', style: { 'border-color': css('--muted') } },
  { selector: 'node.model', style: { 'border-color': css('--purple'), 'border-style': 'dashed', 'background-color': 'rgba(176,131,240,.16)', width: 330, height: 110 } },
  { selector: 'node.file', style: { shape: 'rectangle', 'border-color': css('--amber'), 'background-color': 'rgba(210,153,34,.10)' } },
  { selector: 'node.outside', style: { 'border-style': 'dotted', width: 330 } },
  { selector: 'node.reuse', style: { 'background-color': 'rgba(63,185,80,.14)', 'border-color': css('--green') } },
  { selector: 'node.clone', style: { 'background-color': 'rgba(210,153,34,.16)', 'border-color': css('--amber') } },
  { selector: 'node.new', style: { 'background-color': 'rgba(176,131,240,.22)', 'border-color': css('--purple'), 'border-width': 3 } },
  { selector: 'edge', style: { 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 1.3, width: 2, 'line-color': css('--muted'), 'target-arrow-color': css('--muted'), label: 'data(label)', 'font-size': 12, color: css('--text'), 'text-background-color': css('--bg'), 'text-background-opacity': .9, 'text-background-padding': 3, 'text-rotation': 'autorotate', 'text-wrap': 'wrap', 'text-max-width': 200 } },
  { selector: 'edge.model', style: { 'line-style': 'dashed', 'line-color': css('--purple'), 'target-arrow-color': css('--purple') } },
  { selector: 'edge.lit', style: { 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), width: 4, 'font-weight': 700, 'z-index': 9 } },
  { selector: 'node.lit', style: { 'border-width': 5, 'border-color': css('--accent') } },
  { selector: 'node:selected, edge:selected', style: { 'overlay-opacity': 0 } },
];

const cys = {};
let current = 'today';
function mount(level, nodes, edges) {
  const cy = window.cytoscape({ container: $('#cy-' + level), elements: [...nodes, ...edges], layout: { name: 'preset', fit: true, padding: 40 }, wheelSensitivity: 0.2, autounselectify: true, style: STYLE });
  cy.on('tap', 'node', (ev) => {
    const n = ev.target;
    const again = n.hasClass('lit');
    cy.elements().removeClass('lit');
    if (again) return;
    n.connectedEdges().addClass('lit'); n.addClass('lit');
    showDetail(n.data());
  });
  cy.on('tap', (ev) => { if (ev.target === cy) cy.elements().removeClass('lit'); });
  cys[level] = cy;
}
mount('today', TODAY, TODAY_E);
mount('goal', GOAL, GOAL_E);

function showDetail(d) {
  $('#d-title').textContent = d.label;
  const tag = $('#d-tag');
  tag.className = 'd-tag ' + (d.tag || '');
  tag.textContent = d.tag ? ({ reuse: 'reuse as is', clone: 'clone with a new name', new: 'genuinely new' })[d.tag] : (d.who === 'model' ? 'the model decides' : d.who === 'human' ? 'you / the Operator' : d.who === 'file' ? 'a folder at the repo root' : 'deterministic harness code');
  $('#d-body').textContent = d.detail;
  $('#d-file').textContent = d.file || '';
}

function show(level) {
  current = level;
  document.querySelectorAll('[data-tabs] .tab').forEach((t) => t.classList.toggle('is-on', t.dataset.level === level));
  document.querySelectorAll('[data-cy]').forEach((el) => el.classList.toggle('is-on', el.dataset.cy === level));
  if (cys[level]) { cys[level].resize(); cys[level].fit(undefined, 40); }
}
document.querySelectorAll('[data-tabs] .tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.level)));
$('#cy-fit').addEventListener('click', () => cys[current]?.fit(undefined, 40));
window.addEventListener('resize', () => cys[current]?.resize());

// Questions tab: an accordion; "show on the diagram" jumps to tab 1 and lights the node the question decides.
const qs = $('#qs');
for (const q of QUESTIONS) {
  const d = document.createElement('details'); d.className = 'q'; d.open = q.n === 'Q1';
  d.innerHTML = `<summary><span class="qn">${q.n}</span><span>${q.title}</span></summary><div class="body"><p class="why">${q.why}</p><ol>${q.options.map((o) => `<li>${o}</li>`).join('')}</ol><p class="rec"><b>My recommendation:</b> ${q.rec}</p><button type="button" class="jump" data-node="${q.node}">show on the diagram ↗</button></div>`;
  qs.appendChild(d);
}
qs.addEventListener('click', (ev) => {
  const b = ev.target.closest('.jump'); if (!b) return;
  show('goal');
  const cy = cys.goal; cy.elements().removeClass('lit');
  const n = cy.getElementById(b.dataset.node); n.addClass('lit'); n.connectedEdges().addClass('lit');
  cy.animate({ center: { eles: n }, zoom: 0.9 }, { duration: 300 });
  showDetail(n.data());
});
