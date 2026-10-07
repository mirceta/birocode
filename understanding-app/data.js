// Fleet task 7914195c — the Arch examples tab: where the catalogue comes from and how a message
// becomes a category. Transcribed from openspec/changes/arch-examples-tab.
window.AX_DATA = {
  sources: [
    ['Arch transcripts', '~/.claude/projects/<arch-home>/*.jsonl — the Arch agent chat, the second arch, the policeman, every goal conversation', '653 user turns in 10 files → 285 are the Operator'],
    ['Goal conversations', 'arch.json → GoalText / GoalStartedBy', '7 goals; 1 started by the Operator (the rest are the arch continuing or fulfilling requests)'],
    ['Repo-agent requests', 'agent-requests.json', '12 requests (8 approved, 4 dismissed) — a category by nature'],
  ],
  dropped: [
    ['[wake-up from the harness …]', 'the harness telling the arch what happened'],
    ['[Autopilot loop briefing] …', 'a loop prompt, not a person'],
    ['[goal <id> done — summary …]', 'a goal\'s summary posted back'],
    ['[Request from repo agent …]', 'the request post (the store is the source instead)'],
    ['This session is being continued …', 'a context roll-over'],
    ['[from the Operator, queued while you were busy] + body', 'KEPT — unwrapped to its body'],
  ],
  // a message walks the ordered rules; the first match wins
  walk: [
    { text: 'alright now we merged something new in birocode. please update all of the fleet computer birocode repo agents except spacex please', hits: [['nudge', false], ['explain-concept', false], ['tracking-card', false], ['recurring-task', false], ['redeploy-fleet', true]] },
    { text: 'Make a card for razvoj2016\'s prg agent — we are doing local-bironext on there. just a card — dont delegate it anything, its already working on it', hits: [['nudge', false], ['explain-concept', false], ['tracking-card', true]] },
    { text: 'we merged PR #151 of birocode — can you pull and redeploy on this computer so we can use the new thing', hits: [['nudge', false], ['explain-concept', false], ['tracking-card', false], ['recurring-task', false], ['redeploy-fleet', false], ['redeploy-hub', true]] },
    { text: 'the loop capped out but you are not finished yet', hits: [['nudge', false], ['…', false], ['hub-files', false], ['repo-agent-request', true]] },
    { text: 'and who did you ask on living room birocode? the main agent or what?', hits: [['nudge', false], ['…', false], ['investigate', true]] },
  ],
  pipeline: [
    ['Read', 'every *.jsonl in the arch home\'s session folder, the goals, the requests'],
    ['Keep', 'user turns whose text the harness did not write (prefix list); unwrap queued instructions'],
    ['Scrub', 'ghp_… / github_pat_… / sk-… / Bearer … / password: … → [redacted]; e-mail → <email>'],
    ['Classify', 'management/arch-example-categories.json — ordered regex rules, anti-patterns veto; no match → other'],
    ['Dedupe', 'the same text within 10 minutes (a resend) counts once'],
    ['Report', 'per category: count, first/last, two typical examples, per-week counts; a fleet timeline; written to the data dir and committed as the snapshot'],
  ],
};
