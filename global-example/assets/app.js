// global-example/assets/app.js
//
// The client half of the contract demonstration. Loaded as ./assets/app.js
// (RULE 3 — relative), and every fetch below is ./api/… (relative) so the URLs
// ride the /preview/ base under IIS/ARR instead of escaping it.

(function () {
  var countEl = document.getElementById('count');
  var statusEl = document.getElementById('status');
  var badgeEl = document.getElementById('badge');
  var cPost = document.getElementById('c-post');
  var cGet = document.getElementById('c-get');

  function flash(el) {
    el.classList.add('fire');
    setTimeout(function () { el.classList.remove('fire'); }, 700);
  }
  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  // RULE 5 (client half): append ?_=<ts> so each GET URL is unique and ARR's
  // output cache can't hand back a stale body after a mutation.
  function getState() {
    flash(cGet);
    return fetch('./api/state?_=' + Date.now(), { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); });
  }

  // RULE 4: always send a body (even {}) with a Content-Type, or IIS/ARR rejects
  // the Content-Length-less POST with 411 before it ever reaches the server.
  function bump() {
    flash(cPost);
    setStatus('POST ./api/bump { } …');
    return fetch('./api/bump', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(function () { return getState(); })
      .then(function (s) {
        countEl.textContent = s.count;
        setStatus('POST carried a body → no 411 · GET cache-busted → fresh count ' + s.count, 'ok');
      })
      .catch(function (e) {
        setStatus('failed: ' + e.message + ' (is the server on :5200?)', 'err');
      });
  }

  document.getElementById('bump').addEventListener('click', bump);
  document.getElementById('refresh').addEventListener('click', function () {
    setStatus('GET ./api/state …');
    getState().then(function (s) {
      countEl.textContent = s.count;
      setStatus('GET cache-busted → count ' + s.count, 'ok');
    }).catch(function (e) {
      setStatus('failed: ' + e.message, 'err');
    });
  });

  // initial load — also the badge health check.
  getState().then(function (s) {
    countEl.textContent = s.count;
    badgeEl.textContent = 'live · :5200 · via /preview/';
    badgeEl.classList.add('ok');
  }).catch(function () {
    countEl.textContent = '?';
    badgeEl.textContent = 'server not reached';
    badgeEl.classList.add('err');
    setStatus('Could not reach ./api/state — start the server: node serve.mjs', 'err');
  });

  // ---- the five rules, and how this app meets each ----
  var RULES = [
    ['1', 'Bind 0.0.0.0:5200', 'serve.mjs: server.listen(PORT, "0.0.0.0") — all interfaces, not localhost. Launched detached via launch-detached.vbs, port freed first.'],
    ['2', 'Serve at root', 'serve.mjs: GET / returns index.html; a missing file is a real 404, never an HTML fallback.'],
    ['3', 'Base + relative URLs', 'index.html links ./assets/…; this file fetches ./api/… — all relative, so they ride the /preview/ base. An absolute /asset 404s; an absolute /api 401s to the harness.'],
    ['4', 'Body-ful POSTs', 'bump() POSTs JSON.stringify({}) with a Content-Type. serve.mjs strips a leading /preview/ so the route matches both through ARR and on direct-LAN.'],
    ['5', 'Beat ARR’s GET cache', 'getState() cache-busts every GET (?_=Date.now()); serve.mjs also sets Cache-Control: no-store on /api (ARR may ignore it — which is why the client busts too).'],
  ];
  var ul = document.getElementById('rules');
  RULES.forEach(function (r) {
    var li = document.createElement('li');
    var glob = (r[0] === '4' || r[0] === '5');
    li.innerHTML =
      '<span class="rn">' + r[0] + '</span>' +
      '<div><b>' + r[1] + '</b> ' +
      (glob ? '<span class="tag glob">global-only</span>' : '<span class="tag shared">shared with local</span>') +
      '<div class="rd">' + r[2] + '</div></div>';
    ul.appendChild(li);
  });
})();
