// The policeman's RESPONSIBILITIES (openspec policeman-responsibilities-tab; rendered by
// PolicemanResponsibilities.jsx — a different file name on purpose, case-insensitive disks): one table of
// "when the card is in state X and the conversation / the facts say Y, the policeman does Z" —
// the Operator's answer to "the policeman feels like a black box". Every row is read off the
// code that runs the pass, named in `source`:
//   PolicemanSweep.cs   Trace / Read / Flag / ReasonFor      (ClaudeWeb.App/Services/Policeman)
//   BoardIntegrity.cs   Judge / StuckReason / Apply          (ClaudeWeb.App/Services/TaskGraph)
//   BoardVerifier.cs    facts + forward-only moves
//   CliCardReader.cs    the one question to the model, CardObservations.cs its vocabulary
//   Handoffs.cs         the follow-up correlation
//   TaskVerification.cs the pass: every 60 s, at startup, on Run now — trace → facts → move → judge → read → flag → journal
// Framework-free (node --test), like policemanLoop.js: the view renders ONLY what this returns,
// and the test pins that every observation state the card can show has a row here.
import { OBSERVATIONS } from './cardSections.js';

/** The numbers the rules use — the same constants as the code. */
export const RULES = {
  passEverySeconds: 60,          // TaskVerificationPoller.Interval
  attentionHours: 2,             // PolicemanSweep.AttentionWindow
  againstSweeps: 2,              // PolicemanSweep.AgainstSweeps
  traceEveryMinutes: 5,          // PolicemanSweep.TraceEvery
  tailDefault: 4,                // PolicemanSettings.DefaultTail
  maxQuestionsPerPass: 8,        // PolicemanSettings.DefaultMaxQuestionsPerPass
  lookBackHours: 2,              // Handoffs.LookBack
  sharedWords: 3,                // Handoffs.SharedWords
  stuckWindow: 'the board’s stale window (Settings · 24 h by default)', // graph.StaleAfterMs
};

/** The table's columns, in order. */
export const COLUMNS = [
  ['card', 'the card'],
  ['says', 'the conversation says · the facts show'],
  ['does', 'the policeman does'],
  ['then', 'you see · what happens next'],
];

const r = (card, says, does, then, source) => ({ card, says, does, then, source });

