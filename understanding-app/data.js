// Numbers behind the Understanding app — transcribed from the lab runs recorded in
// openspec/changes/hub-perf-log-path/design.md (fleet task 3bcaff3a, 2026-09-28).
window.PERF_DATA = {
  hubLogs: [
    { day: '2026-09-24', size: '59 MB', lines: 716354, admitted: 599982, git: 105343 },
    { day: '2026-09-27', size: '13 MB', lines: 165190, admitted: 142979, git: 19216 },
    { day: '2026-09-28 (to 13:00, after a restart)', size: '1 MB', lines: 12796, admitted: 11013, git: 1295 },
  ],
  mix: [
    { label: 'Process CPU under the polling mix, feed empty', unit: '% of one core', before: 9, after: 6 },
    { label: 'CPU per request, feed empty', unit: 'ms', before: 35, after: 23 },
    { label: 'CPU per request, collector feed at cap', unit: 'ms', before: 35, after: 24 },
    { label: 'RSS after the 40 s mix', unit: 'MB', before: 406, after: 258 },
    { label: 'RSS at the end of the run', unit: 'MB', before: 414, after: 279 },
    { label: 'Policeman board response', unit: 'KB per poll, every 5 s', before: 1446, after: 462 },
  ],
  pages: [
    { page: 'Management App › Status', before: 190, after: 189 },
    { page: 'Management App › Kanban', before: 210, after: 204 },
    { page: 'Management App › Arch', before: 99, after: 102 },
    { page: 'Dashboard (/studio)', before: 173, after: 195 },
  ],
  endpoints: [
    { path: '/api/arch', before: '9 ms · 9.0 KB', after: '8 ms · 9.0 KB' },
    { path: '/api/arch/messages?tail=50', before: '7 ms · 78 KB', after: '7 ms · 78 KB' },
    { path: '/api/arch/fleet/status', before: '49 ms · 13 KB', after: '46 ms · 13 KB' },
    { path: '/api/taskgraph', before: '2 ms · 270 KB', after: '2 ms · 270 KB' },
    { path: '/api/taskgraph/policeman', before: '11 ms · 1,446 KB', after: '6 ms · 462 KB', changed: true },
    { path: '/api/analytics (feed full)', before: '14 ms · 230 KB', after: '8 ms · 230 KB', changed: true },
    { path: '/api/analytics (feed empty)', before: '23 ms', after: '17 ms', changed: true },
    { path: '/api/traffic', before: '1 ms · 2.9 KB', after: '1 ms · 2.9 KB' },
  ],
  pump: [
    { label: 'before, admissions', samples: [
      { lines: 0, cpuMsPer1k: 0, rssMB: 126, probeMs: 42 }, { lines: 20000, cpuMsPer1k: 516, rssMB: 155, probeMs: 42 }, { lines: 40000, cpuMsPer1k: 409, rssMB: 164, probeMs: 42 },
      { lines: 60000, cpuMsPer1k: 343, rssMB: 194, probeMs: 51 }, { lines: 80000, cpuMsPer1k: 322, rssMB: 193, probeMs: 40 }, { lines: 100000, cpuMsPer1k: 379, rssMB: 209, probeMs: 45 }, { lines: 120000, cpuMsPer1k: 347, rssMB: 208, probeMs: 39 } ] },
    { label: 'before, admissions (long)', crashed: true, samples: [
      { lines: 0, cpuMsPer1k: 0, rssMB: 126, probeMs: 41 }, { lines: 20000, cpuMsPer1k: 455, rssMB: 158, probeMs: 76 }, { lines: 40000, cpuMsPer1k: 438, rssMB: 187, probeMs: 41 }, { lines: 60000, cpuMsPer1k: 398, rssMB: 202, probeMs: 43 },
      { lines: 80000, cpuMsPer1k: 399, rssMB: 244, probeMs: 42 }, { lines: 100000, cpuMsPer1k: 308, rssMB: 248, probeMs: 42 }, { lines: 120000, cpuMsPer1k: 314, rssMB: 264, probeMs: 48 }, { lines: 140000, cpuMsPer1k: 331, rssMB: 275, probeMs: 49 }, { lines: 160000, cpuMsPer1k: 450, rssMB: 298, probeMs: 43 } ] },
    { label: 'after, admissions', samples: [
      { lines: 0, cpuMsPer1k: 0, rssMB: 129, probeMs: 59 }, { lines: 20000, cpuMsPer1k: 251, rssMB: 148, probeMs: 42 }, { lines: 40000, cpuMsPer1k: 140, rssMB: 149, probeMs: 37 }, { lines: 60000, cpuMsPer1k: 120, rssMB: 150, probeMs: 37 }, { lines: 80000, cpuMsPer1k: 123, rssMB: 149, probeMs: 37 },
      { lines: 100000, cpuMsPer1k: 121, rssMB: 148, probeMs: 41 }, { lines: 120000, cpuMsPer1k: 129, rssMB: 149, probeMs: 36 }, { lines: 140000, cpuMsPer1k: 143, rssMB: 149, probeMs: 41 }, { lines: 160000, cpuMsPer1k: 145, rssMB: 149, probeMs: 39 }, { lines: 180000, cpuMsPer1k: 122, rssMB: 150, probeMs: 40 },
      { lines: 200000, cpuMsPer1k: 119, rssMB: 149, probeMs: 38 }, { lines: 220000, cpuMsPer1k: 139, rssMB: 150, probeMs: 47 }, { lines: 240000, cpuMsPer1k: 153, rssMB: 150, probeMs: 43 }, { lines: 260000, cpuMsPer1k: 146, rssMB: 151, probeMs: 41 }, { lines: 280000, cpuMsPer1k: 123, rssMB: 149, probeMs: 36 },
      { lines: 300000, cpuMsPer1k: 113, rssMB: 149, probeMs: 36 }, { lines: 320000, cpuMsPer1k: 145, rssMB: 150, probeMs: 37 }, { lines: 340000, cpuMsPer1k: 136, rssMB: 150, probeMs: 37 }, { lines: 360000, cpuMsPer1k: 112, rssMB: 150, probeMs: 40 }, { lines: 380000, cpuMsPer1k: 121, rssMB: 152, probeMs: 36 }, { lines: 400000, cpuMsPer1k: 112, rssMB: 151, probeMs: 43 } ] },
    { label: 'after, file line', samples: [
      { lines: 0, cpuMsPer1k: 0, rssMB: 130, probeMs: 39 }, { lines: 20000, cpuMsPer1k: 630, rssMB: 170, probeMs: 40 }, { lines: 40000, cpuMsPer1k: 420, rssMB: 177, probeMs: 39 }, { lines: 60000, cpuMsPer1k: 468, rssMB: 176, probeMs: 37 }, { lines: 80000, cpuMsPer1k: 436, rssMB: 171, probeMs: 38 },
      { lines: 100000, cpuMsPer1k: 421, rssMB: 176, probeMs: 39 }, { lines: 120000, cpuMsPer1k: 432, rssMB: 173, probeMs: 37 }, { lines: 140000, cpuMsPer1k: 463, rssMB: 172, probeMs: 43 }, { lines: 160000, cpuMsPer1k: 455, rssMB: 172, probeMs: 39 }, { lines: 180000, cpuMsPer1k: 439, rssMB: 172, probeMs: 43 },
      { lines: 200000, cpuMsPer1k: 466, rssMB: 171, probeMs: 39 }, { lines: 220000, cpuMsPer1k: 417, rssMB: 172, probeMs: 47 }, { lines: 240000, cpuMsPer1k: 430, rssMB: 173, probeMs: 37 }, { lines: 260000, cpuMsPer1k: 435, rssMB: 173, probeMs: 41 }, { lines: 280000, cpuMsPer1k: 445, rssMB: 174, probeMs: 37 },
      { lines: 300000, cpuMsPer1k: 377, rssMB: 171, probeMs: 37 }, { lines: 320000, cpuMsPer1k: 444, rssMB: 172, probeMs: 39 }, { lines: 340000, cpuMsPer1k: 497, rssMB: 174, probeMs: 44 }, { lines: 360000, cpuMsPer1k: 434, rssMB: 173, probeMs: 41 }, { lines: 380000, cpuMsPer1k: 468, rssMB: 179, probeMs: 36 }, { lines: 400000, cpuMsPer1k: 432, rssMB: 182, probeMs: 40 } ] },
    { label: 'before, file line', samples: [
      { lines: 0, cpuMsPer1k: 0, rssMB: 126, probeMs: 40 }, { lines: 20000, cpuMsPer1k: 952, rssMB: 187, probeMs: 41 }, { lines: 40000, cpuMsPer1k: 794, rssMB: 238, probeMs: 42 }, { lines: 60000, cpuMsPer1k: 907, rssMB: 265, probeMs: 47 }, { lines: 80000, cpuMsPer1k: 698, rssMB: 315, probeMs: 64 },
      { lines: 100000, cpuMsPer1k: 741, rssMB: 395, probeMs: 38 }, { lines: 120000, cpuMsPer1k: 755, rssMB: 397, probeMs: 49 }, { lines: 140000, cpuMsPer1k: 756, rssMB: 405, probeMs: 44 }, { lines: 160000, cpuMsPer1k: 752, rssMB: 518, probeMs: 38 }, { lines: 180000, cpuMsPer1k: 726, rssMB: 568, probeMs: 40 },
      { lines: 200000, cpuMsPer1k: 685, rssMB: 595, probeMs: 38 }, { lines: 220000, cpuMsPer1k: 702, rssMB: 661, probeMs: 42 }, { lines: 240000, cpuMsPer1k: 632, rssMB: 676, probeMs: 39 }, { lines: 260000, cpuMsPer1k: 642, rssMB: 708, probeMs: 37 }, { lines: 280000, cpuMsPer1k: 717, rssMB: 802, probeMs: 37 },
      { lines: 300000, cpuMsPer1k: 849, rssMB: 845, probeMs: 52 }, { lines: 320000, cpuMsPer1k: 724, rssMB: 918, probeMs: 39 } ] },
  ],
  pumpNote: 'The "file line" runs read README.md through /api/files/read on every request, so their CPU includes the read itself (≈300 ms per 1k on both builds); the difference between the two file-line curves is the log path. RSS on the unmodified build climbs with every line for the life of the process (~0.7 KB per short admission line, ~2.5 KB per longer file line — the text lives in the RichTextBox); the fixed build is flat.',
};
