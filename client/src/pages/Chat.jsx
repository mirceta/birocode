import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import ActivitySteps from '../components/chat/ActivitySteps';
import SessionPicker from '../components/chat/SessionPicker';
import UnderstandingPanel from '../components/chat/UnderstandingPanel';
import ToolCallsPanel from '../components/chat/ToolCallsPanel';
import OperatorMessagesPanel from '../components/chat/OperatorMessagesPanel';
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
//
// Long chats are slow because every turn mounts a heavy markdown bubble, and we
// almost never scroll up — so we render only the recent TAIL by default
// (plans/chat-windowing.md). Older messages stay in state; a "Show earlier"
// button reveals them in chunks. WINDOW/CHUNK are render-only caps, not data.
const WINDOW = 50;
const REVEAL_CHUNK = 50;
//
// Normally it drives the ACTIVE conversation (useChat). The Agent Dashboard's
// "wall of phones" reuses this same view for a BACKGROUND agent by passing a
// `chat` facade from useChatFor + `embedded` (drops the app-level chrome —
// Claude/Term toggle, project/harness scopes, understanding panel — that only
// makes sense for the one active conversation). See plans/agent-dashboard.md.
export default function Chat({ chat: injected, embedded = false, stashTabId }) {
  const { t } = useT();
  const active = useChat();
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
    refresh,
    chatView,
    setChatView,
    hasSelfRepo,
    liveToolCalls,
    activeRepoId,
  } = injected || active;

  const showContextMeter = useFeature('contextMeter');
  const showDualChat = useFeature('dualChat');
  const showUnderstanding = useFeature('understandingPanel');
  const showToolCalls = useFeature('toolCallHistory');
  const showOperators = useFeature('operatorMessages');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [operatorsOpen, setOperatorsOpen] = useState(false);

  // The tool-calls and operator-messages panels both overlay the chat area, so
  // only one can be open at a time — opening either closes the other.
  function toggleTools() {
    setToolsOpen((v) => !v);
    setOperatorsOpen(false);
  }
  function toggleOperators() {
    setOperatorsOpen((v) => !v);
    setToolsOpen(false);
  }

  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);

  // Only the last `visibleCount` messages are rendered; the rest stay in state.
  const [visibleCount, setVisibleCount] = useState(WINDOW);

  // Conversation refresh — only the per-agent dock facade (useChatFor) exposes
  // `refresh`; the main chat doesn't, so the button only appears on docks. It
  // re-pulls this agent's latest transcript / reattaches a live run.
  const [refreshing, setRefreshing] = useState(false);
  async function handleRefresh() {
    if (refreshing || !refresh) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }
  const total = messages.length;
  const start = Math.max(0, total - visibleCount);
  const hidden = start;

  // Pin the user's most recent prompt at the top so it stays visible no matter
  // how much the agent writes (plans/pin-last-prompt.md). Clamped, click to
  // expand. A copy — the message still renders in the transcript below.
  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && (messages[i].text || '').trim()) return messages[i].text;
    }
    return '';
  }, [messages]);
  const [pinnedExpanded, setPinnedExpanded] = useState(false);

  // Switching conversations (resume / new / dashboard agent swap) snaps the
  // window back to the tail so we never mount a huge history up front.
  useEffect(() => {
    setVisibleCount(WINDOW);
  }, [sessionId]);

  // Revealing earlier messages prepends content above the viewport; keep the
  // user's reading position by restoring distance-from-bottom after the render.
  const revealAnchor = useRef(null);
  useLayoutEffect(() => {
    if (revealAnchor.current == null) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight - revealAnchor.current;
    revealAnchor.current = null;
  }, [visibleCount]);

  function revealEarlier() {
    const el = scrollRef.current;
    if (el) revealAnchor.current = el.scrollHeight - el.scrollTop;
    setVisibleCount((n) => n + REVEAL_CHUNK);
  }

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
    setVisibleCount(WINDOW);
    send(text);
  }

  return (
    <div className={`chat${embedded ? ' chat--embedded' : ''}`}>
      {!embedded && showDualChat && (
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
          <button
            type="button"
            role="tab"
            aria-selected={chatView === 'ask'}
            className={`chat__scope${chatView === 'ask' ? ' chat__scope--on' : ''}`}
            title={t('chat.askHint')}
            onClick={() => setChatView('ask')}
          >
            {t('chat.tabAsk')}
          </button>
        </div>
      )}
      {!embedded && showDualChat && chatView === 'ask' && (
        <p className="chat__ask-note">{t('chat.askHint')}</p>
      )}
      <div className="chat__bar">
        {!embedded && <ClaudeViewToggle />}
        <button type="button" className="chat__conversations" onClick={openPicker}>
          {t('chat.yourConversations')}
        </button>
        {showContextMeter && contextTokens > 0 && (
          <span className="chat__ctx" title={`${contextTokens.toLocaleString()} context tokens`}>
            ctx {Math.round(contextTokens / 1000)}K
          </span>
        )}
        <ModelSelector value={model} onChange={changeModel} />
        {showToolCalls && (
          <button
            type="button"
            className={`chat__tools${toolsOpen ? ' chat__tools--on' : ''}`}
            onClick={toggleTools}
            title={t('chat.toolCalls')}
            aria-label={t('chat.toolCalls')}
            aria-pressed={toolsOpen}
          >
            {t('chat.toolCalls')}
          </button>
        )}
        {showOperators && (
          <button
            type="button"
            className={`chat__operators${operatorsOpen ? ' chat__operators--on' : ''}`}
            onClick={toggleOperators}
            title={t('chat.operatorMessages')}
            aria-label={t('chat.operatorMessages')}
            aria-pressed={operatorsOpen}
          >
            {t('chat.operatorMessages')}
          </button>
        )}
        {refresh && (
          <button
            type="button"
            className={`chat__refresh${refreshing ? ' is-spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title={t('chat.refresh')}
            aria-label={t('chat.refresh')}
          >
            ↻
          </button>
        )}
        <button type="button" className="chat__new" onClick={startNewConversation}>
          {t('chat.new')}
        </button>
      </div>

      {!embedded && showUnderstanding && <UnderstandingPanel />}

      {lastUserText && (
        <button
          type="button"
          className={`chat__pinned${pinnedExpanded ? ' chat__pinned--expanded' : ''}`}
          onClick={() => setPinnedExpanded((v) => !v)}
          title={pinnedExpanded ? t('chat.pinnedCollapse') : t('chat.pinnedExpand')}
          aria-expanded={pinnedExpanded}
        >
          <span className="chat__pinned-label">{t('chat.lastPrompt')}</span>
          <span className="chat__pinned-text">{lastUserText}</span>
        </button>
      )}

      <div className="chat__body">
        <div className="chat__scroll" ref={scrollRef} onScroll={handleScroll}>
          {hidden > 0 && (
            <button type="button" className="chat__earlier" onClick={revealEarlier}>
              {t('chat.showEarlier')} ({hidden})
            </button>
          )}
          {messages.slice(start).map((m, i) => {
            const key = start + i; // absolute index — stable as the window slides
            return (
              <div key={key} className="turn">
                {m.role === 'assistant' && m.steps?.length > 0 && <ActivitySteps steps={m.steps} />}
                {(m.text || m.role === 'user') && <MessageBubble role={m.role} text={m.text} />}
              </div>
            );
          })}
          {awaitingFirst && <ThinkingIndicator />}
          {error && <ErrorBanner message={error} />}
        </div>

        {/* Tool-call history overlays the chat message area (not a separate
            drawer); the same toolbar button toggles it back to the chat. Works
            for the active chat and an embedded dashboard dock alike — the data
            comes from whichever chat source drives this view. */}
        {showToolCalls && (
          <ToolCallsPanel
            open={toolsOpen}
            onClose={() => setToolsOpen(false)}
            sessionId={sessionId}
            streaming={streaming}
            liveToolCalls={liveToolCalls}
            repoId={activeRepoId}
          />
        )}

        {/* Operator messages overlay the same chat area as the tool-call drawer
            (mutually exclusive). Purely client-side over the loaded messages. */}
        {showOperators && (
          <OperatorMessagesPanel
            open={operatorsOpen}
            onClose={() => setOperatorsOpen(false)}
            messages={messages}
          />
        )}
      </div>

      <ChatInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onStop={stop}
        streaming={streaming}
        attachment={attachment}
        onAttach={setAttachment}
        embedded={embedded}
        stashTabId={stashTabId}
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
