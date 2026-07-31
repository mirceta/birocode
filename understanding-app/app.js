/* Understanding app — loop-agent-briefing (D2a).
   Self-contained, no deps. Visualizes how ComposeBriefedPrompt wraps a stored
   prompt with a work-phase core (+ contract line) or a verify-phase honesty note. */

// ---- the briefing text, verbatim from design.md D2a draft v1 ----
const WORK_CORE =
`[Autopilot loop briefing]
This prompt was sent by an automated loop. It was not typed live by a human, and
nobody is reading your reply in real time — a reply that only asks or plans goes
nowhere.
- Do the work in this turn. Do not stop at a plan, a list of options, or a
  clarifying question.
- Answer your own questions and follow your own advice when you are confident.
  Choose sensible defaults for open details and state briefly which you chose.
- Only if a decision genuinely requires the human — irreversible, destructive,
  or a preference only they can give — stop and end your reply with the final
  line: NEEDS_HUMAN: <one short question>`;

const VERIFY_NOTE =
`[Autopilot loop briefing]
This verification prompt was sent by an automated loop; nobody is reading in
real time. Judge honestly — a false confirmation silently corrupts the run,
while an honest refusal merely stops the loop for a human to look at.`;

const SEP = `--- The prompt follows. ---`;

// ---- the five send shapes ----
const KINDS = [
  { id:'queue-item',   label:'queue item',    phase:'work',
    contract:'Below is one item from a stored queue; a separate verification turn follows automatically, so print no completion marker.',
    stored:'Add a --dry-run flag to swap.ps1' },
  { id:'goal-work',    label:'goal work',     phase:'work', sentinel:'LOOP_DONE',
    contract:'When the whole job below is genuinely complete — not before — end your reply with the exact final line: LOOP_DONE',
    stored:'Goal: make swap.ps1 support a dry-run that previews the swap without touching live.' },
  { id:'recipe',       label:'recipe',        phase:'work', sentinel:'RECIPE_DONE',
    contract:'When the whole job below is genuinely complete — not before — end your reply with the exact final line: RECIPE_DONE',
    stored:'Run the nightly checklist: build client, run swap.ps1 -DryRun, summarize the guard output.' },
  { id:'queue-verify', label:'queue step-verify', phase:'verify',
    stored:'The step above claimed to add a --dry-run flag to swap.ps1. Independently confirm it is really there and wired to the guard.' },
  { id:'goal-verify',  label:'goal verify',   phase:'verify',
    stored:'Verify the dry-run goal is fully met: swap.ps1 -DryRun previews build + guard and never touches live.' },
];

let current = KINDS[0].id;

const $ = (s, r=document) => r.querySelector(s);
const el = (tag, cls, txt) => { const n=document.createElement(tag); if(cls)n.className=cls; if(txt!=null)n.textContent=txt; return n; };
const wordsOf = s => s.trim().split(/\s+/).filter(Boolean).length;

// ---- shapes list (choke-point diagram) ----
function renderShapes(){
  const host = $('#shapes'); host.innerHTML='';
  KINDS.forEach(k=>{
    const row = el('div','shape'+(k.id===current?' sel':''));
    row.dataset.id = k.id;
    row.appendChild(el('span',null,k.label));
    row.appendChild(el('span','ph '+k.phase, k.phase));
    row.onclick = ()=>select(k.id);
    host.appendChild(row);
  });
}

// ---- kind buttons (builder toolbar) ----
function renderKinds(){
  const host = $('#kinds'); host.innerHTML='';
  KINDS.forEach(k=>{
    const b = el('button','kbtn'+(k.id===current?' on':''));
    const dot = el('span','dot '+k.phase);
    b.appendChild(dot); b.appendChild(el('span',null,k.label));
    b.onclick = ()=>select(k.id);
    host.appendChild(b);
  });
}

