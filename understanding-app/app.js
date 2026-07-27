/* Understanding app — why the goal loop stopped at iteration 0, and the
   arm-freshness fix. Build-less, no deps, relative URLs only. */
(function () {
  'use strict';

  // ---- tabs ----------------------------------------------------------------
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('on'); });
      document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('on'); });
      t.classList.add('on');
      document.getElementById(t.dataset.v).classList.add('on');
    });
  });

  // ---- tab 1: arm + tick simulator ----------------------------------------
  // The exact shape of what happened this morning: the trailing message is the
  // human/agent DEPLOY conversation; then the goal loop is armed; then ticks.
  var lane = document.getElementById('lane');
  var verdicts = document.getElementById('verdicts');
  var armBtn = document.getElementById('simArm');
  var tickBtn = document.getElementById('simTick');
  var resetBtn = document.getElementById('simReset');
  var modePill = document.getElementById('modePill');

  var fixed = false;   // false = engine before the fix
  var armed = false;
  var step = 0;        // ticks taken since arming

  modePill.addEventListener('click', function () {
    fixed = !fixed;
    modePill.textContent = fixed ? 'engine: AFTER the fix' : 'engine: BEFORE the fix';
    modePill.className = 'pill ' + (fixed ? 'on-new' : 'on-old');
    reset();
  });
  resetBtn.addEventListener('click', reset);

  function msg(who, html, cls) {
    var d = document.createElement('div');
    d.className = 'msg' + (cls ? ' ' + cls : '');
    d.innerHTML = '<div class="who">' + who + '</div><div class="txt">' + html + '</div>';
    lane.appendChild(d);
    d.scrollIntoView({ block: 'nearest' });
    return d;
  }
  function armline() {
    var d = document.createElement('div');
    d.className = 'armline';
    d.innerHTML = '<span>🎯 goal loop ARMED here (ArmedAt stamped)</span>';
    lane.appendChild(d);
  }
  function verdict(ok, html) {
    var d = document.createElement('div');
    d.className = 'verdict ' + (ok ? 'ok' : 'bad');
    d.innerHTML = html;
    verdicts.appendChild(d);
    d.scrollIntoView({ block: 'nearest' });
  }

  function seed() {
    msg('🤖 agent — 14:43 (BEFORE arming: your deploy conversation)',
      '<b>Deployed and verified on live :5099</b> — the <span class="deny">deploy</span> carried the ' +
      'always-admin <span class="deny">merge</span>… say “keep it”.');
  }

  function reset() {
    lane.innerHTML = '';
    verdicts.innerHTML = '';
    armed = false; step = 0;
    armBtn.disabled = false;
    tickBtn.disabled = true;
    seed();
  }

  armBtn.addEventListener('click', function () {
    if (armed) return;
    armed = true; step = 0;
    armBtn.disabled = true;
    tickBtn.disabled = false;
    armline();
    verdict(true, 'Loop armed: goal <i>“reply OK; the 3rd time, reply LOOP_DONE”</i>, drive mode, phase work. ' +
      'Nothing has been sent yet — <b>iterationsDone = 0</b>. Now click <b>Engine tick</b>.');
  });

  tickBtn.addEventListener('click', function () {
    if (!armed) return;
    step++;
    if (!fixed) {
      // Old engine: first tick judges the PRE-ARM deploy message with the ladder.
      verdict(false,
        '<b>Tick ' + step + ' (old engine):</b> trailing reply contains deny-listed ' +
        '<span class="deny">“deploy”</span> → <b>Stop(escalate, deny-list)</b> at iterationsDone 0. ' +
        'The loop is dead — <i>this is exactly your debug bundle</i>: ' +
        '<code>stopReason: "deny-list", iterationsDone: 0</code>. It judged a message it never caused. ' +
        'Click the red pill above to switch to the fixed engine.');
      tickBtn.disabled = true;
      return;
    }
    // Fixed engine walkthrough.
    if (step === 1) {
      verdict(true,
        '<b>Tick 1 (fixed):</b> trailing reply timestamp (14:43) &lt; ArmedAt → <b>pre-arm, ignored by the ladder</b>. ' +
        'Decision: Propose(stored work prompt) → <b>SEND, iteration 1</b>.');
      msg('🚗 loop → agent', 'Work toward this goal until it is genuinely achieved: …reply OK… (stored work prompt)');
      msg('🤖 agent — now (fresh: produced AFTER arming)', 'OK');
    } else if (step === 2) {
      verdict(true, '<b>Tick 2:</b> fresh reply “OK” — ladder applies (no deny words, no sentinel) → resend work prompt, iteration 2.');
      msg('🚗 loop → agent', '(same stored work prompt)');
      msg('🤖 agent', 'OK');
    } else if (step === 3) {
      verdict(true, '<b>Tick 3:</b> resend, iteration 3 — the 3rd ask.');
      msg('🚗 loop → agent', '(same stored work prompt)');
      msg('🤖 agent', 'That was the 3rd time. <b>LOOP_DONE</b>');
    } else if (step === 4) {
      verdict(true, '<b>Tick 4:</b> fresh reply carries the sentinel → send the <b>verification prompt</b>, phase → verify. ' +
        'Only <code>GOAL_VERIFIED</code> in the verification reply resolves the loop as done.');
      msg('🚗 loop → agent', 'You declared the goal done… verify against the ACTUAL state… end with GOAL_VERIFIED.');
      tickBtn.disabled = true;
      verdict(true, '<b>Note:</b> fresh replies are still fully guarded — in the e2e, a post-arm reply saying ' +
        '“I will deploy to production” escalated the loop with <code>deny-list</code> as before. ' +
        'Only <i>stale</i> history is immune.');
    }
  });

  reset();
})();
