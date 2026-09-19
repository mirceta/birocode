// Understanding app — the hub file system (openspec hub-file-system). Build-less, relative URLs only.
(function () {
  const tabs = document.querySelectorAll('.tab');
  const views = document.querySelectorAll('.view');
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('is-on', x === b));
    views.forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
  }));

  // ---- 2. the ritual -----------------------------------------------------------------------
  const steps = document.getElementById('steps');
  const same = document.getElementById('same');
  function ritual(sameMachine) {
    const list = [
      ['🏛 → A', 'send_task A: "upload tests/fixtures/customers.json to the hub file system as prg/fixtures/customers.json"', 'the arch names the hub path itself'],
      ['A', 'hub_upload(path: "prg/fixtures/customers.json", localPath: "tests/fixtures/customers.json") → uploaded (v1, spacex/prg#1 @ ' + (sameMachine ? 'spacex' : 'MONSTER') + ')', 'A reads only inside its repo folder'],
      ['A → 🏛', 'reply: "uploaded prg/fixtures/customers.json (14.2 KB)"', 'the arch waits for the path before moving anything'],
    ];
    if (!sameMachine) list.push(['🏛', 'hub_transfer(path: "prg/fixtures/customers.json", from: "MONSTER", to: "spacex") → fetched · via arch ← MONSTER', 'the fleet client fetches from MONSTER’s peer route; the hub keeps a copy with A’s provenance']);
    else list.push(['🏛', '(no transfer — same machine, same store)', 'B reads what A wrote']);
    list.push(['🏛 → B', 'send_task B: "download prg/fixtures/customers.json from the hub file system into tests/fixtures/"', 'the same hub path']);
    list.push(['B', 'hub_download(path: "prg/fixtures/customers.json", localPath: "tests/fixtures") → downloaded: tests/fixtures/customers.json', 'never clobbers an existing file without overwrite']);
    list.push(['🖥 Operator', 'File System tab: prg/fixtures/customers.json · spacex/prg#1 @ ' + (sameMachine ? 'spacex' : 'MONSTER') + ' · v1' + (sameMachine ? '' : ' · via arch ← MONSTER'), 'live, every 5 s']);
    steps.innerHTML = '';
    list.forEach(([who, what, why]) => {
      const li = document.createElement('li');
      li.innerHTML = '<b>' + who + '</b> <code>' + what.replace(/</g, '&lt;') + '</code> <span class="dim">— ' + why + '</span>';
      steps.appendChild(li);
    });
  }
  function play() {
    ritual(same.checked);
    const items = [...steps.querySelectorAll('li')];
    items.forEach((li) => { li.style.opacity = '0.15'; });
    items.forEach((li, i) => setTimeout(() => { li.style.opacity = '1'; li.classList.add('lit'); setTimeout(() => li.classList.remove('lit'), 700); }, 500 * (i + 1)));
  }
  document.getElementById('play').addEventListener('click', play);
  same.addEventListener('change', () => ritual(same.checked));
  ritual(false);

  // ---- 3. the tools -----------------------------------------------------------------------
  const EX = {
    upload: {
      call: 'hub_upload({ path: "prg/fixtures/customers.json", localPath: "tests/fixtures/customers.json", note: "test fixtures" })',
      answer: JSON.stringify({ ok: true, status: 'uploaded', detail: 'prg/fixtures/customers.json (14.2 KB, v1) is on spacex’s hub store as spacex/prg#1 from tests/fixtures/customers.json. Tell the Operator or the arch the hub path; an agent on another machine needs the arch to hub_transfer it there first.', data: { machine: 'spacex', path: 'prg/fixtures/customers.json', size: 14542, sha256: '9f86…', uploadedBy: 'spacex/prg#1', uploadedFrom: 'spacex', version: 1, note: 'test fixtures' } }, null, 1),
      effects: ['localPath is resolved under the repo folder; ../ and absolute paths are refused', 'text instead of localPath stores a text', 'an existing hub path needs overwrite (version + 1)', 'one file at a time, ≤ 64 MB'],
    },
    download: {
      call: 'hub_download({ path: "prg/fixtures/customers.json", localPath: "tests/fixtures" })',
      answer: JSON.stringify({ ok: true, status: 'downloaded', detail: 'prg/fixtures/customers.json (14.2 KB, uploaded by MONSTER/prg#1 on MONSTER, v1) written to tests\\fixtures\\customers.json in your repo', data: { localPath: 'tests\\fixtures\\customers.json', file: { via: 'arch ← MONSTER' } } }, null, 1),
      effects: ['default target: hub-downloads/<hub path> inside the repo', 'an existing local file → status exists, untouched, unless overwrite', 'not on this machine → not-found with the hint that the arch must hub_transfer it here'],
    },
    files: {
      call: 'hub_files({ prefix: "prg" })',
      answer: JSON.stringify({ ok: true, status: 'ok', detail: '2 file(s) on spacex’s hub store: prg/fixtures/customers.json, prg/readme.md', data: { machine: 'spacex', files: ['…'], stats: { files: 2, bytes: 14800, maxFileBytes: 67108864, maxTotalBytes: 2147483648 } } }, null, 1),
      effects: ['only this machine’s store'],
    },
    afiles: {
      call: 'hub_files({ })   // the arch: every machine',
      answer: JSON.stringify({ ok: true, status: 'ok', detail: '3 file(s) across the fleet; not answered: laptop: unreachable — connection refused. A repo agent downloads from ITS OWN machine’s store: hub_transfer moves a file to that machine first.', data: { hub: 'spacex', files: [{ machine: 'spacex', path: 'prg/fixtures/customers.json', uploadedBy: 'spacex/prg#1' }, { machine: 'MONSTER', path: 'web/testdata.sql', uploadedBy: 'MONSTER/web#1' }], notAnswered: ['laptop: unreachable — connection refused'] } }, null, 1),
      effects: ['the hub’s store + each peer’s (GET /api/arch/peer/files)', 'dark peers are named, never hidden'],
    },
    transfer: {
      call: 'hub_transfer({ path: "web/testdata.sql", from: "MONSTER", to: "self" })',
      answer: JSON.stringify({ ok: true, status: 'fetched', detail: 'web/testdata.sql (2.1 MB, uploaded by MONSTER/web#1 on MONSTER) is now on spacex’s hub store — a repo agent here can hub_download it', data: { machine: 'spacex', path: 'web/testdata.sql', uploadedBy: 'MONSTER/web#1', uploadedFrom: 'MONSTER', via: 'arch ← MONSTER', version: 1 } }, null, 1),
      effects: ['from a peer → fetched into the hub (kept, provenance preserved)', 'to a peer → pushed (POST /api/arch/peer/files): needs this Operator’s allow-sends and the peer’s accept-fleet-sends', 'peer → peer goes through the hub in one call', 'audited under the arch actor'],
    },
  };
  const call = document.getElementById('call');
  const answer = document.getElementById('answer');
  const effects = document.getElementById('effects');
  function show(k) {
    const e = EX[k];
    call.textContent = e.call;
    answer.textContent = e.answer;
    effects.innerHTML = '';
    e.effects.forEach((t) => { const li = document.createElement('li'); li.textContent = t; effects.appendChild(li); });
  }
  document.querySelectorAll('input[name="tool"]').forEach((r) => r.addEventListener('change', () => show(r.value)));
  show('upload');
})();
