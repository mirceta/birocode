// Loaded via a RELATIVE URL (./assets/exposer.js). If this runs, the browser
// resolved the script under the harness's /api/localview/<repo>/ sub-path —
// proof the relative-URL rule is satisfied. An absolute "/assets/exposer.js"
// would have escaped the sub-path and 404'd. That's the whole demonstration.
(function () {
  var el = document.getElementById('exposer-status');
  if (!el) return;
  el.textContent =
    'Relative script resolved under the proxy sub-path — assets are wired correctly. ✓';
  el.classList.add('exposer__status--ok');
})();
