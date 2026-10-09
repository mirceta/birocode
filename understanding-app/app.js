// Understanding app — "Sofa view": one button on the phone remote that maximizes the dock's chat and,
// when a local app is pushed, splits the dock 30 / 70. Drawn, not screenshotted. Data inline.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ---- 1 · what I understood ---------------------------------------------------------------------
const MAP = [
  ['"when we click on a repo agent it goes to that harness window"', 'The remote\'s open-agent → the projector\'s dock for that repo (the Agent tab) — works today.', 'remoteDispatch.js · DockContext steerToAgent'],
  ['"the screen is a bit small for that"', 'The dock\'s TOP PART — name row, six lanes, app chips, Discover / Ask-for-understanding / Update-goal rows, Engine, git — takes the height; the chat gets the rest.', 'PinnedAgent.jsx (the dock)'],
  ['"the stretch button … next to the blue browser button and the tool calls button … makes the chat bigger and overlays it over the top part"', '⤢ Maximize chat to fill the dock: an ephemeral per-dock switch; on, the chat covers the dock\'s top part (class phone--chat-max), the button reads ⤡.', 'Chat.jsx toggleChatMaximized · PinnedAgent chatMaximized (openspec add-maximize-chat-dock)'],
  ['"if there is an active local app (pushed = we clicked the button) it should get shown in the agent dock"', 'The app chip row: clicking a chip opens that app\'s frame in the dock (openAppId). "Pushed" = that chip is on, for this dock — now or earlier at the desk; the dock remembers it per device.', 'PinnedAgent openAppId (openspec dock-multi-local-app, persist-dock-split-view)'],
  ['"then the split screen gets activated, chat 30 % / app 70 %"', 'Split view: the app BESIDE the chat instead of over it, with a draggable divider; the ratio is the chat\'s share of the width.', 'PinnedAgent splitApp + splitRatio (openspec dock-app-split-view, split-divider-drag)'],
  ['"a new button that will just do this mode"', 'One button on the phone remote — 🛋 Sofa view — that flips those switches on the dock the projector shows: ⤢ on; if an app is pushed, split on at 30 / 70. Again = back to normal.', 'NEW: a remote command + the button; nothing new is rendered'],
];
$('#map').innerHTML = '<tr><th>You said</th><th>What it is in the harness</th><th>Where</th></tr>' + MAP.map(([a, b, c]) => `<tr><td><i>${esc(a)}</i></td><td>${esc(b)}</td><td class="dim">${esc(c)}</td></tr>`).join('');

