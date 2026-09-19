# One-shot patch for openspec harness-window-agent-tabs (board task 9973393e).
import json

def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: anchor not unique/found ({s.count(old)}):\n{old[:200]}"
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

# ---- harnessWindow.js: the viewer sub-setting, the launcher relay ----------------------------
edit('client/src/components/shared/harnessWindow.js', [
("""export const PLACEMENT_KEY = 'manageapp.harnessWindow';
export const HARNESS_WINDOW_NAME = 'birocode-harness-window';
export const MODES = ['tabs', 'window'];
""",
"""export const PLACEMENT_KEY = 'manageapp.harnessWindow';
export const HARNESS_WINDOW_NAME = 'birocode-harness-window';
export const MODES = ['tabs', 'window'];
// How the dedicated window shows agents (openspec harness-window-agent-tabs):
//   'tabs'   — ONE TAB PER AGENT inside it. Measured in Chrome (check-harness-tabs.mjs): a tab
//              can only be opened into a window by a page living in that window, and Chrome
//              never adds tabs to a popup-style window — so the harness window is a NORMAL
//              window holding a small same-origin LAUNCHER tab; the dashboard keeps its handle
//              and asks it to open / focus the per-agent named tabs, which land next to it.
//              The Operator drags that window to the other monitor once (a normal window
//              cannot be placed by script) and allows pop-ups for this site once (the popup
//              blocker only lets the launcher open one tab per click IT received).
//   'single' — the earlier one viewer window, placed on the chosen screen, navigated per click.
export const VIEWERS = ['tabs', 'single'];
export const LAUNCHER_HOOK = '__birocodeOpenAgent';
export const LAUNCHER_QUERY = 'launcher';
"""),
("""    const mode = MODES.includes(v?.mode) ? v.mode : 'tabs';
    return { mode, screen: screenRecord(v?.screen) };
  } catch {
    return { mode: 'tabs', screen: null };
  }
}""",
"""    const mode = MODES.includes(v?.mode) ? v.mode : 'tabs';
    const viewer = VIEWERS.includes(v?.viewer) ? v.viewer : 'tabs';
    return { mode, viewer, screen: screenRecord(v?.screen) };
  } catch {
    return { mode: 'tabs', viewer: 'tabs', screen: null };
  }
}"""),
("""  const clean = { mode: MODES.includes(p?.mode) ? p.mode : 'tabs', screen: screenRecord(p?.screen) };""",
 """  const clean = { mode: MODES.includes(p?.mode) ? p.mode : 'tabs', viewer: VIEWERS.includes(p?.viewer) ? p.viewer : 'tabs', screen: screenRecord(p?.screen) };"""),
("""/** Open (or reuse) the dedicated harness window and show `url` in it. The window is
 * created with the placement's features; an existing one keeps wherever it is and is only
 * navigated + focused. True when the browser gave us a handle. */""",
"""/** The launcher page's URL: this very page (same origin, same proxy prefix) with ?launcher=1. */
export function launcherUrl(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.location) return null;
  return `${win.location.origin}${win.location.pathname}?${LAUNCHER_QUERY}=1`;
}

/** Whether this page IS the launcher (rendered instead of the dashboard). */
export function isLauncherPage(win = typeof window !== 'undefined' ? window : null) {
  try { return new URLSearchParams(win?.location?.search || '').get(LAUNCHER_QUERY) === '1'; } catch { return false; }
}

/** Install the launcher hook on `win`: `win.__birocodeOpenAgent(name, url)` opens the agent's
 * named tab in the LAUNCHER's window when it does not exist yet (fresh handle → navigated),
 * else only focuses it — never reloads. Returns 'opened' | 'focused' | 'blocked'. `onChange`
 * hears every call (the launcher page lists what it opened). */
export function installLauncher(win, onChange = null) {
  if (!win) return null;
  const opened = new Map(); // name → { url, at, hits }
  win[LAUNCHER_HOOK] = (name, url) => {
    if (!name || !url) return 'blocked';
    const w = win.open('', name);
    if (!w) { onChange?.({ name, url, result: 'blocked', opened: [...opened.values()] }); return 'blocked'; }
    let fresh = false;
    try { fresh = w.location.href === 'about:blank'; } catch { /* cross-origin: exists → focus only */ }
    if (fresh) { try { w.location.href = url; } catch { /* nothing more */ } }
    try { w.focus(); } catch { /* never guaranteed */ }
    const rec = opened.get(name) || { name, url, at: Date.now(), hits: 0 };
    rec.hits += 1; rec.last = Date.now(); if (fresh) rec.at = Date.now();
    opened.set(name, rec);
    const result = fresh ? 'opened' : 'focused';
    onChange?.({ name, url, result, opened: [...opened.values()] });
    return result;
  };
  return win[LAUNCHER_HOOK];
}

/** Per-agent tabs inside the dedicated harness window: find / create the launcher tab, then
 * ask it to open (first time) or focus (later) the agent's own named tab. The launcher is
 * created as a plain tab (no features — a popup-style window cannot hold tabs) next to the
 * dashboard; the Operator drags its window to the other monitor once. A brand-new launcher
 * is still loading, so the hook is awaited briefly (the fresh window carries the click's
 * activation for a few seconds). Resolves 'opened' | 'focused' | 'blocked' | 'no-launcher'
 * — 'blocked' = the launcher's window.open was popup-blocked (allow pop-ups for this site). */
export function openAgentViaLauncher(agentName, url, win = typeof window !== 'undefined' ? window : null, { waitMs = 4000, stepMs = 100 } = {}) {
  if (!win || !agentName || !url) return Promise.resolve('no-launcher');
  const h = win.open('', HARNESS_WINDOW_NAME);
  if (!h) return Promise.resolve('blocked');
  let fresh = false;
  try { fresh = h.location.href === 'about:blank'; } catch { /* another origin in the harness slot: replace it with our launcher */ fresh = true; }
  if (fresh) { try { h.location.href = launcherUrl(win); } catch { return Promise.resolve('no-launcher'); } }
  const ask = () => { try { return typeof h[LAUNCHER_HOOK] === 'function' ? h[LAUNCHER_HOOK](agentName, url) : null; } catch { return null; } };
  const first = ask();
  if (first) return Promise.resolve(first);
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const r = ask();
      if (r) return resolve(r);
      if (Date.now() - t0 >= waitMs) return resolve('no-launcher');
      (win.setTimeout || setTimeout)(tick, stepMs);
    };
    (win.setTimeout || setTimeout)(tick, stepMs);
  });
}

/** Open (or reuse) the dedicated harness window and show `url` in it. The window is
 * created with the placement's features; an existing one keeps wherever it is and is only
 * navigated + focused. True when the browser gave us a handle. */"""),
])

