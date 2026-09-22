// Understanding app — manual agent occupancy (fleet task 3a978f93). View 1 is the composition
// rule as an interactive table: ArchClaims.Classify then ArchClaims.ApplyOccupancy, transcribed.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

function classify(branch, busy, unmanaged) {
  if (unmanaged) return { a: 'unmanaged', r: null };
  if (busy) return { a: 'busy', r: null };
  if (branch === 'main' || branch === 'arch') return { a: 'available', r: null };
  if (branch === 'human') return { a: 'claimed', r: 'human-active' };
  return { a: 'available', r: 'unassigned-branch' };
}
function applyOccupancy(v, op) {
  if (op === 'auto') return { ...v, how: 'the branch rule' };
  if (v.a !== 'available' && v.a !== 'claimed') return { ...v, how: `${v.a} is a fact — the Operator's setting is kept but does not apply` };
  if (op === 'occupied') return { a: 'claimed', r: 'operator-occupied', how: 'the Operator said occupied' };
  const unassigned = v.r === 'human-active' || v.r === 'unassigned-branch';
  return { a: 'available', r: unassigned ? 'unassigned-branch' : null, how: 'the Operator said free' + (unassigned ? ' — a send must still name the branch' : '') };
}
function render() {
  const v = applyOccupancy(classify($('#branch').value, $('#busy').checked, $('#unmanaged').checked), $('#op').value);
  const occupied = v.a === 'claimed' || v.a === 'busy';
  $('#verdict').innerHTML = `<span class="pill pill--${v.a}">${v.a}</span>${v.r ? ` <code>${v.r}</code>` : ''} <span class="dim">— ${v.how}</span><br><span class="dim">Status tab: ${$('#op').value === 'auto' ? (occupied || $('#branch').value !== 'main' ? 'Occupied (branch rule)' : 'Free (branch rule)') : ($('#op').value === 'occupied' ? 'Occupied ✋' : 'Free ✋')}; arch: ${v.a === 'available' ? 'may send' : v.a === 'claimed' ? 'sends refused as claimed' : v.a}</span>`;
}
['#branch', '#op', '#busy', '#unmanaged'].forEach((s) => $(s).addEventListener('change', render));
render();
