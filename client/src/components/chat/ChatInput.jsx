import { useEffect, useRef, useState } from 'react';
import { useDock } from '../../context/DockContext';
import { useFeature } from '../../context/UiModeContext';
import { usePrompts } from '../../context/PromptsContext';
import { useT } from '../../i18n/LanguageContext';
import PromptManager from './PromptManager';

// Controlled composer. The draft text lives in ChatContext (so it persists
// across tab navigation and can be appended to by other tabs), and is passed
// in via value/onChange. An optional attachment (image/file) can be added via
// the paperclip button; it is uploaded on send and its path appended to the
// message so Claude can Read it.
//
// Typing stays ENABLED while the agent streams — you can draft the next idea
// mid-run and either wait to send it or stash it (plans/prompt-stash.md):
// the bookmark button stores the draft on the active agent tab (backend-
// synced), and the chips above the row bring a stashed idea back into the
// composer. Tapping a chip while a draft exists swaps them, so nothing is
// ever lost.
export default function ChatInput({ value, onChange, onSend, onStop, streaming, attachment, onAttach, embedded = false }) {
  const { t } = useT();
  const { activeTabId, activeTab, addStash, removeStash } = useDock();
  // Stash is keyed to the ACTIVE dock tab, so it's meaningless (and would
  // cross-write) inside a dashboard phone for a background agent — disable it
  // there (plans/agent-dashboard.md).
  const stashEnabled = useFeature('promptStash') && !!activeTabId && !embedded;
  // Prompts (plans/custom-prompts.md): a single ⚙ button opens a modal that holds
  // BOTH the built-in prompts (understanding, kickoff — formerly their own toolbar
  // buttons) and the user's custom ones, each with a "Use" button that prefills
  // the composer. Available on the main composer AND the dashboard docks
  // (plans/dock-prompts-button.md) — the modal portals to <body>, so the small
  // dock window doesn't shrink it.
  const customPromptsEnabled = useFeature('customPrompts');
  const { prompts, addPrompt, updatePrompt, deletePrompt } = usePrompts();
  const [mgrOpen, setMgrOpen] = useState(false);
  const stash = (stashEnabled && activeTab?.stash) || [];
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const sendDisabled = streaming;

  // Auto-grow to fit the content. Runs on every value change -- including when
  // the draft is restored after navigating back, or cleared after sending.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function submit() {
    const trimmed = (value || '').trim();
    if ((!trimmed && !attachment) || sendDisabled) return;
    onSend(trimmed);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onAttach(file);
    // Reset so the same file can be re-selected.
    e.target.value = '';
  }

  function handleStash() {
    const trimmed = (value || '').trim();
    if (!trimmed || !stashEnabled) return;
    addStash(activeTabId, trimmed);
    onChange('');
  }

  // Insert a prompt's text into the composer (called from the manager modal's
  // "Use" buttons — built-in and custom alike). Appended so nothing is lost, no
  // auto-send: the user reviews and presses Enter, so it's an ordinary turn.
  function insertPrompt(promptText) {
    const current = (value || '').trim();
    onChange(current ? `${current}\n\n${promptText}` : promptText);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleChipTap(item) {
    // Swap: a non-empty draft is stashed before the chip replaces it.
    const trimmed = (value || '').trim();
    if (trimmed) addStash(activeTabId, trimmed);
    onChange(item.text);
    removeStash(activeTabId, item.id);
  }

  function handleChipRemove(e, item) {
    e.stopPropagation();
    removeStash(activeTabId, item.id);
  }

  const canSend = ((value || '').trim().length > 0 || !!attachment) && !sendDisabled;
  const canStash = stashEnabled && (value || '').trim().length > 0;

  return (
    <div className="chat-input">
      {customPromptsEnabled && mgrOpen && (
        <PromptManager
          prompts={prompts}
          onAdd={addPrompt}
          onUpdate={updatePrompt}
          onDelete={deletePrompt}
          onInsert={insertPrompt}
          onClose={() => setMgrOpen(false)}
        />
      )}
      {stash.length > 0 && (
        <div className="chat-stash" aria-label={t('chat.stashListAria')}>
          {stash.map((item) => (
            <button
              key={item.id}
              type="button"
              className="chat-stash__chip"
              title={item.text}
              onClick={() => handleChipTap(item)}
            >
              <span className="chat-stash__text">{item.text}</span>
              <span
                className="chat-stash__remove"
                role="button"
                aria-label={t('common.close')}
                onClick={(e) => handleChipRemove(e, item)}
              >
                &times;
              </span>
            </button>
          ))}
        </div>
      )}
      {attachment && (
        <div className="chat-input__preview">
          {attachment.type.startsWith('image/') ? (
            <img
              className="chat-input__thumb"
              src={URL.createObjectURL(attachment)}
              alt={attachment.name}
            />
          ) : (
            <span className="chat-input__file-name">{attachment.name}</span>
          )}
          <button
            type="button"
            className="chat-input__remove"
            onClick={() => onAttach(null)}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>
      )}
      <div className="chat-input__row">
        <button
          type="button"
          className="chat-input__attach"
          onClick={() => fileRef.current?.click()}
          disabled={streaming}
          aria-label={t('chat.attach')}
          title={t('chat.attach')}
        >
          +
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.jsx,.tsx,.py,.cs,.java,.rb,.go,.rs,.c,.cpp,.h"
          className="chat-input__file-hidden"
          onChange={handleFileChange}
        />
        {customPromptsEnabled && (
          <button
            type="button"
            className="chat-input__manage"
            onClick={() => setMgrOpen((o) => !o)}
            aria-label={t('prompts.manage')}
            title={t('prompts.manage')}
            aria-expanded={mgrOpen}
          >
            &#9881;
          </button>
        )}
        <textarea
          ref={textareaRef}
          className="chat-input__field"
          placeholder={t('chat.inputPlaceholder')}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={t('chat.inputAria')}
        />
        {stashEnabled && (
          <button
            type="button"
            className="chat-input__stash"
            onClick={handleStash}
            disabled={!canStash}
            aria-label={t('chat.stash')}
            title={t('chat.stash')}
          >
            &#9873;
          </button>
        )}
        {streaming ? (
          <button
            type="button"
            className="chat-input__send chat-input__stop"
            onClick={onStop}
            aria-label={t('chat.stopAria')}
          >
            <span className="chat-input__stop-square" aria-hidden="true" />
            {t('chat.stop')}
          </button>
        ) : (
          <button
            type="button"
            className="chat-input__send"
            onClick={submit}
            disabled={!canSend}
            aria-label={t('chat.sendAria')}
          >
            {t('chat.send')}
          </button>
        )}
      </div>
    </div>
  );
}
