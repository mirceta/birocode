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
            "Queued prompts let you <b>stack up the next prompts while it's busy</b>, so the thought isn't lost."
          ]
        },
        {
          h: "You approve every send",
          steps: [
            "<b>Enqueue</b> — type a prompt while the agent is busy; it joins that agent's queue.",
            "<b>Approve</b> — nothing runs on its own. When the agent is free, you <b>tap a queued prompt to send it</b>.",
            "<b>Delete</b> — tap <b>×</b> on any item to drop it without sending.",
            "Open the <b>Simulator</b> tab to try it."
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
            "<b>Send &amp; busy:</b> <span class=\"kbd\">ChatContext.sendTo(text, {key, repoId, tabId, lane})</span> sends a prompt and flips the tab to <span class=\"kbd\">status: running</span>; a send during a run 409s.",
            "<b>Approve = send:</b> tapping a queued item calls <span class=\"kbd\">sendTo</span> with its text, enabled only when the agent is idle. The harness never sends a queued prompt by itself.",
            "<b>Storage:</b> mirror <b>prompt-stash</b> — a Queue list on the <span class=\"kbd\">DockTab</span> in <span class=\"kbd\">dock.json</span> with <span class=\"kbd\">POST/DELETE /dock/{id}/queue</span>, riding the existing dock sync so a queue built on the phone shows on the desktop.",
            "<b>Surfaces:</b> the main Chat tab and the dashboard docks, like stash."
          ]
        }
      ]
    },
    {
      id: "open",
      label: "Open question",
      cards: [
        {
          h: "One decision left",
          steps: [
            "<b>Relation to prompt-stash</b> — both are per-agent, backend-synced prompt lists. Keep the queue separate from stash, or merge them (a stash chip gains an approve/send action)?",
            "Smaller follow-ups: reorder before sending, a queue-length cap, confirm-clear."
          ]
        }
      ]
    }
  ]
};
