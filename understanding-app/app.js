// Deploy-status Understanding app — countdown + fork simulator.
// All state is client-side; the deadline is the real one from the deploy.

(function () {
  'use strict';

  // ---- live countdown to the rollback deadline ----
  var DEADLINE = new Date(2026, 6, 6, 22, 59, 13); // 2026-07-06 22:59:13 local (task trigger)
  var cdEl = document.getElementById('countdown');
  var cdLabel = document.getElementById('cdLabel');
  var banner = document.getElementById('banner');
  var armPill = document.getElementById('armPill');

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function tick() {
    var ms = DEADLINE - new Date();
    if (ms > 0) {
      var s = Math.floor(ms / 1000);
      cdEl.textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
    } else {
      // Deadline has passed. This page can't know whether keep.ps1 disarmed
      // the task in time — say so instead of guessing.
      banner.classList.add('expired');
      cdLabel.textContent = 'Deadline passed';
      cdEl.textContent = 'If "keep it" was said in time, the new build survived; otherwise live has already auto-reverted.';
      armPill.textContent = 'DEADLINE PASSED';
      armPill.classList.remove('armed');
      armPill.classList.add('fired');
      clearInterval(timer);
    }
  }
  var timer = setInterval(tick, 1000);
  tick();

  // ---- fork simulator: reveal one path's steps in sequence ----
  var btnKeep = document.getElementById('btnKeep');
  var btnIgnore = document.getElementById('btnIgnore');
  var flowKeep = document.getElementById('flowKeep');
  var flowIgnore = document.getElementById('flowIgnore');
  var pending = [];

  function showFlow(flow, otherFlow, btn, otherBtn) {
    pending.forEach(clearTimeout);
    pending = [];

    otherFlow.classList.remove('visible');
    flow.classList.add('visible');
    btn.classList.add('active');
    otherBtn.classList.remove('active');

    var steps = flow.querySelectorAll('.step, .outcome');
    steps.forEach(function (el) { el.classList.remove('shown'); });
    steps.forEach(function (el, i) {
      pending.push(setTimeout(function () { el.classList.add('shown'); }, 150 + i * 450));
    });
  }

  btnKeep.addEventListener('click', function () {
    showFlow(flowKeep, flowIgnore, btnKeep, btnIgnore);
  });
  btnIgnore.addEventListener('click', function () {
    showFlow(flowIgnore, flowKeep, btnIgnore, btnKeep);
  });
})();
