// global-example/assets/prompt.js
//
// The copy-paste prompt an operator pastes into ANOTHER on-box agent's chat so
// THAT agent exposes ITS product globally. Same move as homepage's Local/Global
// topics: a POINTER to the canonical doc (read off disk on this box), not a copy
// — change the convention in docs/global-exposure-convention.md and every agent
// picks it up. Repo-relative path on purpose (no stale absolute username).

(function () {
  var CONVENTION_DOC = 'docs/global-exposure-convention.md';

  function buildPrompt(service) {
    var s = (service || '').trim();
    var target = s ? s : 'the web app you want to expose';
    return 'This repository may run several web apps — I want to expose ' + target +
      ' GLOBALLY: on the public Claude Web Homepage (no login), reachable through the ' +
      'off-box IIS/ARR HTTPS door at /preview/ → :5200. Read the file `' + CONVENTION_DOC +
      '` in the Claude Web repo and reconfigure ' + target + ' so it satisfies the ' +
      'five-rule contract there: (1) bind 0.0.0.0:5200 — all interfaces, launched detached, ' +
      'port freed first; (2) serve its page at GET /; (3) carry the /preview/ base on every ' +
      'asset AND runtime fetch URL (./… not /…); (4) send a body (even {}) on every POST so ' +
      'IIS+ARR does not 411; (5) cache-bust GETs (?_=Date.now()) so ARR’s output cache ' +
      'does not serve stale state. Then start it on :5200 and tell me, so I can verify the ' +
      'public hop. The doc is the single source of truth — re-read it if the convention changes.';
  }

  function mount(host) {
    host.innerHTML =
      '<h2>🌐 Expose your own product globally — paste this into another agent</h2>' +
      '<p class="muted">A repo can run several web apps. Name the one to expose; it’s injected ' +
      'into the prompt below. Paste it into another on-box agent’s chat and it will make its ' +
      'product satisfy the five rules. It’s a <b>pointer</b>, not a copy — the agent reads ' +
      '<code>' + CONVENTION_DOC + '</code> off disk, so the convention can’t drift.</p>';

    var field = document.createElement('div'); field.className = 'pfield';
    var label = document.createElement('label'); label.textContent = 'Which service should it expose?';
    label.setAttribute('for', 'svc');
    var input = document.createElement('input'); input.id = 'svc'; input.type = 'text';
    input.placeholder = 'e.g. the App product, the Vite build, the docs site';
    field.appendChild(label); field.appendChild(input);

    var head = document.createElement('div'); head.className = 'phead';
    var copy = document.createElement('button'); copy.className = 'btn'; copy.type = 'button'; copy.textContent = 'Copy';
    head.appendChild(copy);

    var pre = document.createElement('pre'); pre.className = 'prompt';
    var code = document.createElement('code'); code.textContent = buildPrompt('');
    pre.appendChild(code);

    host.appendChild(field);
    host.appendChild(head);
    host.appendChild(pre);

    function current() { return buildPrompt(input.value); }
    input.addEventListener('input', function () { code.textContent = current(); });

    var t = null;
    function flash(text, ok) {
      copy.textContent = text;
      copy.classList.toggle('is-ok', !!ok);
      if (t) clearTimeout(t);
      t = setTimeout(function () { copy.textContent = 'Copy'; copy.classList.remove('is-ok'); }, 1600);
    }
    copy.addEventListener('click', function () {
      var text = current();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { flash('Copied ✓', true); },
          function () { flash('Press Ctrl+C', false); }
        );
      } else {
        try {
          var r = document.createRange(); r.selectNodeContents(pre);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          var ok = document.execCommand('copy'); sel.removeAllRanges();
          flash(ok ? 'Copied ✓' : 'Press Ctrl+C', ok);
        } catch (e) { flash('Press Ctrl+C', false); }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var host = document.getElementById('prompt-host');
      if (host) mount(host);
    });
  } else {
    var host = document.getElementById('prompt-host');
    if (host) mount(host);
  }
})();
