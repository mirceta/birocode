/* Status Monitor Dashboard — proposal mock. Build-less, no deps. ./app.js */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---- tabs ---- */
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    $$('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    $$('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'v-' + b.dataset.v); });
  });

  /* ---- base fleet state (what api/status-monitor/board would return) ----
     status taxonomy = the collector's existing one. */
  function baseState() {
    return {
      boardStale: false,
      sources: [
        { name: 'desk-main', status: 'alive', seen: 0,  act: 'claude · birocode · feat/status-monitor — proposing' },
        { name: 'desk-2',    status: 'alive', seen: 1,  act: 'claude · youtube-transcript · main — idle 12m' },
        { name: 'laptop',    status: 'alive', seen: 2,  act: 'claude · client-x · fix/auth — tests running' },
        { name: 'nuc-1',     status: 'alive', seen: 0,  act: 'claude · scraper · main — long run, 41m' },
        { name: 'nuc-2',     status: 'alive', seen: 1,  act: '— no agent running' }
      ],
      github: [
        { name: 'birocode',           ci: 'pass', prs: 2, oldest: '2d', review: '1 ready' },
        { name: 'youtube-transcript', ci: 'pass', prs: 0, oldest: null, review: null },
        { name: 'client-x',           ci: 'pass', prs: 1, oldest: '5h', review: 'changes requested' },
        { name: 'scraper',            ci: 'pass', prs: 1, oldest: '9d', review: 'draft' }
      ]
    };
  }

  var STALE_MIN = 10; /* staleness threshold, minutes */

  /* labels: icon + label always paired — status color never carries meaning alone */
  var STATUS = {
    'alive':            { chip: 'ok',       ic: '✓', label: 'alive' },
    'ip-blocked':       { chip: 'critical', ic: '✖', label: 'ip-blocked' },
    'needs-credential': { chip: 'critical', ic: '✖', label: 'needs credential' },
    'bad-credential':   { chip: 'critical', ic: '✖', label: 'bad credential' },
    'throttled':        { chip: 'serious',  ic: '⚠', label: 'throttled' },
    'stale':            { chip: 'warning',  ic: '◌', label: 'not seen' }
  };

  /* ---- attention is DERIVED, never stored — same projection the server would do ---- */
  function deriveAttention(st) {
    var q = [];
    st.sources.forEach(function (s) {
      if (s.status !== 'alive' && s.status !== 'stale') {
        var sev = s.status === 'throttled' ? 'serious' : 'critical';
        q.push({ sev: sev, ic: '✖', text: s.name + ' — ' + STATUS[s.status].label +
                 (s.detail ? ' (' + s.detail + ')' : ''), fix: s.fix || '' });
      } else if (s.seen >= STALE_MIN) {
        q.push({ sev: 'warning', ic: '◌', text: s.name + ' — dark for ' + s.seen + 'm', fix: 'check the machine / harness' });
      }
    });
    var rank = { critical: 0, serious: 1, warning: 2 };
    q.sort(function (a, b) { return rank[a.sev] - rank[b.sev]; });
    return q;
  }

  /* ---- renderers ---- */
  function render(st) {
    var attn = deriveAttention(st);
    var el = $('#attn');
    if (!attn.length) {
      el.innerHTML = '<div class="attn-clear"><span class="ic">✓</span>Nothing needs you — all five machines healthy</div>';
    } else {
      el.innerHTML = attn.map(function (a) {
        return '<div class="attn-row ' + a.sev + '"><span class="ic">' + a.ic + '</span><span>' + a.text +
               '</span><span class="fix">' + a.fix + '</span></div>';
      }).join('');
    }

    $('#fleet').innerHTML = st.sources.map(function (s) {
      var eff = (s.status === 'alive' && s.seen >= STALE_MIN) ? 'stale' : s.status;
      var c = STATUS[eff];
      return '<div class="mach"><div class="name">' + s.name + '</div>' +
        '<span class="chip ' + c.chip + '">' + c.ic + ' ' + c.label + '</span>' +
        '<div class="seen">last seen ' + (s.seen === 0 ? 'just now' : s.seen + 'm ago') + '</div>' +
        '<div class="act">' + s.act + '</div></div>';
    }).join('');

    $('#gh').innerHTML = st.github.map(function (r) {
      var fail = r.ci === 'fail';
      return '<div class="repo' + (fail ? ' red' : '') + '"><div class="name">' + r.name + '</div>' +
        '<div class="ci ' + (fail ? 'fail' : 'pass') + '">' + (fail ? '✖ CI failing' : '✓ CI green') +
        (r.workflow ? ' · ' + r.workflow : '') + '</div>' +
        '<div class="prs">' + (r.prs ? r.prs + ' open PR' + (r.prs > 1 ? 's' : '') +
        (r.oldest ? ' · oldest ' + r.oldest : '') + (r.review ? ' · ' + r.review : '') : 'no open PRs') + '</div></div>';
    }).join('');

    $('#board').classList.toggle('dimmed', st.boardStale);
    $('#staleBanner').classList.toggle('on', st.boardStale);
    frozen = st.boardStale;
    if (st.boardStale) { $('#staleTime').textContent = lastTick; }
  }

  /* ---- scenarios: mutate collector state, board just re-derives ---- */
  var CAPTIONS = {
    calm:    'Spec scenario "Nothing needs the operator": an empty queue renders as an explicit all-clear state, never an empty gap.',
    badcred: 'Spec scenario "Blocked source enters the queue": nuc-1’s feed token expired → the collector marks it bad-credential → on the next board poll a critical row appears at the TOP, naming machine, refusal, and fix. This is the highest-value signal on the board.',
    dark:    'Spec scenario "Machine goes dark": laptop hasn’t answered a poll for ' + 14 + 'm (> ' + STALE_MIN + 'm threshold) → its card changes state and a warning row appears. Note ordering: a dark machine ranks below a refused one.',
    ci:      'Spec scenario "CI goes red": birocode’s default-branch workflow failed → the tile goes red within one 60s cache window. Deliberate v1 detail: CI red does NOT enter the "needs me" queue — that queue is only for blocked agents/machines.',
    stale:   'Spec scenario "Board loses its own data source": consecutive board polls failed → full-bleed staleness banner over the dimmed last-known state. A wallboard that silently freezes while looking healthy is worse than no wallboard.'
  };

  function apply(name) {
    var st = baseState();
    if (name === 'badcred') {
      var n = st.sources[3]; n.status = 'bad-credential'; n.detail = '401 from feed'; n.fix = 'rotate the feed token';
      n.act = '— unknown: feed refused'; n.seen = 6;
    } else if (name === 'dark') {
      st.sources[2].seen = 14; st.sources[2].act = '— last known: tests running';
    } else if (name === 'ci') {
      st.github[0].ci = 'fail'; st.github[0].workflow = 'build-and-test';
    } else if (name === 'stale') {
      st.boardStale = true;
    }
    render(st);
    $('#caption').textContent = CAPTIONS[name];
  }

  $('#scenarios').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    $$('#scenarios button').forEach(function (x) { x.classList.toggle('on', x === b); });
    apply(b.dataset.s);
  });

  /* ---- the last-updated clock (freezes when the board is stale) ---- */
  var frozen = false, lastTick = '';
  setInterval(function () {
    if (frozen) return;
    var d = new Date();
    lastTick = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    $('#clock').textContent = 'updated ' + lastTick;
  }, 1000);

  apply('calm');
})();
