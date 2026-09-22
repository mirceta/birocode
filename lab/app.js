/* Agentic Engineering Lab — build-less SPA (plans/agentic-lab.md).
   Dependency-free: data from ./data/*, a tiny Markdown renderer, hash routing.
   Relative URLs only (it serves under /api/localview/<repo>/app/lab/). */

const KINDS = [
  { key: "learned", label: "Learned", icon: "📘", blurb: "Settled lessons." },
  { key: "found",   label: "Found",   icon: "🔍", blurb: "Observations not yet generalized." },
  { key: "testing", label: "Testing", icon: "🧪", blurb: "Patterns &amp; principles in flight." },
  { key: "good",    label: "Good",    icon: "✅", blurb: "Ideas worth keeping." },
  { key: "bad",     label: "Bad",     icon: "⛔", blurb: "Anti-patterns; things that didn't work." },
];

// Research studies (fleet task aae448bd): a ★-rated comparison each, data in
// ./data/research/<id>.json, rendered by renderResearch(). Listed here so the nav
// can show them without a directory listing (the harness serves files, not folders).
const RESEARCH = [
  { id: "fleet-vs-worktrees", icon: "🖥️", label: "Fleet vs worktrees" },
];

const state = { entries: [], patterns: [], methodology: "", research: {}, preset: "fleet", pick: null, route: "learned" };

