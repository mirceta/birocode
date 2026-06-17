// Prose content for the non-interactive views. The Simulator view is built in app.js.
window.UNDERSTANDING_DATA = {
  views: [
    {
      id: "how",
      label: "How it works",
      cards: [
        {
          h: "The one-at-a-time problem",
          steps: [
            "An agent runs a single prompt at a time. While it's busy, a normal send is refused by the run gate — <span class=\"kbd\">HTTP 409 · chat.busyError</span>.",
            "The queue lets you <b>stack up the next prompts while it's busy</b>, so the thought isn't lost."
          ]
        },
        {
          h: "You approve every send",
          steps: [
            "<b>Enqueue</b> — type a prompt and tap the bookmark (⚐); it joins the queue (allowed even while the agent is busy).",
            "<b>Approve</b> — nothing runs on its own. When the agent is free, tap <b>Send</b> on a queued chip to send it; Send is disabled while the agent is busy.",
            "<b>Edit first</b> — tapping a chip's body loads it back into the composer to tweak before sending (your in-progress draft is swapped in, never lost).",
            "<b>Delete</b> — tap <b>×</b> on any chip to drop it without sending.",
            "Open the <b>Simulator</b> tab to try it."
          ]
        }
      ]
    },
    {
      id: "surfaces",
      label: "Two surfaces",
      cards: [
        {
          h: "Main chat & every agent tab",
          steps: [
            "<b>Agent tab active</b> → the queue attaches to that <span class=\"kbd\">DockTab</span> and rides dock-sync, so a queue built on the phone shows on the desktop for that agent.",
            "<b>Plain main chat (no agent tab)</b> → there's no tab to attach to, so it uses a <b>tab-independent global queue</b>.",
            "These are <b>separate queues</b> — a per-agent queue isn't the main chat's queue. Each surface keeps its own list.",
            "<b>Not</b> the dashboard phones: the queue is disabled inside an embedded dock, where it would cross-write a background agent."
          ]
        },
        {
          h: "Durable by construction",
          steps: [
            "<b>Per-agent</b> queue persists in <span class=\"kbd\">%APPDATA%\\ClaudeWeb\\dock.json</span> — the same store as <span class=\"kbd\">repositories.json</span>.",
            "<b>Global</b> queue persists in <span class=\"kbd\">%APPDATA%\\ClaudeWeb\\dock-stash.json</span>, same pattern.",
            "Both are written on every change and reloaded at startup, so the queue <b>survives refresh and redeploy</b>."
          ]
        }
      ]
    },
    {
      id: "fit",
      label: "How it fits the code",
      cards: [
        {
          h: "Grounded in the chat layer",
          steps: [
            "<b>Send &amp; busy:</b> <span class=\"kbd\">ChatContext.sendTo(text)</span> sends a prompt and flips the tab to <span class=\"kbd\">status: running</span>; a send during a run 409s.",
            "<b>Approve = send:</b> the chip's Send button calls <span class=\"kbd\">onSend(item.text)</span>, enabled only when idle, then drops the item. Any in-progress draft is preserved (sending clears the composer). The harness never sends a queued prompt by itself.",
            "<b>Storage (merged with stash):</b> per-tab via <span class=\"kbd\">POST/DELETE /api/dock/{id}/stash</span>; the main chat via new <span class=\"kbd\">GET/POST/DELETE /api/dock/stash</span> in <span class=\"kbd\">DockRegistry</span>. A falsy <span class=\"kbd\">tabId</span> in <span class=\"kbd\">addStash/removeStash</span> routes to the global queue.",
            "<b>UI:</b> <span class=\"kbd\">ChatInput.jsx</span> chips gained a Send button; <span class=\"kbd\">stashEnabled</span> no longer requires an active tab (only <span class=\"kbd\">!embedded</span>)."
          ]
        }
      ]
    },
    {
      id: "shipped",
      label: "What shipped",
      cards: [
        {
          h: "Decisions, resolved",
          steps: [
            "<b>Merged with prompt-stash</b> — the stash list <i>is</i> the queue. A chip now has Send (approve) + × (delete) + tap-to-edit, instead of a separate queue feature.",
            "<b>Both surfaces</b> — main chat (global queue) and every agent tab (per-tab queue).",
            "<b>Persistent</b> — durable across refresh and redeploy via dock.json / dock-stash.json."
          ]
        },
        {
          h: "Still open",
          steps: [
            "Browser verification on the running harness.",
            "Smaller follow-ups: reorder before sending, a queue-length cap, confirm-clear."
          ]
        }
      ]
    }
  ]
};