# ---- workerWindow.js: three ways, chosen at click time ----------------------------------------
edit('client/src/components/shared/workerWindow.js', [
("""  const placement = readPlacement();
  if (placement.mode === 'window') return openInHarnessWindow(url, placement, window);
  const w = window.open('', name);""",
"""  const placement = readPlacement();
  if (placement.mode === 'window') {
    // One tab per agent INSIDE the harness window (openspec harness-window-agent-tabs): the
    // launcher tab there opens the agent's named tab the first time and only focuses it after
    // that. A popup-blocked launcher falls back to opening the tab here, beside the dashboard,
    // so a click never does nothing; the Settings tab says how to allow pop-ups.
    if (placement.viewer !== 'single') {
      openAgentViaLauncher(name, url, window).then((r) => {
        if (r === 'blocked' || r === 'no-launcher') {
          try { window.dispatchEvent(new CustomEvent('birocode:harness-window', { detail: { result: r, name, url } })); } catch { /* no CustomEvent */ }
          if (r === 'blocked') focusOwnTab(name, url);
        }
      });
      return true;
    }
    return openInHarnessWindow(url, placement, window);
  }
  return focusOwnTab(name, url);
}

/** Today's per-agent tab beside the dashboard: found (never reloaded) and focused, or opened. */
function focusOwnTab(name, url) {
  const w = window.open('', name);"""),
("import { readPlacement, openInHarnessWindow } from './harnessWindow.js';",
 "import { readPlacement, openInHarnessWindow, openAgentViaLauncher } from './harnessWindow.js';"),
])

