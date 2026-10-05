// Generated from the measurement files of fleet task 1a17afbe (.claudeweb-preview/gen-board-data.py):
// the live trace of the hub (245 s) and the four browser waterfalls over a copy of the live store.
window.BOARD_DATA = {
 "waterfalls": {
  "before": {
   "cold": {
    "firstCardMs": null,
    "wireKB": 7402,
    "decodedKB": 7389,
    "requestCount": 72,
    "scriptMs": 61,
    "layoutMs": 64,
    "note": "The board answered in 43 ms, but the Kanban waits for the fleet status — and that request, like the arch state, waited for the first agent snapshot pass. Every later poll joined the same hung request.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 334,
      "wire": 699,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CbgGp26m.js",
      "start": 328,
      "ms": 42,
      "wire": 1488079,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 328,
      "ms": 25,
      "wire": 217346,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 472,
      "ms": 22,
      "wire": 294,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 474,
      "ms": 43,
      "wire": 295384,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 474,
      "ms": null,
      "wire": null,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 474,
      "ms": 136,
      "wire": 4913,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 474,
      "ms": 156,
      "wire": 3064,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 474,
      "ms": 160,
      "wire": 181,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 474,
      "ms": null,
      "wire": null,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 474,
      "ms": 161,
      "wire": 230,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 475,
      "ms": 165,
      "wire": 5563,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 475,
      "ms": 173,
      "wire": 10987,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 640,
      "ms": 3,
      "wire": 160,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 5484,
      "ms": 7,
      "wire": 295384,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 5484,
      "ms": null,
      "wire": null,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 5485,
      "ms": 5,
      "wire": 4913,
      "encoding": "",
      "cached": false
     }
    ]
   },
   "reload": {
    "firstCardMs": 403,
    "wireKB": 2002,
    "decodedKB": 1998,
    "requestCount": 13,
    "scriptMs": 107,
    "layoutMs": 115,
    "note": "With the snapshot ready the board paints in 0.4 s — and still re-downloads 1.67 MB of script and stylesheet, uncompressed, every time.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 4,
      "wire": 699,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CbgGp26m.js",
      "start": 10,
      "ms": 12,
      "wire": 1488079,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 10,
      "ms": 9,
      "wire": 217346,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 71,
      "ms": 4,
      "wire": 294,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 71,
      "ms": 6,
      "wire": 300760,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 71,
      "ms": 244,
      "wire": 17348,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 71,
      "ms": 8,
      "wire": 4913,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 71,
      "ms": 10,
      "wire": 3064,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 72,
      "ms": 11,
      "wire": 181,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 72,
      "ms": null,
      "wire": null,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 72,
      "ms": 12,
      "wire": 230,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 72,
      "ms": 13,
      "wire": 5563,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 72,
      "ms": 15,
      "wire": 10987,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 90,
      "ms": 1,
      "wire": 160,
      "encoding": "",
      "cached": false
     }
    ]
   }
  },
  "after": {
   "cold": {
    "firstCardMs": 707,
    "wireKB": 754,
    "decodedKB": 2039,
    "requestCount": 14,
    "scriptMs": 39,
    "layoutMs": 88,
    "note": "The cards paint when /api/taskgraph answers. The bundle travels compressed once and is then kept by the browser.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 357,
      "wire": 615,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CMQrYj6U.js",
      "start": 333,
      "ms": 67,
      "wire": 592838,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 333,
      "ms": 34,
      "wire": 59039,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 481,
      "ms": 14,
      "wire": 340,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 482,
      "ms": 418,
      "wire": 3934,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 483,
      "ms": 96,
      "wire": 2271,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 483,
      "ms": 136,
      "wire": 97839,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 483,
      "ms": 160,
      "wire": 2808,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 483,
      "ms": 163,
      "wire": 235,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 483,
      "ms": 436,
      "wire": 7891,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 483,
      "ms": 163,
      "wire": 284,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 483,
      "ms": 167,
      "wire": 1941,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 484,
      "ms": 182,
      "wire": 2190,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 661,
      "ms": 3,
      "wire": 214,
      "encoding": "br",
      "cached": false
     }
    ]
   },
   "reload": {
    "firstCardMs": 48,
    "wireKB": 22,
    "decodedKB": 2039,
    "requestCount": 14,
    "scriptMs": 55,
    "layoutMs": 94,
    "note": "Only index.html and the API calls travel; an unchanged board answers 304.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 7,
      "wire": 615,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CMQrYj6U.js",
      "start": 10,
      "ms": 0,
      "wire": 0,
      "encoding": "br",
      "cached": true
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 10,
      "ms": 0,
      "wire": 0,
      "encoding": "br",
      "cached": true
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 18,
      "ms": 9,
      "wire": 340,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 18,
      "ms": 46,
      "wire": 3913,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 18,
      "ms": 8,
      "wire": 2271,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 18,
      "ms": 11,
      "wire": 153,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 18,
      "ms": 8,
      "wire": 2808,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 18,
      "ms": 8,
      "wire": 235,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 18,
      "ms": 60,
      "wire": 8070,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 18,
      "ms": 10,
      "wire": 284,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 19,
      "ms": 10,
      "wire": 1941,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 19,
      "ms": 18,
      "wire": 2190,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 32,
      "ms": 4,
      "wire": 214,
      "encoding": "br",
      "cached": false
     }
    ]
   }
  },
  "before-lan": {
   "cold": {
    "firstCardMs": 33564,
    "wireKB": 3843,
    "decodedKB": 3836,
    "requestCount": 35,
    "scriptMs": 63,
    "layoutMs": 120,
    "note": "The board answered in 43 ms, but the Kanban waits for the fleet status — and that request, like the arch state, waited for the first agent snapshot pass. Every later poll joined the same hung request.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 363,
      "wire": 699,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CbgGp26m.js",
      "start": 362,
      "ms": 571,
      "wire": 1488079,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 362,
      "ms": 91,
      "wire": 217346,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 1024,
      "ms": 17,
      "wire": 294,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 1025,
      "ms": 143,
      "wire": 295368,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 1025,
      "ms": 32050,
      "wire": 17378,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 1025,
      "ms": 16,
      "wire": 4913,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 1025,
      "ms": 47,
      "wire": 3064,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 1026,
      "ms": 31,
      "wire": 181,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 1026,
      "ms": 32097,
      "wire": 35788,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 1026,
      "ms": 63,
      "wire": 230,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 1026,
      "ms": 95,
      "wire": 5563,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 1026,
      "ms": 126,
      "wire": 10987,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 1121,
      "ms": 47,
      "wire": 160,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 6041,
      "ms": 123,
      "wire": 295368,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 6042,
      "ms": 27081,
      "wire": 17378,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 6042,
      "ms": 29,
      "wire": 4913,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 11041,
      "ms": 124,
      "wire": 295368,
      "encoding": "",
      "cached": false
     }
    ]
   },
   "reload": {
    "firstCardMs": 2934,
    "wireKB": 2037,
    "decodedKB": 2034,
    "requestCount": 14,
    "scriptMs": 94,
    "layoutMs": 130,
    "note": "With the snapshot ready the board paints in 0.4 s — and still re-downloads 1.67 MB of script and stylesheet, uncompressed, every time.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 39,
      "wire": 699,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CbgGp26m.js",
      "start": 42,
      "ms": 548,
      "wire": 1488079,
      "encoding": "",
      "cached": false
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 42,
      "ms": 152,
      "wire": 217346,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 620,
      "ms": 43,
      "wire": 294,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 620,
      "ms": 166,
      "wire": 301571,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 620,
      "ms": 2293,
      "wire": 17378,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 621,
      "ms": 45,
      "wire": 4913,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 621,
      "ms": 44,
      "wire": 3064,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 621,
      "ms": 43,
      "wire": 181,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 621,
      "ms": 87,
      "wire": 35788,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 621,
      "ms": 55,
      "wire": 230,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 621,
      "ms": 71,
      "wire": 5563,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 622,
      "ms": 70,
      "wire": 10987,
      "encoding": "",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 693,
      "ms": 14,
      "wire": 160,
      "encoding": "",
      "cached": false
     }
    ]
   }
  },
  "after-lan": {
   "cold": {
    "firstCardMs": 1201,
    "wireKB": 754,
    "decodedKB": 2039,
    "requestCount": 14,
    "scriptMs": 40,
    "layoutMs": 94,
    "note": "The cards paint when /api/taskgraph answers. The bundle travels compressed once and is then kept by the browser.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 336,
      "wire": 615,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CMQrYj6U.js",
      "start": 338,
      "ms": 201,
      "wire": 592838,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 339,
      "ms": 246,
      "wire": 59039,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 669,
      "ms": 24,
      "wire": 340,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 671,
      "ms": 441,
      "wire": 3933,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 671,
      "ms": 22,
      "wire": 2271,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 671,
      "ms": 83,
      "wire": 97839,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 671,
      "ms": 44,
      "wire": 2808,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 671,
      "ms": 67,
      "wire": 235,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 671,
      "ms": 442,
      "wire": 7994,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 671,
      "ms": 98,
      "wire": 284,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 672,
      "ms": 130,
      "wire": 1919,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 672,
      "ms": 161,
      "wire": 2190,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 802,
      "ms": 47,
      "wire": 214,
      "encoding": "br",
      "cached": false
     }
    ]
   },
   "reload": {
    "firstCardMs": 104,
    "wireKB": 23,
    "decodedKB": 2041,
    "requestCount": 14,
    "scriptMs": 55,
    "layoutMs": 100,
    "note": "Only index.html and the API calls travel; an unchanged board answers 304.",
    "requests": [
     {
      "url": "manage/index.html?tab=kanban",
      "start": 0,
      "ms": 34,
      "wire": 615,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "manage/assets/manage-CMQrYj6U.js",
      "start": 35,
      "ms": 0,
      "wire": 0,
      "encoding": "br",
      "cached": true
     },
     {
      "url": "manage/assets/manage-BODs7Ow7.css",
      "start": 35,
      "ms": 0,
      "wire": 0,
      "encoding": "br",
      "cached": true
     },
     {
      "url": "/api/taskgraph/layout",
      "start": 43,
      "ms": 39,
      "wire": 340,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/fleet/status",
      "start": 43,
      "ms": 41,
      "wire": 4234,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/notes?includeConsumed=true",
      "start": 44,
      "ms": 39,
      "wire": 2271,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/taskgraph",
      "start": 44,
      "ms": 42,
      "wire": 153,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch/conversations",
      "start": 44,
      "ms": 39,
      "wire": 2808,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/auth/check",
      "start": 44,
      "ms": 39,
      "wire": 235,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/arch",
      "start": 44,
      "ms": 55,
      "wire": 8367,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/recurring",
      "start": 44,
      "ms": 54,
      "wire": 284,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock",
      "start": 44,
      "ms": 54,
      "wire": 1919,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/repos",
      "start": 44,
      "ms": 55,
      "wire": 2190,
      "encoding": "br",
      "cached": false
     },
     {
      "url": "/api/dock/stash",
      "start": 101,
      "ms": 56,
      "wire": 214,
      "encoding": "br",
      "cached": false
     }
    ]
   }
  }
 },
 "live": [
  {
   "path": "GET /api/arch/claim",
   "n": 166,
   "p50": 4,
   "p95": 10028,
   "max": 15333,
   "total": 264.0,
   "share": 67,
   "why": "a full git status on the request thread, per dock"
  },
  {
   "path": "GET /api/arch/fleet/status",
   "n": 40,
   "p50": 547,
   "p95": 4517,
   "max": 5605,
   "total": 44.9,
   "share": 11,
   "why": "schtasks.exe (watchdog probe) on every poll — the Kanban waits for this call"
  },
  {
   "path": "GET /api/git/status",
   "n": 5,
   "p50": 7203,
   "p95": 9784,
   "max": 9784,
   "total": 33.6,
   "share": 9,
   "why": "a git status = 9–11 processes"
  },
  {
   "path": "GET /api/arch",
   "n": 62,
   "p50": 9,
   "p95": 2830,
   "max": 3989,
   "total": 19.4,
   "share": 5,
   "why": "git log for the home commits when the 15 s cache misses"
  },
  {
   "path": "GET /api/openspec/cockpit",
   "n": 2,
   "p50": 8518,
   "p95": 8518,
   "max": 8518,
   "total": 16.2,
   "share": 4,
   "why": "openspec CLI spawn"
  },
  {
   "path": "GET /api/branch",
   "n": 5,
   "p50": 923,
   "p95": 3824,
   "max": 3824,
   "total": 7.2,
   "share": 2,
   "why": "one git process"
  },
  {
   "path": "GET /api/github-account",
   "n": 137,
   "p50": 0,
   "p95": 1,
   "max": 3832,
   "total": 3.9,
   "share": 1,
   "why": ""
  },
  {
   "path": "GET /api/localview/<id>/app/console-machine/tools/birotests/api/eval/status",
   "n": 150,
   "p50": 3,
   "p95": 8,
   "max": 26,
   "total": 0.6,
   "share": 0,
   "why": ""
  },
  {
   "path": "GET /api/localview/<id>/app/console-machine/tools/birotests/api/status",
   "n": 150,
   "p50": 3,
   "p95": 9,
   "max": 22,
   "total": 0.6,
   "share": 0,
   "why": ""
  },
  {
   "path": "GET /api/taskgraph",
   "n": 42,
   "p50": 2,
   "p95": 5,
   "max": 43,
   "total": 0.1,
   "share": 0,
   "why": "the board itself — never slow"
  }
 ],
 "causes": [
  {
   "what": "The Kanban waited for the fleet status before painting",
   "evidence": "live: /api/taskgraph 2–43 ms, /api/arch/fleet/status p50 547 ms, p95 4.5 s, max 5.6 s; the board awaited both",
   "fix": "the board paints on /api/taskgraph alone; labels and idea numbers fill in"
  },
  {
   "what": "Fleet status spawned schtasks.exe on every poll",
   "evidence": "live stacks: FleetStatus → FleetOverviewProvider.ReadWatchdog → WatchdogProbe → process spawn",
   "fix": "the watchdog state is cached 15 s, renewed in the background"
  },
  {
   "what": "After a restart the board hung until the first snapshot pass ended",
   "evidence": "browser: fleet status and arch state unanswered for over 90 s; live passes take 5–75 s; later polls joined the hung request",
   "fix": "a provisional snapshot without git, never a wait; a poll joins an in-flight request only while it is under 4 s old"
  },
  {
   "what": "The per-dock claim badge ran a full git status per call",
   "evidence": "live: 166 calls, p95 10 s, max 15 s — 67 % of all server time",
   "fix": "claim reads the cached git state; the snapshot worker keeps it fresh"
  },
  {
   "what": "A git status was 9–11 processes",
   "evidence": "a spawn costs 30 ms to over 1 s on the hub; the snapshot pass over 15 repos averaged 17 s live, max 75 s",
   "fix": "at most 5: one for-each-ref, one config --get-regexp"
  },
  {
   "what": "Nothing compressed, the Management App never cached",
   "evidence": "1,666 KB of script + stylesheet per load (no-store); a 295 KB board every 5 s; 3.8 MB a minute per open Kanban",
   "fix": "Brotli/gzip on JSON, JS, CSS, HTML; hashed bundle files immutable; the board GET answers 304 when unchanged"
  },
  {
   "what": "Rendering — checked, not a cause",
   "evidence": "script ~0.1 s + layout ~0.1 s for the real board; only visible cards are in the DOM",
   "fix": "none needed"
  }
 ],
 "browser": [
  {
   "label": "Kanban, first load after a restart — first card (browser on the hub)",
   "before": "not within 90 s",
   "after": "707 ms"
  },
  {
   "label": "Kanban, first load — LAN model",
   "before": "33,564 ms",
   "after": "1,201 ms"
  },
  {
   "label": "Kanban, reload — first card (hub / LAN model)",
   "before": "403 ms / 2,934 ms",
   "after": "48 ms / 104 ms"
  },
  {
   "label": "Kanban, reload — bytes on the wire",
   "before": "2,002 KB",
   "after": "22 KB"
  },
  {
   "label": "Kanban open for a minute — bytes on the wire",
   "before": "3,786 KB",
   "after": "186 KB"
  },
  {
   "label": "Management App bundle per load (script + stylesheet)",
   "before": "1,666 KB, every load",
   "after": "637 KB once, then 0"
  },
  {
   "label": "Every other tab — first element, LAN model",
   "before": "850–1,911 ms",
   "after": "129–256 ms"
  },
  {
   "label": "Dashboard (/studio) — bytes on the wire, first load",
   "before": "4,790 KB",
   "after": "1,589 KB"
  },
  {
   "label": "Script + layout time for the Kanban (never the problem)",
   "before": "107 + 115 ms",
   "after": "55 + 94 ms"
  }
 ],
 "server": [
  {
   "path": "claim",
   "before": "7 / 50,829 / 62,876 ms",
   "after": "6 / 18 / 54 ms"
  },
  {
   "path": "fleetStatus",
   "before": "1,234 / 5,698 / 7,142 ms",
   "after": "5 / 9 / 59 ms"
  },
  {
   "path": "watchdog",
   "before": "1,924 / 5,726 / 5,726 ms",
   "after": "2 / 10 / 22 ms"
  },
  {
   "path": "arch",
   "before": "12 / 1,721 / 2,464 ms",
   "after": "11 / 32 / 34 ms"
  },
  {
   "path": "taskgraph",
   "before": "4 / 18 / 29 ms",
   "after": "8 / 33 / 50 ms"
  },
  {
   "path": "archMessages",
   "before": "11 / 28 / 172 ms",
   "after": "13 / 28 / 313 ms"
  },
  {
   "path": "policeman",
   "before": "18 / 61 / 90 ms",
   "after": "23 / 47 / 51 ms"
  }
 ],
 "bars": [
  {
   "label": "GET /api/arch/claim — p95 (the Dashboard polls it per dock)",
   "unit": "ms",
   "before": 50829,
   "after": 18
  },
  {
   "label": "GET /api/arch/fleet/status — median (the Kanban waited for it)",
   "unit": "ms",
   "before": 1234,
   "after": 5
  },
  {
   "label": "GET /api/watchdog/status — median",
   "unit": "ms",
   "before": 1924,
   "after": 2
  },
  {
   "label": "GET /api/arch — p95",
   "unit": "ms",
   "before": 1721,
   "after": 32
  },
  {
   "label": "Kanban reload — bytes on the wire",
   "unit": "KB",
   "before": 2002,
   "after": 22
  },
  {
   "label": "Kanban open for a minute — bytes on the wire",
   "unit": "KB",
   "before": 3786,
   "after": 186
  }
 ]
};
