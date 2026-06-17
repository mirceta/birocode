// Dock colour-tint explainer — self-contained, no libraries, relative URLs.
// Toggles let you compare how far the agent-colour wash reaches into a dock,
// and whether it survives the "important" red-border state.

const phone = document.getElementById('phone');
const scopeName = document.getElementById('scopeName');
const scopeDesc = document.getElementById('scopeDesc');
const phoneTag = document.getElementById('phoneTag');

const SCOPES = {
  bar: {
    name: 'Header bar only',
    desc: 'What is shipped today. Only the top strip (the agent name + maximize button) ' +
          'takes the colour. Subtle — easy to miss if you expected the whole dock to change.',
  },
  chrome: {
    name: 'Bar + lanes + git',
    desc: 'Middle ground. The top "chrome" (header, Builder/Ask toggle, git row) is washed, ' +
          'but the chat transcript stays plain. More presence without colouring the reading area.',
  },
  full: {
    name: 'Whole dock',
    desc: 'What the original plan described. Every region — header, lanes, git, and the chat ' +
          'screen — gets a graded wash, so the entire dock reads as the agent colour.',
  },
};

let scope = 'bar';
let important = false;

function render() {
  phone.setAttribute('data-scope', scope);
  phone.setAttribute('data-colored', 'true');
  if (important) phone.setAttribute('data-important', 'true');
  else phone.removeAttribute('data-important');

  scopeName.textContent = SCOPES[scope].name;
  scopeDesc.textContent = SCOPES[scope].desc;
  phoneTag.textContent = important ? 'important' : 'coloured';
}

// scope segmented control
document.querySelectorAll('#scope button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#scope button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    scope = btn.dataset.scope;
    render();
  });
});

// state segmented control (coloured is always on; toggle important)
document.querySelectorAll('#state button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.state === 'important') {
      important = !important;
      btn.classList.toggle('on', important);
    } else {
      // "Coloured" is the baseline — clicking it just clears important
      important = false;
      document.querySelector('#state [data-state="important"]').classList.remove('on');
      btn.classList.add('on');
    }
    render();
  });
});

// colour swatches — drive the --agent-color variable
const COLOURS = ['#e0467c', '#f0a020', '#34c759', '#5b8cff', '#a472ff', '#22c3c3'];
const swatches = document.getElementById('swatches');
COLOURS.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'sw' + (i === 0 ? ' on' : '');
  b.style.background = c;
  b.setAttribute('aria-label', 'colour ' + c);
  b.addEventListener('click', () => {
    document.documentElement.style.setProperty('--agent-color', c);
    swatches.querySelectorAll('.sw').forEach((s) => s.classList.remove('on'));
    b.classList.add('on');
  });
  swatches.appendChild(b);
});

render();
