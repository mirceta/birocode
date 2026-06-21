// Understanding app for: "Make the redeploy procedure reproducible — the harness
// seeds its deploy scripts (swap/rollback/arm) on first run from in-repo templates,
// substituting this machine's paths, missing-only so an existing box is untouched."
// Self-contained, no libs, relative URLs (served under
// /api/localview/<repo>/app/understanding/).

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids) n.append(kid && kid.nodeType ? kid : document.createTextNode(kid ?? ""));
  return n;
};

// ----------------------------------------------------------------------------
// VIEW: problem
// ----------------------------------------------------------------------------
function viewProblem() {
  const root = el("div");
  root.append(el("p", {
    class: "lead",
    html: `Before this change, the Deployments tab and the rollback code were committed —
      but the <span class="hl">tooling they drive was not</span>. A fresh checkout had the
      buttons and none of the scripts. Three things made the procedure impossible to reproduce
      on another machine:`,
  }));

  root.append(el("div", { class: "grid3" },
    problemCard("📍", "Off-repo & untracked", "bad",
      `The scripts and the <code>deploys.jsonl</code> ledger lived in a sibling folder
       <span class="path">playground/claudeweb-rollback</span> — outside the repo and not in git.`),
    problemCard("🔧", "Hardcoded paths", "bad",
      `Every script was full of absolute paths tied to this box's profile, e.g.
       <span class="path">C:\\Users\\Administrator\\…\\birocode</span>.`),
    problemCard("🕳️", "Assumed to exist", "bad",
      `The committed <code>DeployService.cs</code> just <em>assumed</em> the scripts were there.
       On a new box: dead buttons.`),
  ));

  root.append(el("h2", { class: "section-title" }, "What a fresh checkout looked like"));

  const before = el("div", { class: "beforewrap" });
  before.append(
    el("div", { class: "box repo" },
      el("div", { class: "boxhd" }, "📦 The git repo (cloned anywhere)"),
      fileRow("ClaudeWeb.App/Services/Deploy/DeployService.cs", "tracked", "tracked"),
      fileRow("ClaudeWeb.App/.../Deployments tab UI", "tracked", "tracked"),
      el("div", { class: "brokenlink" }, "⤓ calls scripts that aren't here ⤓"),
    ),
    el("div", { class: "box" },
      el("div", { class: "boxhd" }, "🗂️ ../claudeweb-rollback (sibling)"),
      fileRow("swap.ps1", "untracked", "MISSING"),
      fileRow("rollback.ps1", "untracked", "MISSING"),
      fileRow("arm.ps1", "untracked", "MISSING"),
      el("div", { class: "brokenlink" }, "✗ never cloned — lived only on this PC"),
    ),
  );
  root.append(before);

  root.append(el("div", { class: "callout warn", html:
    `<b>The constraint:</b> the scripts genuinely <em>must</em> live outside the repo —
     rollback reverts the working tree, so its own scripts can't sit inside the thing it
     reverts. So we can't just commit them in place. We need them to <b>self-install</b> per machine.` }));
  return root;
}

function problemCard(icon, title, tone, bodyHtml) {
  return el("div", { class: "card" },
    el("h3", {}, el("span", {}, icon), title, el("span", { class: `pill ${tone}`, style: "margin-left:auto" }, "gap")),
    el("p", { html: bodyHtml }),
  );
}
function fileRow(name, cls, tag) {
  return el("div", { class: `fileitem ${cls}` }, el("span", {}, "📄"), el("span", {}, name),
    el("span", { class: "tag" }, tag));
}

