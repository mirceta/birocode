// The phased driven loops AS state machines (openspec: loop-state-param-panel,
// D1) — the single frontend transcription of GoalLoop.cs / QueueLoop.cs. Every
// dock renderer reads this module: the state-sectioned parameter panel, the
// armed header strip, and the collapsed phase word — so the drawn machine and
// the lit machine can never drift apart. Labels are i18n keys; badge tokens are
// the engine's literal sentinels and are never translated.
//
// Shape per kind:
//   sections     — parameter-bearing states in flow order; `verify-owed` owns
//                  no parameters so it gets no section (design D6)
//   badges       — the sentinel each state expects from the agent; an explicit
//                  null means the state exits WITHOUT a badge (queue work exits
//                  on the step's turn finishing) and exitKey names that trigger
//   transitions  — per state: { preKey, to, postKey? } where `to` is a state or
//                  terminal id resolved through SM_REFS for the color-coded ref
//   strip        — live Phase values in flow order (the armed header chips)
//   terminals    — matched against a stopped instance's status + stopReason

export const SM = {
  goal: {
    sections: [
      { id: 'work', descKey: 'dashboard.loopSm.goal.workDesc' },
      { id: 'verify', descKey: 'dashboard.loopSm.goal.verifyDesc' },
    ],
    badges: { work: 'LOOP_DONE', verify: 'GOAL_VERIFIED' },
    transitions: {
      work: [
        { preKey: 'dashboard.loopSm.goal.workT1', to: 'verify' },
        { preKey: 'dashboard.loopSm.goal.workT2', to: 'work', postKey: 'dashboard.loopSm.goal.workT2Post' },
      ],
      verify: [
        { preKey: 'dashboard.loopSm.goal.verifyT1', to: 'done-verified', postKey: 'dashboard.loopSm.endsLoop' },
        { preKey: 'dashboard.loopSm.goal.verifyT2', to: 'work' },
      ],
    },
    strip: ['work', 'verify'],
    terminals: [
      { status: 'done', stopReason: 'verified', cls: 'ok', labelKey: 'dashboard.loopSm.termVerified' },
    ],
  },
  queue: {
    sections: [
      { id: 'work', descKey: 'dashboard.loopSm.queue.workDesc' },
      { id: 'verify', descKey: 'dashboard.loopSm.queue.verifyDesc' },
    ],
    badges: { work: null, verify: 'STEP_VERIFIED' },
    exitKey: 'dashboard.loopSm.queue.workExit',
    transitions: {
      work: [
        { preKey: 'dashboard.loopSm.queue.workT1', to: 'verify' },
        { preKey: 'dashboard.loopSm.queue.workT2', to: 'work', postKey: 'dashboard.loopSm.queue.workT2Post' },
      ],
      verify: [
        { preKey: 'dashboard.loopSm.queue.verifyT1', to: 'work', postKey: 'dashboard.loopSm.queue.verifyT1Post' },
        { preKey: 'dashboard.loopSm.queue.verifyT2', to: 'done-drained', postKey: 'dashboard.loopSm.endsLoop' },
        { preKey: 'dashboard.loopSm.queue.verifyT3', to: 'escalate', postKey: 'dashboard.loopSm.queue.verifyT3Post' },
      ],
    },
    strip: ['work', 'verify-owed', 'verify'],
    terminals: [
      { status: 'done', stopReason: 'drained', cls: 'ok', labelKey: 'dashboard.loopSm.termDrained' },
      { status: 'escalate', stopReason: 'step-unverified', cls: 'esc', labelKey: 'dashboard.loopSm.termEscalate' },
    ],
  },
};

// Transition targets → their display key + accent class. States reuse the
// section-name keys so a transition line and the section it points at can
// never be worded differently.
export const SM_REFS = {
  work: { key: 'dashboard.loopSm.stateWork', cls: 'work' },
  verify: { key: 'dashboard.loopSm.stateVerify', cls: 'verify' },
  'done-verified': { key: 'dashboard.loopSm.termVerified', cls: 'ok' },
  'done-drained': { key: 'dashboard.loopSm.termDrained', cls: 'ok' },
  escalate: { key: 'dashboard.loopSm.termEscalate', cls: 'esc' },
};

// Section-name keys in section order (loopwide is panel chrome, not a state).
export const SECTION_NAME_KEY = {
  loopwide: 'dashboard.loopSm.loopwide',
  work: 'dashboard.loopSm.stateWork',
  verify: 'dashboard.loopSm.stateVerify',
};

// Phase → strip-chip / collapsed-word key. An unmapped phase renders its raw
// backend string — a future phase must never render blank.
export const PHASE_KEY = {
  work: 'dashboard.loopSm.phase.work',
  'verify-owed': 'dashboard.loopSm.phase.verifyOwed',
  verify: 'dashboard.loopSm.phase.verify',
};

// Which SECTION an armed loop's live phase lights (design D6): verify-owed is
// the machine's between-moment, so it lights the verification section it is
// about to enter. Unknown phases light nothing.
export const PHASE_SECTION = {
  work: 'work',
  'verify-owed': 'verify',
  verify: 'verify',
};
