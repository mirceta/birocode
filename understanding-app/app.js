// Understanding app for: "assume the other agent is on the SAME box — what does
// that change for the paste that teaches the Understanding-app convention?"
// Answer: it collapses the self-contained copy into a pointer to one on-disk doc.
// Self-contained, no libraries, relative URLs only.

(function () {
  var PANES = {
    copy: {
      h3: '📋 Self-contained copy',
      p: 'The old paste re-typed the entire 4-line contract into the prompt, so the ' +
         'other agent needed nothing from this box to start. Robust anywhere — but it is ' +
         'a copy, and copies drift.',
      pills: ['~5 paragraphs', 'works offline', 'duplicated text', 'drifts on change'],
      pillsNote: 'fine when you can’t assume reachability — not our case',
    },
    pointer: {
      h3: '🎯 Pointer (chosen)',
      p: 'Same box, so the agent just reads the canonical doc off disk. The paste shrinks ' +
         'to two lines: “read docs/understanding-app-convention.md and follow it.” One ' +
         'source of truth, nothing to keep in sync.',
      pills: ['2 lines', 'reads off disk', 'single source', 'no drift'],
      pillsNote: 'enabled purely by the same-box assumption',
    },
  };

  var tabs = document.getElementById('demoTabs');
  var screen = document.getElementById('demoScreen');

  function render(id) {
    var d = PANES[id];
    var pane = document.createElement('div');
    pane.className = 'pane';
    pane.innerHTML =
      '<h3>' + d.h3 + '</h3><p>' + d.p + '</p>' +
      '<div class="pane__row">' +
      d.pills.map(function (p) { return '<span class="pane__pill">' + p + '</span>'; }).join('') +
      '</div><p class="pane__ghost" style="margin-top:10px">' + d.pillsNote + '</p>';
    screen.innerHTML = '';
    screen.appendChild(pane);
  }

  Array.prototype.forEach.call(tabs.children, function (btn) {
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(tabs.children, function (b) {
        b.classList.toggle('tab--on', b === btn);
      });
      render(btn.dataset.tab);
    });
  });

  render('pointer');
})();