# ---- main.jsx: the launcher page is the same bundle with ?launcher=1 ---------------------------
edit('client/src/manage/main.jsx', [
("import ManageApp from './ManageApp.jsx';", "import ManageApp from './ManageApp.jsx';\nimport HarnessLauncher from './HarnessLauncher.jsx';\nimport { isLauncherPage } from '../components/shared/harnessWindow';"),
("""            <MemoryRouter>
              <ManageApp />
            </MemoryRouter>""",
"""            <MemoryRouter>
              {isLauncherPage() ? <HarnessLauncher /> : <ManageApp />}
            </MemoryRouter>"""),
])

# ---- ManageSettings.jsx: the viewer choice under window mode -----------------------------------
edit('client/src/manage/ManageSettings.jsx', [
("import { readPlacement, savePlacement, screenPicking, listScreens, screenSummary, openInHarnessWindow, HARNESS_WINDOW_NAME } from '../components/shared/harnessWindow';",
 "import { readPlacement, savePlacement, screenPicking, listScreens, screenSummary, openInHarnessWindow, openAgentViaLauncher, launcherUrl, HARNESS_WINDOW_NAME } from '../components/shared/harnessWindow';"),
("""  const tryOpen = () => {
    const url = `${(root || '').replace(/\\/$/, '')}/studio`;
    const ok = openInHarnessWindow(url, placement, window);
    setNote(ok ? t('manageSettings.windowOpened') : t('manageSettings.windowBlocked'));
  };""",
"""  const setViewer = (viewer) => update({ ...placement, mode: 'window', viewer });
  const tryOpen = () => {
    const url = `${(root || '').replace(/\\/$/, '')}/studio`;
    if (placement.viewer !== 'single') {
      // Tabs viewer: create / focus the launcher tab; it is the harness window to drag once.
      const h = window.open('', HARNESS_WINDOW_NAME);
      if (!h) { setNote(t('manageSettings.windowBlocked')); return; }
      let fresh = false;
      try { fresh = h.location.href === 'about:blank'; } catch { fresh = true; }
      if (fresh) { try { h.location.href = launcherUrl(window); } catch { /* nothing */ } }
      try { h.focus(); } catch { /* never guaranteed */ }
      setNote(t('manageSettings.launcherOpened'));
      return;
    }
    const ok = openInHarnessWindow(url, placement, window);
    setNote(ok ? t('manageSettings.windowOpened') : t('manageSettings.windowBlocked'));
  };
  // A badge click that the launcher could not serve (pop-ups blocked / no launcher) is
  // reported here so the Operator learns what to allow.
  const [relayNote, setRelayNote] = useState('');
  useEffect(() => {
    const on = (e) => setRelayNote(e.detail?.result === 'blocked' ? t('manageSettings.relayBlocked') : t('manageSettings.relayMissing'));
    window.addEventListener('birocode:harness-window', on);
    return () => window.removeEventListener('birocode:harness-window', on);
  }, [t]);"""),
("""        {placement.mode === 'window' && (
          <div className="ms__screens" data-placement-screens>
            <div className="ms__row">
              <span className="ms__label">{t('manageSettings.screen')}</span>""",
"""        {placement.mode === 'window' && (
          <div className="ms__screens" data-placement-screens>
            <div className="ms__modes ms__modes--viewer" role="radiogroup" aria-label={t('manageSettings.viewer')} data-placement-viewer={placement.viewer}>
              <label className={`ms__mode${placement.viewer !== 'single' ? ' ms__mode--on' : ''}`} data-placement-viewer-option="tabs">
                <input type="radio" name="viewer" checked={placement.viewer !== 'single'} onChange={() => setViewer('tabs')} />
                <span className="ms__mode-t">{t('manageSettings.viewerTabs')}</span>
                <span className="ms__dim">{t('manageSettings.viewerTabsHint')}</span>
              </label>
              <label className={`ms__mode${placement.viewer === 'single' ? ' ms__mode--on' : ''}`} data-placement-viewer-option="single">
                <input type="radio" name="viewer" checked={placement.viewer === 'single'} onChange={() => setViewer('single')} />
                <span className="ms__mode-t">{t('manageSettings.viewerSingle')}</span>
                <span className="ms__dim">{t('manageSettings.viewerSingleHint')}</span>
              </label>
            </div>
            {relayNote && <div className="ms__note" role="status" data-placement-relay-note>{relayNote}</div>}
            {placement.viewer !== 'single' && <div className="ms__dim" data-placement-tabs-howto>{t('manageSettings.viewerTabsHowto')}</div>}
            {placement.viewer === 'single' && (<>
            <div className="ms__row">
              <span className="ms__label">{t('manageSettings.screen')}</span>"""),
("""            {screens && screens.length === 0 && !detectError && <div className="ms__dim">{t('manageSettings.detectNone')}</div>}
            <div className="ms__row">""",
"""            {screens && screens.length === 0 && !detectError && <div className="ms__dim">{t('manageSettings.detectNone')}</div>}
            </>)}
            <div className="ms__row">"""),
("""              <span className="ms__dim">{t('manageSettings.tryOpenHint', { name: HARNESS_WINDOW_NAME })}</span>""",
 """              <span className="ms__dim">{t(placement.viewer !== 'single' ? 'manageSettings.tryOpenTabsHint' : 'manageSettings.tryOpenHint', { name: HARNESS_WINDOW_NAME })}</span>"""),
])

