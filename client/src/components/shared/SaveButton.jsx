import { useSave } from '../history/SaveHandler';

// Global Save button -- always visible in the header on every screen.
//
// M7 owns the save flow: useSave() (from history/SaveHandler) opens the
// "What changed?" modal and POSTs to the backend, showing a "Saved!" /
// "Nothing to save" toast. This button just opens that flow. The button must
// be rendered inside <SaveProvider> (mounted in layout/Layout.jsx).
export default function SaveButton() {
  const { openSave, saving } = useSave();

  return (
    <button
      type="button"
      className="save-button"
      onClick={openSave}
      disabled={saving}
    >
      {saving ? 'Saving...' : 'Save'}
    </button>
  );
}
