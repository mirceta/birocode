import { useEffect, useState } from 'react';
import { OPEN_AGENT_EVENT } from './agentLink';
import { openToastOf } from '../../manage/openNotice';
import { showToast } from './toast';
import ToastLayer from './ToastLayer';

// What happened after "open harness", wherever it was clicked (openspec
// status-open-agent-anywhere, widened by open-agent-everywhere) — now as an OVERLAY toast
// (fleet task 6ee431ea, openspec manage-toast-overlay), never an in-flow banner: the old
// line sat between the header and the body and pushed the whole GUI down every time it
// appeared. The opener still announces every outcome on the window; this component only
// translates each announcement into the shared toast (same wording, same persistence —
// quiet outcomes fade after ~4 s, the "cannot open / did not come to the front" family
// stays until dismissed, the fresh-tab link rides along) and mounts the ToastLayer.
// Mounted ONCE per page (the first instance wins), like before.
let mounted = 0;
export default function OpenAgentNotice() {
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (mounted > 0) return undefined;
    mounted += 1; setOwner(true);
    const on = (e) => showToast(openToastOf(e.detail || {}));
    window.addEventListener(OPEN_AGENT_EVENT, on);
    return () => { window.removeEventListener(OPEN_AGENT_EVENT, on); mounted -= 1; };
  }, []);
  return owner ? <ToastLayer /> : null;
}
