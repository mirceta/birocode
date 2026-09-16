// Understanding app — the Goal app per repo agent (fleet task f7224e55). No deps, relative URLs only.
(function () {
  // Tabs
  var tabs = document.querySelectorAll('.tab');
  var views = document.querySelectorAll('.view');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.toggle('is-on', x === t); });
      views.forEach(function (v) { v.classList.toggle('is-on', v.dataset.view === t.dataset.view); });
    });
  });

  // The chain, animated: a manual press lights the button chain; an automatic run lights
  // the Auto chain first and then joins the button chain at the jobs registry.
  function walk(steps, done) {
    var i = 0;
    steps.forEach(function (s) { s.classList.remove('is-hot'); });
    var id = setInterval(function () {
      steps.forEach(function (s, k) { s.classList.toggle('is-hot', k === i); });
      i++;
      if (i >= steps.length) { clearInterval(id); setTimeout(function () { steps.forEach(function (s) { s.classList.remove('is-hot'); }); if (done) done(); }, 700); }
    }, 650);
  }
  var chain = Array.prototype.slice.call(document.querySelectorAll('#chain .step'));
  var auto = Array.prototype.slice.call(document.querySelectorAll('#auto .step'));
  document.getElementById('play').addEventListener('click', function () { walk(chain); });
  document.getElementById('playauto').addEventListener('click', function () { walk(auto, function () { walk(chain.slice(2)); }); });

  // A goal's life: who moves each state, what the app shows.
  var DETAIL = {
    none: '<b>no goal</b> — nobody has stated one in this agent\'s chat. The Goal app is an explicit empty state (no fallback, like the Understanding app). "Update goal" on this state answers "no goal found in the conversation" unless the transcript contains one.',
    set: '<b>goal set</b> — moved by the Operator\'s words in the chat ("we want to create a goal …", "the goal here is …", "done looks like …"). Recorded by the next Update-goal run (manual press or Auto after that turn) — or, if we give repo agents a <code>set_goal</code> harness tool, by the agent itself at once (Q3). The app shows the goal + acceptance + "set N min ago from turn #k".',
    revised: '<b>revised</b> — a later turn changed the scope. The run rewrites the current goal and appends a revision {when, turn, what changed, why}; the app shows the current goal and a timeline (Q2: history yes/no).',
    unchanged: '<b>unchanged</b> — the common case: most turns are work, not goal talk. The run must say so cheaply and touch nothing; the Console shows "goal unchanged". With Auto on, this is what most of the paid runs will conclude (Q5: a cheaper pre-check?).',
    done: '<b>reached / retired</b> — the Operator says it is done, or a new unrelated goal is stated. The old goal moves to history; the app starts fresh. Or: one goal per agent, overwritten, no history (Q2).',
  };
  var states = document.querySelectorAll('#states .state');
  var detail = document.getElementById('statedetail');
  states.forEach(function (s) {
    s.addEventListener('click', function () {
      states.forEach(function (x) { x.classList.toggle('is-on', x === s); });
      detail.innerHTML = DETAIL[s.dataset.s];
    });
  });
  states[1].click();

  // The open questions: question, options, recommendation. Ticks are visual only.
  var QS = [
    { id: 'Q1', q: 'Where does the goal TEXT live?', opts: [
      'A · in the repo: goal-app/goal.json (+ the visualisation goal-app/index.html) — versioned with the code, readable by the agent, served by the harness like understanding-app/',
      'B · server-side per repo (RepositoryConfig.Goal, next to AutoUnderstanding) — survives a clean checkout, invisible to the agent unless injected into every prompt',
      'C · on the fleet board (the card\'s note / a card field) — one goal per card, not per agent',
    ], rec: 'A. It mirrors the understanding app exactly (the artefact lives in the repo, the harness only serves it) and the subagent can read the previous goal from disk. B only if you want the goal to outlive a re-clone.' },
    { id: 'Q2', q: 'One goal per agent, or a history of revisions?', opts: [
      'A · exactly one current goal, overwritten on every change (simplest; the app shows only "now")',
      'B · one current goal + an append-only list of revisions (what changed, why, which turn) — the app shows a timeline',
      'C · several concurrent goals per agent (a list), each with its own state',
    ], rec: 'B. Cheap to keep (an array in goal.json), and "how did we get here" is exactly what the Operator asks when a goal drifts. C sounds like the board\'s job, not the agent\'s.' },
    { id: 'Q3', q: 'How is "set a goal from chat" detected?', opts: [
      'A · only by the Update-goal subagent (LLM) reading the conversation — no special syntax; set on the next manual press or Auto run',
      'B · a literal trigger phrase matched by the harness ("we want to create a goal …") that sets the text at once, before any subagent',
      'C · a harness tool on the repo-agent MCP server from PR #115 (set_goal / my_goal): the agent records the goal the moment the Operator states it, and Update goal only refreshes the visualisation',
    ], rec: 'A as the base (it is what "reads the conversation and figures out" means) + C as the precise path once PR #115 lands: the same server the effort tools live on, no second tool server. B is brittle (phrasing, languages) — avoid.' },
    { id: 'Q4', q: 'What does "Update goal" do when nothing changed?', opts: [
      'A · rebuilds the visualisation anyway (like understanding, which always rebuilds)',
      'B · answers "no change", writes nothing, the Console says "goal unchanged" (the run still costs a turn)',
      'C · B, plus the app itself shows "last checked N min ago · unchanged"',
    ], rec: 'C. A goal is stable most of the time; rewriting the app every turn would churn the repo. The "last checked" stamp is what makes an unchanged goal trustworthy.' },
    { id: 'Q5', q: 'Auto cadence and cost — two paid runs per turn when both Autos are on?', opts: [
      'A · yes: the goal Auto is an independent flag with the identical post-turn hook; the Operator decides per repo',
      'B · a cheaper first pass: a read-only helper run answers SET / REVISED / UNCHANGED, and only SET / REVISED starts the building run',
      'C · gate the goal Auto on the understanding run: run the goal check only after the understanding run of the same turn (sequential, one at a time)',
    ], rec: 'A now, B as the first optimisation if the Console shows mostly "unchanged". C couples two features that should stay independent.' },
    { id: 'Q6', q: 'How does the per-agent goal compose with the board goal and the arch goals?', opts: [
      'A · independent: per-agent goal = "what we are building in this repo right now"; board goal = the fleet\'s reference; arch goal conversations = the arch\'s timers — three different things, no wiring',
      'B · seeded: when the arch dispatches a card to this agent, the card\'s title + note become the initial goal (until the Operator states another)',
      'C · exposed: the arch and the policeman can read each agent\'s current goal (list_agents / fleet status) and compare it with the card the agent is a leg of',
    ], rec: 'A for this change; C is the natural follow-up (my_effort from PR #115 already lists the cards, so the Goal app can link them today). B is worth a decision: it makes every dispatched agent start with a goal, but the Operator said the goal is set FROM CHAT.' },
    { id: 'Q7', q: 'Where is the Goal app served?', opts: [
      'A · a second synthetic harness app "goal" on every repo (goal-app/ at the repo root, /api/localview/{repo}/app/goal/) — a sibling of Understanding in the Local tab',
      'B · a tab inside the Understanding app (one folder, the understanding subagent must not overwrite the goal part)',
      'C · a panel in the dock above the chat (like the restatement "understanding panel"), reading goal.json through the API',
    ], rec: 'A. Same mechanism (HarnessStaticApp), separate folder so the two subagents never overwrite each other. C could be added later as a one-line summary above the chat.' },
    { id: 'Q8', q: 'Same infrastructure: parameterise the existing classes by kind, or copy them?', opts: [
      'A · parameterise: CompanionJobs / CompanionAsk / AutoCompanionTrigger with kind ∈ {understanding, goal} — the understanding feature keeps its behaviour, its internals move',
      'B · copy: GoalJobs, GoalAsk, AutoGoalTrigger, GoalController — zero risk to understanding, twice the code',
    ], rec: 'A. The Operator said "same infrastructure — reuse, don\'t reinvent"; the existing tests pin the understanding behaviour so the refactor is safe, and a third kind later is free.' },
    { id: 'Q9', q: 'Should the current goal be visible in the chat itself?', opts: [
      'A · no — the Goal app in the Local tab is the surface',
      'B · yes — one line above the chat ("🎯 goal: …", from goal.json) so the Operator sees it while typing',
      'C · yes, and the goal line is editable there (sets the goal without a subagent)',
    ], rec: 'B later, not in the first slice; C blurs "set from chat" with a form.' },
    { id: 'Q10', q: 'Which turns count for Auto?', opts: [
      'A · exactly the understanding rule: builder lane, status done, session id present, flag on; ask-lane turns never',
      'B · also the ask lane (a goal is often discussed in Ask)',
    ], rec: 'A, to stay a true mirror; revisit if goals keep being stated in Ask.' },
  ];
  var qs = document.getElementById('qs');
  QS.forEach(function (q) {
    var el = document.createElement('div'); el.className = 'q'; el.id = q.id;
    el.innerHTML = '<h4>' + q.id + ' · ' + q.q + '</h4>' + q.opts.map(function (o, i) {
      return '<label class="opt"><input type="radio" name="' + q.id + '" value="' + i + '"><span>' + o + '</span></label>';
    }).join('') + '<div class="rec">Recommendation: <b>' + q.rec + '</b></div>';
    el.addEventListener('change', function () { el.classList.add('is-answered'); });
    qs.appendChild(el);
  });
})();
