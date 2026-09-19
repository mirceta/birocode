# One-shot patch for openspec management-settings-tab (board task a434653b).
import json, re

def edit(path, pairs):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: anchor not unique/found ({s.count(old)}):\n{old[:200]}"
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

# ---- ManageSettings.jsx: the i18n hook's real path, keys under manageSettings.* -------------
p = 'client/src/manage/ManageSettings.jsx'
s = open(p, encoding='utf-8').read()
s = s.replace("import { useT } from '../i18n/useT';", "import { useT } from '../i18n/LanguageContext';")
s = s.replace("t('settings.", "t('manageSettings.")
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched', p)

# ---- workerWindow.js: the badge click honours the placement ------------------------------
edit('client/src/components/shared/workerWindow.js', [
("""export function focusAgentTab(key, url) {
  const name = agentTabName(key);
  if (!name || !url) return false;
  const w = window.open('', name);""",
"""export function focusAgentTab(key, url) {
  const name = agentTabName(key);
  if (!name || !url) return false;
  // The Settings tab's placement (openspec management-settings-tab): the Operator may
  // route every badge click into ONE dedicated harness window on a chosen screen.
  const placement = readPlacement();
  if (placement.mode === 'window') return openInHarnessWindow(url, placement, window);
  const w = window.open('', name);"""),
("""/** The per-agent window name for an assignee key""",
"""import { readPlacement, openInHarnessWindow } from './harnessWindow.js';

/** The per-agent window name for an assignee key"""),
])

# ---- Arch.jsx: the fleet-wide cards split by purpose ---------------------------------------
p = 'client/src/pages/Arch.jsx'
lines = open(p, encoding='utf-8').read().split('\n')
def find(text, start=0):
    for i in range(start, len(lines)):
        if lines[i] == text: return i
    raise AssertionError('line not found: ' + text)
i_side = find('  const sideCards = (')
assert lines[i_side + 1] == '    <>'
i_managed = find('        <section className="arch__card">', i_side)
i_fleet = find('        <section className="arch__card arch__fleet">', i_managed)
i_home = find('        <section className="arch__card">', i_fleet)
i_goals = find('        <section className="arch__card" data-arch-goals>', i_home)
i_end = find('    </>', i_goals)
assert lines[i_end + 1] == '  );'
managed = lines[i_managed:i_fleet]
fleet = lines[i_fleet:i_home]
home = lines[i_home:i_goals]
goals = lines[i_goals:i_end]
def block(name, body):
    return [f'  const {name} = ('] + body + ['  );']
new = (
    ['  // The fleet-wide cards (openspec management-settings-tab): the Managed-agents scope and the',
     '  // Fleet posture are SETTINGS (the Management App\'s Settings tab); the Home repo and the goal',
     '  // conversations are STATUS (its Status tab); the Fleet lane beside a conversation shows all four.']
    + block('managedCard', managed) + block('fleetCard', fleet) + block('homeCard', home) + block('goalsCard', goals)
    + ['  const settingsCards = <>{managedCard}{fleetCard}</>;',
       '  const statusCards = <>{homeCard}{goalsCard}</>;',
       '  const sideCards = <>{managedCard}{fleetCard}{homeCard}{goalsCard}</>;']
)
lines[i_side - 2:i_end + 2] = new  # replace from the two comment lines above sideCards
s = '\n'.join(lines)
old = "export default function Arch({ popup = false, onOpenDock = null, view = 'full', conv = '@arch', onConversationChanged = null }) {"
assert s.count(old) == 1
s = s.replace(old, "export default function Arch({ popup = false, onOpenDock = null, view = 'full', conv = '@arch', onConversationChanged = null, cards = 'all' }) {")
old = """        <div className="arch__overview" data-overview>{sideCards}</div>
      </div>
    );
  }"""
assert s.count(old) == 1
s = s.replace(old, """        <div className="arch__overview" data-overview data-cards={cards}>{cards === 'settings' ? settingsCards : cards === 'status' ? statusCards : sideCards}</div>
      </div>
    );
  }""")
open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched', p)

