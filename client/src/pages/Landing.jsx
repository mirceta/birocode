import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client';
import ProductFrame from '../components/app/ProductFrame';
import { resolveProductUrl } from '../components/app/productUrl';
import { useT } from '../i18n/LanguageContext';
import './landing.css';

// The public landing page: a visitor just sees the running product, fullscreen,
// with none of the builder chrome. A small "Builder" button (top-right) leads to
// the gated Claude Web harness. No login required to view this page; the preview
// port comes from the unauthenticated /api/health.
export default function Landing() {
  const { t } = useT();
  const navigate = useNavigate();
  const [port, setPort] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGet('/health')
      .then((d) => {
        if (cancelled) return;
        setPort(d?.previewPort ?? 5200);
        setPreviewUrl(d?.previewUrl ?? '');
      })
      .catch(() => {
        if (!cancelled) setPort(5200);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const url = port ? resolveProductUrl(port, previewUrl) : null;

  return (
    <div className="landing">
      <button
        type="button"
        className="landing__builder"
        onClick={() => navigate('/studio')}
        title={t('landing.builder')}
      >
        <span aria-hidden="true">⚙</span> {t('landing.builder')}
      </button>
      <ProductFrame url={url} port={port} />
    </div>
  );
}
