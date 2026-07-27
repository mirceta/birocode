// Understanding app — "aligning the dock with the loop-type model"
// Vanilla JS, no deps. Three interactions: tab router, loop-card expanders,
// before/after wipe, and a goal-loop step simulator.
(function () {
  'use strict';

  // ── Tab router ──
  var tabs = document.getElementById('tabs');
  var panels = document.querySelectorAll('.panel');
  tabs.addEventListener('click', function (e) {
    var btn = e.target.closest('.tabs__btn');
    if (!btn) return;
    var name = btn.dataset.tab;
    tabs.querySelectorAll('.tabs__btn').forEach(function (b) {
      b.classList.toggle('is-on', b === btn);
    });
    panels.forEach(function (p) {
      p.classList.toggle('is-on', p.dataset.panel === name);
    });
  });

  // ── Loop-type card expanders ──
  document.querySelectorAll('.loopcard').forEach(function (card) {
    var toggle = function () { card.classList.toggle('is-open'); };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
  // Open the goal card by default so the seeded recipes are visible.
  var goalCard = document.querySelector('.loopcard--goal');
  if (goalCard) goalCard.classList.add('is-open');

  // ── Before/after wipe ──
  var range = document.getElementById('baRange');
  var before = document.getElementById('baBefore');
  var handle = document.getElementById('baHandle');
  if (range && before && handle) {
    var applyWipe = function () {
      var v = Number(range.value); // 0..100 = how much of BEFORE is shown from the left
      before.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
      handle.style.left = v + '%';
    };
    range.addEventListener('input', applyWipe);
    applyWipe();
  }

  // ── Goal-loop simulator ──
  var RECIPES = {
    drive: {
      name: 'Drive the feature',
      cap: 10,
      prompt: 'Continue driving the current OpenSpec change: pick the next unchecked task…',
    },
    ship: {
      name: 'Finish and ship',
      cap: 5,
      prompt: 'Finish and ship the current work: verify the build and tests pass, update docs…',
    },
  };

  var el = {
    recipe: document.getElementById('simRecipe'),
    reply: document.getElementById('simReply'),
    step: document.getElementById('simStep'),
    reset: document.getElementById('simReset'),
    bar: document.getElementById('simBar'),
    iter: document.getElementById('simIter'),
    cap: document.getElementById('simCap'),
    badge: document.getElementById('simBadge'),
    prompt: document.getElementById('simPrompt'),
    log: document.getElementById('simLog'),
  };

  var state = { iter: 0, cap: 10, status: 'stopped', done: false };

  function currentRecipe() { return RECIPES[el.recipe.value]; }

  function render() {
    var r = currentRecipe();
    state.cap = r.cap;
    el.cap.textContent = r.cap;
    el.iter.textContent = state.iter;
    el.prompt.textContent = r.prompt;
    el.bar.style.width = Math.min(100, (state.iter / r.cap) * 100) + '%';
    el.badge.textContent = state.status;
    el.badge.dataset.state = state.status;
    el.step.disabled = state.done;
  }

  function addLog(kind, html) {
    var li = document.createElement('li');
    if (kind) li.className = kind;
    li.innerHTML = html;
    el.log.prepend(li);
  }

  function reset(keepLog) {
    state = { iter: 0, cap: currentRecipe().cap, status: 'stopped', done: false };
    if (!keepLog) el.log.innerHTML = '';
    render();
  }

  var STOP = {
    done: { status: 'done', reason: 'sentinel — agent reported <b>LOOP_DONE</b>' },
    human: { status: 'escalate', reason: 'escalated — agent asked <b>NEEDS_HUMAN:</b> which base?' },
    risky: { status: 'escalate', reason: 'escalated — <b>deny‑list</b> hit (“force‑push”)' },
  };

  el.step.addEventListener('click', function () {
    if (state.done) return;
    var reply = el.reply.value;

    // A goal-loop turn: it resent the fixed prompt, agent replied, engine reads the ending.
    state.iter += 1;
    state.status = 'looping';
    addLog('is-send', '<b>Turn ' + state.iter + '</b> — <span>resent the fixed prompt →</span> agent worked');

    if (STOP[reply]) {
      var s = STOP[reply];
      state.status = s.status;
      state.done = true;
      addLog('is-stop', '<b>Stopped:</b> <span>' + s.reason + '</span>');
      render();
      return;
    }

    // "more work" — keep looping unless we hit the cap.
    if (state.iter >= state.cap) {
      state.status = 'capped';
      state.done = true;
      addLog('is-stop', '<b>Stopped:</b> <span>iteration <b>cap</b> reached (' + state.cap + ')</span>');
    }
    render();
  });

  el.reset.addEventListener('click', function () { reset(false); });
  el.recipe.addEventListener('change', function () { reset(false); });

  render();
})();
