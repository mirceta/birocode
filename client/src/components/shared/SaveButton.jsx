import { useSave } from '../history/SaveHandler';
import { useT } from '../../i18n/LanguageContext';

export default function SaveButton() {
  const { openSave, saving } = useSave();
  const { t } = useT();

  return (
    <button
      type="button"
      className="save-button"
      onClick={openSave}
      disabled={saving}
    >
      {saving ? t('save.saving') : t('save.idle')}
    </button>
  );
}