// ----------------------------------------------------------------------------
// VIEW: solution (startup flow)
// ----------------------------------------------------------------------------
function viewSolution() {
  const root = el("div");
  root.append(el("p", {
    class: "lead",
    html: `The fix mirrors the pattern the app already uses for <code>auth.json</code>
      (<span class="hl">LoadOrSeed on startup</span>): keep the canonical scripts in the
      repo as <span class="hl">embedded-resource templates</span>, and have a new
      <code>DeployScriptProvisioner</code> write any <span class="hl">missing</span> script
      for <em>this</em> machine when the harness boots.`,
  }));

  root.append(el("div", { class: "grid2" },
    el("div", { class: "card" },
      el("h3", {}, el("span", {}, "🌱"), "What's now in the repo"),
      el("ul", { class: "clean", html:
        `<li><b>Templates</b> — <span class="path">Deploy/templates/{swap,rollback,arm}.ps1.tmpl</span>,
          tracked & embedded in the exe. Machine bits replaced by tokens.</li>
         <li><b>Provisioner</b> — <code>DeployScriptProvisioner</code>: <code>ResolveDir</code> +
          <code>EnsureSeeded</code>.</li>
         <li><b>Portable default</b> — <code>DeployScriptsDir</code> now resolves at runtime to
          <span class="path">&lt;parent-of-repo&gt;/claudeweb-rollback</span>.</li>` }),
    ),
    el("div", { class: "card" },
      el("h3", {}, el("span", {}, "🧭"), "Why this shape"),
      el("ul", { class: "clean", html:
        `<li>Runtime scripts stay <b>off-repo</b> (rollback-safety) — only the templates are in-repo.</li>
         <li>Follows the existing <b>LoadOrSeed-on-startup</b> convention.</li>
         <li><b>Backward compatible</b>: missing-only writes + a default that resolves to the
           current dir ⇒ this box is untouched.</li>` }),
    ),
  ));

  root.append(el("h2", { class: "section-title" }, "What happens on startup (Program.cs)"));

  const steps = [
    ["1", "Self-repo is known", "is-decision",
      `<code>FindRepoRoot()</code> locates the harness's own source tree (or returns null on a
       source-less install).`, ""],
    ["2", "Resolve the deploy dir", "",
      `<code>ResolveDir(config.DeployScriptsDir, repoRoot)</code> → an explicit config value if set,
       else <span class="path">&lt;parent-of-repo&gt;/claudeweb-rollback</span>.`,
      "On this box that resolves to the existing folder — behavior unchanged."],
    ["3", "Ensure dir exists", "",
      `<code>EnsureSeeded</code> creates the deploy directory if it isn't there yet.`, ""],
    ["loop", "For each script: swap · rollback · arm", "is-decision",
      `Check whether the target file already exists…`, ""],
    ["a", "exists → skip", "is-skip",
      `An existing script is <b>never</b> overwritten — a hand-tuned box keeps its scripts.`, ""],
    ["b", "missing → write", "is-write",
      `Read the embedded template, substitute <span class="tok">__REPO__</span> and
       <span class="tok">__DEPLOYDIR__</span> for this machine, write the file.`, ""],
    ["4", "API starts", "",
      `The Deployments tab now drives real, correct-for-this-machine scripts. Best-effort:
       seeding never throws into startup.`, ""],
  ];

  const flow = el("div", { class: "flow" });
  steps.forEach((s, i) => {
    flow.append(el("div", { class: `step ${s[2]}` },
      el("div", { class: "dot" }, s[0] === "loop" ? "⟳" : s[0]),
      el("div", { class: "body" },
        el("h4", {}, s[1]),
        el("p", { html: s[3] }),
        s[4] ? el("p", { class: "note", html: "→ " + s[4] }) : "",
      ),
    ));
    if (i < steps.length - 1) flow.append(el("div", { class: "connector" }));
  });
  root.append(el("div", { class: "card" }, flow));
  return root;
}

// ----------------------------------------------------------------------------
// VIEW: tokens (interactive substitution)
// ----------------------------------------------------------------------------
const TEMPLATES = {
  swap: `$repo = '__REPO__'
$bin = Join-Path $repo 'ClaudeWeb.App\\bin\\Release\\net8.0-windows'
$log = '__DEPLOYDIR__\\swap.log'

# Gate: refuse to deploy a tree missing origin/main
git -C $repo merge-base --is-ancestor origin/main HEAD
...
robocopy $staged $bin /MIR
# health check; on failure:
& '__DEPLOYDIR__\\rollback.ps1'`,
  rollback: `$repo = '__REPO__'
$bin = Join-Path $repo 'ClaudeWeb.App\\bin\\Release\\net8.0-windows'
$log = '__DEPLOYDIR__\\rollback.log'

robocopy "$bin.lastgood" $bin /MIR
robocopy "$dist.lastgood" $dist /MIR
Start-Process (Join-Path $bin 'ClaudeWeb.exe')
Add-Content '__DEPLOYDIR__\\deploys.jsonl' $entry`,
  arm: `# arm the 15-min dead-man's switch
$action = New-ScheduledTaskAction -Execute 'powershell' \`
  -Argument '-File __DEPLOYDIR__\\rollback.ps1'
Register-ScheduledTask -TaskName ClaudeWebAutoRollback ...
# (note: arm.ps1 only references the deploy dir, not __REPO__)`,
};

let tokState = { repo: "D:\\work\\birocode", dir: "D:\\work\\claudeweb-rollback", script: "swap", filled: false };

