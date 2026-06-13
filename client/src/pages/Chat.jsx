import { useCallback, useEffect, useRef } from 'react';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import ActivitySteps from '../components/chat/ActivitySteps';
import SessionPicker from '../components/chat/SessionPicker';
import UnderstandingPanel from '../components/chat/UnderstandingPanel';
import ErrorBanner from '../components/shared/ErrorBanner';
import ClaudeViewToggle from '../components/shared/ClaudeViewToggle';
import ModelSelector from '../components/chat/ModelSelector';
import { useChat } from '../context/ChatContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import '../components/chat/chat.css';

// The chat screen. Conversation state + streaming live in ChatContext (mounted
// in Layout) so they survive navigating to other tabs. This component is the
// view: it renders the messages and owns only the scroll behavior.
export default function Chat() {
  const { t } = useT();
  const {
    messages,
    sessionId,
    draft,
    setDraft,
    attachment,
    setAttachment,
    streaming,
    error,
    pickerOpen,
    setPickerOpen,
    sessions,
    sessionsLoading,
    sessionsError,
    model,
    changeModel,
    contextTokens,
    send,
    stop,
    startNewConversation,
    resumeConversation,
    openPicker,
    chatView,
    setChatView,
    hasSelfRepo,
  } = useChat();

  const showContextMeter = useFeature('contextMeter');
  const showDualChat = useFeature('dualChat');
  const showUnderstanding = useFeature('understandingPanel');

  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 40;
  }

  // Follow new content while streaming (unless the user scrolled up to read).
  useEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  // Brief "starting" dots before the first event of a turn arrives.
  const last = messages[messages.length - 1];
  const awaitingFirst =
    streaming && last && last.role === 'assistant' && !last.text && (!last.steps || last.steps.length === 0);

  // On (re)mount -- e.g. coming back from the Files tab -- jump to the latest.
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  function handleSend(text) {
    stickToBottom.current = true;
    send(text);
  }

  return (
    <div className="chat">
      {showDualChat && (
        <div className="chat__scopes" role="tablist" aria-label={t('chat.scopesAria')}>
          <button
            type="button"
            role="tab"
            aria-selected={chatView === 'project'}
            className={`chat__scope${chatView === 'project' ? ' chat__scope--on' : ''}`}
            onClick={() => setChatView('project')}
          >
            {t('chat.tabProject')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={chatView === 'harness'}
            className={`chat__scope${chatView === 'harness' ? ' chat__scope--on' : ''}`}
            disabled={!hasSelfRepo}
            title={hasSelfRepo ? undefined : t('chat.noSelfRepo')}
            onClick={() => setChatView('harness')}
          >
            {t('chat.tabClaudeWeb')}
          </button>
        </div>
      )}
      <div className="chat__bar">
        <ClaudeViewToggle />
        <button type="button" className="chat__conversations" onClick={openPicker}>
          {t('chat.yourConversations')}
        </button>
        {showContextMeter && contextTokens > 0 && (
          <span className="chat__ctx" title={`${contextTokens.toLocaleString()} context tokens`}>
            ctx {Math.round(contextTokens / 1000)}K
          </span>
        )}
        <ModelSelector value={model} onChange={changeModel} />
        <button type="button" className="chat__new" onClick={startNewConversation}>
          {t('chat.new')}
        </button>
      </div>

      {showUnderstanding && <UnderstandingPanel />}

      <div className="chat__scroll" ref={scrollRef} onScroll={handleScroll}>
        {messages.map((m, i) => (
          <div key={i} className="turn">
            {m.role === 'assistant' && m.steps?.length > 0 && <ActivitySteps steps={m.steps} />}
            {(m.text || m.role === 'user') && <MessageBubble role={m.role} text={m.text} />}
          </div>
        ))}
        {awaitingFirst && <ThinkingIndicator />}
        {error && <ErrorBanner message={error} />}
      </div>

      <ChatInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onStop={stop}
        streaming={streaming}
        attachment={attachment}
        onAttach={setAttachment}
      />

      <SessionPicker
        open={pickerOpen}
        sessions={sessions}
        loading={sessionsLoading}
        error={sessionsError}
        activeId={sessionId}
        onSelect={resumeConversation}
        onNew={startNewConversation}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
