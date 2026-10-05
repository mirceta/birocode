// The chain, the checks, the repairs and the findings behind the Understanding app
// (fleet task 20f936ec). Transcribed from openspec/changes/chrome-readiness-preflight/design.md.
window.CHROME_DATA = {
  // Each link: what it is, its check, what a break looks like to the agent, and who repairs it.
  //   repair: 'auto' = the harness, by itself; 'open' = the harness opens the page, the Operator
  //   finishes; 'spawn' = fixed at every browser turn's start; 'operator' = only the Operator.
  links: [
    { id: 'login', icon: '🔑', name: 'Claude Code on its claude.ai login', sub: 'no API key or long-lived token reaching the turn', check: 'login', agent: 'The turn starts with --chrome and simply has no browser tools. No error anywhere.', section: 'Passes with a note: the harness removes the override from every browser turn. Fails only when there is no claude.ai login at all.', repair: 'spawn', repairText: 'A browser turn does not inherit CLAUDE_CODE_OAUTH_TOKEN and the like when a claude.ai login exists.' },
    { id: 'cli', icon: '⌨️', name: 'Claude Code CLI with --chrome', sub: 'on PATH, lists the flag', check: 'cli', agent: 'The turn fails to start, or starts without the browser.', section: 'CLI check fails: install or update Claude Code.', repair: 'operator', repairText: 'Install or update Claude Code on the machine.' },
    { id: 'host', icon: '🧩', name: 'Native-messaging registration', sub: 'registry → manifest → wrapper → claude.exe --chrome-native-host', check: 'nativeHost', agent: 'The local path cannot start. Calls still work while the cloud path is up.', section: 'Native host check fails and names the broken link (missing manifest, a moved claude.exe…).', repair: 'auto', repairText: 'Any --chrome run of the CLI rewrites it (verified by deleting the registry value); then the extension is asked to reconnect.' },
    { id: 'pipe', icon: '🧵', name: 'The local host (a named pipe)', sub: 'claude-mcp-browser-bridge-&lt;user&gt;, started by the extension', check: 'bridge', agent: 'Nothing, while the cloud path answers. The extension never restarts the host by itself.', section: 'Bridge check: a warning — "the harness repairs this by itself".', repair: 'auto', repairText: 'The extension\'s own reconnect address, opened in the right profile: the pipe was back in under a second; the tab closes itself.' },
    { id: 'ext', icon: '🧱', name: 'The Claude extension', sub: 'installed, enabled, ≥ 1.0.36 — in the profile that is open', check: 'extension · profile', agent: '"Browser extension is not connected."', section: 'Extension check fails (not installed / disabled / too old), or the profile check says the open profile does not have it.', repair: 'open', repairText: 'The wrong profile open: the harness opens the right one. Disabled, missing or old: it opens the extension\'s page or its store page on the host; the Operator clicks.' },
    { id: 'chrome', icon: '🟢', name: 'Chrome running', sub: 'the extension only exists while Chrome is open', check: 'chrome', agent: '"Browser extension is not connected."', section: 'Chrome check fails — repairable.', repair: 'auto', repairText: 'The harness starts Chrome in the profile that has the extension (the same command as the reconnect).' },
    { id: 'account', icon: '👤', name: 'Extension signed in — same account', sub: 'claude.ai, the account Claude Code uses', check: 'extensionLogin', agent: '"Browser extension is not connected … logged into claude.ai with the same account as Claude Code."', section: 'Cannot be seen from the harness: "?" — the live probe fails, which is how you find out.', repair: 'open', repairText: 'The harness opens claude.ai\'s Chrome page in that profile; the Operator signs in.' },
  ],
  checks: [
    { id: 'chrome', kind: 'static', what: 'Chrome installed and running', how: 'chrome.exe + its version; the process list', repair: 'auto' },
    { id: 'extension', kind: 'static', what: 'Extension installed, enabled, ≥ 1.0.36', how: "each profile's Extensions folder and its settings entry", repair: 'open the page' },
    { id: 'profile', kind: 'static', what: 'Extension is in the profile Chrome has open', how: 'Local State: profiles, last active', repair: 'auto' },
    { id: 'nativeHost', kind: 'static', what: 'Native-messaging host registered', how: 'registry → manifest → wrapper → binary → allowed origin', repair: 'auto' },
    { id: 'bridge', kind: 'static', what: 'The local host is up', how: 'the pipe list', repair: 'auto' },
    { id: 'cli', kind: 'static', what: 'Claude Code supports --chrome', how: 'PATH; --help and --version once per harness lifetime', repair: '—' },
    { id: 'login', kind: 'static', what: 'Claude Code signed in with the claude.ai login', how: 'the account probe; auth overrides in the harness environment', repair: 'at every browser turn' },
    { id: 'extensionLogin', kind: 'not checkable', what: 'Extension signed in with the same account', how: 'lives inside the browser — "?" until a live answer proves it', repair: 'open the page' },
    { id: 'harness', kind: 'static', what: 'Harness browser mode', how: "the browser gate's holder", repair: '—' },
    { id: 'lastTurn', kind: 'passive', what: 'Last real agent browser call', how: 'the adapter reports every claude-in-chrome tool result', repair: 'a failure triggers a reconnect' },
    { id: 'live', kind: 'on Re-run', what: 'Live probe: an agent turn reaches the browser', how: 'one short claude -p --chrome turn, two read-only tools', repair: '—' },
  ],
  triggers: [
    { when: 'Before every browser turn', what: 'Re-read the checks (no process). Chrome closed, local host down or the wrong profile open → the reconnect address in the right profile, wait up to 10 s. What only the Operator can fix is said in the chat; the turn runs either way.', verified: 'Local host stopped, a real browser turn sent: "up after 1.6 s (before a browser turn of …)", the turn completed.' },
    { when: 'An agent\'s browser call answers "not connected"', what: 'The reconnect address at once, so the agent\'s retry finds the browser.', verified: 'Rule unit-tested; not produced live (it needs both transports down).' },
    { when: 'Repair in the section', what: 'Rewrite a broken registration → reconnect → the live probe as the proof. Each step lands in "What the harness repaired".', verified: 'Local host stopped → Repair → "up after 5.7 s" → probe passed → Ready.' },
    { when: 'Every browser turn\'s start', what: 'Authentication overrides are not inherited when a claude.ai login exists.', verified: 'Harness started with CLAUDE_CODE_OAUTH_TOKEN: the probe passed (zero browser tools before) → Ready.' },
  ],
  probe: {
    pass: { verdict: ['ok', 'Live probe passes: "An agent turn reached the extension: 1 browser connected (Browser 1 — this machine), and tabs_context_mcp answered." The same-account check turns green; overall: Ready.'], steps: [
      ['ok', 'the turn starts', 'claude -p … --chrome --model haiku --allowedTools list_connected_browsers,tabs_context_mcp — auth overrides removed, like a browser turn'],
      ['ok', 'init', 'mcp_servers: claude-in-chrome connected · 22 browser tools — proves nothing yet'],
      ['ok', 'list_connected_browsers', '[{ name: "Browser 1", osPlatform: "Windows", isLocal: true }]'],
      ['ok', 'tabs_context_mcp {}', '"No tab group exists for this session." — the extension answered; no tab was opened'],
    ] },
    auth: { verdict: ['bad', 'Without the repair: "The turn was started with --chrome but was NOT offered the browser tools." With it, this case no longer happens when a claude.ai login exists.'], steps: [
      ['ok', 'the turn starts', 'the environment carries CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY)'],
      ['bad', 'init', 'mcp_servers: [] · 0 browser tools — --chrome was silently ignored'],
      ['dim', 'list_connected_browsers', 'never called: the tool does not exist in this turn'],
      ['dim', 'tabs_context_mcp {}', 'never called'],
    ] },
    bridge: { verdict: ['bad', 'Live probe fails with the extension\'s own words: "Browser extension is not connected…" — and the harness asks the extension to reconnect.'], steps: [
      ['ok', 'the turn starts', 'the same launch'],
      ['ok', 'init', 'mcp_servers: claude-in-chrome connected · 22 browser tools — still says connected'],
      ['bad', 'list_connected_browsers', '[] or "Browser extension is not connected"'],
      ['bad', 'tabs_context_mcp {}', '"Browser extension is not connected … logged into claude.ai with the same account as Claude Code."'],
    ] },
  },
  found: [
    ['Chrome', '154, running'],
    ['Profiles', 'two; the extension (1.0.98, enabled) is in one of them only'],
    ['Registration', 'HKCU … NativeMessagingHosts → manifest → chrome-native-host.bat → claude.exe --chrome-native-host; registered for Chrome, not for Edge'],
    ['Two transports', 'the local host (a pipe) and the extension\'s cloud connection — either is enough'],
    ['Local host stopped', 'a turn STILL got through (cloud path); the pipe did not come back in 60 s — the extension does not re-dial by itself'],
    ['The reconnect address', 'https://clau.de/chrome/reconnect: the extension drops and re-dials both transports and closes the tab; the pipe was back in under a second'],
    ['Registration deleted', 'one --chrome run of the CLI rewrote it, identical to before'],
    ['Init says "connected" regardless', 'only a tool call tells whether the extension is reachable'],
    ['Token or API key reaching a turn', 'zero browser tools, no error — the harness used to strip only the API key'],
    ['In the wild', '21 browser calls of one agent answered "Browser extension is not connected" on 2–4 September'],
  ],
};
