import IdeasPanel from '../components/ideas/IdeasPanel';

// The Ideas tab (plans/ideas-pinned-dashboard.md): one GLOBAL notes list,
// shared with the dashboard's pinned-left panel. All behaviour lives in the
// shared IdeasPanel component; the tab just hosts it.
export default function Ideas() {
  return <IdeasPanel />;
}
