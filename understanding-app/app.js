// Stale-cache fix — USAGE guide SPA. Self-contained, no libraries, relative
// URLs (served under /api/localview/<repo>/app/understanding/). Two interactions:
//   1) the symptom picker maps "what you're seeing" → the right rung + advice;
//   2) picking a symptom also highlights the matching rung in the ladder above.
// Mirrors plans/cache-hardening.md (three layers = three things you can do).
(function () {
  const answer = document.getElementById('answer');
  const choices = Array.from(document.querySelectorAll('.choice'));
  const rungs = Array.from(document.querySelectorAll('.rung'));

  // One entry per rung — title + the concrete action to take.
  const ADVICE = [
    {
      title: 'Rung 1 — just reload.',
      body: 'The shell is served <b>no-store</b>, so a normal reload (Ctrl+R, or ' +
            'pull-to-refresh) already lands on the newest build. Nothing to click.',
      tone: 'ok',
    },
    {
      title: 'Rung 2 — click Reload on the banner.',
      body: 'That bar means the server is serving a newer build than this tab is ' +
            'running. Tap <b>Reload</b>; it runs the thorough clear and you’re current.',
      tone: 'ok',
    },
    {
      title: 'Rung 3 — Force refresh.',
      body: 'Go to <b>Settings ▸ Maintenance ▸ Force refresh</b>. It wipes ' +
            'caches, unregisters service workers, and reloads cache-busted — a ' +
            'guaranteed clean slate even through a stubborn proxy. Then check ' +
            '<b>This tab’s build</b> right below the button to confirm.',
      tone: 'warn',
    },
  ];

  function select(rung) {
    const a = ADVICE[rung];
    answer.innerHTML =
      '<p class="answer__title">' + a.title + '</p>' +
      '<p class="answer__body">' + a.body + '</p>';
    answer.className = 'answer show ' + a.tone;
    choices.forEach((c) => c.classList.toggle('active', Number(c.dataset.rung) === rung));
    rungs.forEach((r) => r.classList.toggle('lit', Number(r.dataset.rung) === rung));
    // Bring the highlighted rung into view on small screens.
    const target = rungs.find((r) => Number(r.dataset.rung) === rung);
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  choices.forEach((c) => c.addEventListener('click', () => select(Number(c.dataset.rung))));
})();
