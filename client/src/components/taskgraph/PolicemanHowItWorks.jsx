import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { LEVELS, WHO, levelElements } from './policemanStateMachine';
import './policemanHowItWorks.css';

// The policeman's "How it works" view: the same four cytoscape pictures the Understanding app
// carried (openspec one-policeman / policeman-observes-agents) — the parts, the loop, each card,
// and where it came from — moved into the Kanban's Policeman tab so they live with the thing
// they explain. Same tools, same data: cytoscape over `policemanStateMachine.js`, the module the
// client tests validate (every endpoint known, every node reachable, no dead end but the terminal
// ones, nothing moves a card backwards, exactly one model box in the loop). Positions are laid by
// hand so the picture is stable. Click a box to light its arrows; click it again, or the
// background, to clear; a dashed stand-in box opens the level it refers to.

const LEVEL_KEYS = Object.keys(LEVELS);
const TAB_LABELS = { parts: '0 · The parts', loop: '1 · The loop', cards: '2 · Each card', before: '3 · Before: two checkers → one' };

// The Management App's palette through its CSS variables; the fallbacks are the Understanding
// app's own dark palette, so the picture reads the same in both homes.
function palette(el) {
  const cs = getComputedStyle(el);
  const v = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    bg: v('--color-bg', '#0f1117'), surface: v('--color-surface', '#171a23'), border: v('--color-border', '#2a2f3d'),
    text: v('--color-text', '#e8eaf0'), muted: v('--color-text-muted', '#9aa3b5'), accent: v('--color-accent', '#5ea0ef'),
    red: '#e5484d', amber: '#d29922', green: '#3fb950',
  };
}