// ---- the drawings ------------------------------------------------------------------------------
const AGENTS = [
  { name: 'pers-dec', color: '#d29922' }, { name: 'living-room', color: '#3fb950' }, { name: 'Claude Web (this app)', color: '#5ea0ef' }, { name: 'prg', color: '#a371f7' },
];
// st: { agent, pushed (an app chip is on), sofa (the button is on), compose?, sent? }
function phoneHtml(st, { showNew = true, press = null } = {}) {
  const list = AGENTS.map((a) => `<div class="agent${st.agent === a.name ? ' is-on' : ''}" data-agent="${a.name}"><i style="background:${a.color}"></i><b>${esc(a.name)}</b></div>`).join('');
  const sofa = `<div class="phone__sofa${st.sofa ? ' is-on' : ''}${showNew && !st.sofa ? ' is-new' : ''}${press === 'sofa' ? ' is-press' : ''}" id="${st.agent ? 'sofaBtn' : 'sofaBtnOff'}">🛋 Sofa view${st.sofa ? ' · on' : ''}</div>`;
  const apps = st.agent ? `<div class="phone__label">Apps of ${esc(st.agent)} (optional — push from the phone)</div><div class="phone__apps"><span class="${st.pushed ? 'is-on' : ''}">homepage :28166</span><span>Understanding</span><span>Goal</span></div>` : '';
  const compose = st.agent ? `<div class="phone__compose">${st.compose ? esc(st.compose) : `Message ${esc(st.agent)}… (dictate, then Send)`}</div><div class="phone__send">${st.sent ? 'Sent — watch the projector' : 'Send'}</div>` : '<div class="phone__compose">tap an agent</div>';
  return `<div class="phone__hdr"><span>Harness · remote</span><i>📺 ${st.agent ? 'Agent · ' + esc(st.agent) : 'Kanban'}</i></div>${list}${st.agent ? sofa : ''}${apps}${compose}<div class="phone__ctl"><span>▲</span><span>▼</span><span>Latest</span><span>A±</span></div>`;
}
function dockHtml(st) {
  const split = st.sofa && st.pushed;
  const msgs = st.sent
    ? `<div class="bubble me">${esc(st.compose)}</div><div class="bubble tool">▸ Read src/orders/board.ts</div><div class="bubble">Adding the "Ordered" column rule now…</div>`
    : `<div class="bubble me">Alright great! Then update the marriage tab…</div><div class="bubble">Done. The Marriage tab now has two halves. <b>Bureaucracy</b> holds everything that was there before; <b>Actual wedding</b> is the new plan, four pages, every open point marked to decide.</div><div class="bubble tool">✓ done · 1m 42s</div>`;
  return `
    <div class="dock__top">
      <div class="dock__name"><i></i>${esc(st.agent || 'pers-dec')} <span class="dim" style="font-size:10px">C:\\Users\\admin\\Desktop\\playground\\${esc(st.agent || 'pers-dec')}</span><em>Done ★ ⤢</em></div>
      <div class="lanes"><span class="is-on">Builder</span><span>Ask</span><span>Files</span><span>Console</span><span>OpenSpec</span><span>Tools</span></div>
      <div class="chips"><span class="${st.pushed ? 'is-on' : ''}" id="chipApp">homepage :28166</span><span>Understanding</span><span>Goal</span><span>🛰 Discover local apps</span><span>Local apps</span></div>
      <div class="rows"><span>Ask for understanding · Auto</span><span>Update goal · Auto</span><span>Engine: claude · Claude capabilities &amp; switching</span><span>⎇ main · 0 ahead · 25 behind origin/main</span></div>
    </div>
    <div class="dock__chat">
      ${split ? '<span class="pct pct--chat">30 %</span>' : ''}
      <div class="dock__bar"><b>Your conversations</b><span>Fable 5.1 ▾</span><span class="tool" style="color:#2f80ed">🌐</span><span class="max${st.sofa ? ' is-on' : ''}" id="dockMaxBtn" title="Maximize chat to fill the dock">${st.sofa ? '⤡' : '⤢'}</span><span>Tool calls</span><span>Operator messages</span><span>↻</span><span>New</span></div>
      <div class="dock__msgs">${msgs}</div>
      <div class="dock__compose">+ ☑ ⚙ ⛶ <span>Type a message…</span><b>Send</b></div>
    </div>
    <div class="dock__app">
      <div class="dock__divider"></div><span class="pct">70 %</span>
      <div class="app__side"><b>📁 pers-dec<br><small style="color:#9aa3b2;font-weight:400">personal decisions</small></b><span class="is-on">📦 Orders</span><span>🎯 What I do</span><span>🏠 Home apartment</span><span>💑 Sevda &amp; me</span><span>💶 Finances</span></div>
      <div class="app__main"><h4>Orders</h4><p>Everything ordered or about to be ordered, as a board. served live · :28166</p>
        <div class="kb"><div><b>To order 1</b><div class="c">Ceiling mount BenQ CM00G3</div></div><div><b>Ordered 1</b><div class="c">Projector lamp 5J.J7L05.001</div></div><div><b>On the way 0</b></div><div><b>Arrived 0</b></div><div><b>Done</b><div class="c">Temu order of 4 Jun</div></div></div>
      </div>
    </div>`;
}
function paintDock(el, st) {
  el.innerHTML = dockHtml(st);
  el.classList.toggle('is-max', !!st.sofa);
  el.classList.toggle('is-split', !!(st.sofa && st.pushed));
}

// ---- 2 · live demo -----------------------------------------------------------------------------
const demo = { agent: 'pers-dec', pushed: true, sofa: false };
let lastChange = 'Nothing yet — press 🛋 Sofa view on the phone, or ⤢ on the dock.';
function renderDemo() {
  $('#phone').innerHTML = phoneHtml(demo);
  paintDock($('#dock'), demo);
  $('#pushed').checked = demo.pushed;
  const split = demo.sofa && demo.pushed;
  $('#state').textContent = `⤢ maximize: ${demo.sofa ? 'ON — the chat covers the dock\'s top part' : 'off'} · pushed app: ${demo.pushed ? 'homepage :28166' : 'none'} · split: ${split ? 'ON, chat 30 % / app 70 %' : 'off'}`;
  $('#changed').textContent = lastChange;
  $('#sofaBtn')?.addEventListener('click', () => toggleSofa('the phone\'s 🛋 Sofa view'));
  $('#dockMaxBtn')?.addEventListener('click', () => toggleSofa('⤢ on the dock itself (the same switch)'));
  $('#chipApp')?.addEventListener('click', () => { demo.pushed = !demo.pushed; lastChange = demo.pushed ? 'You pushed homepage on the dock — with Sofa view on, the dock splits at once.' : 'You un-pushed the app — Sofa view falls back to the maximized chat alone.'; renderDemo(); });
  $$('#phone .agent').forEach((a) => a.addEventListener('click', () => { demo.agent = a.dataset.agent; lastChange = `Opened ${demo.agent} — the dock arrives in its normal layout; Sofa view is per dock, so it is off here until you press it.`; demo.sofa = false; renderDemo(); }));
}
function toggleSofa(who) {
  demo.sofa = !demo.sofa;
  lastChange = demo.sofa
    ? `${who}: ⤢ on → the top part folds away, the chat takes the dock's height${demo.pushed ? '; homepage is pushed → split on, divider at 30 / 70' : '; no app is pushed → the chat alone, full width (push one and it splits)'}.`
    : `${who} again: ⤡ → the top part is back, split off, the dock as it was.`;
  renderDemo();
}
$('#pushed').addEventListener('change', (e) => { demo.pushed = e.target.checked; lastChange = demo.pushed ? 'An app is pushed on this dock.' : 'No app pushed on this dock.'; renderDemo(); });
$('#dockMax').addEventListener('click', () => toggleSofa('⤢ on the dock itself (the same switch)'));
$('#reset').addEventListener('click', () => { demo.sofa = false; demo.pushed = true; lastChange = 'Reset.'; renderDemo(); });
renderDemo();

