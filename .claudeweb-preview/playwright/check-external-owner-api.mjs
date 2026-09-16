// openspec kanban-external-owner — API-level check against an ISOLATED harness instance
// (launched by ../external-owner-e2e.ps1): a card handed to an external human developer
// carries the owner, the verifier's pass skips it with a note, the board verdict counts it
// as external (never stuck / dishonest), a blank name is refused, and clearing hands it
// back so the next pass judges it again.
//   PORT=<port> PW=<password> node check-external-owner-api.mjs
const base = `http://127.0.0.1:${process.env.PORT || 5228}`;
const H = { 'X-Auth-Password': process.env.PW || '', 'Content-Type': 'application/json' };
const api = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, j };
};
const checks = {};
const ok = (k, v, detail) => { checks[k] = !!v; if (!v) console.log('FAIL', k, detail ?? ''); };

// A card that LIES (pr-opened, nothing verified) so the policeman would call it dishonest.
const made = await api('POST', '/api/taskgraph/nodes', { title: 'External owner e2e card', status: 'todo' });
ok('created', made.status === 200 && made.j?.id, made);
const id = made.j.id;
await api('PATCH', `/api/taskgraph/nodes/${id}`, { status: 'pr-opened' });
const blank = await api('POST', `/api/taskgraph/nodes/${id}/owner`, { name: '   ' });
ok('blankNameRefused', blank.status === 400, blank);
const set = await api('POST', `/api/taskgraph/nodes/${id}/owner`, { name: '  Jane Doe (Acme)  ' });
ok('ownerSetTrimmed', set.status === 200 && set.j?.externalOwner === 'Jane Doe (Acme)' && typeof set.j?.externalOwnerAt === 'number', set.j);
const byRef = await api('POST', `/api/taskgraph/nodes/${id.slice(0, 8)}/owner`, { name: 'Jane Doe (Acme)' });
ok('cardRefAccepted', byRef.status === 200 && byRef.j?.externalOwnerAt === set.j?.externalOwnerAt, byRef);

const pass = await api('POST', '/api/taskgraph/verify');
ok('verifierSkipsWithNote', pass.status === 200 && (pass.j?.notes || []).some((n) => /External owner e2e card: external — owned by Jane Doe \(Acme\), not verified/.test(n)), pass.j?.notes);
const board = await api('GET', '/api/taskgraph');
const node = (board.j?.nodes || []).find((n) => n.id === id);
// The claim badge the PATCH stamped before the handover stays as it was (as with manual):
// the pass neither probes nor re-badges the card, so nothing about it moved.
ok('boardCarriesOwner', node?.externalOwner === 'Jane Doe (Acme)' && node?.status === 'pr-opened' && node?.verifiedStatus == null && node?.verifiedAt == null && node?.updatedAt === set.j?.updatedAt, node);
const integ = board.j?.integrity;
const mine = (integ?.flagged || []).find((f) => f.id === id);
ok('verdictExternalNotDishonest', integ && integ.external >= 1 && !mine, integ);
ok('noNeedsHuman', !node?.needsHuman, node?.needsHuman);

const cleared = await api('DELETE', `/api/taskgraph/nodes/${id}/owner`);
ok('ownerCleared', cleared.status === 200 && cleared.j?.externalOwner == null && cleared.j?.externalOwnerAt == null, cleared.j);
const pass2 = await api('POST', '/api/taskgraph/verify');
const board2 = await api('GET', '/api/taskgraph');
const node2 = (board2.j?.nodes || []).find((n) => n.id === id);
const mine2 = (board2.j?.integrity?.flagged || []).find((f) => f.id === id);
ok('judgedAgainOnceOurs', !(pass2.j?.notes || []).some((n) => /External owner e2e card: external/.test(n)) && mine2?.state === 'dishonest', { notes: pass2.j?.notes, mine2, node2 });

await api('DELETE', `/api/taskgraph/nodes/${id}`);
const passed = Object.values(checks).filter(Boolean).length;
console.log(JSON.stringify({ checks, passed, total: Object.keys(checks).length }, null, 1));
process.exit(passed === Object.keys(checks).length ? 0 : 1);