edit('client/src/manage/manageSettings.css', [
(".ms__screens { margin: 10px 0 0;", ".ms__modes--viewer .ms__mode { flex-basis: 260px; }\n.ms__screens { margin: 10px 0 0;"),
])

# ---- i18n ------------------------------------------------------------------------------------
KEYS_EN = {
    "manageSettings.viewer": "How the harness window shows agents",
    "manageSettings.viewerTabs": "One tab per agent (recommended)",
    "manageSettings.viewerTabsHint": "The harness window is a normal Chrome window with a small launcher tab. The first click on an agent opens its own tab there; every later click just focuses that tab — never reloads it.",
    "manageSettings.viewerSingle": "One viewer, placed on a screen",
    "manageSettings.viewerSingleHint": "A single window that shows the clicked agent (re-navigated each time). The only kind a page can place on a chosen screen.",
    "manageSettings.viewerTabsHowto": "Two one-time steps: press \"Open the harness window now\" and drag its window to the monitor you want (it stays); and allow pop-ups for this site (the icon at the right of the address bar, or Site settings → Pop-ups and redirects → Allow) — without it Chrome lets the launcher open only the first agent tab.",
    "manageSettings.tryOpenTabsHint": "Creates (or focuses) the launcher tab named {name}; drag its window to the monitor you want — agent tabs open next to it.",
    "manageSettings.launcherOpened": "launcher opened — drag its window to the screen you want; agent tabs will open next to it",
    "manageSettings.relayBlocked": "Chrome blocked the harness window from opening an agent tab, so it opened beside the dashboard instead. Allow pop-ups for this site (address bar → Pop-ups blocked → Always allow) and click again.",
    "manageSettings.relayMissing": "The harness window did not answer in time; click the agent again once its launcher tab has loaded.",
    "launcher.title": "Harness window",
    "launcher.lead": "Keep this tab open. The Management dashboard opens each repo agent as its own tab next to it, and focuses an existing one instead of reloading it. Drag this window to the monitor where you want the agents.",
    "launcher.popups": "If Chrome blocks a tab, allow pop-ups for this site (the icon at the right of the address bar) — otherwise only the first agent tab opens.",
    "launcher.none": "No agent opened from here yet.",
    "launcher.opened": "Opened from here",
    "launcher.hits": "{n}× focused",
}
KEYS_TR = {
    "manageSettings.viewer": "Harness penceresi ajanları nasıl göstersin",
    "manageSettings.viewerTabs": "Ajan başına bir sekme (önerilen)",
    "manageSettings.viewerTabsHint": "Harness penceresi küçük bir başlatıcı sekmesi olan normal bir Chrome penceresidir. Bir ajana ilk tıklama orada kendi sekmesini açar; sonraki her tıklama yalnızca o sekmeye odaklanır — asla yeniden yüklemez.",
    "manageSettings.viewerSingle": "Tek görüntüleyici, bir ekrana yerleştirilmiş",
    "manageSettings.viewerSingleHint": "Tıklanan ajanı gösteren tek bir pencere (her seferinde yeniden gidilir). Bir sayfanın seçilen ekrana yerleştirebildiği tek tür.",
    "manageSettings.viewerTabsHowto": "Bir kerelik iki adım: \"Harness penceresini şimdi aç\"a basın ve penceresini istediğiniz monitöre sürükleyin (orada kalır); ve bu site için açılır pencerelere izin verin (adres çubuğunun sağındaki simge veya Site ayarları → Açılır pencereler ve yönlendirmeler → İzin ver) — onsuz Chrome başlatıcının yalnızca ilk ajan sekmesini açmasına izin verir.",
    "manageSettings.tryOpenTabsHint": "{name} adlı başlatıcı sekmesini oluşturur (veya odaklar); penceresini istediğiniz monitöre sürükleyin — ajan sekmeleri onun yanında açılır.",
    "manageSettings.launcherOpened": "başlatıcı açıldı — penceresini istediğiniz ekrana sürükleyin; ajan sekmeleri onun yanında açılacak",
    "manageSettings.relayBlocked": "Chrome harness penceresinin bir ajan sekmesi açmasını engelledi, bu yüzden pano yanında açıldı. Bu site için açılır pencerelere izin verin (adres çubuğu → Açılır pencereler engellendi → Her zaman izin ver) ve yeniden tıklayın.",
    "manageSettings.relayMissing": "Harness penceresi zamanında yanıt vermedi; başlatıcı sekmesi yüklendikten sonra ajana yeniden tıklayın.",
    "launcher.title": "Harness penceresi",
    "launcher.lead": "Bu sekmeyi açık tutun. Yönetim panosu her depo ajanını onun yanında kendi sekmesi olarak açar ve mevcut olanı yeniden yüklemek yerine odaklar. Bu pencereyi ajanları istediğiniz monitöre sürükleyin.",
    "launcher.popups": "Chrome bir sekmeyi engellerse bu site için açılır pencerelere izin verin (adres çubuğunun sağındaki simge) — aksi halde yalnızca ilk ajan sekmesi açılır.",
    "launcher.none": "Buradan henüz ajan açılmadı.",
    "launcher.opened": "Buradan açılanlar",
    "launcher.hits": "{n}× odaklandı",
}
for path, keys in (('client/src/i18n/en.json', KEYS_EN), ('client/src/i18n/tr.json', KEYS_TR)):
    d = json.load(open(path, encoding='utf-8'))
    for k, v in keys.items():
        assert k not in d, (path, k)
        d[k] = v
    open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print('patched', path)
print('all patches applied')
