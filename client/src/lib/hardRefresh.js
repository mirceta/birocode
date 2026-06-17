// A *thorough* refresh that actually defeats stale caching — the recurring
// "the deploy didn't ship... oh, my browser was stale" problem. A plain
// location.reload() can re-serve a cached index.html (the harness SPA shell),
// which pins OLD hashed asset filenames, so you stay on stale code. This:
//   1. deletes every Cache Storage entry (PWA / any future service-worker cache),
//   2. unregisters any service workers so they can't replay a stale shell,
//   3. navigates to a cache-busted URL so even a cached index.html is bypassed.
// The server now also sends index.html no-store (EmbeddedApi.cs), so step 3 is
// belt-and-suspenders against an intermediate proxy (the off-box IIS+ARR).
export async function hardRefresh() {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* Cache API blocked/absent — ignore and keep going */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* no SW support — ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_fresh', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