function viewTokens() {
  const root = el("div");
  root.append(el("p", {
    class: "lead",
    html: `Seeding is just <code>template.Replace("__REPO__", repoRoot).Replace("__DEPLOYDIR__", deployDir)</code>.
      Edit the machine paths below and press <b>Seed →</b> to watch the tokens fill in.
      Pick a script to see its template.`,
  }));

  const bar = el("div", { class: "tokbar" });
  bar.append(
    el("div", { class: "field" },
      el("label", {}, "repoRoot (this machine)"),
      el("input", { id: "inRepo", value: tokState.repo, oninput: e => { tokState.repo = e.target.value; } }),
    ),
    el("div", { class: "field" },
      el("label", {}, "deployDir (resolved off-repo)"),
      el("input", { id: "inDir", value: tokState.dir, oninput: e => { tokState.dir = e.target.value; } }),
    ),
  );
  root.append(bar);

  const ctl = el("div", { class: "tokbar" });
  const seg = el("div", { class: "seg" });
  ["swap", "rollback", "arm"].forEach(s => {
    seg.append(el("button", {
      class: tokState.script === s ? "active" : "",
      onclick: () => { tokState.script = s; render(); },
    }, s + ".ps1"));
  });
  ctl.append(seg);
  ctl.append(el("button", {
    class: "seg",
    style: "cursor:pointer",
    onclick: () => { tokState.filled = !tokState.filled; render(); },
  }, el("button", { class: tokState.filled ? "active" : "" }, tokState.filled ? "↺ Reset to template" : "Seed → substitute")));
  root.append(ctl);

  const panes = el("div", { class: "codepanes" });
  panes.append(
    codePane("Template (in git)", tokState.script + ".ps1.tmpl", renderTemplate(false)),
    codePane(tokState.filled ? "Seeded on this machine" : "After seeding (press Seed →)",
      tokState.script + ".ps1", renderTemplate(tokState.filled)),
  );
  root.append(panes);

  root.append(el("div", { class: "legend" },
    el("span", { html: `<span class="sw" style="background:var(--tok-bg);border:1px solid var(--tok)"></span>unfilled token` }),
    el("span", { html: `<span class="sw" style="background:var(--good-bg);border:1px solid var(--good)"></span>substituted for this machine` }),
  ));

  root.append(el("div", { class: "callout", html:
    `<b>Verified against the real compiled method:</b> the seeded <code>swap.ps1</code> contains the
     repo path and deploy dir, with <b>no leftover tokens</b>. <code>arm.ps1</code> legitimately
     references only the deploy dir.` }));

  const view = document.getElementById("view");
  view.innerHTML = "";
  view.append(root);

  function render() {
    // keep input values across re-render
    viewTokensReRender();
  }
  return root;
}

function viewTokensReRender() {
  routeTo("tokens", true);
}

