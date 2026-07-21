/* add-commit-identity-write — interactive explainer.
   Vanilla JS, no dependencies, relative URLs only. */
(function () {
  "use strict";

  /* ---- tab switching ---- */
  var tabs = document.getElementById("tabs");
  tabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    var view = btn.getAttribute("data-view");
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.classList.toggle("active", t === btn);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) {
      v.classList.toggle("active", v.id === "view-" + view);
    });
  });

  /* ---- dock identity editor (view 2) ---- */
  var state = {
    name: "mirceta-agents",
    email: "caffe.klinika@gmail.com",
    scope: "local",
    editing: false,
    saving: false,
    error: ""
  };
  var dock = document.getElementById("dock");
  var trace = document.getElementById("trace");
  var busyChk = document.getElementById("busy");

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function scopePill(scope) {
    return '<span class="pill ' + scope + '">' + scope + "</span>";
  }

  function renderDock() {
    var commitsVal = state.name || state.email
      ? esc(state.name) + " &lt;" + esc(state.email) + "&gt;"
      : '<span style="color:var(--ink-dim)">not set</span>';

    var html = "";
    // commits as row
    html += '<div class="idrow commit">';
    html += '<span class="lbl">commits as</span>';
    html += '<span class="val">' + commitsVal + " " + scopePill(state.scope) + "</span>";
    if (!state.editing) html += '<button class="editbtn" id="do-edit">Edit</button>';
    html += "</div>";

    // inline editor
    if (state.editing) {
      html += '<div class="editor">';
      html += '<label>name</label><input id="in-name" value="' + esc(state.name) + '">';
      html += '<label>email</label><input id="in-email" value="' + esc(state.email) + '">';
      html += '<div class="scope">';
      html += '<button class="scopebtn ' + (state.scope === "local" ? "on" : "") + '" data-scope="local">local · this repo</button>';
      html += '<button class="scopebtn ' + (state.scope === "global" ? "on" : "") + '" data-scope="global">global · whole box</button>';
      html += "</div>";
      html += '<div class="actions">';
      html += '<button class="save" id="do-save"' + (state.saving ? " disabled" : "") + ">" + (state.saving ? "saving…" : "Save") + "</button>";
      html += '<button class="cancel" id="do-cancel"' + (state.saving ? " disabled" : "") + ">Cancel</button>";
      html += "</div>";
      if (state.error) html += '<div class="err">' + esc(state.error) + "</div>";
      html += "</div>";
    }

    // pushes as row (always read-only)
    html += '<div class="idrow push">';
    html += '<span class="lbl">pushes as</span>';
    html += '<span class="val">@mirceta-agents</span>';
    html += '<span class="roflag">read-only</span>';
    html += "</div>";

    dock.innerHTML = '<div class="dock-head">Agent dock · git</div>' + html;
    wireDock();
  }

  function wireDock() {
    var editBtn = document.getElementById("do-edit");
    if (editBtn) editBtn.onclick = function () {
      state.editing = true; state.error = ""; renderDock();
      var f = document.getElementById("in-name"); if (f) f.focus();
    };
    var cancel = document.getElementById("do-cancel");
    if (cancel) cancel.onclick = function () {
      state.editing = false; state.error = ""; renderDock();
    };
    Array.prototype.forEach.call(document.querySelectorAll(".scopebtn"), function (b) {
      b.onclick = function () { state.scope = b.getAttribute("data-scope"); renderDock(); };
    });
    var save = document.getElementById("do-save");
    if (save) save.onclick = doSave;
    // keep typed values on re-render triggered by scope switch
    var nameIn = document.getElementById("in-name");
    var emailIn = document.getElementById("in-email");
    if (nameIn) nameIn.oninput = function () { state.name = nameIn.value; };
    if (emailIn) emailIn.oninput = function () { state.email = emailIn.value; };
  }

  function traceStep(rows) {
    trace.innerHTML = "";
    rows.forEach(function (r, i) {
      var d = document.createElement("div");
      d.className = "step" + (r.err ? " err" : "");
      d.innerHTML = r.html;
      trace.appendChild(d);
      setTimeout(function () { d.classList.add("hot"); }, 120 + i * 320);
    });
  }

  function doSave() {
    var name = (document.getElementById("in-name").value || "").trim();
    var email = (document.getElementById("in-email").value || "").trim();
    state.name = name; state.email = email;

    // guard: busy → 409
    if (busyChk.checked) {
      state.error = "Claude is working in this project — try again when the run finishes.";
      renderDock();
      traceStep([
        { html: '<span class="k">POST</span> /api/git/identity' },
        { html: "_runs.IsBusy(repo.Id) → <b>true</b>" },
        { err: true, html: "→ <b>409 Conflict</b> · nothing written" }
      ]);
      return;
    }
    // guard: empty → 422
    if (!name && !email) {
      state.error = "Provide a name or email.";
      renderDock();
      traceStep([
        { html: '<span class="k">POST</span> /api/git/identity { }' },
        { html: "SetCommitIdentity: n=&quot;&quot; &amp;&amp; e=&quot;&quot;" },
        { err: true, html: "→ <b>422</b> { ok:false, error:&quot;Provide a name or email.&quot; }" }
      ]);
      return;
    }

    // happy path
    state.saving = true; state.error = ""; renderDock();
    var flag = state.scope === "global" ? "--global" : "--local";
    var steps = [
      { html: '<span class="k">POST</span> /api/git/identity { name, email, scope:&quot;' + esc(state.scope) + '&quot; }' },
      { html: "_runs.IsBusy → false · guard passes" }
    ];
    if (name) steps.push({ html: "git config " + flag + " user.name <span class=\"g\">" + esc(name) + "</span>" });
    if (email) steps.push({ html: "git config " + flag + " user.email <span class=\"g\">" + esc(email) + "</span>" });
    steps.push({ html: "ReadCommitIdentity → re-read authoritative value" });
    steps.push({ html: '→ <span class="g">200</span> { ok:true, scope:&quot;' + esc(state.scope) + '&quot; }' });
    steps.push({ html: "onRefreshGit() → dock re-fetches git/status" });
    traceStep(steps);

    setTimeout(function () {
      state.saving = false; state.editing = false; renderDock();
    }, 120 + steps.length * 320 + 200);
  }

  renderDock();

  /* ---- tests list (view 5) ---- */
  var tests = [
    { name: "Write_local_sets_repo_config_and_reports_local_scope", desc: "write name+email local → read back with scope: local" },
    { name: "Write_name_only_leaves_previous_email", desc: "partial write: only name is set, email keeps its prior value" },
    { name: "Write_email_only_sets_just_email", desc: "partial write: only email is set" },
    { name: "Empty_write_is_rejected_and_mutates_nothing", desc: "neither name nor email → rejected, config untouched" },
    { name: "Values_are_trimmed_before_writing", desc: "surrounding whitespace is trimmed before the config write" },
    { name: "Write_global_targets_isolated_global_config", desc: "global scope into an isolated HOME/GIT_CONFIG_GLOBAL → scope: global" }
  ];
  var ul = document.getElementById("tests-list");
  tests.forEach(function (t) {
    var li = document.createElement("li");
    li.innerHTML = '<span class="tick">✓</span><span class="name">' + esc(t.name) +
      '</span><span class="desc">— ' + esc(t.desc) + "</span>";
    ul.appendChild(li);
  });
})();
