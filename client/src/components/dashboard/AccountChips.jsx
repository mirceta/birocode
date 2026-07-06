import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import { useFeature } from '../../context/UiModeContext';
import GitHubTokenControl from './GitHubTokenControl';
import './accountChips.css';

// Dashboard account-status chips (openspec add-account-status): two compact,
// collapsible "who am I logged in as?" chips that sit BESIDE the Scoreboard on the
// same horizontal row, so they cost width — not vertical height. Each polls a
// read-only backend probe on the Scoreboard's cadence:
//   GitHub → GET /api/github-account  { ghInstalled, authenticated, account, host }
//   Claude → GET /api/claude-account  { claudeInstalled, authenticated, account, plan }
// Open/closed state is per device (localStorage), independent per chip — mirroring
// the Scoreboard's own collapse idiom.
//
// The Claude chip additionally polls GET /api/claude-usage (openspec
// add-claude-usage) and renders plan-usage meters (5h window / weekly quota /
// per-model weekly) in its EXPANDED body, below the identity rows. Usage is
// strictly additive: any usage failure renders a muted "unavailable" line and
// must never disturb the identity rows or the collapsed chip.
const POLL_MS = 5000;

function readCollapsed(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

// Live, self-refreshing probe. Keeps the last good value on a failed tick so a
// transient error never blanks the chip (same policy as the Scoreboard poll).
function useAccountProbe(endpoint) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await apiGet(endpoint);
        if (alive) setData(d);
      } catch {
        /* keep the last good snapshot; try again next tick */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [endpoint]);
  return data;
}

// A usage meter row's value cell: small percent bar + "54% · resets 15:50".
// `tone` (warn) tints the bar when the backend reports severity ≠ normal.
function UsageMeter({ percent, text, tone }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span className={`acct-chip__meter${tone ? ` acct-chip__meter--${tone}` : ''}`}>
      <span className="acct-chip__bar" aria-hidden="true">
        <span className="acct-chip__bar-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="acct-chip__meter-txt">{text}</span>
    </span>
  );
}

