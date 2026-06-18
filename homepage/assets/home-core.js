// Topic shell registry for the Claude Web homepage.
//
// Loads FIRST (before any topic). Creates the global `ClaudeWebHome`, the
// top-level layer ABOVE the per-topic visualizations: each topic is one
// tutorial/explainer (Local exposure, Understanding app, …) and self-registers
// here. `home.js` (loaded LAST) reads `topics`, builds the topic tab bar, and
// mounts the first topic. Keeping this tiny and dependency-free means a topic
// can register before the shell script even runs.
//
// A topic exposes:
//   { id, label, tabDesc, mount(container) -> { destroy? } | void }
// mount() owns everything inside its container; destroy() (optional) is called
// when the user switches away, so a topic can tear down timers/listeners.

(function () {
  window.ClaudeWebHome = {
    topics: [],
    register: function (topic) {
      this.topics.push(topic);
    },
    // Same el() helper the exposure variants use — create tag with class + text.
    el: function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    },
  };
})();
