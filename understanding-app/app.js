// Understanding app — where the Kanban badge links open (fleet task a434653b). No deps, relative URLs only.
(function () {
  var tabs = document.querySelectorAll('.tab');
  var views = document.querySelectorAll('.view');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.toggle('is-on', x === t); });
      views.forEach(function (v) { v.classList.toggle('is-on', v.dataset.view === t.dataset.view); });
    });
  });

  // The two modes: the exact window.open call a badge click makes, and what follows.
  var SCREEN = { label: 'DELL U2419H', left: -1920, top: 0, width: 1920, height: 1080, availLeft: -1920, availTop: 0, availWidth: 1920, availHeight: 1040 };
  var HREF = 'http://192.168.1.20:5099/studio?agent=web-flow-autodev';
  function render() {
    var mode = document.querySelector('input[name=mode]:checked').value;
    var call = document.getElementById('call');
    var effects = document.getElementById('effects');
    if (mode === 'tabs') {
      call.textContent = "const w = window.open('', 'birocode-agent-src-monster_r-webflow');   // no features → a TAB in this window\nif (w.location.href === 'about:blank') w.location.href = '" + HREF + "';\nw.focus();";
      effects.innerHTML = '<li>a brand-new agent tab appears <b>in the dashboard\'s Chrome window</b> (right monitor)</li><li>once dragged to the left window, every later click <b>finds and focuses</b> it there — never reloads it</li><li>two agents = two tabs; a re-click never duplicates</li>';
    } else {
      call.textContent = "const w = window.open('', 'birocode-harness-window', 'popup=1,left=" + SCREEN.availLeft + ",top=" + SCREEN.availTop + ",width=" + SCREEN.availWidth + ",height=" + SCREEN.availHeight + "');   // features → a SEPARATE window, placed on the chosen screen\nif (w.location.href !== '" + HREF + "') w.location.href = '" + HREF + "';   // cross-origin? navigate anyway\nw.focus();";
      effects.innerHTML = '<li>the FIRST click creates ONE dedicated harness window — on <b>' + SCREEN.label + '</b> when the Window Management permission was granted on a secure page, else beside this window (drag it once)</li><li>every later click <b>navigates that same window</b> to the clicked agent and focuses it — nothing new ever opens in the dashboard\'s window</li><li>a popup-style window: no tab strip; it keeps its position and size for as long as it lives</li>';
    }
  }
  document.querySelectorAll('input[name=mode]').forEach(function (r) { r.addEventListener('change', render); });
  document.getElementById('click').addEventListener('click', function () { render(); var c = document.getElementById('call'); c.style.outline = '2px solid #5ea0ef'; setTimeout(function () { c.style.outline = ''; }, 500); });
  render();
})();
