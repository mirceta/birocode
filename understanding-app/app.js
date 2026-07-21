/* promote-sound-settings-to-tab — interactive explainer.
   Vanilla JS, no dependencies, relative URLs only. */
(function () {
  "use strict";

  // The before/after toggle: flip the faux header between the old five loose
  // buttons and the new grouped Sounds tab. Pure class toggle; CSS animates it.
  var stage = document.getElementById("stage");
  var tgl = document.getElementById("promote");
  if (stage && tgl) {
    function apply(after) {
      stage.classList.toggle("after", after);
      tgl.setAttribute("aria-pressed", String(after));
      tgl.textContent = after ? "↺ Show the old header" : "▶ Promote to a Sounds tab";
    }
    tgl.addEventListener("click", function () {
      apply(!stage.classList.contains("after"));
    });
    apply(false);
  }
})();
