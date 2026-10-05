// Fleet task 9c1120fe — why living room/living-room lost its "finished, not yet checked" mark, and how the
// hub raises it now. Transcribed from openspec/changes/status-mark-from-events.
window.MARK_DATA = {
  evidence: [
    ['19 Sep 21:25Z', 'Fleet upgrade: every machine on build d2ce4d16 (PR #129).', 'arch transcript · list_machines'],
    ['24 Sep → 5 Oct', 'The hub moves on (8171596f … 1c022f1e … a425a0d0). living room, spacex, razvoj2016, fotrsqlbirokrat stay on d2ce4d16; only laptop_pisarna was upgraded.', 'arch transcript · list_machines, no upgrade_peer for living room'],
    ['5 Oct 21:12Z', 'PR #142 merged: the mark = the dock latch on the machine that ran the turn, read off its describe; a missing field reads as "no mark".', 'git · 49fc5cb5'],
    ['5 Oct 20:41Z → 23:09Z', 'living room/living-room: lastActor none → human on branch feature/daljinski-text-send (adopted). The Operator ran it there.', 'arch transcript · list_agents rows'],
    ['5 Oct 23:30Z', '"it just went back to the default state" — no !.', 'the Operator'],
    ['6 Oct', 'Lab: a peer built from d2ce4d16, a real builder turn; its describe has no unseenResult, its agents/checked answers 404, and the hub on the pre-fix build never marks it in 45 s.', '.claudeweb-preview/mark/old-peer-e2e.mjs before'],
  ],
  links: [
    { id: 'describe', name: 'Peer describe', sub: 'unseenResult: null on d2ce4d16', old: 'says nothing', neu: 'says nothing — the hub reads its own record instead' },
    { id: 'events', name: 'turn.ended events', sub: 'every build since the feed existed; the collector pulls them on a cursor', old: 'ignored for the mark', neu: 'the source of the mark where the latch cannot speak' },
    { id: 'record', name: 'fleet-attention.json', sub: 'per agent: finishedAt, ackedAt (producer clock)', old: '—', neu: 'pending = finishedAt > ackedAt' },
    { id: 'checked', name: '✓ mark as checked', sub: 'POST /api/arch/fleet/checked', old: 'relays to the peer → 404 → 502', neu: 'acks the hub record; relays only where the latch speaks' },
  ],
  cases: {
    // [peer reports the latch?, docked?] → where the mark comes from
    modernDocked: { title: 'Build with PR #142, repo docked', from: 'dock', text: 'The machine\'s own latch decides, exactly as PR #142 designed it. The hub\'s record follows it: when the latch says "nothing unchecked", the record is acknowledged too, so nothing old resurfaces later.' },
    modernUndocked: { title: 'Build with PR #142, repo without a dock', from: 'hub', text: 'No tab to latch — before: never marked. Now the hub\'s record from the turn.ended events marks it.' },
    oldDocked: { title: 'Build d2ce4d16 (living room today), repo docked', from: 'hub', text: 'The describe has no field. The hub raises the mark from the peer\'s turn.ended; the chip says "seen by the hub from its turn events"; the machine shows "finish mark: from the hub". A turn stopped by hand is marked too (the event cannot tell a stop from a failure).' },
    oldUndocked: { title: 'Build d2ce4d16, repo without a dock', from: 'hub', text: 'Same as above: the hub\'s record.' },
  },
  restart: [
    ['Hub restarts', 'The peer\'s retained feed is pulled from its start again (a backlog, cursor -1). Only events after the last one the hub had seen from that source count — so a mark already checked is not re-raised, and a run that ended while the hub was down is.'],
    ['Source met for the first time', 'Its history is a baseline: no marks for runs from before the hub knew the machine.'],
    ['Peer restarts', 'Its event seqs begin at 1 again. The cursor used to jump to the new last seq and lose those first events; now it goes back to -1 and pulls them as a backlog.'],
    ['Clocks', 'Finish and acknowledgement are compared in the producing machine\'s clock (the event\'s at); the hub\'s clock never enters.'],
  ],
};
