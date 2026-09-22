import io

def read(p): return io.open(p, encoding='utf-8').read()
def write(p, s): io.open(p, 'w', encoding='utf-8', newline=chr(10)).write(s); print('patched', p)
def rep(s, old, new, p=''):
    assert s.count(old) == 1, (p, old[:80], s.count(old))
    return s.replace(old, new)

# ---- ArchController: tool calls folded onto messages; History limited to the recent N ------
p = 'ClaudeWeb.App/Controllers/ArchController.cs'; s = read(p)
s = rep(s, '''        var messages = _sessions.GetMessages(_arch.HomePath, sid);
        var annotated = MessageActors.Annotate(messages, _audit.Recent(5000), key, ArchAgentService.ActorHuman);
        var (items, total) = TranscriptWindow.Tail(annotated, tail);
        return Ok(new { sessionId = sid, messages = items, total });''',
'''        var messages = _sessions.GetMessages(_arch.HomePath, sid);
        var annotated = MessageActors.Annotate(messages, _audit.Recent(5000), key, ArchAgentService.ActorHuman);
        // The tool calls of every finished turn ride with the assistant message that answered it
        // (openspec arch-chat-tool-calls-history) — the live steps used to vanish at reload.
        var withCalls = ArchTranscriptViews.AttachToolCalls(annotated, _sessions.GetToolCallHistory(_arch.HomePath, sid));
        var (items, total) = TranscriptWindow.Tail(withCalls, tail);
        return Ok(new { sessionId = sid, messages = items, total });''', p)
s = rep(s, '''    [HttpGet("tool-calls")]
    public IActionResult ToolCalls([FromQuery] string? sessionId = null, [FromQuery] string? conv = null)
    {
        _logger.CountRequest();
        if (UnknownConversation(conv, out var key) is { } missing) return missing;
        var sid = string.IsNullOrWhiteSpace(sessionId) ? _arch.ResolveArchSessionId(key) : sessionId;
        if (sid is null) return Ok(new { sessionId = (string?)null, calls = Array.Empty<object>(), turns = Array.Empty<object>() });
        var records = _sessions.GetToolCallHistory(_arch.HomePath, sid);
''',
'''    /// <summary><c>limit</c> (openspec arch-chat-tool-calls-history): the most recent N calls —
    /// the default <see cref="ArchTranscriptViews.DefaultHistoryLimit"/> keeps a long conversation
    /// from freezing the lane; <c>0</c> (or the lane's "load all") is the whole history. The
    /// reply carries <c>total</c> and <c>truncated</c> so the lane can say what it left out.</summary>
    [HttpGet("tool-calls")]
    public IActionResult ToolCalls([FromQuery] string? sessionId = null, [FromQuery] string? conv = null, [FromQuery] int? limit = null)
    {
        _logger.CountRequest();
        if (UnknownConversation(conv, out var key) is { } missing) return missing;
        var sid = string.IsNullOrWhiteSpace(sessionId) ? _arch.ResolveArchSessionId(key) : sessionId;
        if (sid is null) return Ok(new { sessionId = (string?)null, calls = Array.Empty<object>(), turns = Array.Empty<object>(), total = 0, truncated = false, limit = limit ?? ArchTranscriptViews.DefaultHistoryLimit });
        var (records, totalCalls, truncated) = ArchTranscriptViews.LimitRecent(_sessions.GetToolCallHistory(_arch.HomePath, sid), limit ?? ArchTranscriptViews.DefaultHistoryLimit);
''', p)
s = rep(s, '''        return Ok(new { sessionId = sid, calls, turns });
    }

    public sealed record SendRequest(string? Text);''',
'''        return Ok(new { sessionId = sid, calls, turns, total = totalCalls, truncated, limit = limit ?? ArchTranscriptViews.DefaultHistoryLimit });
    }

    public sealed record SendRequest(string? Text);''', p)
write(p, s)

# ---- turnSteps.js: persisted tool calls in the live step shape ---------------------------------
p = 'client/src/components/chat/turnSteps.js'; s = read(p)
s += '''
/** Persisted tool calls (the transcript endpoint's `toolCalls` on an assistant message, openspec
 * arch-chat-tool-calls-history) as steps in the live shape, so a finished turn renders exactly
 * like it did while running: done / error, the input as detail, the result as preview. */
export function stepsFromToolCalls(calls) {
  return (calls || []).map((c) => ({
    kind: 'tool', id: c.id, name: c.name || c.tool || 'tool',
    status: c.status === 'error' || c.ok === false ? 'error' : 'done', ok: c.ok !== false,
    summary: c.summary || '', detail: c.detail || '', preview: c.preview || '',
    startedAt: c.startedAt || null, durationMs: c.durationMs ?? null, persisted: true,
  }));
}
'''
write(p, s)

# ---- Arch.jsx: render the persisted steps under every assistant message -------------------------
p = 'client/src/pages/Arch.jsx'; s = read(p)
s = rep(s, "import { TRANSCRIPT_WINDOW, tailFor, widened, windowOf } from '../components/chat/transcriptWindow';",
          "import { TRANSCRIPT_WINDOW, tailFor, widened, windowOf } from '../components/chat/transcriptWindow';\nimport { stepsFromToolCalls } from '../components/chat/turnSteps';", p)