// ---- 3 · visual user story ---------------------------------------------------------------------
const STORY = [
  { t: 'Tap the agent', st: { agent: 'pers-dec', pushed: true, sofa: false }, press: 'On the phone, tap pers-dec.', proj: 'The projector opens pers-dec\'s dock, as today — the top part, six lanes, chips, rows, then the chat. Readable from a desk, small from a sofa.' },
  { t: 'Is an app pushed?', st: { agent: 'pers-dec', pushed: true, sofa: false }, press: 'Nothing — look at the chip row. homepage :28166 is lit: you pushed it earlier at the desk (or you tap it on the phone\'s Apps row now).', proj: 'The dock shows which app is pushed; the frame itself is not open yet.' },
  { t: 'Tap 🛋 Sofa view', st: { agent: 'pers-dec', pushed: true, sofa: true }, press: 'The new button, right under the agent list.', proj: '⤢ flips on: the top part folds away, the chat takes the height. homepage is pushed, so split flips on at 30 / 70: the conversation left, the Orders board right, large.' },
  { t: 'Dictate and send', st: { agent: 'pers-dec', pushed: true, sofa: true, compose: 'Move the projector lamp to "On the way" — it shipped today.', sent: true }, press: 'Dictate with Wispr Flow, press Send.', proj: 'The reply streams in the left 30 %; the app on the right updates as the agent edits it — you watch the product, not the log.' },
  { t: 'A dock with no app', st: { agent: 'prg', pushed: false, sofa: true }, press: 'Tap prg, then 🛋 Sofa view.', proj: 'prg has no pushed app: Sofa view maximizes the chat alone, full width. Push an app later and it splits.' },
  { t: 'Back to normal', st: { agent: 'pers-dec', pushed: true, sofa: false }, press: 'Tap 🛋 Sofa view again (or ⤡ on the dock).', proj: 'The top part is back, split off — the dock as you had it. Sofa view is a per-dock switch, like ⤢ itself.' },
];
let si = 0, timer = null;
function renderStory() {
  const s = STORY[si];
  $('#steps').innerHTML = STORY.map((x, i) => `<span class="step${i === si ? ' is-on' : ''}${i < si ? ' is-done' : ''}" data-i="${i}">${i + 1}. ${esc(x.t)}</span>`).join('');
  $$('.step').forEach((b) => b.addEventListener('click', () => { si = Number(b.dataset.i); stop(); renderStory(); }));
  $('#sphone').innerHTML = phoneHtml(s.st, { showNew: si <= 2 });
  paintDock($('#sdock'), s.st);
  $('#s-press').textContent = s.press; $('#s-proj').textContent = s.proj;
  $('#prev').disabled = si === 0; $('#next').disabled = si === STORY.length - 1;
}
function stop() { if (timer) { clearInterval(timer); timer = null; $('#play').textContent = '▶ Play'; $('#play').classList.remove('is-on'); } }
$('#prev').addEventListener('click', () => { si = Math.max(0, si - 1); stop(); renderStory(); });
$('#next').addEventListener('click', () => { si = Math.min(STORY.length - 1, si + 1); stop(); renderStory(); });
$('#play').addEventListener('click', () => { if (timer) return stop(); $('#play').textContent = '⏸ Pause'; $('#play').classList.add('is-on'); timer = setInterval(() => { si = (si + 1) % STORY.length; renderStory(); $('#play').textContent = '⏸ Pause'; $('#play').classList.add('is-on'); }, 3200); });
renderStory();

