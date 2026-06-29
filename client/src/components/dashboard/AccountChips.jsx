import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './accountChips.css';

// Dashboard account-status chips (openspec add-account-status): two compact,
// collapsible "who am I logged in as?" chips that sit BESIDE the Scoreboard on the
// same horizontal row, so they cost width — not vertical height. Each polls a
// read-only backend probe on the Scoreboard's cadence:
//   GitHub → GET /api/github-account  { ghInstalled, authenticated, account, host }
//   Claude → GET /api/claude-account  { claudeInstalled, authenticated, account, plan }
// Open/closed state is per device (localStorage), independent per chip — mirroring
// the Scoreboard's own collapse idiom.
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

// Presentational chip. `state` ∈ loading | ok | unauth | missing drives the dot
// color; `handle` is the one-line collapsed label; `rows` are the expanded detail.
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
          {rows.map((r) => (
            <span className="acct-chip__row" key={r.label}>
              <span className="acct-chip__rk">{r.label}</span>
              <span className={`acct-chip__rv${r.tone ? ` acct-chip__rv--${r.tone}` : ''}`}>{r.value}</span>
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

// Map the Claude probe payload → chip view.
function claudeView(data, t) {
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
    ],
  };
}

export default function AccountChips() {
  const { t } = useT();
  const github = useAccountProbe('/github-account');
  const claude = useAccountProbe('/claude-account');

  const gh = githubView(github, t);
  const cl = claudeView(claude, t);

  return (
    <div className="acct-strip" aria-label={t('account.title')}>
      <AccountChip
        kind="github"
        title={t('account.github.title')}
        collapseKey="claudeweb_github_account_collapsed"
        {...gh}
      />
      <AccountChip
        kind="claude"
        title={t('account.claude.title')}
        collapseKey="claudeweb_claude_account_collapsed"
        {...cl}
      />
    </div>
  );
}
