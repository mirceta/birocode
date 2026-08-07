/**
 * Claude Web — shared ideas board endpoint (openspec ideas-drive-sync).
 *
 * This script is the "one link" that lets every harness share a single ideas
 * board stored in YOUR Google Drive, with no service accounts or API keys.
 *
 * One-time setup (~2 minutes):
 *   1. Go to https://script.google.com → New project.
 *   2. Replace the default Code.gs content with this file. Save.
 *   3. Deploy → New deployment → type "Web app":
 *        - Execute as:            Me
 *        - Who has access:        Anyone
 *      → Deploy, authorize, and copy the Web app URL (ends in /exec).
 *   4. Paste that URL into the sync bar at the top of the Ideas panel on each
 *      harness and enable sync. Done — the script creates
 *      `claude-web-ideas.json` in your Drive on first write.
 *
 * Updating the script later: use Deploy → Manage deployments → ✏ Edit →
 * Version: New version. That keeps the SAME /exec URL. ("New deployment"
 * mints a different URL and every harness would need the new one.)
 *
 * Security: the /exec URL is a bearer capability — anyone who has it can read
 * and write this one board (and nothing else). Revoke any time by archiving
 * the deployment (Manage deployments → Archive).
 *
 * Contract (what the harness and its tests rely on):
 *   GET  ?fn=get            → { ok:true, rev:N, store:{...} }
 *   POST { baseRev, store } → { ok:true, rev:N+1 }
 *                             or { ok:false, conflict:true, rev, store } when
 *                             baseRev no longer matches (harness re-merges and
 *                             retries). Writes are serialized with LockService,
 *                             so this is a real compare-and-swap.
 * Responses are always HTTP 200 (an Apps Script limitation); errors are in the
 * body as { ok:false, error:"..." }.
 */

var FILE_NAME = 'claude-web-ideas.json';
var EMPTY = { rev: 0, store: { Ideas: [], Tombstones: [] } };

function doGet(e) {
  try {
    return json_(withOk_(readStore_()));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var body = JSON.parse(e.postData.contents);
    var cur = readStore_();
    if (Number(body.baseRev) !== cur.rev) {
      var out = withOk_(cur);
      out.ok = false;
      out.conflict = true;
      return json_(out);
    }
    var next = { rev: cur.rev + 1, store: body.store };
    writeStore_(next);
    return json_({ ok: true, rev: next.rev });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function withOk_(s) {
  return { ok: true, rev: s.rev, store: s.store };
}

function file_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('fileId');
  if (id) {
    try {
      return DriveApp.getFileById(id);
    } catch (err) {
      // File was deleted — fall through and recreate.
    }
  }
  var it = DriveApp.getFilesByName(FILE_NAME);
  var file = it.hasNext()
    ? it.next()
    : DriveApp.createFile(FILE_NAME, JSON.stringify(EMPTY), 'application/json');
  props.setProperty('fileId', file.getId());
  return file;
}

function readStore_() {
  var text = file_().getBlob().getDataAsString();
  if (!text) return EMPTY;
  var parsed = JSON.parse(text);
  return {
    rev: Number(parsed.rev) || 0,
    store: parsed.store || EMPTY.store,
  };
}

function writeStore_(s) {
  file_().setContent(JSON.stringify(s));
}