function styleFor(c) {
  return [
    { selector: 'node', style: { label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 190, 'font-size': 15, 'font-weight': 700, color: c.text, 'text-valign': 'center', 'text-halign': 'center', shape: 'round-rectangle', width: 230, height: 64, 'background-color': c.surface, 'border-width': 2, 'border-color': c.border, 'text-margin-y': -8 } },
    { selector: 'node[sub]', style: { label: (n) => n.data('label') + '\n' + n.data('sub') } },
    // WHO decides, always visible: a glyph before the name.
    { selector: 'node[who][sub]', style: { label: (n) => (WHO[n.data('who')] ? WHO[n.data('who')].glyph + ' ' : '') + n.data('label') + '\n' + n.data('sub') } },
    { selector: 'node.step', style: { shape: 'rectangle', width: 270, height: 80, 'font-size': 13.5, 'text-max-width': 230 } },
    { selector: 'node.card', style: { width: 290, height: 66, 'border-style': 'dashed' } },
    // Tab 0: the parts the policeman is made of (thick boxes, inside its own box) and what sits outside it (plain boxes, no glyph).
    { selector: 'node.part', style: { shape: 'round-rectangle', 'corner-radius': '10px', width: 330, height: 96, 'border-width': 3, 'font-size': 15, 'text-max-width': 300 } },
    { selector: 'node.outside', style: { shape: 'round-rectangle', 'corner-radius': '10px', width: 300, height: 90, 'border-style': 'dotted', color: c.muted, 'text-max-width': 270, label: (n) => n.data('label') + '\n' + n.data('sub') } },
    { selector: 'node#today, node#one', style: { label: 'data(label)', padding: 44, 'border-style': 'dashed', 'border-width': 2, 'font-size': 16 } },
    { selector: 'node#one', style: { 'border-color': c.green, color: c.green } },
    { selector: 'edge.merge', style: { 'text-max-width': 240 } },
    { selector: 'node#policeman', style: { label: 'data(label)', padding: 50, 'border-style': 'solid', 'border-width': 2, 'border-color': c.accent, color: c.accent, 'font-size': 17 } },
    { selector: 'edge.part', style: { 'text-max-width': 260, width: 2.5 } },
    { selector: 'node.tone-ok', style: { 'border-color': c.green } },
    { selector: 'node.tone-warn', style: { 'border-color': c.amber, 'background-color': 'rgba(210,153,34,.10)' } },
    { selector: 'node.tone-bad', style: { 'border-color': c.red, 'background-color': 'rgba(229,72,77,.10)' } },
    { selector: 'node.group', style: { shape: 'round-rectangle', 'background-color': c.bg, 'background-opacity': 0.55, 'border-color': c.muted, 'border-width': 1.5, 'border-style': 'dashed', padding: 56, 'text-valign': 'top', 'text-halign': 'center', 'font-size': 16, color: c.muted, 'text-margin-y': -10, 'text-max-width': 900 } },
    { selector: 'node#pass', style: { 'border-color': c.accent, color: c.accent } },
    { selector: 'node#cards', style: { padding: 44 } },
    { selector: 'edge', style: { 'curve-style': 'bezier', 'control-point-step-size': 60, 'target-arrow-shape': 'triangle', 'arrow-scale': 1.4, width: 2, 'line-color': c.muted, 'target-arrow-color': c.muted, label: 'data(label)', 'font-size': 13, color: c.text, 'text-background-color': c.bg, 'text-background-opacity': 0.9, 'text-background-padding': 3, 'text-background-shape': 'round-rectangle', 'text-rotation': 'autorotate', 'text-wrap': 'wrap', 'text-max-width': 220, 'loop-direction': '-45deg', 'loop-sweep': '50deg' } },
    { selector: 'edge[curve="arc"]', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 90, 'control-point-weights': 0.5 } },
    { selector: 'edge.flow', style: { 'line-color': c.accent, 'target-arrow-color': c.accent } },
    { selector: 'edge.link', style: { 'line-style': 'dashed', 'line-color': c.accent, 'target-arrow-color': c.accent, width: 3 } },
    { selector: 'edge.card', style: { 'line-color': c.muted } },
    // Flowchart shapes (SHAPES in the data module): pill · rounded state · parallelogram · rectangle · diamond.
    { selector: 'node.shape-terminal', style: { shape: 'round-rectangle', 'corner-radius': '32px', width: 240, height: 64 } },
    { selector: 'node.shape-state', style: { shape: 'round-rectangle', 'corner-radius': '12px' } },
    { selector: 'node.shape-io', style: { shape: 'rhomboid', width: 320, height: 80, 'text-max-width': 220 } },
    { selector: 'node.shape-process', style: { shape: 'rectangle', width: 280, height: 80 } },
    { selector: 'node.shape-decision', style: { shape: 'diamond', width: 340, height: 150, 'text-max-width': 150, 'font-size': 13.5 } },
    { selector: 'node.tone-start', style: { 'background-color': c.green, 'border-color': c.green, color: '#0b1a10' } },
    { selector: 'edge.lit', style: { 'line-color': c.accent, 'target-arrow-color': c.accent, width: 4, color: c.accent, 'font-weight': 700, 'font-size': 14, 'z-index': 9 } },
    { selector: 'node.lit', style: { 'border-width': 4, 'border-color': c.accent } },
    { selector: 'node:selected, edge:selected', style: { 'overlay-opacity': 0 } },
    // WHO decides, on the edges: solid = the harness fires it · dashed = the model decides · dotted = you / the arch.
    { selector: 'edge.who-model', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6] } },
    { selector: 'edge.who-mixed', style: { 'line-style': 'dashed', 'line-dash-pattern': [10, 6, 2, 6] } },
    { selector: 'edge.who-human', style: { 'line-style': 'dotted' } },
    // "Colour by who decides" (the toggle): nodes take the who palette instead of the state tones.
    { selector: 'node.by-who.who-code', style: { 'background-color': c.surface, 'border-color': c.muted, 'border-style': 'solid', color: c.text } },
    { selector: 'node.by-who.who-model', style: { 'background-color': 'rgba(155, 89, 182, .22)', 'border-color': '#9b59b6', 'border-style': 'dashed', color: c.text } },
    { selector: 'node.by-who.who-mixed', style: { 'background-color': 'rgba(155, 89, 182, .10)', 'border-color': '#9b59b6', 'border-style': 'double', 'border-width': 4, color: c.text } },
    { selector: 'node.by-who.who-human', style: { 'background-color': 'rgba(94, 160, 239, .16)', 'border-color': c.accent, 'border-style': 'dotted', color: c.text } },
    // The stand-in for the nested level: a dashed accent box; clicking it opens that level's tab.
    { selector: 'node.shape-ref', style: { shape: 'round-rectangle', 'corner-radius': '14px', width: 320, height: 84, 'border-style': 'dashed', 'border-width': 3, 'border-color': c.accent, color: c.accent, 'background-color': c.bg, 'font-size': 16 } },
  ];
}

