/* dash view modes × zoom test — understanding app (vanilla JS, no deps) */
'use strict';

/* ---------- top tabs ---------- */
const tabs = document.querySelectorAll('.tab');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.toggle('is-active', v.id === `view-${tab.dataset.view}`);
    });
  });
});

/* ---------- timeline players (views 1 & 4) ---------- */
function wirePlayer(btnId, listId, verdictId) {
  const btn = document.getElementById(btnId);
  const items = Array.from(document.getElementById(listId).children);
  const verdict = document.getElementById(verdictId);
  let timer = null;
  btn.addEventListener('click', () => {
    clearTimeout(timer);
    btn.disabled = true;
    verdict.hidden = true;
    items.forEach((li) => li.classList.remove('is-lit'));
    let i = 0;
    (function step() {
      if (i >= items.length) {
        verdict.hidden = false;
        btn.disabled = false;
        btn.textContent = btn.textContent.replace('▶ Run', '↻ Replay');
        return;
      }
      items[i].classList.add('is-lit');
      i += 1;
      timer = setTimeout(step, 650);
    })();
  });
}
wirePlayer('run-fail', 'fail-timeline', 'fail-verdict');
wirePlayer('run-pass', 'pass-timeline', 'pass-verdict');

/* ---------- dashboard simulator (view 2) ---------- */
// Four mock agents; `hot` = "recently used by me" (matters only in hot view).
const AGENTS = [
  { name: 'birocode', hot: true },
  { name: 'homepage', hot: true },
  { name: 'invoices', hot: false },
  { name: 'scraper', hot: false },
];

const grid = document.getElementById('simgrid');
const counter = document.getElementById('apps-counter');
const caption = document.getElementById('sim-caption');
const segBtns = document.querySelectorAll('.seg__btn');

const CAPTIONS = {
  cards:
    "cards — every agent is a cheap status tile. No live Chat, no dock, zero .phone__apps anywhere. " +
    "This is what the headless test saw: its locator matched nothing, so the dock check failed with count=0.",
  phones:
    "phones — the wall of phones. Every agent renders its live Chat with the dock strip underneath: " +
    "one .phone__apps per agent, deterministically. This is why the test seeds this view.",
  hot:
    "hot — a mix. Agents recently used by me (amber dot) render as phones with docks; cold agents stay cards. " +
    "Docks exist here, but how many depends on recency state — not a stable test target.",
};

function renderCard(a) {
  return `
    <div class="atile atile--card">
      <div class="atile__head">
        <span class="atile__dot${a.hot ? ' is-hot' : ''}"></span>
        <span class="atile__name">${a.name}</span>
        <span class="atile__kind">card</span>
      </div>
      <div class="atile__body">
        <div class="statline">idle<s></s></div>
        <div class="statline">git ✓<s></s></div>
        <div class="statline">activity<s></s></div>
      </div>
    </div>`;
}

function renderPhone(a) {
  return `
    <div class="atile atile--phone">
      <div class="atile__head">
        <span class="atile__dot${a.hot ? ' is-hot' : ''}"></span>
        <span class="atile__name">${a.name}</span>
        <span class="atile__kind">phone</span>
      </div>
      <div class="atile__body">
        <div class="phonechat">
          <div class="bubble bubble--me">run the app</div>
          <div class="bubble">Started on :5200 — preview is live.</div>
        </div>
        <div class="phoneapps">
          <span class="phoneapps__chip">Product</span>
          <span class="phoneapps__chip">Und.</span>
          <span class="phoneapps__tag">.phone__apps</span>
        </div>
      </div>
    </div>`;
}

function renderSim(view) {
  const html = AGENTS.map((a) => {
    const asPhone = view === 'phones' || (view === 'hot' && a.hot);
    return asPhone ? renderPhone(a) : renderCard(a);
  }).join('');
  grid.innerHTML = html;
  const n = grid.querySelectorAll('.phoneapps').length;
  counter.textContent = `.phone__apps in DOM: ${n}`;
  counter.classList.toggle('is-zero', n === 0);
  counter.classList.toggle('is-some', n > 0);
  caption.textContent = CAPTIONS[view];
  segBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.simview === view));
}

segBtns.forEach((b) => b.addEventListener('click', () => renderSim(b.dataset.simview)));
renderSim('phones');

/* ---------- readView() sandbox (view 3) ---------- */
const input = document.getElementById('ls-input');
const result = document.getElementById('ls-result');
const lsCaption = document.getElementById('ls-caption');

// Mirrors Dashboard.jsx readView(): strict whitelist, everything else → 'cards'.
function readViewSim(v) {
  return v === 'phones' || v === 'hot' ? v : 'cards';
}

function updateSandbox() {
  const raw = input.value;
  const v = raw === '' ? null : raw; // empty input models an absent key
  const out = readViewSim(v);
  result.textContent = `'${out}'`;
  result.className = `trybadge ${out === 'cards' ? 'is-cards' : 'is-pass'}`;
  if (v === null) {
    lsCaption.textContent =
      "Key absent — exactly a fresh headless browser profile. getItem returns null, the whitelist rejects it, you get 'cards'.";
  } else if (out === 'cards') {
    lsCaption.textContent =
      `'${raw}' is not in the whitelist ('phones' | 'hot' — exact, case-sensitive), so it falls back to 'cards'. ` +
      'A typo in a test seed would fail the same silent way the missing key did.';
  } else if (out === 'phones') {
    lsCaption.textContent =
      "'phones' passes the whitelist — the wall of phones mounts and every agent gets a .phone__apps dock. This is the value the test seeds.";
  } else {
    lsCaption.textContent =
      "'hot' passes the whitelist — but only recently-used agents become phones, so dock count would depend on recency state.";
  }
}

input.addEventListener('input', updateSandbox);
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.fill;
    updateSandbox();
  });
});
updateSandbox();
