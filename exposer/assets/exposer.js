// Exposure Helper — the guided exposure flow (plans/serving-model-clarity.md,
// slice 2). Loaded via a RELATIVE URL (./assets/exposer.js); if it runs at all,
// the browser resolved it under the harness's /api/localview/<repo>/ sub-path,
// which is itself proof the relative-URL rule holds. Plain vanilla JS on purpose:
// this product is the "done right" reference an agent copies, so it stays small
// and dependency-free.
(function () {
  'use strict';

  // --- self-proof: the relative script resolved ----------------------------
  var statusEl = document.getElementById('exposer-status');
  if (statusEl) {
    statusEl.textContent =
      'Relative script resolved under the proxy sub-path — assets are wired correctly. ✓';
    statusEl.classList.add('exposer__status--ok');
  }

  // --- guided check --------------------------------------------------------
  var runBtn = document.getElementById('run-check');
  var summaryEl = document.getElementById('check-summary');
  var listEl = document.getElementById('check-list');
  var fixArea = document.getElementById('fix-area');
  var fixBtn = document.getElementById('fix-with-agent');
  var fixHint = document.getElementById('fix-hint');
  var fixPromptEl = document.getElementById('fix-prompt');
  var noteEl = document.getElementById('check-note');
  if (!runBtn || !listEl) return;

  var currentFixPrompt = '';

  function setSummary(text, cls) {
    summaryEl.textContent = text;
    summaryEl.className = 'exposer__summary' + (cls ? ' ' + cls : '');
  }

  // Build one checklist row. Uses textContent throughout (never innerHTML with
  // server strings) so probe details can't inject markup.
  function renderRow(check) {
    var li = document.createElement('li');
    li.className = 'exposer__check ' + (check.ok ? 'is-ok' : 'is-fail');

    var icon = document.createElement('span');
    icon.className = 'exposer__check-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = check.ok ? '✓' : '✗';
    li.appendChild(icon);

    var body = document.createElement('span');
    body.className = 'exposer__check-body';

    var label = document.createElement('span');
    label.className = 'exposer__check-label';
    label.textContent = check.label;
    body.appendChild(label);

    if (check.detail) {
      var detail = document.createElement('span');
      detail.className = 'exposer__check-detail';
      detail.textContent = check.detail;
      body.appendChild(detail);
    }

    // The "live contract" — why this rule exists (always shown).
    if (check.why) {
      var why = document.createElement('span');
      why.className = 'exposer__check-why';
      why.textContent = check.why;
      body.appendChild(why);
    }

    // The remediation — only when the rule fails.
    if (!check.ok && check.fix) {
      var fix = document.createElement('span');
      fix.className = 'exposer__check-fix';
      fix.textContent = '→ ' + check.fix;
      body.appendChild(fix);
    }

    li.appendChild(body);
    return li;
  }

  function render(data) {
    var checks = (data && data.checks) || [];
    listEl.textContent = '';
    checks.forEach(function (c) {
      listEl.appendChild(renderRow(c));
    });
    listEl.hidden = checks.length === 0;

    var okCount = checks.filter(function (c) { return c.ok; }).length;
    var allOk = checks.length > 0 && okCount === checks.length;
    if (allOk) {
      setSummary('All ' + checks.length + ' checks pass — your product embeds correctly here.', 'is-ok');
    } else {
      setSummary(okCount + '/' + checks.length + ' checks pass for “' + (data.repo || 'this project') + '”.', 'is-warn');
    }

    currentFixPrompt = (data && data.fixPrompt) || '';
    fixArea.hidden = !currentFixPrompt;
    if (currentFixPrompt) {
      fixPromptEl.value = currentFixPrompt;
      fixHint.textContent = '';
      fixPromptEl.hidden = true;
    }
    noteEl.textContent = 'The check probes 127.0.0.1 / [::1] server-side and never edits your product.';
  }

  function run() {
    runBtn.disabled = true;
    setSummary('Running…', '');
    // Absolute /api path (not a relative asset): this is an API call to the
    // harness, which is same-origin when the helper is opened via the Local tab.
    fetch('/api/expose/check', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(render)
      .catch(function () {
        listEl.hidden = true;
        fixArea.hidden = true;
        setSummary('', '');
        noteEl.textContent =
          'Open this helper from the harness Local tab to run the check — it calls the harness API, which is only reachable through the proxy.';
      })
      .finally(function () {
        runBtn.disabled = false;
      });
  }

  // One-click "Fix with an agent": ask the parent harness (same-origin) to
  // prefill the project chat and jump to the agent — the same path the chrome
  // Exposure-check panel uses. When there is no parent (helper opened directly),
  // fall back to copying the prompt so it can be pasted into chat.
  function fixWithAgent() {
    if (!currentFixPrompt) return;
    var posted = false;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: 'claudeweb:expose-fix', prompt: currentFixPrompt },
          window.location.origin
        );
        posted = true;
      }
    } catch (e) {
      posted = false;
    }
    if (posted) {
      fixHint.textContent = 'Sent to the agent — switching you to the chat.';
      return;
    }
    // Fallback: copy + reveal the prompt.
    var reveal = function () {
      fixPromptEl.hidden = false;
      fixPromptEl.focus();
      fixPromptEl.select();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentFixPrompt).then(
        function () { fixHint.textContent = 'Copied the fix prompt — paste it into the project chat.'; reveal(); },
        function () { fixHint.textContent = 'Copy the fix prompt below into the project chat:'; reveal(); }
      );
    } else {
      fixHint.textContent = 'Copy the fix prompt below into the project chat:';
      reveal();
    }
  }

  runBtn.addEventListener('click', run);
  fixBtn.addEventListener('click', fixWithAgent);

  // Auto-run once on load so the agent sees results immediately.
  run();
})();
