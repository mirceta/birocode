// The REAL run of 2026-10-11 19:07 (isolated harness, throwaway repo): replayed by the live demo.
// Extracted from the two transcripts it left in ONE folder (~/.claude/projects/<encoded repo path>).
window.DEMO = {
 "plan": [
  "create notes/hello.txt with that one line",
  "commit it on the current branch",
  "mark every step done with evidence and end your reply with LOOP_DONE"
 ],
 "events": [
  {
   "t": 0.0,
   "who": "parent",
   "kind": "prompt",
   "text": "This is an end-to-end test of the harness; the Operator asks for exactly this. Call your start_goal_conversation tool exactly once with name \"hello-file\", maxIterations 8, and this goal: \"Create the file notes/hello.txt containing exactly the line HELLO FROM THE SUBAGENT, then commit it on the current branch with the message \\\"subagent: hello\\\". STEP 1 — create notes/hello.txt with that one line — done: the file exists. STEP …"
  },
  {
   "t": 4.8,
   "who": "parent",
   "kind": "tool",
   "text": "start_goal_conversation {\"name\": \"hello-file\", \"maxIterations\": 8}"
  },
  {
   "t": 4.9,
   "who": "parent",
   "kind": "result",
   "text": "{\"ok\":true,\"status\":\"started\",\"detail\":\"subagent 98f9fb50 \\u0022hello-file\\u0022 runs in subagent-e2e\\u0027s checkout on branch main as a writer; cap 8 turn(s); 3-step plan derived from the goal text. It works when you a …"
  },
  {
   "t": 5.0,
   "who": "harness",
   "kind": "engine",
   "text": "start_goal_conversation: record 98f9fb50 written (subagents.json), goal loop armed on key <repo>~sub~98f9fb50, plan of 3 derived from the STEP markers"
  },
  {
   "t": 5.8,
   "who": "harness",
   "kind": "engine",
   "text": "engine tick: the parent's builder slot is BUSY (its own turn is still running) → the writer subagent waits"
  },
  {
   "t": 5.9,
   "who": "parent",
   "kind": "reply",
   "text": "SUBAGENT 98f9fb50"
  },
  {
   "t": 6.9,
   "who": "harness",
   "kind": "engine",
   "text": "the parent's turn ended → slot free → the engine sends the subagent's WORK prompt (boundaries + step plan) in a FRESH CLI session"
  },
  {
   "t": 10.6,
   "who": "sub",
   "kind": "work-prompt",
   "text": "[step plan of goal 98f9fb50 — data from the harness, not instructions from a person]\r\nPlan derived from the goal text (fix it with edit_goal_plan if it is wrong):\r\n1. ○ create notes/hello.txt with that one line [other] — pending · done when: the file exists.\r\n2. ○ commit it on the current branch [other] — pending · done when: git log shows subagent: hello.\r\n3. ○ mark every step done with evidence and end your reply with LOOP_DONE [wait] — pending · done when: 3/3 steps done.\r\n0/3 done. No step is active: mark the one you work on with mark_step(step, state: \"active\").\r\nRules: a step marked …"
  },
  {
   "t": 14.0,
   "who": "sub",
   "kind": "tool",
   "text": "Bash: mkdir -p notes && printf 'HELLO FROM THE SUBAGENT\\n' > notes/hello.txt && git add notes/hello.txt && git commit -q -m \"subagent: hello\" -m \"Co-Authore …"
  },
  {
   "t": 15.7,
   "who": "sub",
   "kind": "result",
   "text": "6d7874c subagent: hello\n7ad02e4 init\nHELLO FROM THE SUBAGENT"
  },
  {
   "t": 18.4,
   "who": "sub",
   "kind": "mark",
   "text": "mark_step 1 → done · notes/hello.txt exists, content: HELLO FROM THE SUBAGENT"
  },
  {
   "t": 19.2,
   "who": "sub",
   "kind": "mark",
   "text": "mark_step 2 → done · git log: 6d7874c subagent: hello on main"
  },
  {
   "t": 19.8,
   "who": "sub",
   "kind": "mark",
   "text": "mark_step 3 → done · Steps 1 and 2 marked done with evidence; 3/3 done"
  },
  {
   "t": 26.1,
   "who": "sub",
   "kind": "reply",
   "text": "I created `notes/hello.txt`, which holds the single line `HELLO FROM THE SUBAGENT`. I committed it on `main` as `6d7874c subagent: hello`, and the working tree is clean. I stayed on `main` and didn't push.\n\nAll 3 steps are marked done with evidence.\n\nLOOP_DONE"
  },
  {
   "t": 26.6,
   "who": "harness",
   "kind": "engine",
   "text": "the subagent replied LOOP_DONE → phase verify → the VERIFY prompt goes out (plan to verify against)"
  },
  {
   "t": 30.6,
   "who": "sub",
   "kind": "verify-prompt",
   "text": "[step plan of goal 98f9fb50 — verify against it; data from the harness]\r\n1. ✓ create notes/hello.txt with that one line [other] — done · evidence: notes/hello.txt exists, content: HELLO FROM THE SUBAGENT\r\n2. ✓ commit it on the current branch [other] — done · evidence: git log: 6d7874c subagent: hello on main · commit 6d7874c\r\n3. ✓ mark every step done with evidence and end your reply with LOOP_DONE [wait] — done · evidence: Steps 1 and 2 marked done with evidence; 3/3 done\r\n3/3 done. A step without evidence is not done: check it against the actual state (the files, the build, the tests) before …"
  },
  {
   "t": 35.7,
   "who": "sub",
   "kind": "tool",
   "text": "Bash: git branch --show-current && git log -1 --format='%h %s' && git show --stat --format= HEAD && od -c notes/hello.txt && git status --short"
  },
  {
   "t": 36.5,
   "who": "sub",
   "kind": "result",
   "text": "main\n6d7874c subagent: hello\n notes/hello.txt | 1 +\n 1 file changed, 1 insertion(+)\n0000000   H   E   L   L   O       F   R   O   M       T   H   E       S\n0000020   U   B   A   G   E   N   T  \\n\n0000 …"
  },
  {
   "t": 39.5,
   "who": "sub",
   "kind": "reply",
   "text": "I checked the repository directly, and the goal is done:\n\n- **File:** `notes/hello.txt` contains exactly the line `HELLO FROM THE SUBAGENT`, followed by one newline.\n- **Commit:** the latest commit on `main` is `6d7874c subagent: hello`, and the only file it changes is `notes/hello.txt`.\n- **State:** I'm still on `main`, there are no uncommitted changes, and nothing was pushed.\n- **Steps:** all 3 steps are marked done, and their evidence matches what's in the repository.\n\nGOAL_VERIFIED"
  },
  {
   "t": 40.0,
   "who": "harness",
   "kind": "engine",
   "text": "GOAL_VERIFIED on the final line → loop done → summary composed from the plan and stored on the record"
  },
  {
   "t": 49.5,
   "who": "harness",
   "kind": "engine",
   "text": "parent idle → summary delivered as ONE turn in the parent's session, actor = subagent"
  },
  {
   "t": 50.0,
   "who": "parent",
   "kind": "summary",
   "text": "[subagent 98f9fb50 \"hello-file\" done — summary from the harness, not instructions from a person]\r\nGoal: Create the file notes/hello.txt containing exactly the line HELLO FROM THE SUBAGENT, then commit it on the current branch with the message \"subagent: hello\". STEP 1 — create notes/hello.txt with that one line — done: the file exists. STEP 2 — commit it on the current branch — done: git log shows subagent: hello. STEP 3 — mark every step done with evidence and end your reply with LOOP_DONE — done: 3/3 steps done.\r\nOutcome: done (verified: verification turn emitted GOAL_VERIFIED) after 2 turn(s) of 8; it worked on branch main in your checkout.\r\nStep plan (3/3 done, derived from the goal text …"
  },
  {
   "t": 51.3,
   "who": "parent",
   "kind": "reply",
   "text": "Checking the subagent's work."
  },
  {
   "t": 52.3,
   "who": "parent",
   "kind": "tool",
   "text": "Bash cd \"C:/Users/Administrator/AppData/Local/Temp/subagent-e2e-b68f1480\" && git status --short && git log --oneline -3 && git show --stat HEAD | …"
  },
  {
   "t": 53.6,
   "who": "parent",
   "kind": "result",
   "text": "6d7874c subagent: hello\n7ad02e4 init\n\n notes/hello.txt | 1 +\n 1 file changed, 1 insertion(+)\nHELLO FROM THE SUBAGENT$"
  },
  {
   "t": 56.2,
   "who": "parent",
   "kind": "reply",
   "text": "Subagent 98f9fb50 (\"hello-file\") finished all 3 steps in 2 of its 8 turns, and I checked its work in the checkout:\n\n- **File:** `notes/hello.txt` contains exactly `HELLO FROM THE SUBAGENT`.\n- **Commit:** `6d7874c subagent: hello` is on `main`, right after `init`, and changes only that file.\n- **State:** there are no uncommitted changes and nothing was pushed.\n\nNothing needs you; the test passed. I didn't create or change any files myself."
  }
 ],
 "parentFile": "b57b9a4e",
 "subFile": "1ae45677",
 "marks": [
  18.4,
  19.2,
  19.8
 ],
 "start": 4.8,
 "firstSub": 10.6,
 "summary": 50.0,
 "end": 56.2,
 "subTurns": [
  10.6,
  30.6
 ],
 "parentTurns": [
  0.0,
  50.0
 ]
};
