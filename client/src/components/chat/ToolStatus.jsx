import { toolLabel } from './toolLabels';
import { useT } from '../../i18n/LanguageContext';

export default function ToolStatus({ name }) {
  const { t } = useT();
  return (
    <div className="tool-status" role="status">
      <span className="tool-status__spinner" aria-hidden="true" />
      <span>{toolLabel(name, t)}</span>
    </div>
  );
}
