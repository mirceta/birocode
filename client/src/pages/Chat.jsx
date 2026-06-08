import { useCallback, useEffect, useRef } from 'react';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import ActivitySteps from '../components/chat/ActivitySteps';
import SessionPicker from '../components/chat/SessionPicker';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useChat } from '../context/ChatContext';
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
    streaming,
    error,
    pickerOpen,
    setPickerOpen,
    sessions,
    sessionsLoading,
    sessionsError,
    send,
    stop,
    startNewConversation,
    resumeConversation,
    openPicker,
  } = useChat();

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
      <div className="chat__bar">
        <button type="button" className="chat__conversations" onClick={openPicker}>
          {t('chat.yourConversations')}
        </button>
        <button type="button" className="chat__new" onClick={startNewConversation}>
          {t('chat.new')}
        </button>
      </div>

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