export default function PolicemanHowItWorks() {
  const [level, setLevel] = useState('parts');
  const [byWho, setByWho] = useState(false);
  const holders = useRef({});
  const cys = useRef({});
  const levelRef = useRef(level);
  levelRef.current = level;

  // One cytoscape instance per level, built once on mount and destroyed on unmount.
  useEffect(() => {
    const root = holders.current.parts;
    if (!root) return undefined;
    const style = styleFor(palette(root));
    for (const key of LEVEL_KEYS) {
      const container = holders.current[key];
      if (!container) continue;
      const cy = cytoscape({ container, elements: levelElements(key), layout: { name: 'preset', fit: true, padding: 40 }, wheelSensitivity: 0.2, autounselectify: true, style });
      cy.on('tap', 'node', (ev) => {
        const n = ev.target;
        if (n.data('kind') === 'ref') { setLevel(n.data('to')); return; }
        const again = n.hasClass('lit');
        cy.elements().removeClass('lit');
        if (again) return; // a second click on the same state clears it
        n.connectedEdges().addClass('lit');
        n.addClass('lit');
      });
      cy.on('tap', (ev) => { if (ev.target === cy) cy.elements().removeClass('lit'); });
      cys.current[key] = cy;
    }
    const onResize = () => { const cy = cys.current[levelRef.current]; if (cy) { cy.resize(); cy.fit(undefined, 40); } };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      for (const cy of Object.values(cys.current)) cy.destroy();
      cys.current = {};
    };
  }, []);

  // Showing a level: the container becomes visible, so the picture must be re-measured and fitted.
  useEffect(() => {
    const cy = cys.current[level];
    if (!cy) return undefined;
    const t = setTimeout(() => { cy.resize(); cy.fit(undefined, 40); }, 0);
    return () => clearTimeout(t);
  }, [level]);

  useEffect(() => {
    for (const cy of Object.values(cys.current)) cy.nodes().toggleClass('by-who', byWho);
  }, [byWho]);

  const fit = () => { const cy = cys.current[level]; if (cy) cy.animate({ fit: { eles: cy.elements(), padding: 40 }, duration: 350 }); };
  const L = LEVELS[level];

  return (
    <div className={`pw${byWho ? ' pw--by-who' : ''}`} data-policeman-how>
      <div className="pw__bar">
        <nav className="pw__tabs" role="tablist" aria-label="How the policeman works" data-policeman-how-tabs>
          {LEVEL_KEYS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={level === k} className={`pw__tab${level === k ? ' pw__tab--on' : ''}`} onClick={() => setLevel(k)} data-policeman-how-level={k}>{TAB_LABELS[k] || LEVELS[k].title}</button>
          ))}
        </nav>
        <button type="button" className="pw__btn" onClick={fit} title="Fit the picture to the view" data-policeman-how-fit>⤢ fit</button>
        <button type="button" className={`pw__btn${byWho ? ' pw__btn--on' : ''}`} onClick={() => setByWho((v) => !v)} title="Switch the node colours between the state's tone and WHO decides it" data-policeman-how-who>{byWho ? '🎨 colour: who decides' : '🎨 colour: state'}</button>
      </div>
      <p className="pw__blurb" data-policeman-how-blurb><b>{L.title}</b> — {L.blurb}.</p>
      <div className="pw__legend">
        <i className="pw__sw pw__sw-pill pw__sw-start" /> START <i className="pw__sw pw__sw-pill" /> end <i className="pw__sw pw__sw-state" /> a state it rests in <i className="pw__sw pw__sw-io" /> a step that reads <i className="pw__sw pw__sw-step" /> a step that acts <i className="pw__sw pw__sw-decision" /> a decision <i className="pw__sw pw__sw-part" /> a part it is made of <i className="pw__sw pw__sw-card" /> card state
        <span className="pw__legend-tones"><i className="pw__sw pw__sw-ok" /> good <i className="pw__sw pw__sw-warn" /> attention <i className="pw__sw pw__sw-bad" /> a human is needed</span>
        <span className="pw__legend-who"><i className="pw__sw pw__sw-who-code" /> deterministic (code) <i className="pw__sw pw__sw-who-model" /> the model's one question <i className="pw__sw pw__sw-who-mixed" /> code acts on the reading <i className="pw__sw pw__sw-who-human" /> you / the arch</span>
      </div>
      <div className="pw__legend pw__legend-edges">arrows: <i className="pw__ln" /> the harness fires it <i className="pw__ln pw__ln-dashed" /> the model's answer <i className="pw__ln pw__ln-dashdot" /> code acts on the reading <i className="pw__ln pw__ln-dotted" /> you / the arch act &nbsp;·&nbsp; on every box: ⚙️ deterministic · 🧠 the model · ⚙️🧠 both · 🧑 you / the arch</div>
      <div className="pw__stage">
        {LEVEL_KEYS.map((k) => (
          <div key={k} className={`pw__cy${level === k ? ' pw__cy--on' : ''}`} ref={(el) => { holders.current[k] = el; }} data-policeman-how-cy={k} />
        ))}
      </div>
      <p className="pw__note"><b>How to read it.</b> The policeman is <b>one loop in harness code</b> (tab 0): every minute it visits every in-flight card (tab 1) — traces its pull request, reads the facts, moves the card forward, and, only if the assignee has said something new, asks the model <b>one question</b>: which state is the agent in, and why, in one line. That answer is the card's Agent section and the only thing the model decides; flags are raised by rule, and you answer them on the card. Tab 2 is what a card can be in and what the loop does about it. Tab 3 is where this came from: two checkers — the Board check (code, hidden behind a stamp) and the policeman conversation (a model running a prompt, the only thing you could see) — folded into one. Scroll to zoom, drag to pan. Click a box to light its arrows; click it again, or the background, to clear. What is <b>deterministic</b> and what is the <b>model's</b> is marked on every box and every arrow — the glyph on the box, the line style of the arrow, and the "colour: who decides" toggle.</p>
    </div>
  );
}