// ---- 4 · how it would be built -----------------------------------------------------------------
const BUILD = [
  ['The button', 'On /remote, under the agent list: 🛋 Sofa view (toggle, shows on/off from the projector\'s heartbeat). Posts one command to the big screen.'],
  ['The command', 'layout { mode: "sofa" | "normal" } — a seventh type in the dispatch table beside open-agent, open-view, scroll, zoom, lane, stop. Known to the server\'s allow-list; reaches the listening tab (poll) or the hook (window.claudewebRemote).'],
  ['The dock\'s side', 'The dispatcher raises a DOM event, like lane does; the shown dock (PinnedAgent) applies: setChatMaximized(true); if an app is open on it → setSplitApp(true), setSplitRatio(30). "normal" → setChatMaximized(false), setSplitApp(false). Nothing new rendered; the dock\'s own ⤢ / split / divider code runs.'],
  ['Which app is "pushed"', 'The dock\'s openAppId — the chip that is on for this dock, remembered per device. Optional extra: the phone\'s Apps row lists the repo\'s local apps so you can push one from the sofa (a push-app command).'],
  ['What the projector reports', 'The heartbeat gains layout: "sofa" | "normal", so the phone\'s button shows the real state and "Projector is showing: pers-dec · sofa view".'],
  ['Tests', 'Dispatcher: the layout command raises the event with the mode; PinnedAgent helper (pure): sofa → {maximize:true, split: hasApp, ratio:30}; end-to-end: tap 🛋 on the phone → the projector\'s dock has phone--chat-max and phone__screen--split with the chat pane at 30 %.'],
];
$('#build').innerHTML = `<div class="kv">${BUILD.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>`;
const RECONCILE = [
  { h: 'A · Keep #165 as is + add the button', v: 'opening an agent auto-splits with the FIRST app at 30 / 70; the button adds ⤢ and uses the pushed app', rec: false, why: 'Two overlapping behaviours; opening would already change the layout before you ask.' },
  { h: 'B · Replace #165 with the button', v: 'opening an agent leaves the dock as it was; 🛋 Sofa view does ⤢ + split (pushed app) 30 / 70; off restores', rec: true, why: 'One explicit switch, exactly your words today. #165 becomes this change (it is not merged yet).' },
  { h: 'C · Button + remembered per dock', v: 'as B, and the projector remembers Sofa view per dock, so re-opening pers-dec lands in sofa view without pressing again', rec: false, why: 'Nice later; adds state to get right. Easy to add on top of B if you want it.' },
];
$('#reconcile').innerHTML = `<div class="opts">${RECONCILE.map((o) => `<div class="opt${o.rec ? ' is-rec' : ''}"><h3>${esc(o.h)}</h3><div class="verdict">${o.rec ? 'recommended' : 'possible'}</div><p>${esc(o.v)}</p><p class="dim">${esc(o.why)}</p></div>`).join('')}</div>`;

// ---- 5 · questions -----------------------------------------------------------------------------
const QS = [
  ['Is "stretch" the ⤢ button in the chat toolbar — the one between 🌐 and Tool calls that reads ⤡ when on?', 'The dock also has a ⤢ in its name row (top right) that opens the agent full screen; I read you as meaning the chat toolbar one.', 'the chat toolbar ⤢ (maximize chat to fill the dock).'],
  ['When nothing is pushed on that dock, what should the button do?', 'Maximize the chat alone — or also push the first app so there is always a split?', 'maximize the chat alone; the app row on the phone lets you push one when you want it.'],
  ['Should the button toggle back?', 'A second tap restores the dock (top part back, split off) — or is it one-way and you restore with the mouse?', 'toggle; and ⤡ on the dock itself also turns it off.'],
  ['Is 30 / 70 fixed, or the divider still yours?', 'The button sets 30 / 70; after that you may still drag the divider — the next 🛋 resets it to 30 / 70.', 'set 30 / 70 each time the button turns it on; the divider stays draggable.'],
  ['What about #165 (the automatic 30 / 70 when an agent is opened)?', 'Keep it beside the button (A), replace it with the button (B), or button + remembered per dock (C) — see tab 4.', 'B — replace; one explicit switch.'],
  ['Push an app from the phone too?', 'An Apps row on the remote (the repo\'s local apps as chips) so you can push one from the sofa without the mouse.', 'yes, small and useful; say no if you want the button only.'],
];
$('#qs').innerHTML = QS.map(([q, w, g]) => `<div class="q"><b>${esc(q)}</b><span>${esc(w)}</span><em>${esc(g)}</em></div>`).join('');
