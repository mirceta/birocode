/* Understanding app — loop-agent-briefing (D2a/D2b).
   Self-contained, no deps. Visualizes how ComposeBriefedPrompt wraps a stored
   prompt with a fixed frame around the OPERATOR-EDITABLE rules list (work sends)
   or the fixed verify-phase honesty note. Frame text mirrors LoopConfigStore;
   the seeded rules mirror BriefingRulesStore's draft v1. */

/* ---- the FIXED frame, verbatim from LoopConfigStore ---- */
const HEADER = "[Autopilot loop briefing]";
const INTRO = [
  "This prompt was sent by an automated loop. It was not typed live by a human,",
  "and nobody is reading your reply in real time — a reply that only asks or",
  "plans goes nowhere."
].join("\n");
const ESCALATION = [
  "- Only if a decision genuinely requires the human — irreversible, destructive,",
  "  or a preference only they can give — stop and end your reply with the final",
  "  line: NEEDS_HUMAN: <one short question>"
].join("\n");
const VERIFY_NOTE = [
  HEADER,
  "This verification prompt was sent by an automated loop; nobody is reading in",
  "real time. Judge honestly — a false confirmation silently corrupts the run,",
  "while an honest refusal merely stops the loop for a human to look at."
].join("\n");
const SEP = "--- The prompt follows. ---";
const CONTRACT_QUEUE = "Below is one item from a stored queue; a separate verification turn follows\nautomatically, so print no completion marker.";
const CONTRACT_SENTINEL = (s) => "When the whole job below is genuinely complete — not before —\nend your reply with the exact final line: " + s;

/* ---- the EDITABLE rules (D2b): seeded draft v1, lives in briefing.json ---- */
let RULES = [
  { text: "Do the work in this turn. Do not stop at a plan, a list of options, or a clarifying question.", enabled: true },
  { text: "Answer your own questions and follow your own advice when you are confident. Choose sensible defaults for open details and state briefly which you chose.", enabled: true }
];
let REV = 1; // bumps on every edit — each send stamps the rev it composed with

/* per-kind spec used by the composer tab */
const KINDS = {
  "queue-item":   { phase:"work",   sentinel:null,        stored:"Add a null check to the queue drain",
                    contract:CONTRACT_QUEUE },
  "queue-verify": { phase:"verify", sentinel:null,        stored:"Verify the previous step actually landed. Reply STEP_VERIFIED on the final line only if it did." },
  "goal-work":    { phase:"work",   sentinel:"LOOP_DONE", stored:"Keep improving test coverage on the parser until every branch is hit." },
  "goal-verify":  { phase:"verify", sentinel:"GOAL_VERIFIED", stored:"Is the goal fully met? Reply GOAL_VERIFIED on the final line only if it is." },
  "recipe":       { phase:"work",   sentinel:"LOOP_DONE", stored:"Run the nightly triage recipe: scan new issues, label, and summarise." }
};

/* build the briefing for a kind (mirrors ComposeBriefedPrompt): fixed frame
   around the CURRENT enabled rules; verify sends get the note only — the rules
   structurally cannot reach a verification turn. */
function briefingFor(kind) {
  const spec = KINDS[kind];
  if (spec.phase === "verify") return VERIFY_NOTE;
  const bullets = RULES.filter(r => r.enabled).map(r => "- " + r.text);
  const contract = spec.contract || CONTRACT_SENTINEL(spec.sentinel);
  return [HEADER, INTRO, ...bullets, ESCALATION, contract, SEP].join("\n");
}

/* escape + lightweight syntax highlight for a prompt block */
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function hlBriefing(text){
  let h = esc(text)
    .replace(/(\[Autopilot loop briefing\])/g,'<span class="k-title">$1</span>')
    .replace(/(NEEDS_HUMAN: &lt;one short question&gt;)/g,'<span class="k-marker">$1</span>')
    .replace(/(LOOP_DONE|GOAL_VERIFIED|STEP_VERIFIED)/g,'<span class="k-marker">$1</span>')
    .replace(/(--- The prompt follows\. ---)/g,'<span class="k-sep">$1</span>')
    .replace(/(Below is one item from a stored queue[\s\S]*?marker\.|When the whole job below[\s\S]*?final line: )/g,
             '<span class="k-contract">$1</span>');
  // mark the operator-editable rule bullets
  RULES.filter(r=>r.enabled).forEach(r=>{
    const needle = esc("- " + r.text);
    h = h.replace(needle, '<span class="k-rule">' + needle + '</span>');
  });
  return h;
}

/* ---------- tabs ---------- */
document.querySelectorAll("#tabs button").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll("#tabs button").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
  });
});

/* ---------- TAB 1: why ---------- */
const STORED_ITEM = "Wire up the retry cap on the drain worker.";
const whyScenarios = () => ({
  off: {
    prompt: STORED_ITEM,
    reply: "Sure — before I start: should the cap be per-worker or global, and what limit did you have in mind? I can sketch two approaches and wait for your call.",
    bad: true,
    outcome: "✗ Turn ends with a question. Nobody answers. Step-verify refuses → queue escalates → operator interrupt.",
    chain: [["send raw item","n"],["agent asks a question","bad"],["no human reads it","bad"],["STEP_VERIFIED refused","bad"],["queue ESCALATES","bad"]]
  },
  on: {
    reply: "Done. I made the cap per-worker (sensible default; a global cap needs a config knob you didn't ask for) and set it to 5 retries matching the existing backoff. Added the guard in DrainWorker.Run and a test. If a global cap is actually wanted that's a preference call — but I didn't block on it.",
    bad: false,
    outcome: "✓ Work happened this turn. Defaults chosen and stated. No escalation.",
    chain: [["send briefed item","n"],["agent acts + picks defaults","good"],["work lands","good"],["STEP_VERIFIED passes","good"],["queue advances","good"]]
  }
});