# ---- ManageApp.jsx: the Settings tab; the Status tab keeps the status cards ---------------
edit('client/src/manage/ManageApp.jsx', [
("const TABS = ['arch', 'tasks', 'ideas', 'graph', 'kanban', 'events', 'status'];",
 "const TABS = ['arch', 'tasks', 'ideas', 'graph', 'kanban', 'events', 'status', 'settings'];"),
("const DEFAULT_WEIGHTS = { arch: 2, tasks: 1, ideas: 1, graph: 1, kanban: 1, events: 1, status: 1 };",
 "const DEFAULT_WEIGHTS = { arch: 2, tasks: 1, ideas: 1, graph: 1, kanban: 1, events: 1, status: 1, settings: 1 };"),
("// URL-addressable tabs: ?tab=arch|tasks|ideas|graph|kanban|events|status wins, else",
 "// URL-addressable tabs: ?tab=arch|tasks|ideas|graph|kanban|events|status|settings wins, else"),
("""              : k === 'status' ? t('manage.status')
                : t('manage.events'));""",
"""              : k === 'status' ? t('manage.status')
                : k === 'settings' ? t('manage.settings')
                  : t('manage.events'));"""),
("""  // The Arch tab is the conversation with its lanes (Chat · Tools · History · Loops);
  // the fleet-wide cards (Managed agents, Fleet, Home repo) live on the Status tab.""",
"""  // The Arch tab is the conversation with its lanes (Chat · Tools · History · Loops);
  // the fleet-wide cards are split by purpose (openspec management-settings-tab): the
  // Managed-agents scope and the Fleet posture are Settings, the Home repo and the goal
  // conversations stay on Status."""),
("""            <section className="mg__status-arch" aria-label={t('manage.archControls')}>
              <h3 className="mg__status-h">🏛 {t('manage.archControls')}</h3>
              <Arch popup view="cards" onOpenDock={openHarness} />
            </section>
          </div>
        )
        : <iframe""",
"""            <section className="mg__status-arch" aria-label={t('manage.archStatus')}>
              <h3 className="mg__status-h">🏛 {t('manage.archStatus')}</h3>
              <Arch popup view="cards" cards="status" onOpenDock={openHarness} />
            </section>
          </div>
        )
        : k === 'settings' ? <ManageSettings root={root} openHarness={openHarness} />
        : <iframe"""),
("import FleetStatus from './FleetStatus';", "import FleetStatus from './FleetStatus';\nimport ManageSettings from './ManageSettings';"),
])

