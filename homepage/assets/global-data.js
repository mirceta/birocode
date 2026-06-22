// Shared data for the Global-exposure example — the PUBLIC twin of core.js.
//
// Same shape as ExposureViz (NODES / MESSAGES / RULES), so the four data-agnostic
// viz variants (pipeline/sequence/layers/stepper) render this story unchanged when
// the Global topic hands them a ctx built from here. Only the data differs: the
// public Homepage path crosses an off-box IIS+ARR proxy, so it carries FIVE rules
// (vs local's three) — the two extra exist to survive the public reverse proxy.

(function () {
  // The three actors in the public round trip (left→right / top→bottom).
  var NODES = [
    {
      id: 'browser',
      title: 'Anyone, no login',
      sub: 'opens the public homepage',
      glyph: '🌍',
    },
    {
      id: 'door',
      title: 'Public HTTPS door',
      sub: 'IIS + ARR · https://<domain> · strips /preview/ → :5200',
      glyph: '🛡️',
    },
    {
      id: 'app',
      title: 'Your product',
      sub: 'listening on 0.0.0.0:5200',
      glyph: '🚀',
    },
  ];

  // Canonical messages, in order. `rule` marks the hop where one of the five
  // contract rules is make-or-break; the stepper legend highlights it.
  var MESSAGES = [
    {
      from: 'browser', to: 'door', kind: 'req',
      label: 'GET https://<domain>/preview/',
      detail: 'Anyone past the IP gate loads the public homepage — no login. It embeds ' +
        'the App product via the same-origin /preview/ path. This is the one surface a ' +
        'stranger can see.',
    },
    {
      from: 'door', to: 'app', kind: 'req',
      label: 'strip /preview/  →  dial <host>:5200  →  GET /',
      rule: 'bind 0.0.0.0:5200',
      detail: 'ARR terminates TLS, strips the /preview/ prefix, and forwards to your ' +
        'product. It dials the machine’s address — so the product MUST bind ' +
        '0.0.0.0:5200 (all interfaces), not localhost, or the off-box proxy can’t ' +
        'reach it. Launch it detached and free the port first.',
    },
    {
      from: 'app', to: 'door', kind: 'res',
      label: '200  text/html',
      rule: 'serve at root',
      detail: 'Your product answers GET / at the root with the page HTML. Serve only under ' +
        'your own sub-path and the embed is blank.',
    },
    {
      from: 'door', to: 'browser', kind: 'res',
      label: '200  (served under /preview/)',
      detail: 'ARR streams the HTML back to the browser, living under the /preview/ origin ' +
        'of the public domain.',
    },
    {
      from: 'browser', to: 'door', kind: 'req',
      label: 'GET /preview/assets/app.js',
      rule: 'base + relative URLs',
      detail: 'The page built its asset URLs under the /preview/ base (Vite base:"/preview/", ' +
        'or ./relative). An absolute /assets/… escapes the prefix → 404; an absolute ' +
        '/api/… escapes to the harness → 401. Runtime fetch URLs need the base too.',
    },
    {
      from: 'browser', to: 'door', kind: 'req',
      label: 'POST /preview/api/act   { }',
      rule: 'body-ful POST',
      detail: 'Always send a body (even {}) with Content-Type. IIS+ARR rejects a ' +
        'Content-Length-less POST with 411 Length Required — it works on :5200 directly but ' +
        '411s through the public door.',
    },
    {
      from: 'browser', to: 'door', kind: 'req',
      label: 'GET /preview/api/state?_=1717543210',
      rule: 'beat ARR cache',
      detail: 'ARR caches GETs by exact URL and IGNORES the backend’s no-store. ' +
        'Cache-bust every GET (?_=Date.now()) or a read after a mutation returns the frozen ' +
        'old body and the UI appears to "revert" — looks like a client race, isn’t one.',
    },
    {
      from: 'door', to: 'browser', kind: 'res',
      label: '200  →  live on the public homepage ✅',
      detail: 'Assets load, fetches resolve under the prefix, POSTs carry a body, GETs bust ' +
        'the cache — your product is correctly exposed to the world.',
    },
  ];

  // The five contract rules, for any variant that wants a legend.
  var RULES = [
    { id: 'bind 0.0.0.0:5200', short: 'Bind 0.0.0.0:5200', text: 'All interfaces, not localhost; detached, port free.' },
    { id: 'serve at root', short: 'Serve at root', text: 'GET / returns your page.' },
    { id: 'base + relative URLs', short: 'Base + relative URLs', text: 'Asset + fetch URLs under /preview/, not /….' },
    { id: 'body-ful POST', short: 'Body-ful POSTs', text: 'Send a body (even {}) or ARR 411s.' },
    { id: 'beat ARR cache', short: 'Beat ARR cache', text: 'Cache-bust GETs (?_=…); ARR ignores no-store.' },
  ];

  window.GlobalExposureViz = {
    NODES: NODES,
    MESSAGES: MESSAGES,
    RULES: RULES,
  };
})();
