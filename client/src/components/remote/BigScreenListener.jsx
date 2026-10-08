// Headless big-screen listener for the Management App bundle (openspec sofa-mode): the Management
// App has no header pill, but a Kanban shown on the projector must still take the phone's orders
// (`open-agent` hops to the studio, `open-view` switches its own tab) and heartbeat what it shows.
// Same hook as the pill; what it reports is the ?tab= of the page.
import { useBigScreen } from './useBigScreen.js';

export default function BigScreenListener() {
  let view = null;
  try { view = new URLSearchParams(window.location.search).get('tab') || 'arch'; } catch { /* no URL */ }
  useBigScreen({ view: view ? `management · ${view}` : null });
  return null;
}
