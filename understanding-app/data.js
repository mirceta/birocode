// The chain, the checks and the findings behind the Understanding app (fleet task 20f936ec).
// Transcribed from openspec/changes/chrome-readiness-preflight/design.md.
window.CHROME_DATA = {
  // Each link: what it is, the check that watches it, and what a break looks like.
  links: [
    { id: 'toggle', icon: '🌐', name: "The agent's 🌐 toggle", sub: 'per agent, on this device; builder lane, Claude engine', check: 'harness', agent: 'The turn is an ordinary turn — no browser tools were asked for.', section: 'Not a machine fault: the tile notes how many agents on this device have the toggle on.', state: 'info', blocks: false },
    { id: 'login', icon: '🔑', name: 'Claude Code on its claude.ai login', sub: 'no API key, no long-lived token reaching the turn', check: 'login', agent: 'The turn starts with --chrome and simply has no browser tools. No error anywhere.', section: 'Login check fails: names the variable (e.g. CLAUDE_CODE_OAUTH_TOKEN) and says to remove it and restart the harness.', state: 'fail', blocks: true },
    { id: 'cli', icon: '⌨️', name: 'Claude Code CLI with --chrome', sub: 'on PATH, lists the flag', check: 'cli', agent: 'The turn fails to start, or starts without the browser.', section: 'CLI check fails: install or update Claude Code.', state: 'fail', blocks: true },
    { id: 'pipe', icon: '🧵', name: 'The bridge pipe', sub: 'claude-mcp-browser-bridge-&lt;user&gt;, opened by the native host', check: 'bridge', agent: '"Browser extension is not connected."', section: 'Bridge check fails: the extension has not started the native host — open the profile with the extension.', state: 'fail', blocks: true },
    { id: 'host', icon: '🧩', name: 'Native-messaging registration', sub: 'registry → manifest → wrapper → claude.exe --chrome-native-host', check: 'nativeHost', agent: '"Browser extension is not connected."', section: 'Native host check fails and names the broken link (missing manifest, a moved claude.exe…): run `claude --chrome` once, restart Chrome.', state: 'fail', blocks: true },
    { id: 'ext', icon: '🧱', name: 'The Claude extension', sub: 'installed, enabled, ≥ 1.0.36 — in the profile that is open', check: 'extension · profile', agent: '"Browser extension is not connected."', section: 'Extension check fails (not installed / disabled / too old), or the profile check says the open profile does not have it.', state: 'fail', blocks: true },
    { id: 'chrome', icon: '🟢', name: 'Chrome running', sub: 'the extension only exists while Chrome is open', check: 'chrome', agent: '"Browser extension is not connected."', section: 'Chrome check fails: open Chrome.', state: 'fail', blocks: true },
    { id: 'account', icon: '👤', name: 'Extension signed in — same account', sub: 'claude.ai, the account Claude Code uses', check: 'extensionLogin', agent: '"Browser extension is not connected … logged into claude.ai with the same account as Claude Code."', section: 'Cannot be seen from the harness: shown "?" — and the live probe fails, which is how you find out.', state: 'unknown', blocks: true },
  ],
  checks: [
    { id: 'chrome', kind: 'static', what: 'Chrome installed and running', how: 'chrome.exe + its version; the process list' },
    { id: 'extension', kind: 'static', what: 'Extension installed, enabled, ≥ 1.0.36', how: "each profile's Extensions folder and its settings entry in (Secure) Preferences" },
    { id: 'profile', kind: 'static', what: 'Extension is in the profile Chrome has open', how: 'Local State: profiles, last active' },
    { id: 'nativeHost', kind: 'static', what: 'Native-messaging host registered', how: 'registry → manifest → wrapper → the binary it starts → allowed origin' },
    { id: 'bridge', kind: 'static', what: 'Bridge to the extension is up', how: 'the pipe list has claude-mcp-browser-bridge-&lt;user&gt;' },
    { id: 'cli', kind: 'static', what: 'Claude Code supports --chrome', how: 'PATH; --help and --version once per harness lifetime' },
    { id: 'login', kind: 'static', what: 'Claude Code signed in with the claude.ai login', how: 'the account probe; auth overrides in the harness environment; apiKeyHelper' },
    { id: 'extensionLogin', kind: 'not checkable', what: 'Extension signed in with the same account', how: 'lives inside the browser — "?" until a live answer proves it' },
    { id: 'harness', kind: 'static', what: 'Harness browser mode', how: "the browser gate's holder" },
    { id: 'lastTurn', kind: 'passive', what: 'Last real agent browser call', how: 'the adapter reports every claude-in-chrome tool result as it streams past' },
    { id: 'live', kind: 'on Re-run', what: 'Live probe: an agent turn reaches the browser', how: 'one short claude -p --chrome turn, two read-only tools, verdict from tool results' },
  ],
  probe: {
    pass: { verdict: ['ok', 'Live probe passes: "An agent turn reached the extension: 1 browser connected (Browser 1 — this machine), and tabs_context_mcp answered." The same-account check turns green; overall: Ready.'], steps: [
      ['ok', 'the turn starts', 'claude -p … --chrome --model haiku --allowedTools list_connected_browsers,tabs_context_mcp'],
      ['ok', 'init', 'mcp_servers: claude-in-chrome connected · 22 browser tools — proves nothing yet'],
      ['ok', 'list_connected_browsers', '[{ name: "Browser 1", osPlatform: "Windows", isLocal: true }]'],
      ['ok', 'tabs_context_mcp {}', '"No tab group exists for this session." — the extension answered; no tab was opened'],
    ] },
    auth: { verdict: ['bad', 'Live probe fails: "The turn was started with --chrome but was NOT offered the browser tools — the CLI authenticated with something other than the claude.ai login."'], steps: [
      ['ok', 'the turn starts', 'the same launch; the environment carries CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY when not stripped)'],
      ['bad', 'init', 'mcp_servers: [] · 0 browser tools — --chrome was silently ignored'],
      ['dim', 'list_connected_browsers', 'never called: the tool does not exist in this turn'],
      ['dim', 'tabs_context_mcp {}', 'never called'],
    ] },
    bridge: { verdict: ['bad', 'Live probe fails with the extension\'s own words: "Browser extension is not connected. Please ensure the Claude browser extension is installed and running…"'], steps: [
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
    ['Bridge', 'pipe present; chrome.exe → cmd.exe → claude.exe --chrome-native-host, started with Chrome'],
    ['CLI', '2.1.289, lists --chrome'],
    ['Login', 'claude.ai login, Max; no API key or token in the environment'],
    ['Harness spawn', 'removes only ANTHROPIC_API_KEY; any other auth override reaches the agent'],
    ['Init says "connected" regardless', 'a --chrome turn lists the browser server as connected whether or not the extension can be reached — only a tool call tells'],
    ['Two turns at once', 'both got answers on this CLI version; the harness gate still runs one browser turn at a time'],
    ['Verified end to end', 'healthy: Degraded → Re-run → probe passed in 10–20 s → Ready; polled read 1–2 ms. Failure: harness started with a token in its environment → Not ready, cause named twice'],
  ],
};
