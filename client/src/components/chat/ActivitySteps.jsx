import { useEffect, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

// Renders the verbose activity trail of an assistant turn: contiguous thinking
// blocks and tool calls (name + input summary + status + elapsed + expandable
// input/output). Thinking is shown dimmed/collapsible -- never in the answer
// bubble itself.

// Live seconds counter shown on a still-running tool, so a long step never looks
// like the app has hung.
function Elapsed({ startedAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.round((now - startedAt) / 1000));
  return <span className="step__elapsed">{s}s</span>;
}

function ToolHead({ step }) {
  const mark =
    step.status === 'running' ? (
      <span className="step__spinner" aria-hidden="true" />
    ) : step.status === 'error' ? (
      <span className="step__icon step__icon--error">✗</span>
    ) : (
      <span className="step__icon step__icon--done">✓</span>
    );
  return (
    <>
      {mark}
      <span className="step__name">{step.name}</span>
      {step.summary && <code className="step__summary">{step.summary}</code>}
      {step.status === 'running' && step.startedAt && <Elapsed startedAt={step.startedAt} />}
    </>
  );
}

function ToolStep({ step }) {
  const { t } = useT();
  const hasBody = step.detail || step.preview;

  if (!hasBody) {
    return (
      <div className="step step--tool">
        <ToolHead step={step} />
      </div>
    );
  }
  return (
    <details className="step step--tool">
      <summary>
        <ToolHead step={step} />
      </summary>
      {step.detail && (
        <>
          <div className="step__label">{t('chat.inputLabel')}</div>
          <pre className="step__pre">{step.detail}</pre>
        </>
      )}
      {step.preview && (
        <>
          <div className="step__label">{t('chat.outputLabel')}</div>
          <pre className="step__pre">{step.preview}</pre>
        </>
      )}
    </details>
  );
}

function ThinkingStep({ text }) {
  const { t } = useT();
  return (
    <details className="step step--thinking" open>
      <summary>
        <span className="step__think-icon" aria-hidden="true">💭</span>
        {t('chat.thinking')}
      </summary>
      <div className="step__think">{text}</div>
    </details>
  );
}

export default function ActivitySteps({ steps }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div className="steps">
      {steps.map((s, i) =>
        s.kind === 'thinking' ? (
          <ThinkingStep key={i} text={s.text} />
        ) : (
          <ToolStep key={s.id || i} step={s} />
        ),
      )}
    </div>
  );
}
