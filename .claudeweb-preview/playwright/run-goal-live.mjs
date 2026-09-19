// openspec goal-app — the REAL thing, end to end, on an isolated harness pointed at this
// repo: three real chat turns on the self repo's builder lane and three real "Update goal"
// subagent runs (paid turns, on purpose). Proves the three rules the prompt states:
//   1. a goal stated in chat (GOAL: marker) lands in goal-app/goal.json + index.html;
//   2. a redirect replaces the goal and keeps the old one in history;
//   3. a turn that says nothing about the goal leaves goal-app/ byte-identical.
// Plain node (fetch), no browser. Prints a JSON report; exit 0 only if all three hold.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = process.env.PORT || '5232';
const BASE = `http://127.0.0.1:${PORT}`;
const PW = process.env.PW || 'changeme';
const r = {};
let pass = true;
const expect = (k, got, ok) => { r[k] = `${ok ? 'PASS' : 'FAIL'} (${got})`; if (!ok) pass = false; console.log(`${ok ? '✔' : '✘'} ${k}: ${got}`); };

let cookie = '';
async function call(method, url, { body, headers = {}, raw = false } = {}) {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'content-type': 'application/json', cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  if (raw) return res;
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, text }; }
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// One real chat turn on the builder lane; returns { sessionId, text, status } after the SSE ends.
async function chatTurn(repoId, message, sessionId) {
  const res = await call('POST', '/api/chat', { body: { message, sessionId: sessionId || null, lane: 'builder' }, headers: { 'X-Repo-Id': repoId }, raw: true });
  if (res.status !== 200) return { status: res.status, error: await res.text() };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', text = '', sid = sessionId || null, status = 'unknown';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let e; try { e = JSON.parse(line.slice(6)); } catch { continue; }
        const s = e.sessionId || e.session_id || e.session; if (typeof s === 'string' && s.length > 8) sid = s;
        if (e.type === 'token' && e.text) text += e.text;
        if (e.type === 'done') status = 'done';
        if (e.type === 'error') { status = 'error'; text += `\n[error] ${e.message || ''}`; }
      }
    }
  }
  if (!sid) {
    // The stream carries the session id on its done record; if it did not, the
    // newest transcript on disk for this repo is this turn's.
    const s = await call('GET', '/api/sessions', { headers: { 'X-Repo-Id': repoId } });
    const list = Array.isArray(s.json) ? s.json : s.json?.sessions || [];
    sid = list[0]?.id || list[0]?.sessionId || null;
  }
  return { sessionId: sid, text: text.trim(), status };
}

async function goalRun(repoId, sessionId) {
  const start = await call('POST', '/api/goal/ask', { body: { sessionId }, headers: { 'X-Repo-Id': repoId } });
  if (start.status !== 200) return { status: 'http-' + start.status, error: JSON.stringify(start.json || start.text) };
  const t0 = Date.now();
  for (;;) {
    await sleep(5000);
    const st = await call('GET', '/api/goal/status', { headers: { 'X-Repo-Id': repoId } });
    if (st.json?.status !== 'running') return { ...st.json, seconds: Math.round((Date.now() - t0) / 1000) };
    if (Date.now() - t0 > 15 * 60_000) return { status: 'timeout' };
  }
}

const hashDir = (dir) => {
  if (!fs.existsSync(dir)) return 'absent';
  const h = crypto.createHash('sha256');
  const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); } } };
  walk(dir); return h.digest('hex').slice(0, 16);
};
const readGoal = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'goal.json'), 'utf8')); } catch { return null; } };

