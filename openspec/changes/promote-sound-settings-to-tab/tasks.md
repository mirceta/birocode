## 1. Add the Sounds tab shell

- [x] 1.1 Add a `#tab-sounds` button (`role="tab"`, `data-tab="sounds"`, `aria-controls="panel-sounds"`) to the `.tabbar`, after the GitHub tab
- [x] 1.2 Add an empty `#panel-sounds .tabpanel[data-tab="sounds"]` (`role="tabpanel"`, `aria-labelledby="tab-sounds"`) after the GitHub panel
- [x] 1.3 Extend the tab-visibility CSS: add `body[data-tab="sounds"] .tabpanel[data-tab="sounds"]{display:block}` to the existing rule set (display mode already force-shows all panels via `body.display .tabpanel`)
- [x] 1.4 Confirm the existing `?tab=`/`localStorage` resolver selects `sounds` with no special-casing (it routes any `data-tab` value generically)

## 2. Relocate the controls into the tab (no behaviour change)

- [x] 2.1 Move the Device toggle button `#snd` out of `<header>` into a *Device sound* section in `#panel-sounds`, with a one-line explainer
- [x] 2.2 Inline the `.sndpanel` modal's inner `.sndcard` content (per-type Choose/Replace/Test/Clear grid for `turn.start`, `turn.ended`, `_default`) as a *Custom event sounds* section in `#panel-sounds`, keeping every slot/control element ID intact
- [x] 2.3 Move the Host controls `#hsnd`, `#hmode`, `#htest` into a *Host cue* section in `#panel-sounds`
- [x] 2.4 Retire the modal: remove the `#sndcfg` opener button and the floating `.sndpanel`/`#sndClose` overlay + its open/close handlers; drop the overlay-only CSS (fixed position, backdrop, max-height scroll) and re-home `.sndcard` under plain in-page section styling
- [x] 2.5 Leave a clearly-marked empty section/placeholder in the tab where the future event→sound rules UI will live (no functionality — just headroom)

## 3. Wire-check (keep IDs → keep logic)

- [x] 3.1 Verify every retained handler still binds (`#snd` toggle → `renderSnd()`/`soundOn`, per-type assign/test/clear → IndexedDB + `playCue`, `#hsnd`/`#hmode`/`#htest` → host cue handlers) with no reference to a now-removed element throwing at load
- [x] 3.2 Confirm `unlockAudio()`, the user-gesture unlock, and the enable-confirmation blip still fire from within the tab

## 4. Understanding-app companion

- [x] 4.1 Rewrite `understanding-app/index.html` (rolling latest, relative URLs, build-less/self-contained) to explain the new Sounds tab: what moved, the tab mechanics (`?tab=sounds`, persistence, display mode), and that event→sound rules are a deliberate next step

## 5. Verify

- [x] 5.1 Headless: the Sounds tab appears in the tabbar and no loose sound buttons remain in the header
- [x] 5.2 Headless: `?tab=sounds` opens the tab; select it, reload, it re-opens (localStorage persistence)
- [x] 5.3 Headless: within the tab, the Device toggle flips state, a per-type file assign persists across reload and Clear reverts, and the host Test button is present/clickable
- [x] 5.4 Headless: display mode renders the sound section alongside the other panels
- [x] 5.5 No audio files added; app still build-less/self-contained with relative URLs only
- [x] 5.6 `openspec validate promote-sound-settings-to-tab --strict` passes

## 6. Out of scope (tracked, not done here)

- [ ] 6.1 Event→sound **rules/mapping** UI (which event `type` triggers which sound) — the operator's explicit next order of business, a separate change