// ---- left column: the stacked parts, animated in ----
function renderParts(){
  const k = KINDS.find(x=>x.id===current);
  const host = $('#parts'); host.innerHTML='';
  const items = [];

  if(k.phase==='work'){
    items.push({cls:'core', hd:'briefing · work core (fixed)', bd:WORK_CORE, plusAfter:true});
    items.push({cls:'contract', hd:'contract line · by kind', bd:k.contract, plusAfter:true});
    items.push({cls:'sep', hd:'separator', bd:SEP, plusAfter:true});
    items.push({cls:'stored', hd:'stored text (operator-owned, raw)', bd:k.stored});
  } else {
    items.push({cls:'note', hd:'briefing · verify note (fixed, no posture)', bd:VERIFY_NOTE, plusAfter:true});
    items.push({cls:'sep', hd:'separator', bd:SEP, plusAfter:true});
    items.push({cls:'stored', hd:'stored verify text (raw)', bd:k.stored});
  }

  items.forEach((it,i)=>{
    const p = el('div','part '+it.cls);
    const hd = el('div','hd'); hd.appendChild(el('span',null,it.hd));
    if(it.cls==='stored') hd.appendChild(el('span',null,'briefed:false'));
    p.appendChild(hd);
    p.appendChild(el('div','bd', it.bd));
    host.appendChild(p);
    if(it.plusAfter){ const pl=el('div','plus','+'); pl.style.opacity='0'; host.appendChild(pl); }
    setTimeout(()=>{
      p.classList.add('show');
      const pl=p.nextSibling;
      if(pl && pl.className==='plus'){ pl.style.transition='opacity .3s'; pl.style.opacity='1'; }
    }, 90*i + 40);
  });
}

// ---- right column: the composed bytes ----
function renderSent(){
  const k = KINDS.find(x=>x.id===current);
  $('#sentkind').textContent = k.label + ' · ' + k.phase;
  const body = $('#sentbody'); body.innerHTML='';

  const add = (cls, txt, block) => {
    const node = document.createElement(block?'div':'span');
    node.className = cls; node.textContent = txt;
    body.appendChild(node);
    if(!block) body.appendChild(document.createTextNode('\n'));
  };

  if(k.phase==='work'){
    add('b-core', WORK_CORE);
    add('b-contract', k.contract);
    body.appendChild(document.createTextNode('\n'));
    add('b-sep', SEP);
    add('b-stored', k.stored, true);
  } else {
    add('b-note', VERIFY_NOTE);
    body.appendChild(document.createTextNode('\n'));
    add('b-sep', SEP);
    add('b-stored', k.stored, true);
  }
}

// ---- word budget meter (tracks the fixed briefing core) ----
function renderMeter(){
  const k = KINDS.find(x=>x.id===current);
  const core = k.phase==='work' ? WORK_CORE : VERIFY_NOTE;
  const n = wordsOf(core);
  const pct = Math.min(100, Math.round(n/120*100));
  const fill = $('#wfill');
  fill.style.width = pct+'%';
  fill.style.background = n<=120
    ? 'linear-gradient(90deg,var(--green),var(--accent))'
    : 'linear-gradient(90deg,var(--amber),var(--red))';
  $('#wcount').textContent = n;
  $('#wok').textContent = n<=120 ? '✓ within budget' : '✗ over';
  $('#wok').style.color = n<=120 ? 'var(--green)' : 'var(--red)';

  $('#phasenote').innerHTML = k.phase==='work'
    ? 'Work phase → the <b style="color:var(--accent)">act-don\'t-ask core</b> plus a per-kind contract line'
      + (k.sentinel ? ' carrying the sentinel <code>'+k.sentinel+'</code>.' : ' (no done-marker — a verify turn follows).')
    : 'Verify phase → the <b style="color:var(--amber)">honesty-first note</b> only. No posture pressure, no marker line — '
      + 'that comes from the verify template, not the briefing.';
}

function select(id){
  current = id;
  renderShapes(); renderKinds(); renderParts(); renderSent(); renderMeter();
}

// init
renderShapes(); renderKinds(); renderParts(); renderSent(); renderMeter();
