// Topic shell: builds the top-level topic tab bar and mounts the selected
// topic's tutorial into #topic-stage. Loaded LAST, after every topic has
// self-registered into ClaudeWebHome.topics.
//
// This is the homepage's outermost layer. Each topic builds its own internal UI
// (the Local-exposure topic, for instance, builds the variant switcher + stage +
// Play/Pause/Reset it had as a standalone app). The shell only owns the topic
// tabs and the swap between topics.

(function () {
  var H = window.ClaudeWebHome;
  var tabsEl = document.getElementById('topic-tabs');
  var stageEl = document.getElementById('topic-stage');

  var active = null;    // current topic controller ({ destroy? })

  function mountTopic(topic) {
    if (active && active.destroy) active.destroy();
    stageEl.innerHTML = '';
    var host = H.el('div', 'topic');
    stageEl.appendChild(host);
    active = topic.mount(host) || {};
    Array.prototype.forEach.call(tabsEl.children, function (b) {
      var on = b.dataset.id === topic.id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function buildTabs() {
    H.topics.forEach(function (topic) {
      var b = H.el('button', 'topics__tab');
      b.dataset.id = topic.id;
      b.setAttribute('role', 'tab');
      b.innerHTML =
        '<span class="topics__label">' + topic.label + '</span>' +
        '<span class="topics__desc">' + (topic.tabDesc || '') + '</span>';
      b.addEventListener('click', function () { mountTopic(topic); });
      tabsEl.appendChild(b);
    });
  }

  if (!H.topics.length) {
    stageEl.textContent = 'No topics loaded.';
    return;
  }
  buildTabs();
  mountTopic(H.topics[0]);
})();