# ---- i18n ----------------------------------------------------------------------------------
KEYS_EN = {
    "manage.settings": "Settings",
    "manage.archStatus": "Arch agent — home repo, goal conversations",
    "manageSettings.placement": "Where the Kanban badge links open",
    "manageSettings.placementLead": "Clicking a repo-agent badge on a Kanban card opens that machine's harness. Choose whether those open as tabs in this Chrome window, or in one dedicated harness window you keep on another screen.",
    "manageSettings.modeTabs": "Tabs in this window (one tab per agent)",
    "manageSettings.modeTabsHint": "Each agent gets its own named tab next to the dashboard; a click focuses it wherever you dragged it. A brand-new agent tab always appears in this window.",
    "manageSettings.modeWindow": "One dedicated harness window on a chosen screen",
    "manageSettings.modeWindowHint": "Every click shows that agent in ONE separate harness window and focuses it. Placed on the screen you pick below when the browser lets us; otherwise it opens beside this window — drag it to the other monitor once and it stays there.",
    "manageSettings.screen": "screen",
    "manageSettings.screenNone": "no screen chosen — the window opens on this screen, drag it once",
    "manageSettings.screenClear": "forget",
    "manageSettings.detect": "🖥 Detect screens…",
    "manageSettings.detectHint": "Chrome asks once for the Window Management permission, then lists your monitors.",
    "manageSettings.detectNone": "The browser reported no screens.",
    "manageSettings.noPicker": "Screen picking is not available here:",
    "manageSettings.noPickerHint": "The dedicated window still works — it opens beside this window and keeps wherever you drag it.",
    "manageSettings.tryOpen": "Open the harness window now",
    "manageSettings.tryOpenHint": "Creates (or focuses) the window named {name} with this harness in it, so you can park it where you want.",
    "manageSettings.windowOpened": "opened — drag it to the screen you want if it did not land there",
    "manageSettings.windowBlocked": "the browser blocked the window — allow pop-ups for this site and try again",
    "manageSettings.limitsTitle": "What a web page can and cannot do here",
    "manageSettings.limit1": "A page cannot list Chrome's open windows, nor put a tab into a window it did not open — that needs a browser extension (chrome.windows / chrome.tabs). If you want tabs to land in an existing left-monitor Chrome window, that is the extension route; say so and it can be built as a small companion extension the dashboard talks to.",
    "manageSettings.limit2": "A named tab (\"tabs\" mode) always opens in the window that hosts the dashboard; once you drag it elsewhere, later clicks find and focus it there.",
    "manageSettings.limit3": "A window opened with a position and size is a separate Chrome window; placing it on another monitor needs the Window Management API — a secure page (https or localhost) and your one-time permission. Without that, Chrome opens it on this screen and remembers where you drag it for as long as it lives.",
    "manageSettings.limit4": "This choice is saved in this browser only, like the dashboard's layout.",
}
KEYS_TR = {
    "manage.settings": "Ayarlar",
    "manage.archStatus": "Arch ajanı — ana depo, hedef konuşmaları",
    "manageSettings.placement": "Kanban rozet bağlantıları nerede açılsın",
    "manageSettings.placementLead": "Bir Kanban kartındaki depo-ajanı rozetine tıklamak o makinenin harness'ını açar. Bunların bu Chrome penceresinde sekme olarak mı, yoksa başka bir ekranda tuttuğunuz tek bir harness penceresinde mi açılacağını seçin.",
    "manageSettings.modeTabs": "Bu pencerede sekmeler (ajan başına bir sekme)",
    "manageSettings.modeTabsHint": "Her ajan panonun yanında kendi adlandırılmış sekmesini alır; tıklama onu sürüklediğiniz yerde odaklar. Yeni bir ajan sekmesi her zaman bu pencerede açılır.",
    "manageSettings.modeWindow": "Seçilen ekranda tek bir harness penceresi",
    "manageSettings.modeWindowHint": "Her tıklama o ajanı TEK bir ayrı harness penceresinde gösterir ve odaklar. Tarayıcı izin verirse aşağıda seçtiğiniz ekrana yerleştirilir; aksi halde bu pencerenin yanında açılır — bir kez diğer monitöre sürükleyin, orada kalır.",
    "manageSettings.screen": "ekran",
    "manageSettings.screenNone": "ekran seçilmedi — pencere bu ekranda açılır, bir kez sürükleyin",
    "manageSettings.screenClear": "unut",
    "manageSettings.detect": "🖥 Ekranları algıla…",
    "manageSettings.detectHint": "Chrome bir kez Pencere Yönetimi izni ister, sonra monitörlerinizi listeler.",
    "manageSettings.detectNone": "Tarayıcı ekran bildirmedi.",
    "manageSettings.noPicker": "Ekran seçimi burada kullanılamıyor:",
    "manageSettings.noPickerHint": "Özel pencere yine çalışır — bu pencerenin yanında açılır ve sürüklediğiniz yerde kalır.",
    "manageSettings.tryOpen": "Harness penceresini şimdi aç",
    "manageSettings.tryOpenHint": "{name} adlı pencereyi bu harness ile oluşturur (veya odaklar); istediğiniz yere park edin.",
    "manageSettings.windowOpened": "açıldı — istediğiniz ekrana gelmediyse sürükleyin",
    "manageSettings.windowBlocked": "tarayıcı pencereyi engelledi — bu site için açılır pencerelere izin verip yeniden deneyin",
    "manageSettings.limitsTitle": "Bir web sayfası burada neyi yapabilir, neyi yapamaz",
    "manageSettings.limit1": "Bir sayfa Chrome'un açık pencerelerini listeleyemez, kendisinin açmadığı bir pencereye sekme koyamaz — bu bir tarayıcı uzantısı ister (chrome.windows / chrome.tabs). Sekmelerin mevcut sol monitör Chrome penceresine düşmesini istiyorsanız yol uzantıdır; söyleyin, panonun konuştuğu küçük bir yardımcı uzantı olarak yapılabilir.",
    "manageSettings.limit2": "Adlandırılmış bir sekme (\"sekmeler\" modu) her zaman panoyu barındıran pencerede açılır; başka yere sürüklediğinizde sonraki tıklamalar onu orada bulup odaklar.",
    "manageSettings.limit3": "Konum ve boyutla açılan pencere ayrı bir Chrome penceresidir; başka bir monitöre yerleştirmek Pencere Yönetimi API'sini ister — güvenli bir sayfa (https veya localhost) ve tek seferlik izniniz. Onsuz Chrome onu bu ekranda açar ve yaşadığı sürece sürüklediğiniz yeri hatırlar.",
    "manageSettings.limit4": "Bu seçim panonun düzeni gibi yalnızca bu tarayıcıda saklanır.",
}
for path, keys in (('client/src/i18n/en.json', KEYS_EN), ('client/src/i18n/tr.json', KEYS_TR)):
    d = json.load(open(path, encoding='utf-8'))
    for k, v in keys.items():
        assert k not in d, (path, k)
        d[k] = v
    open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print('patched', path)

# ---- the new tests in the client suite ---------------------------------------------------
edit('client/package.json', [
("src/components/shared/agentStatusDot.test.mjs", "src/components/shared/agentStatusDot.test.mjs src/components/shared/harnessWindow.test.mjs"),
])
print('all patches applied')
