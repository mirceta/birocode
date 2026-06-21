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

const state = { entries: [], patterns: [], methodology: "", route: "learned" };

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

function renderMain() {
  const main = document.getElementById("main");
  const r = state.route;

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
  const valid = ["repository", "methodology", ...KINDS.map(k => k.key)];
  state.route = valid.includes(h) ? h : "learned";
  render();
}

async function boot() {
  try {
    const [entries, patterns, methodology] = await Promise.all([
      loadJSON("./data/entries.json"),
      loadJSON("./data/patterns.json"),
      loadText("./data/methodology.md"),
    ]);
    state.entries = entries;
    state.patterns = patterns;
    state.methodology = methodology;
    window.addEventListener("hashchange", onHash);
    onHash();
  } catch (err) {
    document.getElementById("main").innerHTML =
      `<div class="error"><strong>Couldn't load the lab data.</strong><br>${esc(String(err.message || err))}</div>`;
  }
}
boot();
