// Stale-cache fix — plan explainer SPA. Self-contained, no libraries, relative
// URLs (served under /api/localview/<repo>/app/understanding/). One interaction:
// the "Run the fix" button animates the SERVER→CACHE→TAB diagram from stale to
// fresh and lights up the three fix layers in turn, mirroring understanding.md.
(function () {
  const cacheBox = document.getElementById('cacheBox');
  const tabBox = document.getElementById('tabBox');
  const cacheHash = document.getElementById('cacheHash');
  const tabHash = document.getElementById('tabHash');
  const verdict = document.getElementById('verdict');
  const btn = document.getElementById('fixBtn');
  const layers = ['L1', 'L2', 'L3'].map((id) => document.getElementById(id));

  function reset() {
    cacheBox.className = 'box cache';
    tabBox.className = 'box tab';
    cacheHash.textContent = 'index-OLD.js';
    tabHash.textContent = 'index-OLD.js';
    verdict.textContent = '⚠ Stale — the cached shell pins the OLD hash.';
    verdict.className = 'verdict';
    layers.forEach((l) => l && l.classList.remove('lit'));
  }

  const steps = [
    // 1 · no-store: the cache stops holding the shell.
    () => {
      layers[0].classList.add('lit');
      cacheBox.className = 'box cache purged';
      cacheHash.textContent = '(no-store — empty)';
    },
    // 2 · the tab re-fetches the fresh shell → fresh hash.
    () => {
      layers[1].classList.add('lit');
      tabBox.className = 'box tab fresh';
      tabHash.textContent = 'index-NEW.js';
    },
    // 3 · banner/button guarantee it, even through a proxy.
    () => {
      layers[2].classList.add('lit');
      verdict.textContent = '✓ Fresh — every reload now lands on the latest build.';
      verdict.className = 'verdict ok';
    },
  ];

  let timers = [];
  btn.addEventListener('click', () => {
    timers.forEach(clearTimeout);
    timers = [];
    reset();
    btn.disabled = true;
    steps.forEach((step, i) => {
      timers.push(setTimeout(step, 650 * (i + 1)));
    });
    timers.push(setTimeout(() => { btn.disabled = false; }, 650 * (steps.length + 1)));
  });

  reset();
})();