function renderTemplate(filled) {
  let t = TEMPLATES[tokState.script];
  // escape HTML
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (!filled) {
    t = t.replace(/__REPO__/g, `<span class="tok">__REPO__</span>`)
         .replace(/__DEPLOYDIR__/g, `<span class="tok">__DEPLOYDIR__</span>`);
  } else {
    const r = escapeHtml(tokState.repo);
    const d = escapeHtml(tokState.dir);
    t = t.replace(/__REPO__/g, `<span class="tok filled">${r}</span>`)
         .replace(/__DEPLOYDIR__/g, `<span class="tok filled">${d}</span>`);
  }
  return t;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function codePane(label, which, html) {
  return el("div", { class: "codepane" },
    el("div", { class: "cphd" }, el("span", {}, label), el("span", { class: "which" }, which)),
    el("pre", { class: "code", html }),
  );
}

// ----------------------------------------------------------------------------
// VIEW: safety / verification
// ----------------------------------------------------------------------------
function viewSafety() {
  const root = el("div");
  root.append(el("p", {
    class: "lead",
    html: `Two properties make this safe to ship to the <span class="hl">live box</span> without
      touching its working deploy — and I proved each against the <span class="hl">real compiled
      method</span> via a throwaway console harness, not just by reading the code.`,
  }));

  root.append(el("div", { class: "grid2" },
    el("div", { class: "card" },
      el("h3", {}, el("span", {}, "🛡️"), "Missing-only"),
      el("p", { html: `A <code>File.Exists</code> guard means an existing script is never clobbered.
        This box's hand-tuned <span class="path">claudeweb-rollback</span> scripts stay exactly as they are.` }),
    ),
    el("div", { class: "card" },
      el("h3", {}, el("span", {}, "🎯"), "Default lands on the same dir"),
      el("p", { html: `On this box, <code>ResolveDir</code> computes
        <span class="path">&lt;parent-of-repo&gt;/claudeweb-rollback</span> — the already-existing
        folder. So nothing new is written here; only a <em>fresh</em> machine gets seeds.` }),
    ),
  ));

  root.append(el("h2", { class: "section-title" }, "Verification — real method, real assertions"));
  const checks = el("div", { class: "checks" });
  [
    ["Build", "ClaudeWeb.App compiles clean (only pre-existing CliRunner warnings)", "0 errors"],
    ["Templates embed", "All 3 templates present as ClaudeWeb.Deploy.templates.*.tmpl", "3/3"],
    ["ResolveDir('', repo)", "Computes the off-repo sibling path", "…/claudeweb-rollback"],
    ["ResolveDir(explicit)", "Honors an explicit config override", "C:\\explicit"],
    ["ResolveDir(no repo)", "Source-less install handled", "null"],
    ["EnsureSeeded writes", "All 3 scripts written, no leftover tokens, real paths in", "swap+rollback+arm"],
    ["Missing-only guard", "A pre-placed SENTINEL file was NOT overwritten", "preserved ✓"],
  ].forEach(c => {
    checks.append(el("div", { class: "check" },
      el("div", { class: "ic" }, "✓"),
      el("div", { class: "ct" }, el("strong", {}, c[0]), el("span", {}, c[1])),
      el("div", { class: "out" }, c[2]),
    ));
  });
  root.append(checks);

  root.append(el("div", { class: "callout warn", html:
    `<b>One honest caveat:</b> I couldn't boot the full WinForms harness (it'd fight the live :5099),
     so the <code>Program.cs</code> wiring is verified by build + the provisioner's own end-to-end test,
     not by a real startup. It runs for real on the next deploy/restart. <b>No deploy was done</b> —
     that's your call.` }));
  return root;
}

// ----------------------------------------------------------------------------
// VIEW: files
// ----------------------------------------------------------------------------
function viewFiles() {
  const root = el("div");
  root.append(el("p", { class: "lead", html:
    `Everything that changed for this feature. New files are tracked; runtime scripts are still
     produced off-repo at startup.` }));

  const rows = [
    ["new", "Deploy/templates/swap.ps1.tmpl", "Canonical swap script, paths tokenized, embedded in the exe"],
    ["new", "Deploy/templates/rollback.ps1.tmpl", "Canonical rollback script, tokenized"],
    ["new", "Deploy/templates/arm.ps1.tmpl", "Canonical dead-man's-switch arm script, tokenized"],
    ["new", "Services/Deploy/DeployScriptProvisioner.cs", "ResolveDir + EnsureSeeded (missing-only, token substitution)"],
    ["edit", "ClaudeWeb.App.csproj", "Embed Deploy/templates/*.tmpl as resources"],
    ["edit", "Program.cs", "Resolve DeployScriptsDir + EnsureSeeded after self-repo, before API start"],
    ["edit", "Models/AppConfig.cs", "DeployScriptsDir default → \"\" (resolves at runtime, portable)"],
    ["edit", "Services/Deploy/DeployService.cs", "Stale \"both already exist\" doc comment fixed"],
    ["edit", "understanding.md", "Records the task"],
  ];
  const tbl = el("table", { class: "files" });
  tbl.append(el("tr", {}, el("th", {}, ""), el("th", {}, "File (under ClaudeWeb.App/)"), el("th", {}, "What")));
  rows.forEach(r => {
    tbl.append(el("tr", {},
      el("td", {}, el("span", { class: `badge ${r[0]}` }, r[0] === "new" ? "NEW" : "EDIT")),
      el("td", { class: "f" }, r[1]),
      el("td", {}, r[2]),
    ));
  });
  root.append(el("div", { class: "card" }, tbl));

  root.append(el("div", { class: "callout", html:
    `<b>Follow-ups (not done):</b> the human-readable runbook via <code>PreviewDoc.cs</code> +
     a CLAUDE.md pointer, and the deploy itself. Staging left to you (the <code>git add -A</code> rule).` }));
  return root;
}

// ----------------------------------------------------------------------------
// router
// ----------------------------------------------------------------------------
const VIEWS = {
  problem: viewProblem,
  solution: viewSolution,
  tokens: viewTokens,
  safety: viewSafety,
  files: viewFiles,
};

function routeTo(name, isTokenReRender) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.view === name));
  const view = document.getElementById("view");
  if (name === "tokens") {
    // viewTokens manages its own mount (interactive)
    const built = VIEWS.tokens();
    if (!isTokenReRender) { /* already mounted inside viewTokens */ }
    return;
  }
  view.innerHTML = "";
  view.append(VIEWS[name]());
  view.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

document.getElementById("tabs").addEventListener("click", e => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  routeTo(btn.dataset.view);
});

routeTo("problem");
