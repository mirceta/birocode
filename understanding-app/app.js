/* The button that vanished — version-skew diagnosis. Build-less, no deps. ./app.js */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---- tab switching ---- */
  var tabs = $('#tabs');
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-v]');
    if (!b) return;
    var v = b.getAttribute('data-v');
    $$('#tabs button').forEach(function (x) { x.classList.toggle('active', x === b); });
    $$('section.view').forEach(function (s) { s.classList.toggle('active', s.getAttribute('data-v') === v); });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---- view ①: hypothesis fork ---- */
  var fork = $('#fork');
  var forkMsg = $('#forkMsg');
  var FORK_DEFAULT = 'A rollback would revert everything to 6/28 — backend included. So the deciding question is: does the live backend still know the new route? Run the test.';
  var forkBusy = false;
  function resetFork() {
    forkBusy = false;
    $$('.hyp', fork).forEach(function (h) {
      h.classList.remove('ruled-out', 'confirmed');
      $('.verdict', h).textContent = '';
      $('h4', h).classList.remove('strike');
    });
    forkMsg.textContent = FORK_DEFAULT;
  }
  async function testFork() {
    if (forkBusy) return;
    forkBusy = true;
    var a = $('.hyp[data-h="rollback"]', fork);
    var b = $('.hyp[data-h="skew"]', fork);
    a.classList.remove('ruled-out', 'confirmed'); b.classList.remove('ruled-out', 'confirmed');
    $('.verdict', a).textContent = ''; $('.verdict', b).textContent = '';
    $('h4', a).classList.remove('strike');
    forkMsg.textContent = 'Probing the live backend route /api/understanding/status …';
    await sleep(750);
    a.classList.add('ruled-out');
    $('h4', a).classList.add('strike');
    $('.verdict', a).textContent = '✗ Ruled out — the route still answers and lastgood is untouched. A rollback would have reverted the backend too.';
    await sleep(700);
    b.classList.add('confirmed');
    $('.verdict', b).textContent = '✓ Confirmed — backend is new (6/29) but the served JS is old (6/28). The bundle never got copied over.';
    forkMsg.textContent = 'Verdict: version skew. The backend shipped; the frontend bundle in the run dir did not. Tab ② shows the three artifacts.';
    forkBusy = false;
  }
  $('#testBtn').addEventListener('click', testFork);
  $('#testReset').addEventListener('click', resetFork);
  $$('.hyp', fork).forEach(function (h) { h.addEventListener('click', testFork); });

  /* ---- view ②: artifact scanner ---- */
  var arts = $('#arts');
  var scanline = $('#scanline');
  var scanMsg = $('#scanMsg');
  var scanDefault = scanMsg.innerHTML;
  function resetScan() {
    $$('.art', arts).forEach(function (a) { a.classList.remove('scanned'); });
    scanline.style.opacity = '0';
    scanMsg.innerHTML = scanDefault;
  }
  async function runScan() {
    resetScan();
    var list = $$('.art', arts);
    for (var i = 0; i < list.length; i++) {
      scanline.style.opacity = '1';
      await sleep(420);
      list[i].classList.add('scanned');
      await sleep(260);
    }
    scanline.style.opacity = '0';
    scanMsg.innerHTML = 'Scan complete. Two artifacts contain <code class="inline">understandingAgent</code> — both dated 6/29. ' +
      'But the bundle the browser actually receives is the 6/28 one that does <b>not</b>. The fresh build exists; it was simply never copied into the run dir.';
  }
  $('#scanBtn').addEventListener('click', runScan);
  $('#scanReset').addEventListener('click', resetScan);

  /* ---- view ③: request trace ---- */
  var req = $('#req');
  function resetReq() { $$('.rnode', req).forEach(function (n) { n.classList.remove('lit'); }); }
  async function traceReq() {
    resetReq();
    var nodes = $$('.rnode', req);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.add('lit');
      await sleep(520);
    }
  }
  $('#reqBtn').addEventListener('click', traceReq);
  $('#reqReset').addEventListener('click', resetReq);

  /* ---- view ⑤: robocopy fix ---- */
  var dstFile = $('#dstFile');
  var dstHash = $('#dstHash');
  var dstTag = $('#dstTag');
  function resetFix() {
    dstHash.textContent = 'index-BKUDIuJp.js';
    dstHash.className = 'h old';
    dstTag.textContent = 'stale · 6/28 · no button';
    dstFile.classList.remove('flip');
  }
  async function runFix() {
    resetFix();
    await sleep(450);
    dstFile.classList.add('flip');
    await sleep(450);
    dstHash.textContent = 'index-D2iCtp2-.js';
    dstHash.className = 'h new';
    await sleep(180);
    dstTag.textContent = 'fresh · 6/29 · has the button';
  }
  $('#fixBtn').addEventListener('click', runFix);
  $('#fixReset').addEventListener('click', resetFix);
})();
