// Works out the URL the App tab / Landing should embed for the product.
//
// - Over a reverse proxy (IIS) the raw preview port isn't reachable and there's
//   no TLS on it, so we embed a same-origin path (PreviewUrl, e.g. "/preview/")
//   that the proxy forwards to the product.
// - On the LAN / direct Kestrel access there's no proxy, so we embed the product
//   directly at <host>:<previewPort>.
//
// We tell the two apart by the port in the address bar: hitting Kestrel directly
// shows its port (e.g. 5099); behind the proxy it's the default 80/443 (blank).
export function resolveProductUrl(previewPort, previewUrl) {
  const loc = window.location;
  const proxied = !loc.port || loc.port === '80' || loc.port === '443';
  if (previewUrl && proxied) {
    try {
      return new URL(previewUrl, loc.origin).href;
    } catch {
      /* malformed PreviewUrl -- fall back to the port */
    }
  }
  return `${loc.protocol}//${loc.hostname}:${previewPort}`;
}
