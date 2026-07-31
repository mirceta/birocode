/* Understanding app — loop-agent-briefing (D2a).
   Self-contained, no deps. Visualizes how ComposeBriefedPrompt wraps a stored
   prompt with a work-phase core (+ contract line) or a verify-phase honesty note.
   All briefing text mirrors design.md D2a draft v1. */

/* ---- the briefing text, verbatim from D2a draft v1 ---- */
const WORK_CORE = [
  "[Autopilot loop briefing]",
  "This prompt was sent by an automated loop. It was not typed live by a human, and",
  "nobody is reading your reply in real time — a reply that only asks or plans goes",
  "nowhere.",
  "- Do the work in this turn. Do not stop at a plan, a list of options, or a",
  "  clarifying question.",
  "- Answer your own questions and follow your own advice when you are confident.",
  "  Choose sensible defaults for open details and state briefly which you chose.",
  "- Only if a decision genuinely requires the human — irreversible, destructive,",
  "  or a preference only they can give — stop and end your reply with the final",
  "  line: NEEDS_HUMAN: <one short question>"
].join("\n");

const VERIFY_NOTE = [
  "[Autopilot loop briefing]",
  "This verification prompt was sent by an automated loop; nobody is reading in",
  "real time. Judge honestly — a false confirmation silently corrupts the run,",
  "while an honest refusal merely stops the loop for a human to look at."
].join("\n");

const SEP = "--- The prompt follows. ---";
const CONTRACT_QUEUE = "Below is one item from a stored queue; a separate verification turn follows\nautomatically, so print no completion marker.";
const CONTRACT_SENTINEL = (s) => "When the whole job below is genuinely complete — not before —\nend your reply with the exact final line: " + s;

/* per-kind spec used by the composer tab */
const KINDS = {
  "queue-item":   { phase:"work",   sentinel:null,        stored:"Add a null check to the queue drain",
                    contract:CONTRACT_QUEUE },
  "queue-verify": { phase:"verify", sentinel:null,        stored:"Verify the previous step actually landed. Reply STEP_VERIFIED on the final line only if it did." },
  "goal-work":    { phase:"work",   sentinel:"LOOP_DONE", stored:"Keep improving test coverage on the parser until every branch is hit." },
  "goal-verify":  { phase:"verify", sentinel:"GOAL_VERIFIED", stored:"Is the goal fully met? Reply GOAL_VERIFIED on the final line only if it is." },
  "recipe":       { phase:"work",   sentinel:"LOOP_DONE", stored:"Run the nightly triage recipe: scan new issues, label, and summarise." }
};

/* build the fixed briefing block for a kind (mirrors ComposeBriefedPrompt) */
function briefingFor(kind) {
  const spec = KINDS[kind];
  if (spec.phase === "verify") return VERIFY_NOTE;
  let contract = spec.contract;
  if (!contract) contract = CONTRACT_SENTINEL(spec.sentinel);
  return WORK_CORE + "\n" + contract + "\n" + SEP;
}

/* escape + lightweight syntax highlight for a prompt block */
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function hlBriefing(text){
  return esc(text)
    .replace(/(\[Autopilot loop briefing\])/g,'<span class="k-title">$1</span>')
    .replace(/(NEEDS_HUMAN: &lt;one short question&gt;)/g,'<span class="k-marker">$1</span>')
    .replace(/(LOOP_DONE|GOAL_VERIFIED|STEP_VERIFIED)/g,'<span class="k-marker">$1</span>')
    .replace(/(--- The prompt follows\. ---)/g,'<span class="k-sep">$1</span>')
    .replace(/(Below is one item from a stored queue[\s\S]*?marker\.|When the whole job below[\s\S]*?final line: )/g,
             '<span class="k-contract">$1</span>');
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
const whyScenarios = {
  off: {
    prompt: STORED_ITEM,
    reply: "Sure — before I start: should the cap be per-worker or global, and what limit did you have in mind? I can sketch two approaches and wait for your call.",
    bad: true,
    outcome: "✗ Turn ends with a question. Nobody answers. Step-verify refuses → queue escalates → operator interrupt.",
    chain: [["send raw item","n"],["agent asks a question","bad"],["no human reads it","bad"],["STEP_VERIFIED refused","bad"],["queue ESCALATES","bad"]]
  },
  on: {
    prompt: WORK_CORE + "\n" + CONTRACT_QUEUE + "\n" + SEP + "\n\n" + STORED_ITEM,
    reply: "Done. I made the cap per-worker (sensible default; a global cap needs a config knob you didn't ask for) and set it to 5 retries matching the existing backoff. Added the guard in DrainWorker.Run and a test. If a global cap is actually wanted that's a preference call — but I didn't block on it.",
    bad: false,
    outcome: "✓ Work happened this turn. Defaults chosen and stated. No escalation.",
    chain: [["send briefed item","n"],["agent acts + picks defaults","good"],["work lands","good"],["STEP_VERIFIED passes","good"],["queue advances","good"]]
  }
};

const toggle = document.getElementById("briefToggle");
function renderWhy(on){
  const s = on ? whyScenarios.on : whyScenarios.off;
  document.getElementById("whyPrompt").innerHTML = on
    ? '<span style="color:var(--faint);font-family:var(--mono);font-size:12px">[fixed briefing prefix]</span>\n\n' + esc(STORED_ITEM)
    : esc(s.prompt);
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

/* ---------- TAB 2: compose ---------- */
let curKind = "queue-item";
const storedInput = document.getElementById("storedInput");

function renderCompose(){
  const spec = KINDS[curKind];
  const briefing = briefingFor(curKind);
  const stored = storedInput.value || spec.stored;

  // badges
  const phasePill = '<span class="pill '+spec.phase+'">phase: '+spec.phase+'</span>';
  const sentPill = spec.sentinel ? '<span class="pill">sentinel: '+spec.sentinel+'</span>' : '';
  const corePill = '<span class="pill">'+(spec.phase==="verify"?"verify-phase note":"work-phase core")+'</span>';
  document.getElementById("composeBadges").innerHTML = phasePill + corePill + sentPill;

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
renderCompose();

/* ---------- TAB 3: the text ---------- */
document.getElementById("workTpl").innerHTML =
  hlBriefing(WORK_CORE + "\n{contract line}\n" + SEP);
document.getElementById("verifyTpl").innerHTML = hlBriefing(VERIFY_NOTE);
