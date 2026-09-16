// The browser tab title = the machine this tab is connected to (board task c97579f3).
// The server stamps the shell with <meta name="claudeweb-host"> (the box's LAN IPv4)
// and <meta name="claudeweb-title"> (what to show); React keeps document.title equal to
// that on every render so navigation never resets it. When the metas are missing (a
// dev server serving raw index.html), fall back to GET /api/health's lanIp (no auth),
// then to the page's own hostname. Pure helpers are node-tested.

export function formatTabTitle({ lanIp, host, machineName } = {}) {
  if (lanIp && String(lanIp).trim()) return String(lanIp).trim();
  let h = String(host || '').trim();
  if (h.startsWith('[')) { const end = h.indexOf(']'); if (end > 0) h = h.slice(0, end + 1); }
  else { const colon = h.lastIndexOf(':'); if (colon > 0) h = h.slice(0, colon); }
  if (h) return h;
  return machineName && String(machineName).trim() ? String(machineName).trim() : 'Claude Web';
}

export function readShellMeta(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return {};
  const get = (n) => doc.querySelector(`meta[name="${n}"]`)?.getAttribute('content') || '';
  return { title: get('claudeweb-title'), lanIp: get('claudeweb-host'), machineName: get('claudeweb-machine') };
}

// Resolve the title once per page load: shell meta → /api/health → location.
export async function resolveTabTitle({ doc, fetchImpl, location } = {}) {
  const meta = readShellMeta(doc);
  if (meta.title) return meta.title;
  const loc = location || (typeof window !== 'undefined' ? window.location : null);
  const host = loc ? loc.host : '';
  try {
    const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (f) {
      const r = await f('/api/health', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); return formatTabTitle({ lanIp: j.lanIp, host, machineName: j.machineName }); }
    }
  } catch { /* offline or blocked: fall through */ }
  return formatTabTitle({ host });
}
