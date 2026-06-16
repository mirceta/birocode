// Shared state + data for the Local-exposure example product.
//
// This file loads FIRST. It creates the global `ExposureViz`, which holds the
// canonical request-flow data every visualization variant renders, and the
// registry each variant calls `register()` on. Keeping the data here means every
// variant tells the exact same story — only the *presentation* differs.

(function () {
  // The three actors in the round trip. Order matters (left→right / top→bottom).
  var NODES = [
    {
      id: 'browser',
      title: 'Your phone / browser',
      sub: 'opens the Local tab',
      glyph: '📱',
    },
    {
      id: 'harness',
      title: 'Claude Web harness',
      sub: 'Kestrel · :5099 · /api/localview/<repo>/app/<appId>/',
      glyph: '🧩',
    },
    {
      id: 'app',
      title: 'Your product',
      sub: 'listening on :5305',
      glyph: '🚀',
    },
  ];

  // The canonical messages, in order. `rule` marks the hop where one of the three
  // contract rules is what makes-or-breaks the exposure — variants surface it.
  var MESSAGES = [
    {
      from: 'browser', to: 'harness', kind: 'req',
      label: 'GET /api/localview/<repo>/app/<appId>/',
      detail: 'You click the Local tab. The browser asks the harness for your ' +
        'product, addressed under the per-app proxy sub-path. A repo can expose ' +
        'several apps, each at …/app/<appId>/ — and the bare /api/localview/<repo>/ ' +
        'is a shortcut to the default (first) app. Every app follows the same ' +
        'contract below.',
    },
    {
      from: 'harness', to: 'app', kind: 'req',
      label: 'dial 127.0.0.1:5305  →  GET /',
      rule: 'dual-stack bind',
      detail: 'The harness forwards the request to your app on loopback. It dials ' +
        '127.0.0.1 (and the check also probes [::1]) — so your app MUST listen on ' +
        'both, or the embed comes back blank.',
    },
    {
      from: 'app', to: 'harness', kind: 'res',
      label: '200  text/html',
      rule: 'serve at root',
      detail: 'Your app answers GET / at the root with the page HTML. If it only ' +
        'served under its own sub-path, the root would return nothing and the tab ' +
        'would be empty.',
    },
    {
      from: 'harness', to: 'browser', kind: 'res',
      label: '200  (served under the sub-path)',
      detail: 'The harness streams the HTML back to the browser, living under ' +
        '/api/localview/<repo>/app/<appId>/ (the bare path = the default app).',
    },
    {
      from: 'browser', to: 'harness', kind: 'req',
      label: 'GET …/assets/app.js',
      rule: 'relative URLs',
      detail: 'The page referenced its script as ./assets/app.js (relative), so the ' +
        'browser resolves it UNDER the proxy sub-path. A leading-slash /assets/… ' +
        'would escape the sub-path and 404.',
    },
    {
      from: 'harness', to: 'app', kind: 'req',
      label: 'GET /assets/app.js',
      detail: 'The harness forwards the asset request to your app on :5305.',
    },
    {
      from: 'app', to: 'harness', kind: 'res',
      label: '200  application/javascript',
      detail: 'Your app serves the asset from its build output.',
    },
    {
      from: 'harness', to: 'browser', kind: 'res',
      label: '200  →  app boots ✅',
      detail: 'The asset arrives, the script runs, and your product is live inside ' +
        'the Local tab — correctly exposed.',
    },
  ];

  // The three contract rules, for any variant that wants a legend.
  var RULES = [
    { id: 'dual-stack bind', short: 'Dual-stack bind', text: 'Listen on 127.0.0.1 AND [::1].' },
    { id: 'serve at root', short: 'Serve at root', text: 'GET / returns your page.' },
    { id: 'relative URLs', short: 'Relative URLs', text: 'Reference assets as ./… not /….' },
  ];

  window.ExposureViz = {
    NODES: NODES,
    MESSAGES: MESSAGES,
    RULES: RULES,
    variants: [],
    register: function (variant) {
      this.variants.push(variant);
    },
    // Small helper variants can reuse: create an element with class + text.
    el: function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    },
  };
})();