const toggle = document.getElementById("briefToggle");
function renderWhy(on){
  const s = on ? whyScenarios().on : whyScenarios().off;
  document.getElementById("whyPrompt").innerHTML = on
    ? '<span style="color:var(--faint);font-family:var(--mono);font-size:12px">[briefing: fixed frame + your enabled rules]</span>\n\n' + esc(STORED_ITEM)
    : esc(STORED_ITEM);
  document.getElementById("whyReply").textContent = s.reply;
  const wrap = document.getElementById("whyReplyWrap");
  wrap.classList.toggle("bad", s.bad);
  const oc = document.getElementById("whyOutcome");
  oc.textContent = s.outcome;
  oc.className = "outcome " + (s.bad ? "bad" : "good");
  const chain = document.getElementById("whyChain");
  chain.innerHTML = s.chain.map((c,i)=>
    (i? '<span class="ar">→</span>':'') + '<span class="cn '+c[1]+'">'+c[0]+'</span>'
  ).join("");
  toggle.classList.toggle("on", on);
  toggle.classList.toggle("off", !on);
  toggle.querySelector(".state").textContent = on ? "ON" : "OFF";
  toggle.setAttribute("aria-pressed", on);
  document.getElementById("toggleHint").textContent = on
    ? "Briefed send — the agent knows it's driven and acts"
    : "Bare stored text — the pre-change behaviour";
}
let whyOn=false;
toggle.addEventListener("click",()=>{whyOn=!whyOn;renderWhy(whyOn);});
renderWhy(false);

/* ---------- TAB 2: compose (with the editable rules list, D2b) ---------- */
let curKind = "queue-item";
const storedInput = document.getElementById("storedInput");

function renderRules(){
  const list = document.getElementById("rulesList");
  list.innerHTML = RULES.map((r,i)=>
    '<li class="rule'+(r.enabled?'':' off')+'">'
    + '<input type="checkbox" data-i="'+i+'" '+(r.enabled?'checked':'')+' title="'+(r.enabled?'enabled — composed into every driven work send':'parked idea — remembered, not sent')+'" />'
    + '<span class="rule-t">'+esc(r.text)+'</span>'
    + '<button class="rule-del" data-i="'+i+'" title="delete">×</button>'
    + '</li>'
  ).join("");
  list.querySelectorAll("input[type=checkbox]").forEach(cb=>cb.addEventListener("change",()=>{
    RULES[+cb.dataset.i].enabled = cb.checked; REV++; renderRules(); renderCompose();
  }));
  list.querySelectorAll(".rule-del").forEach(b=>b.addEventListener("click",()=>{
    RULES.splice(+b.dataset.i,1); REV++; renderRules(); renderCompose();
  }));
  document.getElementById("rulesRev").textContent = "rev " + REV;
  document.getElementById("rulesCount").textContent =
    RULES.filter(r=>r.enabled).length + "/" + RULES.length + " enabled";
}
document.getElementById("ruleAddBtn").addEventListener("click",addRule);
document.getElementById("ruleAdd").addEventListener("keydown",e=>{if(e.key==="Enter")addRule();});
function addRule(){
  const inp = document.getElementById("ruleAdd");
  const t = inp.value.trim();
  if(!t) return;
  RULES.push({text:t, enabled:true});
  inp.value=""; REV++;
  renderRules(); renderCompose();
}

function renderCompose(){
  const spec = KINDS[curKind];
  const briefing = briefingFor(curKind);
  const stored = storedInput.value || spec.stored;

  const phasePill = '<span class="pill '+spec.phase+'">phase: '+spec.phase+'</span>';
  const sentPill = spec.sentinel ? '<span class="pill">sentinel: '+spec.sentinel+'</span>' : '';
  const corePill = '<span class="pill">'+(spec.phase==="verify"?"verify-phase note — rules never apply":"work-phase frame + enabled rules")+'</span>';
  const revPill = spec.phase==="verify" ? '' : '<span class="pill">stamps rules rev '+REV+'</span>';
  document.getElementById("composeBadges").innerHTML = phasePill + corePill + sentPill + revPill;

  document.getElementById("composeBriefing").innerHTML = hlBriefing(briefing);
  document.getElementById("composeStored").innerHTML = '<span class="k-op">'+esc(stored)+'</span>';
  document.getElementById("composeSent").innerHTML =
    hlBriefing(briefing) + "\n\n" + '<span class="k-op">'+esc(stored)+'</span>';
}
document.querySelectorAll("#picker button").forEach(b=>{
  b.addEventListener("click",()=>{
    document.querySelectorAll("#picker button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    curKind = b.dataset.k;
    storedInput.value = KINDS[curKind].stored;
    renderCompose();
  });
});
storedInput.addEventListener("input", renderCompose);
renderRules();
renderCompose();

/* ---------- TAB 3: the text ---------- */
function renderText(){
  document.getElementById("workTpl").innerHTML =
    hlBriefing([HEADER, INTRO].join("\n"))
    + '\n<span class="k-rules-slot">{enabled rules from briefing.json — the two seeded draft-v1 bullets, plus yours}</span>\n'
    + hlBriefing([ESCALATION, "{contract line}", SEP].join("\n"));
  document.getElementById("verifyTpl").innerHTML = hlBriefing(VERIFY_NOTE);
}
renderText();
