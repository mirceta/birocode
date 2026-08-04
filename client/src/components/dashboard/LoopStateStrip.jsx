import { Fragment } from 'react';
import { useT } from '../../i18n/LanguageContext';
import { SM, PHASE_KEY } from './loopMachines';

// Live current-state strip (openspec: loop-state-param-panel, 3.2): a phased
// loop's machine as connected chips in the armed popover header, the current
// `phase` lit. A terminal instance lights its matching outcome pill (status +
// stopReason) instead of any live chip; a terminal with no machine outcome
// (cap, user stop, needs-human) renders nothing — the status word already
// covers those. An unknown phase value renders as its raw string, never blank.
export default function LoopStateStrip({ loop }) {
  const { t } = useT();
  const machine = loop ? SM[loop.kind] : null;
  if (!machine) return null;

  const active = !!loop.active;
  const terminal = active ? null
    : machine.terminals.find((x) => x.status === loop.status && x.stopReason === loop.stopReason);
  if (!active && !terminal) return null;

  const phase = loop.phase || 'work';
  const unknownPhase = active && !machine.strip.includes(phase);

  return (
    <span className="phone__loop-smstrip">
      {machine.strip.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && <span className="phone__loop-smstrip-arr">→</span>}
          <span className={`phone__loop-smstrip-chip${active && phase === s ? ' phone__loop-smstrip-chip--on' : ''}`}>
            {t(PHASE_KEY[s])}
          </span>
        </Fragment>
      ))}
      {unknownPhase && (
        <>
          <span className="phone__loop-smstrip-arr">→</span>
          <span className="phone__loop-smstrip-chip phone__loop-smstrip-chip--on">{phase}</span>
        </>
      )}
      {terminal && (
        <>
          <span className="phone__loop-smstrip-arr">→</span>
          <span className={`phone__loop-smstrip-chip phone__loop-smstrip-chip--${terminal.cls}`}>
            {t(terminal.labelKey)}
          </span>
        </>
      )}
    </span>
  );
}
