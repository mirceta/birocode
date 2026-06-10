<!-- managed by Claude Web -- re-run "Prepare for preview" to update -->

# Test in a real headless browser, not just with curl

`curl` is the wrong lens for proxy traps 1, 2, 3 and 5 (see proxy.md) -- they
all involve **what the browser does after the page loads**: which assets it
asks for, which fetch URLs it constructs, whether `setState` from a click
sticks after the next poll. curl tells you the server responds correctly,
not whether the user sees a working product. After many "should be fixed"
rounds that weren't, the rule is: **before claiming a UI/proxy fix works,
drive a headless browser through the user flow and screenshot it.**

Set up Playwright in the product repo (gitignored sandbox dir):

```bash
mkdir -p .preview-test && cd .preview-test
npm init -y >/dev/null
npm install playwright --no-save
npx playwright install chromium
```

Add `.preview-test/` to `.gitignore`. Then write a minimal driver that
loads the product through the **public** URL (not `localhost`, otherwise
you skip the proxy entirely and miss trap 5), clicks through the user
flow, and checks DOM state at multiple times after each action. Save the
URL to test as an env var so the same script works from anywhere:

```js
// .preview-test/play.mjs -- run with: PUBLIC_URL=http://<your-host>/preview/ node play.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'

const URL = process.env.PUBLIC_URL || 'http://localhost:5200/preview/'
const OUT = '.preview-test/out'; mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()
const requests = []
page.on('response', r => requests.push({
  method: r.request().method(),
  url: r.url(),
  status: r.status(),
  ctype: r.headers()['content-type'],
}))
page.on('console', m => console.log('[browser]', m.type(), m.text()))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${OUT}/01-loaded.png` })

// ... click buttons, wait, check DOM state ...
// e.g. for a value that should stick after a click:
//   await page.getByRole('button', { name: 'Medium' }).click()
//   await page.waitForTimeout(50)
//   console.log('+50ms:', await page.$eval('.diff-btn.active', el => el.textContent))
//   await page.waitForTimeout(2500)
//   console.log('+2.5s:', await page.$eval('.diff-btn.active', el => el.textContent))
// If +50ms and +2.5s diverge, you have trap 5 (ARR cache).

await browser.close()
writeFileSync(`${OUT}/requests.json`, JSON.stringify(requests, null, 2))
```

Run it after every change that touches build config, proxy behaviour, or
fetch logic. Compare `out/requests.json` -- if you see GETs to bundle
hashes that aren't in `dist/`, traps 1-3 are still leaking; if you see
401s on `/api/*`, trap 2 is leaking; if a button click's effect reverts
2s later in the screenshots, trap 5 is leaking.

Common "it works in curl but the screenshot is broken" scenarios:

- **The bundle hash in the served HTML is fresh, but the screenshot is
  blank.** Usually the browser fetched an *old* bundle hash referenced by
  a CACHED `index.html` -- add `Cache-Control: no-store` on `index.html`
  and the SPA-fallback handler must `404` for missing `/assets/*` (not
  return HTML) so the failure is visible.
- **Single curl works, but rapid POST/GET cycles in the browser show
  stale state.** Trap 5 (cache). Cache-bust GETs.
- **Headless browser shows correct first render, then snaps back.** Either
  trap 5 (cache returns stale on poll) or a real race condition. Test by
  pausing polling temporarily; if the bug disappears, it's a poll
  interfering -- but the cause is almost certainly the proxy cache (which
  makes polls return stale data), not the polls themselves.