/* ---------- tiny markdown renderer ---------- */
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s) {
  // order matters: code first so its contents aren't further parsed
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}
function markdown(src) {
  const lines = (src || "").replace(/\r\n/g, "\n").split("\n");
  let html = "", i = 0;
  while (i < lines.length) {
    let line = lines[i];

    if (/^```/.test(line)) {              // fenced code block
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html += `<pre><code>${esc(buf.join("\n"))}</code></pre>`;
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }            // blank
    if (/^---+\s*$/.test(line)) { html += "<hr>"; i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const n = h[1].length; html += `<h${n}>${inline(h[2])}</h${n}>`; i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {        // unordered list
      html += "<ul>";
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`;
        i++;
      }
      html += "</ul>";
      continue;
    }

    const para = [line];                   // paragraph (gather until blank)
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,4}\s|```|\s*[-*]\s|---+\s*$)/.test(lines[i]))
      para.push(lines[i++]);
    html += `<p>${inline(para.join(" "))}</p>`;
  }
  return html;
}

/* ---------- data ---------- */
async function loadJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}
async function loadText(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.text();
}

/* ---------- rendering ---------- */
function countFor(kind) { return state.entries.filter(e => e.kind === kind).length; }

function renderNav() {
  const nav = document.getElementById("nav");
  let html = `<div class="nav__group">Notebook</div>`;
  for (const k of KINDS) {
    html += `<button data-route="${k.key}" class="${state.route === k.key ? "active" : ""}">
      <span class="dot k-${k.key}" style="background:currentColor"></span>
      <span>${k.icon} ${k.label}</span>
      <span class="count">${countFor(k.key)}</span>
    </button>`;
  }
  html += `<div class="nav__group">Method &amp; catalogue</div>`;
  html += `<button data-route="methodology" class="${state.route === "methodology" ? "active" : ""}">
    <span class="dot" style="background:var(--muted)"></span><span>🧭 How I test</span></button>`;
  html += `<button data-route="repository" class="${state.route === "repository" ? "active" : ""}">
    <span class="dot" style="background:var(--accent)"></span><span>📚 Repository</span>
    <span class="count">${state.patterns.length}</span></button>`;
  html += `<div class="nav__group">Research</div>`;
  for (const s of RESEARCH) {
    html += `<button data-route="${s.id}" class="${state.route === s.id ? "active" : ""}">
      <span class="dot" style="background:var(--testing)"></span><span>${s.icon} ${s.label}</span></button>`;
  }
  nav.innerHTML = html;
  nav.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => { location.hash = b.dataset.route; }));

  document.getElementById("totals").textContent =
    `${state.entries.length} entries · ${state.patterns.length} patterns`;
}

function entryCard(e) {
  const tags = (e.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
  const links = (e.links || []).map(l =>
    `<a href="${esc(l.href)}" target="_blank" rel="noopener">↗ ${esc(l.label)}</a>`).join("");
  return `<article class="card b-${e.kind}">
    <div class="card__top">
      <span class="card__kind k-${e.kind}">${esc(e.kind)}</span>
      <h2>${esc(e.title)}</h2>
      <span class="card__date">${esc(e.created || "")}</span>
    </div>
    <div class="card__body">${markdown(e.body)}</div>
    ${tags ? `<div class="tags">${tags}</div>` : ""}
    ${links ? `<div class="card__links">${links}</div>` : ""}
  </article>`;
}

function patternCard(p) {
  const ev = (p.evidence || []).map(x => `<li>${inline(x)}</li>`).join("");
  const rel = (p.related || []).map(r => `<span class="tag">${esc(r)}</span>`).join("");
  return `<article class="pattern">
    <div class="pattern__top">
      <h2>${esc(p.name)}</h2>
      <span class="status s-${p.status}">${esc(p.status)}</span>
    </div>
    <p class="pattern__summary">${inline(p.summary)}</p>
    ${ev ? `<div class="pattern__label">Evidence</div><ul>${ev}</ul>` : ""}
    ${rel ? `<div class="pattern__label">Related</div><div class="related">${rel}</div>` : ""}
  </article>`;
}

/* ---------- research: a ★-rated comparison (fleet task aae448bd) ---------- */
function stars(n) { let s = ""; for (let i = 1; i <= 5; i++) s += i <= n ? "★" : "☆"; return s; }

function weightedTotals(study, preset) {
  const out = {}; let wsum = 0;
  for (const a of study.approaches) out[a.key] = 0;
  for (const d of study.dimensions) {
    const w = d.w[preset]; wsum += w;
    for (const a of study.approaches) out[a.key] += d.r[a.key][0] * w;
  }
  for (const a of study.approaches) out[a.key] = out[a.key] / wsum;
  return out;
}

function renderResearch(study) {
  const preset = state.preset, pick = state.pick;
  const t = weightedTotals(study, preset);
  let best = null;
  for (const a of study.approaches) if (best === null || t[a.key] > t[best]) best = a.key;
  const presetInfo = study.presets.find(p => p.key === preset);
  const col = (key, cls = "") => `class="${cls}${pick ? (pick === key ? " is-pick" : " is-dim") : ""}"`;

  const cards = study.approaches.map(a => `
    <button type="button" class="rs-card${a.ours ? " is-ours" : ""}${pick === a.key ? " is-pick" : ""}" data-approach="${a.key}">
      <div class="rs-card__head"><span class="rs-card__glyph">${a.glyph}</span><span class="rs-card__name">${esc(a.name)}</span>${a.ours ? '<span class="rs-ours">ours</span>' : ""}</div>
      <div class="rs-card__sub">${esc(a.sub)}</div>
      <div class="rs-card__total${best === a.key ? " is-best" : ""}" data-total="${a.key}">${t[a.key].toFixed(1)} ★ weighted</div>
    </button>`).join("");

  const presets = study.presets.map(p => `
    <button type="button" class="rs-preset${p.key === preset ? " on" : ""}" data-preset="${p.key}" title="${esc(p.sub)}">${p.label}</button>`).join("");

  const head = study.approaches.map(a => `<th ${col(a.key, "rs-th" + (a.ours ? " is-ours" : ""))}>${a.glyph}<br>${esc(a.name)}</th>`).join("");
  const rows = study.dimensions.map(d => {
    const w = d.w[preset];
    const cells = study.approaches.map(a => {
      const [n, why] = d.r[a.key];
      return `<td ${col(a.key, "rs-td rs-td--" + n)} data-stars="${n}" title="${esc(why)}"><span class="rs-stars" aria-label="${n} of 5">${stars(n)}</span><span class="rs-why">${esc(why)}</span></td>`;
    }).join("");
    return `<tr class="rs-row" data-dim="${d.key}"><td class="rs-td--name"><div>${esc(d.name)}</div><div class="rs-dimwhy">${esc(d.why)}</div></td><td class="rs-td--w rs-w--${w}">×${w}</td>${cells}</tr>`;
  }).join("");
  const totalsRow = `<tr class="rs-row rs-row--total"><td class="rs-td--name">Weighted average</td><td class="rs-td--w">★ / 5</td>` +
    study.approaches.map(a => `<td ${col(a.key, "rs-td rs-td--total" + (best === a.key ? " is-best" : ""))} data-total-cell="${a.key}">${t[a.key].toFixed(1)} ★</td>`).join("") + `</tr>`;

  const pc = study.approaches.map(a => `
    <article class="rs-pc${a.ours ? " is-ours" : ""}" data-approach="${a.key}">
      <div class="rs-pc__head">${a.glyph} <b>${esc(a.name)}</b>${a.ours ? ' <span class="rs-ours">ours</span>' : ""}</div>
      <div class="rs-pc__cols">
        <div><div class="rs-label rs-label--pro">Pros</div><ul>${a.pros.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div><div class="rs-label rs-label--con">Cons</div><ul>${a.cons.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
    </article>`).join("");

  const v = study.verdict;
  const sources = study.sources.map(s => `<a class="tag rs-src" href="${esc(s[1])}" target="_blank" rel="noopener">${esc(s[0])}</a>`).join("");

  return `
    <div class="view-head"><h1>🖥️ ${esc(study.title)}</h1><p>${esc(study.question)}</p></div>
    <p class="rs-lead">Five approaches, ${study.dimensions.length} dimensions, ★ out of 5 with a one-line reason each, pros and cons, and a verdict. The <b>total</b> depends on whose situation is scored — pick a weight preset; this fleet is not a solo laptop.</p>
    <h2 class="rs-h">The five approaches</h2>
    <div class="rs-cards">${cards}</div>
    <div class="rs-presets"><span class="rs-presets__label">Weights:</span>${presets}<span class="rs-presets__note">${esc(presetInfo.sub)} → best: ${esc(study.approaches.find(a => a.key === best).name)}</span></div>
    <h2 class="rs-h">The ratings matrix — dimensions × approaches</h2>
    <p class="muted rs-note">Hover a cell for the one-line reason; click a card above to highlight its column. The weight column is the current preset's; the last row is the weighted average.</p>
    <div class="rs-tablewrap"><table class="rs-table" data-matrix>
      <thead><tr><th class="rs-th">Dimension</th><th class="rs-th rs-th--w">Weight</th>${head}</tr></thead>
      <tbody>${rows}${totalsRow}</tbody>
    </table></div>
    <h2 class="rs-h">Pros and cons</h2>
    <div class="cards">${pc}</div>
    <h2 class="rs-h">Verdict</h2>
    <div class="rs-verdict" data-verdict>
      <div class="rs-thesis"><b>${esc(v.headline)}</b> ${esc(v.body)}<span class="rs-thesis__src">${esc(v.rival)}</span></div>
      <div class="rs-verdict__cols">
        <div class="rs-verdict__col rs-verdict__col--win"><div class="rs-label rs-label--pro">When the fleet wins</div><ul>${v.wins.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="rs-verdict__col rs-verdict__col--lose"><div class="rs-label rs-label--con">When worktrees would be better</div><ul>${v.loses.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
      <div class="rs-hybrid"><b>Do both:</b> ${esc(v.hybrid)}</div>
    </div>
    <h2 class="rs-h">Sources</h2>
    <div class="tags rs-sources">${sources}</div>
    <p class="muted rs-foot">Study ${esc(study.id)} · ${esc(study.created)} · fleet task ${esc(study.task)} · data: <code>./data/research/${esc(study.id)}.json</code></p>`;
}

function wireResearch(main) {
  main.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { state.preset = b.dataset.preset; renderMain(); }));
  main.querySelectorAll(".rs-card").forEach(b => b.addEventListener("click", () => { state.pick = state.pick === b.dataset.approach ? null : b.dataset.approach; renderMain(); }));
}

function renderMain() {
  const main = document.getElementById("main");
  const r = state.route;

  const study = state.research[r];
  main.classList.toggle("is-wide", !!study); // the 14×5 matrix needs more than the notebook's column
  if (study) {
    main.innerHTML = renderResearch(study);
    main.dataset.best = (() => { const t = weightedTotals(study, state.preset); return Object.keys(t).sort((x, y) => t[y] - t[x])[0]; })();
    wireResearch(main);
    return;
  }

  if (KINDS.some(k => k.key === r)) {
    const k = KINDS.find(x => x.key === r);
    const items = state.entries.filter(e => e.kind === r);
    main.innerHTML = `<div class="view-head"><h1>${k.icon} ${k.label}</h1><p>${k.blurb}</p></div>` +
      (items.length
        ? `<div class="cards">${items.map(entryCard).join("")}</div>`
        : `<div class="empty">Nothing here yet.</div>`);
    return;
  }
  if (r === "repository") {
    main.innerHTML = `<div class="view-head"><h1>📚 Repository</h1>
      <p>The catalogue of patterns &amp; principles, each with a verdict.</p></div>` +
      (state.patterns.length
        ? `<div class="cards">${state.patterns.map(patternCard).join("")}</div>`
        : `<div class="empty">No patterns yet.</div>`);
    return;
  }
  if (r === "methodology") {
    main.innerHTML = `<div class="view-head"><h1>🧭 How I test</h1>
      <p>The loop a pattern runs before it earns a verdict.</p></div>
      <div class="doc">${markdown(state.methodology)}</div>`;
    return;
  }
  main.innerHTML = `<div class="error">Unknown view: ${esc(r)}</div>`;
}

function render() { renderNav(); renderMain(); }

function onHash() {
  const h = (location.hash || "").replace(/^#/, "");
  const valid = ["repository", "methodology", ...KINDS.map(k => k.key), ...RESEARCH.map(s => s.id)];
  state.route = valid.includes(h) ? h : "learned";
  render();
}

async function boot() {
  try {
    const [entries, patterns, methodology, ...studies] = await Promise.all([
      loadJSON("./data/entries.json"),
      loadJSON("./data/patterns.json"),
      loadText("./data/methodology.md"),
      ...RESEARCH.map(s => loadJSON(`./data/research/${s.id}.json`)),
    ]);
    state.entries = entries;
    state.patterns = patterns;
    state.methodology = methodology;
    RESEARCH.forEach((s, i) => { state.research[s.id] = studies[i]; });
    window.addEventListener("hashchange", onHash);
    onHash();
  } catch (err) {
    document.getElementById("main").innerHTML =
      `<div class="error"><strong>Couldn't load the lab data.</strong><br>${esc(String(err.message || err))}</div>`;
  }
}
boot();