/** The responsibilities, grouped in the order the pass runs. */
export const GROUPS = [
  {
    key: 'domain',
    title: 'Which cards it polices',
    lead: `Every ${RULES.passEverySeconds} s, at startup and when you press Run now, the pass visits every card. A card is IN FLIGHT when it is not delivered (Merged / Done), not manual and not another human’s — only those are traced, read and flagged.`,
    rows: [
      r('in Merged or Done', 'anything', 'nothing — the card is delivered and out of the sweep', 'the card stays where it is', 'PolicemanSweep.InFlight'),
      r('marked manual', 'anything', 'nothing at all — not traced, not judged beyond “manual”, not read, never flagged', 'the verdict counts it as manual', 'BoardIntegrity.Judge'),
      r('owned by another human developer (external owner)', 'anything', 'hands off — never stuck, never “not verified”, never read, never flagged', 'the verdict counts it as external', 'CardDomain / BoardIntegrity.Judge'),
      r('no assignee yet', '—', 'no trace, no reading (nobody to read); the judge still compares the column with the facts', 'a column ahead of the facts is “not verified yet”', 'BoardIntegrity.Judge'),
      r('a cross-repo effort with an agentless leg (path:…)', '—', 'that leg is not traced through an agent and not read; the verifier resolves its PR from its own checkout’s origin and recorded branch; the every-leg-merged rule still counts it', 'the card is done only when EVERY leg is verified merged', 'Effort.HasAgent / BoardVerifier'),
    ],
  },
  {
    key: 'trace',
    title: '1 · Trace — pull requests to cards (before the facts)',
    lead: `For every in-flight assignee that records no pull request yet, the repo’s PRs are listed on GitHub — at most once per ${RULES.traceEveryMinutes} min per assignee, always on Run now.`,
    rows: [
      r('in flight, the assignee records no PR', 'GitHub has an OPEN PR that traces to the card — its recorded branch, the branch the harness recorded at dispatch, the card’s #ref in the title, or the title itself — and the column is below PR open', 'links the PR to the card (records the branch and the PR)', 'a “traced” line in the pass; the verifier then moves the card to PR open on that fact', 'PolicemanSweep.Trace / PrTrace'),
      r('in flight, the assignee records no PR', 'GitHub has a MERGED PR that traces to the card and the column is below Merged', 'links it and marks the discovery ⏪ “board was behind reality” — finished work nobody relayed', 'the verifier advances the card to Merged; the journal shows the ⏪ mark', 'PolicemanSweep.Trace'),
      r('in flight', 'a MERGED PR traces to the card but the PR’s repo is none of the card’s assignees’ repos', 'cannot link it; remembers it and raises 🆘 “board behind reality — PR #n is merged but the card records no link”', 'the flag clears by itself once the card records a PR link or reaches Merged', 'PolicemanSweep.Trace / ReasonFor'),
      r('the assignee already records a PR', '—', 'no trace — the verifier follows that PR', '—', 'PolicemanSweep.Trace'),
      r('in flight', 'GitHub cannot be listed (no github.com remote, an unknown agent, an API error)', 'skips that repo and notes why in the pass', 'the note in the journal', 'PolicemanSweep.Trace'),
    ],
  },
  {
    key: 'move',
    title: '2 · Facts and move — the verifier (code)',
    lead: 'The facts are git and GitHub, never words. A card moves FORWARD to what the facts prove and never backwards; a multi-assignee card is as far as its slowest assignee.',
    rows: [
      r('any assignee on this machine', 'the recorded branch in its clone: commits, pushed or not', 'records the verified state (Committed when the branch has commits)', 'Links → verified', 'BoardVerifier'),
      r('any card naming a PR, on any machine', 'GitHub: the PR is open · merged · closed; whether the merge is live', 'moves the card forward to PR open · Merged · Done (live) on the fact', 'a “moved” line in the pass; Links → verified', 'BoardVerifier'),
      r('column ahead of the facts (Committed with nothing committed, PR open with no PR, Merged while the PR is not merged)', '—', 'does NOT demote — records the verified state and a plain warning “column ahead of reality”', '⚠ not verified yet on the card; the judge and, after two sweeps, the flag pick it up', 'BoardVerifier / TaskLifecycle.IsUnverified'),
      r('column To do or Doing', '—', 'never “ahead”: the facts are not needed to be in To do or Doing', '—', 'TaskLifecycle.VerifiedCeiling'),
    ],
  },
  {
    key: 'judge',
    title: '3 · Judge — the mechanical verdict',
    lead: 'Pure code over the facts the verifier just recorded. Its own 🆘 stamps (the two mechanical reasons) are raised and cleared by it alone.',
    rows: [
      r('column ahead of the facts, on the card or on any assignee', '—', 'verdict: not verified yet (“dishonest”), with the warning as the reason', 'the verdict line; no flag from this step alone', 'BoardIntegrity.Judge'),
      r('a cross-repo effort in Merged / Done', 'a leg is not verified merged on GitHub', 'verdict: not verified yet, EVERY leg named — and the flag step raises 🆘 at once', '🆘 naming each leg that is not merged; the card is never silently done', 'Effort.MismatchReason'),
      r('assignee pinged, no PR, the card back in To do', 'the note says BLOCKED (the arch relayed a TASK BLOCKED)', 'verdict: stuck → 🆘 “the assignee reported it is blocked: …”', 'clears by itself once a PR appears, the card progresses, is delivered, flipped to manual or handed to an external owner', 'BoardIntegrity.StuckReason / Apply'),
      r('assignee pinged, no PR, in Doing or Committed', `nothing new — no dispatch, update or verification — for ${RULES.stuckWindow}`, 'verdict: stuck → 🆘 “pinged, no PR and no progress for X (window Y)”', 'clears by itself on progress', 'BoardIntegrity.StuckReason / Apply'),
      r('assignee never pinged', '—', 'never stuck — nothing to be stuck on', '—', 'BoardIntegrity.StuckReason'),
      r('assignee with a PR', '—', 'never stuck — it waits on review, not on the assignee', '—', 'BoardIntegrity.StuckReason'),
      r('everything else', '—', 'verdict: honest', '—', 'BoardIntegrity.Judge'),
    ],
  },
  {
    key: 'read',
    title: '4 · Read — one question to the model',
    lead: `The only step that asks the model. For every in-flight card whose agent has said something NEWER than the card’s last reading: one question with its last ${RULES.tailDefault} messages (settings) — “which state is it in, and why, in one line” — at most ${RULES.maxQuestionsPerPass} questions per pass. The answer, checked against the fixed vocabulary, becomes the card’s Agent section. The model never moves, flags or clears anything.`,
    rows: [
      r('in flight, an agent assignee', 'the agent has said something newer than the card’s last reading', 'asks ONE question; writes the answer as the card’s reading (state + one-line summary)', 'the Agent section on the card; the 🧠 column in the Sweep; tokens in the journal', 'PolicemanSweep.Read / CliCardReader'),
      r('in flight', 'nothing new since the last reading', 'asks nothing', '“nothing — facts unchanged, no new words”', 'PolicemanSweep.Read'),
      r('in flight', `more than ${RULES.maxQuestionsPerPass} cards have new words in one pass`, 'asks the first ones, notes “not asked — this pass’s questions are spent; next pass” for the rest', 'the note in the journal; the next pass continues', 'PolicemanSweep.Read'),
      r('in flight', 'reading is switched off (■ Stop reading)', 'still gathers what the agent last said, asks nothing, writes no reading', 'the Agent section freezes; facts, moves, the judge and the mechanical flags keep running', 'PolicemanSweep.Read'),
      r('in flight', 'the model’s answer is not the JSON asked for, names an unknown state, has no summary, or the CLI fails / times out (75 s)', 'writes nothing — the card keeps its previous reading', '“no usable answer” in the journal', 'CliCardReader.ReadAsync'),
      r('in flight', '“I’m implementing … / running the tests …” — actively on it', 'reading: ⚙️ Working', 'nothing more', 'CardObservations.Working'),
      r('in flight', 'the work is up as a pull request and the agent waits for a review', 'reading: 👀 Waiting for review', 'nothing more', 'CardObservations.WaitingReview'),
      r('in flight', 'the agent asks the Operator something and nobody answered', 'reading: ❓ Asked a question', `🆘 after ${RULES.attentionHours} h unanswered (step 5)`, 'CardObservations.AskedQuestion'),
      r('in flight', 'the agent says it cannot proceed', 'reading: ⛔ Blocked', `🆘 after ${RULES.attentionHours} h (step 5)`, 'CardObservations.Blocked'),
      r('in flight, the facts prove less than the words', 'the agent says it finished', 'reading: 🗣 Says done — the card is NOT moved; only the facts move cards', 'the column stays where the facts put it', 'CardObservations.ClaimsDone'),
      r('in flight', 'the messages say nothing about the work', 'reading: 💤 Idle', 'nothing more', 'CardObservations.Idle'),
      r('in flight', 'the agent’s last turn failed', 'reading: 💥 Errored', `🆘 after ${RULES.attentionHours} h (step 5)`, 'CardObservations.Errored'),
      r('in flight', 'the LAST turns conclude that the next step is a NEW task for ANOTHER agent or repo — “I wrote a handoff for another agent”, “this needs a prg agent to fix X”, “once their fix is merged I’ll pull it”', 'reading: 🤝 Handoff pending, with the target when the words name it; from then on every pass looks for the follow-up card', `🆘 after ${RULES.attentionHours} h only while no follow-up card exists (step 5)`, 'CardObservations.Handoff / Handoffs'),
      r('reading 🤝 Handoff pending', `a card names this card’s #ref or id in its title or note — or a card assigned to the target repo, or one sharing ≥ ${RULES.sharedWords} significant words with the summary, created since the handoff (less a ${RULES.lookBackHours} h look-back) and not delivered`, 'records it as the follow-up — no model call, pure correlation, whether or not the agent said anything new', '“Handoff tracked — follow-up #ref exists”; the badge stops asking and the flag is never raised (or is withdrawn)', 'Handoffs.FollowUpFor'),
      r('in flight', 'the agent mentions other repos while continuing its own work', 'NOT a handoff — reads as ⚙️ Working', '—', 'CliCardReader.BuildPrompt'),
      r('in flight', 'the agent asks the Operator a question', 'NOT a handoff — reads as ❓ Asked a question', '—', 'CliCardReader.BuildPrompt'),
    ],
  },
  {
    key: 'flag',
    title: '5 · Flag by rule — 🆘 Needs human',
    lead: `Code, informed by the reading. A card carries ONE flag: if anyone’s flag already stands (the judge’s, an agent’s, yours) the policeman adds nothing. Reasons are tried in this order: the reading, a cross-repo mismatch, a column against the facts, board behind reality.`,
    rows: [
      r('reading ❓ Asked a question', `still the latest reading after ${RULES.attentionHours} h`, '🆘 “asked a question X ago and nobody answered: …”', 'answer on the card (step 6)', 'PolicemanSweep.ReasonFor'),
      r('reading ⛔ Blocked', `still the latest reading after ${RULES.attentionHours} h`, '🆘 “says it is blocked, for X: …”', 'answer on the card, or unblock it', 'PolicemanSweep.ReasonFor'),
      r('reading 💥 Errored', `still the latest reading after ${RULES.attentionHours} h`, '🆘 “its last turn failed, X ago: …”', 'look at the agent', 'PolicemanSweep.ReasonFor'),
      r('reading 🤝 Handoff pending', `${RULES.attentionHours} h old and no follow-up card found`, '🆘 “ended in a handoff X ago and no follow-up task exists yet (for <target>): …”', 'create the follow-up task (the arch or you) — the next pass tracks it and the flag goes', 'PolicemanSweep.ReasonFor'),
      r('reading 🤝 Handoff pending', 'a follow-up card was found', 'no flag', '“Handoff tracked”', 'PolicemanSweep.ReasonFor'),
      r('reading ⚙️ 👀 🗣 💤', 'anything', 'no flag from the reading', '—', 'CardObservations.NeedsAttention'),
      r('a cross-repo effort in Merged / Done', 'a leg is not verified merged', '🆘 at once, every unmerged leg named', 'merge the leg, or move the card back yourself', 'Effort.MismatchReason'),
      r('column ahead of the facts', `for ${RULES.againstSweeps} consecutive sweeps`, '🆘 “the column says X but the facts show only Y, for N sweeps”', 'the count resets the moment the facts catch up', 'PolicemanSweep.ReasonFor'),
      r('a merged PR was discovered but could not be linked', '—', '🆘 “board behind reality — …”', 'link the PR on the card, or let the card reach Merged', 'PolicemanSweep.ReasonFor'),
    ],
  },
  {
    key: 'clear',
    title: '6 · Clearing, answering, and what it never does',
    lead: 'A flag is withdrawn only by whoever raised it. The policeman never touches an agent’s flag or yours, never moves a card on words, never talks to an agent on its own.',
    rows: [
      r('🆘 by the policeman, from a reading', 'the reason is gone — the agent continued and the new reading is not one that needs attention, the follow-up task exists, the PR got linked', 'withdraws its own flag', '“cleared 🆘” in the pass', 'PolicemanSweep.Flag'),
      r('🆘 by the policeman, mechanical (stuck)', 'no longer stuck — progress, a PR, delivered, manual, external', 'the judge withdraws its own stamp', '“cleared 🆘” in the pass', 'BoardIntegrity.Apply'),
      r('🆘 by an agent (request_human) or by you', 'anything', 'never touched', 'you clear it', 'PolicemanSweep.Flag / BoardIntegrity.Apply'),
      r('🆘 on the card, you answer in the drawer', 'your text', 'sends it into the assignee’s conversation as YOUR message (“[the Operator, answering the flag on task #ref]”) and keeps the answer on the flag', '“answered — waiting for the agent”; the flag clears once the agent continues and the next reading changes', 'TaskGraphController.Answer'),
      r('any card', 'a claim in words — “done”, “merged”, “I opened a PR”', 'never moves the card on it; the facts alone move cards, forward only', 'the reading may say 🗣 Says done; the column does not change', 'BoardVerifier / NEVER'),
      r('any card', 'the model answers', 'the model decides ONE thing: the reading. Code moves, judges, flags, clears and journals', '—', 'PolicemanSweep.Read'),
      r('every pass', '—', 'writes the pass down: trigger, traced, moved, asked, raised, cleared, verdict, cost, error', '📜 History; a card’s timeline in its drawer', 'PolicemanJournal'),
    ],
  },
];

/** The reading vocabulary as the card shows it: [key, icon, word, meaning]. */
export const VOCABULARY = Object.entries(OBSERVATIONS).map(([key, [icon, word, meaning]]) => [key, icon, word, meaning]);

/** Every row, flattened with its group. */
export function allRows(groups = GROUPS) {
  return groups.flatMap((g) => g.rows.map((row) => ({ ...row, group: g.key })));
}

/** Rows whose words contain every term of `query` (case-insensitive, any column). */
export function filterRows(query, groups = GROUPS) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return groups;
  return groups.map((g) => ({
    ...g,
    rows: g.rows.filter((row) => {
      const hay = `${row.card} ${row.says} ${row.does} ${row.then} ${row.source || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }),
  })).filter((g) => g.rows.length > 0);
}