// Presentational chip. `state` ∈ loading | ok | unauth | missing drives the dot
// color; `handle` is the one-line collapsed label; `rows` are the expanded detail.
// A row with `meter` renders a UsageMeter as its value; `muted` greys the row.
function AccountChip({ kind, title, state, handle, rows, collapseKey }) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(collapseKey));

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(collapseKey, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }

  return (
    <button
      type="button"
      className={`acct-chip acct-chip--${kind}${collapsed ? ' acct-chip--collapsed' : ''}`}
      onClick={toggle}
      aria-expanded={!collapsed}
      title={title}
    >
      <span className="acct-chip__hd">
        <span className="acct-chip__kind">{title}</span>
        <span className={`acct-chip__dot acct-chip__dot--${state}`} aria-hidden="true" />
        <span className="acct-chip__handle">{handle}</span>
        <span className="acct-chip__chevron" aria-hidden="true">⌄</span>
      </span>
      {!collapsed && rows.length > 0 && (
        <span className="acct-chip__body">
          {rows.map((r, i) => (
            <span className="acct-chip__row" key={`${i}:${r.label}`}>
              <span className={`acct-chip__rk${r.muted ? ' acct-chip__rk--muted' : ''}`}>{r.label}</span>
              {r.meter ? (
                <UsageMeter {...r.meter} />
              ) : (
                <span
                  className={`acct-chip__rv${r.tone ? ` acct-chip__rv--${r.tone}` : ''}${r.muted ? ' acct-chip__rv--muted' : ''}`}
                >
                  {r.value}
                </span>
              )}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

// Map the GitHub probe payload → chip view (state + collapsed handle + detail rows).
function githubView(data, t) {
  if (!data) return { state: 'loading', handle: t('account.checking'), rows: [] };
  const yes = { value: t('account.yes'), tone: 'yes' };
  const no = { value: t('account.no'), tone: 'no' };
  if (!data.ghInstalled) {
    return {
      state: 'missing',
      handle: t('account.github.missing'),
      rows: [{ label: t('account.installed'), ...no }],
    };
  }
  if (!data.authenticated) {
    return {
      state: 'unauth',
      handle: t('account.notAuthed'),
      rows: [
        { label: t('account.installed'), ...yes },
        { label: t('account.authed'), ...no },
      ],
    };
  }
  return {
    state: 'ok',
    handle: `@${data.account}`,
    rows: [
      { label: t('account.installed'), ...yes },
      { label: t('account.authed'), ...yes },
      { label: t('account.account'), value: data.account },
      { label: t('account.host'), value: data.host || '—' },
    ],
  };
}

// "resets 15:50" for a same-day reset, "resets Tue 15:50" further out; null when
// the upstream timestamp is missing/unparseable (the row then shows percent only).
function formatReset(resetsAt, t) {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const sameDay = Date.now() + 24 * 60 * 60 * 1000 > d.getTime();
  const when = sameDay ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return t('account.usage.resets', { time: when });
}

// One usage entry → a meter row. Severity ≠ normal tints the row (amber).
function usageRow(label, entry, t) {
  if (!entry || typeof entry.percent !== 'number') return null;
  const reset = formatReset(entry.resetsAt, t);
  const text = `${Math.round(entry.percent)}%${reset ? ` · ${reset}` : ''}`;
  const tone = entry.severity && entry.severity !== 'normal' ? 'warn' : null;
  return { label, meter: { percent: entry.percent, text, tone } };
}

// Map GET /api/claude-usage → extra rows for the expanded chip. Strictly
// additive and fail-soft: unavailable (or still loading after an error) becomes
// one muted line; identity rows are built elsewhere and never touched here.
function usageRows(usage, t) {
  if (!usage) return []; // first poll still in flight — show nothing yet
  if (!usage.available) {
    return [{ label: t('account.usage.label'), value: t('account.usage.unavailable'), muted: true }];
  }
  const rows = [
    usageRow(t('account.usage.session'), usage.session, t),
    usageRow(t('account.usage.weekly'), usage.weekly, t),
    ...(usage.scopedWeekly || []).map((s) => usageRow(s.label || t('account.usage.model'), s, t)),
  ].filter(Boolean);
  if (usage.stale) {
    rows.push({ label: t('account.usage.label'), value: t('account.usage.stale'), muted: true });
  }
  return rows;
}

// Map the Claude probe payload (+ usage probe) → chip view. Usage rows are
// appended only in the authenticated view: without a session there is no quota
// to meter, and the unauth/missing states keep their exact previous shape.
function claudeView(data, usage, t) {
  if (!data) return { state: 'loading', handle: t('account.checking'), rows: [] };
  const yes = { value: t('account.yes'), tone: 'yes' };
  const no = { value: t('account.no'), tone: 'no' };
  if (!data.claudeInstalled) {
    return {
      state: 'missing',
      handle: t('account.claude.missing'),
      rows: [{ label: t('account.installed'), ...no }],
    };
  }
  if (!data.authenticated) {
    return {
      state: 'unauth',
      handle: t('account.notAuthed'),
      rows: [
        { label: t('account.installed'), ...yes },
        { label: t('account.loggedIn'), ...no },
      ],
    };
  }
  const handle = data.plan ? `${data.account} · ${data.plan}` : data.account;
  return {
    state: 'ok',
    handle,
    rows: [
      { label: t('account.installed'), ...yes },
      { label: t('account.loggedIn'), ...yes },
      { label: t('account.account'), value: data.account || '—' },
      { label: t('account.plan'), value: data.plan || '—' },
      ...usageRows(usage, t),
    ],
  };
}

export default function AccountChips() {
  const { t } = useT();
  const github = useAccountProbe('/github-account');
  const claude = useAccountProbe('/claude-account');
  const usage = useAccountProbe('/claude-usage'); // backend caches for minutes; polling stays cheap
  const tokenControlOn = useFeature('githubTokenControl');

  const gh = githubView(github, t);
  const cl = claudeView(claude, usage, t);

  return (
    <div className="acct-strip" aria-label={t('account.title')}>
      <div className="acct-col">
        <AccountChip
          kind="github"
          title={t('account.github.title')}
          collapseKey="claudeweb_github_account_collapsed"
          {...gh}
        />
        {tokenControlOn && <GitHubTokenControl />}
      </div>
      <AccountChip
        kind="claude"
        title={t('account.claude.title')}
        collapseKey="claudeweb_claude_account_collapsed"
        {...cl}
      />
    </div>
  );
}
