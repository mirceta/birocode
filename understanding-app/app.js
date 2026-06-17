// Queued-prompts understanding SPA — vanilla JS, no libs.
// Tabs of prose + an interactive Simulator. Key behaviour: prompts NEVER run on their
// own — you enqueue while the agent is busy, then approve (tap Send) each one when it's
// free, or tap × to delete.
(function () {
  var data = window.UNDERSTANDING_DATA || { views: [] };
  var TABS = [{ id: "sim", label: "▶ Simulator" }].concat(data.views);
  var active = "sim";

  var tabsEl = document.getElementById("tabs");
  var viewEl = document.getElementById("view");
  var footEl = document.getElementById("foot");

  // ---------- simulator state ----------
  var START = [
    "Add a dark-mode toggle to the header",
    "Write tests for the login flow",
    "Update the README with the new setup steps"
  ];
  var queue, seq, current, state, progress, log, timer;

  function reset() {
    if (timer) { clearInterval(timer); timer = null; }
    queue = START.map(function (t, i) { return { id: i + 1, text: t }; });
    seq = queue.length + 1;
    current = null; state = "idle"; progress = 0;
    log = [{ k: "run", t: "Three prompts queued. Tap Send on one to run it." }];
    if (active === "sim") paint();
  }

  function note(k, t) { log.unshift({ k: k, t: t }); if (log.length > 8) log.pop(); }

  // Approve: send a specific queued prompt. Only when the agent is free.
  function approve(id) {
    if (state === "running") return;
    var idx = queue.findIndex(function (q) { return q.id === id; });
    if (idx < 0) return;
    current = queue.splice(idx, 1)[0];
    state = "running"; progress = 0;
    note("run", "You approved → sending “" + current.text + "”");
    paint();
    timer = setInterval(tick, 200);
  }

  function tick() {
    progress = Math.min(100, progress + 10);
    if (progress < 100) { updateDial(); return; }   // light update — don't rebuild inputs
    clearInterval(timer); timer = null;
    note("ok", "Done “" + current.text + "”. Agent idle — approve the next when ready.");
    current = null; state = "idle";
    paint();
  }

  function del(id) {
    queue = queue.filter(function (q) { return q.id !== id; });
    paint();
  }

  function enqueue(v) {
    v = (v || "").trim(); if (!v) return;
    queue.push({ id: seq++, text: v });
    note("run", "Enqueued “" + v + "”" + (state === "running" ? " (while busy)" : "") + ".");
    paint();
  }

  // ---------- rendering ----------
  // Between paints the timer only nudges the progress dial, so the composer input keeps
  // its focus and any text typed mid-run is never wiped.
  function updateDial() { var d = byId("dial"); if (d) d.style.setProperty("--p", progress); }

  function renderSim() {
    var busy = state === "running";
    var face = busy ? "⚙️" : "🤖";

    var h = "";
    h += '<p class="card" style="margin-bottom:16px">Drive it: <b>Enqueue</b> a few prompts ' +
      '(allowed even while the agent is busy). Nothing runs on its own — when the agent is ' +
      'free, tap <b>Send</b> on a prompt to approve it, or <b>×</b> to delete it.</p>';

    h += '<div class="scene">';

    // 1 — composer
    h += '<div class="col"><h3>You — composer</h3>' +
      '<p class="hint">Enqueue any time, even while the agent is busy (a normal send would 409).</p>' +
      '<div class="composer"><input id="draft" placeholder="Type a prompt…" />' +
      '<button class="btn" id="enq">Enqueue</button></div></div>';

    // 2 — queue
    h += '<div class="col"><h3>Queue <span class="count">' + queue.length + '</span></h3>' +
      '<p class="hint">' + (busy
        ? 'Agent busy — Send is disabled until it\'s free.'
        : 'Tap Send to approve a prompt, or × to delete.') + '</p>' +
      queueHtml(busy) + '</div>';

    // 3 — agent
    h += '<div class="col agent"><h3>Agent</h3>' +
      '<div class="runner">' +
        '<div class="dial" id="dial" style="--p:' + (busy ? progress : 0) + '"><span class="face">' + face + '</span></div>' +
        '<div class="state-line"><span class="pill ' + (busy ? "running" : "idle") + '">' +
          (busy ? "running" : "idle") + '</span>' +
        '<span class="nowtext' + (current ? "" : " muted") + '">' +
          (current ? esc(current.text) : (queue.length ? "Idle — approve a queued prompt to run it." : "Idle — queue is empty.")) +
        '</span></div>' +
      '</div>' +
      '<div class="controls"><button class="btn sec" id="reset">Reset demo</button></div>' +
      logHtml() +
    '</div>';

    h += '</div>'; // scene

    // key points
    h += '<div class="rules">' +
      point("blue", "Enqueue while busy", "Stack up the next prompts even while the agent is working — the thought isn't lost.") +
      point("green", "You approve every send", "Nothing runs automatically. A queued prompt only sends when you tap Send.") +
      point("slate", "× to delete", "Drop any queued prompt without sending it.") +
    '</div>';

    viewEl.innerHTML = h;
    wire();
  }

  function queueHtml(busy) {
    if (!queue.length) return '<div class="empty">Empty — nothing waiting.</div>';
    return '<ul class="queue">' + queue.map(function (q, i) {
      return '<li class="' + (i === 0 ? "head" : "") + '">' +
        '<span class="qt">' + esc(q.text) + '</span>' +
        '<button class="send" data-id="' + q.id + '"' + (busy ? " disabled" : "") + '>Send</button>' +
        '<button class="x" data-id="' + q.id + '" title="delete">×</button></li>';
    }).join("") + '</ul>';
  }

  function logHtml() {
    return '<ul class="log">' + log.map(function (e) {
      return '<li><span class="dot ' + e.k + '"></span><span>' + esc(e.t) + '</span></li>';
    }).join("") + '</ul>';
  }

  function point(color, title, body) {
    return '<div class="rule ' + color + ' on"><div class="rl">' + esc(title) + '</div>' +
      '<p>' + esc(body) + '</p></div>';
  }

  function wire() {
    bind("reset", "onclick", reset);
    // clear the input BEFORE enqueue() repaints — paint() preserves the live draft,
    // so clearing afterwards would only blank a stale, detached node.
    bind("enq", "onclick", function () {
      var el = byId("draft"); var v = el.value; el.value = ""; enqueue(v);
      var n = byId("draft"); if (n) n.focus();
    });
    var d = byId("draft");
    if (d) d.onkeydown = function (e) {
      if (e.key === "Enter") { var v = d.value; d.value = ""; enqueue(v); }
    };
    each(viewEl.querySelectorAll(".send"), function (b) {
      b.onclick = function () { approve(Number(b.getAttribute("data-id"))); };
    });
    each(viewEl.querySelectorAll(".x"), function (b) {
      b.onclick = function () { del(Number(b.getAttribute("data-id"))); };
    });
  }

  // ---------- prose views ----------
  function renderProse(v) {
    viewEl.innerHTML = (v.cards || []).map(function (c) {
      return '<div class="card"><h2>' + esc(c.h) + '</h2><ul class="steps">' +
        c.steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul></div>";
    }).join("");
  }

  function paint() {
    // preserve a mid-run draft across full repaints
    var prev = byId("draft");
    var draftVal = prev ? prev.value : null;
    var keepFocus = prev && document.activeElement === prev;

    tabsEl.innerHTML = "";
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.textContent = t.label;
      if (t.id === active) b.className = "active";
      b.onclick = function () { active = t.id; paint(); };
      tabsEl.appendChild(b);
    });
    if (active === "sim") renderSim();
    else renderProse(TABS.find(function (t) { return t.id === active; }) || { cards: [] });

    if (draftVal != null) {
      var el = byId("draft");
      if (el) { el.value = draftVal; if (keepFocus) { el.focus(); el.selectionStart = el.selectionEnd = draftVal.length; } }
    }
    footEl.textContent = "understanding-app/ · build-less SPA · plans/queued-prompts.md";
  }

  // ---------- helpers ----------
  function byId(id) { return document.getElementById(id); }
  function bind(id, ev, fn) { var el = byId(id); if (el) el[ev] = fn; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  reset();
  paint();
})();
