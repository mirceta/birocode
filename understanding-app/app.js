// Goal-loop post-mortem explainer — 2026-07-27 test loop.
// Build-less, relative-URL, self-contained (docs/understanding-app-convention.md).

// ---------- tabs ----------
const tabs = document.getElementById('tabs');
tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
  document.querySelectorAll('main .tab').forEach((s) =>
    s.classList.toggle('active', s.id === 'tab-' + btn.dataset.tab));
});

// ---------- tab 1: the send timeline (from autopilot-audit.jsonl) ----------
// t = seconds after arming (armedAt 17:09:03 UTC).
const SENDS = [
  {
    n: 1, t: 5, session: 'watched', prompt: 'work prompt',
    believed: 'Fresh arm — pre-arm gate nulled the stale trailing reply ("Health is 200…" from the deploy turn), so send the work prompt. Correct behaviour.',
    truth: 'Landed in the conversation you watched. The agent replied "OK". ✔ This is real turn 1 of 2 you saw.',
    ok: true,
  },
  {
    n: 2, t: 16, session: 'watched', prompt: 'work prompt',
    believed: 'Trailing message is now "OK" — differs from what I sent against, so the agent replied. Ask again.',
    truth: 'Also landed in your watched conversation → second "OK". ✔ Real turn 2 of 2 you saw. But note the pace: 11 s after send #1.',
    ok: true,
  },
  {
    n: 3, t: 49, session: 'auto', prompt: 'VERIFY prompt (!)',
    believed: 'Trailing message contains "LOOP_DONE" → the goal is claimed done → send the verification prompt.',
    truth: 'The "reply" was the auto-understanding BACKGROUND JOB writing "…the \'reply OK until the 3rd ask, then LOOP_DONE\' mechanism" — it merely QUOTED the sentinel. Contains() matched it. The verify prompt then resumed the newest file: a fork, not your conversation.',
    ok: false,
  },
  {
    n: 4, t: 79, session: 'fork', prompt: 'work prompt',
    believed: 'Verification reply says "Not verified…" (no GOAL_VERIFIED) → gaps found → back to the work prompt.',
    truth: 'All of this happened in the fork session (60494991…). Your open page never saw it. The fork agent answered "OK — this is ask #2, not the 3rd."',
    ok: false,
  },
  {
    n: 5, t: 90, session: 'fork', prompt: 'work prompt',
    believed: 'New reply again → ask again. RecordSend → iteration 5/5 → CAP → resolve "capped before verification".',
    truth: 'Still the fork. Its agent eventually said "This is the 3rd time… LOOP_DONE" — but the loop was already capped. Net: 5 counted sends, 2 visible turns, 3 in sessions you never watched.',
    ok: false,
  },
];

const SESSION_LABEL = {
  watched: 'your watched conversation (194f3269…)',
  fork: 'fork session (60494991…)',
  auto: 'decided against the auto-understanding job (65192ef9…)',
};

const tl = document.getElementById('timeline');
const detail = document.getElementById('send-detail');
const MAXT = 95;
SENDS.forEach((s) => {
  const el = document.createElement('button');
  el.className = 'send s-' + s.session + (s.ok ? '' : ' bad');
  el.style.left = (s.t / MAXT) * 100 + '%';
  el.innerHTML = `<span class="n">${s.n}</span><span class="t">+${s.t}s</span>`;
  el.addEventListener('click', () => {
    tl.querySelectorAll('.send').forEach((x) => x.classList.remove('sel'));
    el.classList.add('sel');
    detail.innerHTML = `
      <h3>Send #${s.n} — ${s.prompt} <small>(+${s.t}s, ${SESSION_LABEL[s.session]})</small></h3>
      <p><b>Engine believed:</b> ${s.believed}</p>
      <p><b>Actually:</b> ${s.truth}</p>`;
  });
  tl.appendChild(el);
});
const axis = document.createElement('div');
axis.className = 'axis';
axis.innerHTML = '<span>arm</span><span>+30s</span><span>+60s</span><span>+90s</span>';
tl.appendChild(axis);

// ---------- tab 2: newest-file diagram ----------
document.getElementById('bug1-diagram').innerHTML = `
<div class="filebox">
  <div class="fbtitle">~/.claude/projects/&lt;repo&gt;/ — ONE shared folder, THREE writers</div>
  <div class="frow watched"><span class="fname">194f3269….jsonl</span><span class="fdesc">the conversation on your screen</span></div>
  <div class="frow fork"><span class="fname">60494991….jsonl</span><span class="fdesc">fork created by the loop's own --resume</span></div>
  <div class="frow auto"><span class="fname">65192ef9….jsonl</span><span class="fdesc">auto-understanding background job</span></div>
  <div class="fbfoot">Every 10 s the engine asks: <b>"whichever file was written last = the agent's reply."</b><br>
  Whoever wrote last — including the loop's own forks and unrelated jobs — becomes "the agent".</div>
</div>`;

// ---------- tab 3: attach-moment diagram ----------
document.getElementById('bug2-diagram').innerHTML = `
<div class="attach-grid">
  <div class="acard yes"><b>page load / refresh</b><span>reconcile() → attachToRun()</span></div>
  <div class="acard yes"><b>tab becomes visible</b><span>visibilitychange → reconcile()</span></div>
  <div class="acard yes"><b>you press Send</b><span>send() opens the stream itself</span></div>
  <div class="acard yes"><b>manual ↻ on a dock</b><span>refreshOne()</span></div>
  <div class="acard no"><b>autopilot starts a run<br>while you watch</b><span>— no signal. Nothing attaches. This is the whole bug.</span></div>
</div>`;
