import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiDelete } from '../api/client';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useT } from '../i18n/LanguageContext';
import './guests.css';

// IP allowlist inspection tab (plans/auth-ip-filter.md). DELIBERATELY
// ASYMMETRIC: full visibility (approved guests + last access, connection
// attempts) and the ability to UNLIST a guest — but NO approve action.
// Approving happens exclusively in the desktop GUI on the host PC; do not
// add an approve button here, the backend endpoint does not exist.

function fmt(utc) {
  if (!utc) return null;
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

// ISO-2 country code -> flag emoji (regional indicator letters).
function flag(cc) {
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// IP intelligence row (plans/ip-intel.md): flag + place, ISP/AS, rDNS, and
// the datacenter/proxy badge — the strongest "bot, not me" signal. Absent
// until the background lookup fills the cache (shows on a later load).
function GeoLine({ geo, t }) {
  if (!geo) return <span className="guest__geo guest__geo--pending">{t('guests.geoPending')}</span>;
  if (geo.local) return <span className="guest__geo guest__geo--local">{t('guests.geoLocal')}</span>;

  const place = [geo.city, geo.country].filter(Boolean).join(', ');
  const org = [geo.org, geo.asn].filter(Boolean).join(' · ');
  return (
    <span className="guest__geo">
      {geo.countryCode && <span className="guest__flag" aria-hidden="true">{flag(geo.countryCode)}</span>}
      {place && <span className="guest__place">{place}</span>}
      {org && <span className="guest__org">{org}</span>}
      {geo.hostname && <span className="guest__host">{geo.hostname}</span>}
      {geo.datacenter && <span className="guest__dc">{t('guests.geoDatacenter')}</span>}
    </span>
  );
}

export default function Guests() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await apiGet('/ipfilter'));
    } catch {
      setError(t('guests.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (guest) => {
    const self = guest.ip === data.callerIp;
    const msg = self
      ? t('guests.confirmRemoveSelf', { name: guest.name, ip: guest.ip })
      : t('guests.confirmRemove', { name: guest.name, ip: guest.ip });
    if (!window.confirm(msg)) return;

    setRemoving(guest.ip);
    try {
      await apiDelete(`/ipfilter/guests/${encodeURIComponent(guest.ip)}`);
      // Removing your own IP aborts this very connection — the reload below
      // will fail and the rejection page takes over on next navigation.
      await load();
    } catch {
      setError(t('guests.removeError'));
    } finally {
      setRemoving('');
    }
  };

  if (loading) return <Loading label={t('guests.loading')} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="guests-page">
      <section className="guests-group">
        <h3 className="guests-group__title">
          {t('guests.approvedTitle')} ({data.guests.length})
        </h3>
        <ul className="guests-list">
          {data.guests.map((g) => (
            <li key={g.ip} className="guest">
              <div className="guest__main">
                <span className="guest__name">
                  {g.name}
                  {g.ip === data.callerIp && (
                    <span className="guest__you">{t('guests.you')}</span>
                  )}
                </span>
                <span className="guest__ip">{g.ip}</span>
              </div>
              <GeoLine geo={g.geo} t={t} />
              <div className="guest__meta">
                <span className="guest__access">
                  {fmt(g.lastAccessUtc)
                    ? t('guests.lastAccess', { time: fmt(g.lastAccessUtc) })
                    : t('guests.never')}
                </span>
                <button
                  type="button"
                  className="guest__remove"
                  onClick={() => remove(g)}
                  disabled={removing === g.ip}
                >
                  {t('guests.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="guests-group">
        <h3 className="guests-group__title guests-group__title--attempts">
          {t('guests.attemptsTitle')} ({data.attempts.length})
        </h3>
        {data.attempts.length === 0 ? (
          <p className="guests-empty">{t('guests.attemptsEmpty')}</p>
        ) : (
          <ul className="guests-list">
            {data.attempts.map((a) => (
              <li key={a.ip} className="guest guest--attempt">
                <div className="guest__main">
                  <span className="guest__ip">{a.ip}</span>
                  <span className="guest__count">
                    {t(a.count === 1 ? 'guests.attemptOne' : 'guests.attemptMany', { n: a.count })}
                  </span>
                </div>
                <GeoLine geo={a.geo} t={t} />
                <div className="guest__meta">
                  <span className="guest__access">
                    {t('guests.lastAttempt', { time: fmt(a.lastUtc) || '—' })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="guests-hint">{t('guests.approveHint')}</p>
      </section>
    </div>
  );
}