try {
  await call('POST', '/api/auth/login', { body: { password: PW } });
  const repos = (await call('GET', '/api/repos')).json;
  const list = Array.isArray(repos) ? repos : repos?.repos || [];
  const self = list.find((x) => x.isSelf) || list[0];
  const dir = path.join(self.path, 'goal-app');
  const H = { 'X-Repo-Id': self.id };
  r.repo = `${self.name} (${self.path})`;
  if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); }
  expect('setup.noGoalAppYet', hashDir(dir), hashDir(dir) === 'absent');

  // ---- 1. state a goal in chat, run Update goal ----
  const t1 = await chatTurn(self.id, 'GOAL: Build a per-repo-agent Goal app in this harness — a 🎯 Update goal button and an Auto box next to Ask for understanding that keep goal-app/ current from what this chat says. Acknowledge in ONE line. Do not read, create or modify any file.');
  r.turn1 = { status: t1.status, sessionId: t1.sessionId, reply: (t1.text || t1.error || '').slice(0, 300) };
  expect('turn1.doneWithSession', `${t1.status} ${t1.sessionId}`, t1.status === 'done' && !!t1.sessionId);
  const g1 = await goalRun(self.id, t1.sessionId);
  r.goalRun1 = g1;
  expect('goalRun1.done', `${g1.status} in ${g1.seconds}s ${g1.error || ''}`, g1.status === 'done');
  const goal1 = readGoal(dir);
  r.goal1 = goal1;
  expect('goal1.jsonWritten', JSON.stringify(goal1 && { text: goal1.text?.slice(0, 120), setBy: goal1.setBy, history: goal1.history?.length }), !!goal1?.text && typeof goal1.updatedAt === 'string');
  expect('goal1.setByOperator', goal1?.setBy, goal1?.setBy === 'operator');
  expect('goal1.textMentionsGoalApp', (goal1?.text || '').slice(0, 80), /goal app|goal-app|update goal/i.test(goal1?.text || ''));
  expect('goal1.indexHtml', fs.existsSync(path.join(dir, 'index.html')), fs.existsSync(path.join(dir, 'index.html')));
  const html1 = fs.existsSync(path.join(dir, 'index.html')) ? fs.readFileSync(path.join(dir, 'index.html'), 'utf8') : '';
  expect('goal1.relativeUrlsOnly', 'no src/href="/…"', !/(src|href)=["']\/(?!\/)/.test(html1));
  const slot = await call('GET', `/api/localview/${self.id}/app/goal/`);
  expect('goal1.slotServesApp', `${slot.status} ${(slot.text || '').length} chars`, slot.status === 200 && !/No Goal app here yet/.test(slot.text || ''));
  const events = (await call('GET', `/api/repos/${self.id}/events`)).json;
  const ev = (Array.isArray(events) ? events : events?.events || []).filter((e) => e.op === 'goal');
  r.goalEvents = ev.map((e) => `${e.phase}: ${e.detail}`);
  expect('goal1.consoleEvents', ev.map((e) => e.phase).join(','), ev.some((e) => e.phase === 'started') && ev.some((e) => e.phase === 'done'));
  const audit = (await call('GET', '/api/agentic-audit?feature=update-goal')).json;
  expect('goal1.audited', JSON.stringify(audit?.calls?.[0] && { outcome: audit.calls[0].outcome, actor: audit.calls[0].actor }), audit?.calls?.[0]?.outcome === 'done');

  // ---- 2. redirect the goal, run again: new text, old one in history ----
  const t2 = await chatTurn(self.id, 'Change of plan: the goal is now to make each agent\'s goal readable by the arch too — list_agents and the Fleet Status detail should show the current goal from goal-app/goal.json. Acknowledge in ONE line. Do not read, create or modify any file.', t1.sessionId);
  r.turn2 = { status: t2.status, reply: (t2.text || t2.error || '').slice(0, 300) };
  expect('turn2.done', t2.status, t2.status === 'done');
  const g2 = await goalRun(self.id, t2.sessionId || t1.sessionId);
  r.goalRun2 = g2;
  expect('goalRun2.done', `${g2.status} in ${g2.seconds}s ${g2.error || ''}`, g2.status === 'done');
  const goal2 = readGoal(dir);
  r.goal2 = goal2 && { text: goal2.text, setBy: goal2.setBy, history: (goal2.history || []).map((h) => h.text?.slice(0, 80)) };
  expect('goal2.textChanged', (goal2?.text || '').slice(0, 80), !!goal2?.text && goal2.text !== goal1?.text && /arch|list_agents|fleet/i.test(goal2.text));
  expect('goal2.historyKeepsGoal1', `${goal2?.history?.length} entries`, Array.isArray(goal2?.history) && goal2.history.length >= 1 && goal2.history.some((h) => h.text === goal1?.text));

  // ---- 3. an unrelated turn, run again: GOAL UNCHANGED, folder byte-identical ----
  const before = hashDir(dir);
  const t3 = await chatTurn(self.id, 'Unrelated question, nothing to do with our goal: what is 2 + 2? Answer in ONE line. Do not read, create or modify any file.', t2.sessionId || t1.sessionId);
  r.turn3 = { status: t3.status, reply: (t3.text || t3.error || '').slice(0, 200) };
  expect('turn3.done', t3.status, t3.status === 'done');
  const g3 = await goalRun(self.id, t3.sessionId || t2.sessionId || t1.sessionId);
  r.goalRun3 = g3;
  expect('goalRun3.done', `${g3.status} in ${g3.seconds}s ${g3.error || ''}`, g3.status === 'done');
  const after = hashDir(dir);
  expect('goal3.folderUntouched', `${before} -> ${after}`, before === after);
} catch (e) {
  r.error = String(e?.stack || e);
  pass = false;
}

console.log('REPORT ' + JSON.stringify(r, null, 2));
console.log(pass ? 'ALL PASS' : 'SOME FAILED');
process.exit(pass ? 0 : 1);