s = rep(s, '''          {visible.map((m, i) => (
            <div key={hidden + i} className="turn">
              <MessageBubble role={m.role} text={m.text} actor={m.actor} />
            </div>
          ))}''',
'''          {visible.map((m, i) => (
            <div key={hidden + i} className="turn" data-arch-tool-calls={m.toolCalls?.length || 0}>
              {/* A finished turn keeps its tool calls (openspec arch-chat-tool-calls-history): the
                  transcript carries them on the assistant message, rendered like the live steps. */}
              {m.role === 'assistant' && m.toolCalls?.length > 0 && <ActivitySteps steps={stepsFromToolCalls(m.toolCalls)} />}
              <MessageBubble role={m.role} text={m.text} actor={m.actor} />
            </div>
          ))}''', p)
write(p, s)

# ---- ArchHistoryPanel: the recent-N window with load more / load all --------------------------
p = 'client/src/components/arch/ArchHistoryPanel.jsx'; s = read(p)
s = rep(s, '''const POLL_MS = 3000;
const ARCH_PREFIX = 'mcp__arch__';''',
'''const POLL_MS = 3000;
const ARCH_PREFIX = 'mcp__arch__';
// The lane loads the most recent DEFAULT_LIMIT calls (openspec arch-chat-tool-calls-history);
// "load more" widens by LOAD_MORE_STEP, "load all" asks for everything (limit 0). The filters
// below apply to whatever is loaded, exactly as before.
export const DEFAULT_LIMIT = 50;
export const LOAD_MORE_STEP = 200;''', p)
s = rep(s, '''  const [openAll, setOpenAll] = useState({ v: 0, open: true });

  const load = useCallback(async () => {
    try {
      // `conv` (openspec arch-conversations): the tool calls of THIS conversation.
      const q = new URLSearchParams();
      if (conv && conv !== '@arch') q.set('conv', conv);
      if (sessionOverride) q.set('sessionId', sessionOverride);
      const qs = q.toString();
      const d = await apiGet(`/arch/tool-calls${qs ? `?${qs}` : ''}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [conv, sessionOverride]);''',
'''  const [openAll, setOpenAll] = useState({ v: 0, open: true });
  // How many recent calls are loaded: DEFAULT_LIMIT, widened by "load more", 0 = all.
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const load = useCallback(async () => {
    try {
      // `conv` (openspec arch-conversations): the tool calls of THIS conversation.
      const q = new URLSearchParams();
      if (conv && conv !== '@arch') q.set('conv', conv);
      if (sessionOverride) q.set('sessionId', sessionOverride);
      q.set('limit', String(limit));
      const qs = q.toString();
      const d = await apiGet(`/arch/tool-calls${qs ? `?${qs}` : ''}`);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [conv, sessionOverride, limit]);''', p)
s = rep(s, '''      <div className="arch-hist__filters">
        <div className="arch-hist__chips">''',
'''      {data?.truncated && (
        <div className="arch-hist__window" data-arch-hist-window={fetched.length} data-arch-hist-total={data.total}>
          <span>showing the <b>last {fetched.length}</b> of {data.total} calls — the filters below search only these</span>
          <button type="button" className="arch-hist__btn" onClick={() => setLimit((l) => (l === 0 ? 0 : l + LOAD_MORE_STEP))} data-arch-hist-more>load {LOAD_MORE_STEP} more</button>
          <button type="button" className="arch-hist__btn" onClick={() => setLimit(0)} data-arch-hist-all title="every call of this conversation — slow on a long one">load all {data.total}</button>
        </div>
      )}
      {data && !data.truncated && limit !== DEFAULT_LIMIT && fetched.length > DEFAULT_LIMIT && (
        <div className="arch-hist__window" data-arch-hist-window={fetched.length} data-arch-hist-total={data.total}>
          <span>showing <b>all {fetched.length}</b> calls</span>
          <button type="button" className="arch-hist__btn" onClick={() => setLimit(DEFAULT_LIMIT)} data-arch-hist-recent>back to the last {DEFAULT_LIMIT}</button>
        </div>
      )}
      <div className="arch-hist__filters">
        <div className="arch-hist__chips">''', p)
write(p, s)

# the window bar's style
p = 'client/src/components/arch/archHistory.css'; s = read(p)
s += '''
/* the recent-N window (openspec arch-chat-tool-calls-history) */
.arch-hist__window { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: var(--color-text-muted, #9aa); border: 1px dashed var(--color-border, #444); border-radius: 8px; padding: 5px 10px; margin: 0 0 8px; }
'''
write(p, s)

# ---- client tests: register the new node test ------------------------------------------------
p = 'client/package.json'; s = read(p)
s = rep(s, 'src/manage/fileTree.test.mjs"', 'src/manage/fileTree.test.mjs src/components/chat/turnSteps.test.mjs"', p)
write(p, s)
print('ALL PATCHED')
