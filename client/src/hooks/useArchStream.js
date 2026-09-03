import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiStreamGet } from '../api/client';
import { hubAttach, hubSupported } from '../api/chatStreamHub';
import { createSseParser } from '../components/chat/sseParser';
import { appendThinking, applyToolEvent, settleSteps } from '../components/chat/turnSteps';

// Live view of the arch agent's CURRENT turn (openspec: add-arch-agent, 6c).
//
// The arch conversation is a run session like any repo chat's (keyed "@arch"
// in RunSessionService), so its thinking / tool / token events are already on
// the wire: the shared multiplexed hub carries a subscription for repoId
// "@arch" (stream-multi resolves run slots without a registry lookup), and
// GET /api/arch/stream?after=N is the per-run fallback. This hook turns those
// events into ONE live turn — { user, assistant: { text, steps } } — that the
// Arch tab renders on top of its polled transcript while the turn runs, with
// the same <ActivitySteps> / <ThinkingIndicator> the repo chat uses.
//
// Lifecycle of `turn`:
//   null                 — nothing live
//   { active: true }     — attached; events are arriving
//   { active: false }    — settled: the stream ended; the page keeps the local
//                          copy until the transcript on disk carries the reply
//                          (or the next turn starts), so a reply the CLI never
//                          persisted is not lost from view.
//
// The seq watermark is monotonic across turns (the server's seq is monotonic
// per run key across runs), so a re-attach replays only what this page has not
// seen; a server restart (seq went backwards) resets it.

const RETRY_MS = 2000;
const MAX_ATTEMPTS = 5;

const emptyTurn = () => ({ active: true, user: null, assistant: { text: '', steps: [] }, error: '' });

export default function useArchStream({ onEnded }) {
  const [turn, setTurn] = useState(null);
  const seqRef = useRef(0);
  const handleRef = useRef(null);   // { abort() } while attached
  const alive = useRef(true);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      handleRef.current?.abort();
      handleRef.current = null;
    };
  }, []);

  const applyEvent = useCallback((evt) => {
    if (!alive.current) return;
    if (evt.seq != null) {
      if (evt.seq <= seqRef.current) return; // replayed across a re-attach
      seqRef.current = evt.seq;
    }
    switch (evt.type) {
      case 'user':
        // The harness emits the prompt for EVERY arch send (composer, loop
        // wake, arch-eval) — this is the only place the live user bubble comes
        // from, so a composer send must not draw its own.
        setTurn((t) => ({ ...(t?.active ? t : emptyTurn()), user: { text: evt.text || '', actor: evt.actor || 'human' } }));
        break;
      case 'thinking':
        setTurn((t) => { const c = t?.active ? t : emptyTurn(); return { ...c, assistant: { ...c.assistant, steps: appendThinking(c.assistant.steps, evt.text) } }; });
        break;
      case 'tool':
        setTurn((t) => { const c = t?.active ? t : emptyTurn(); return { ...c, assistant: { ...c.assistant, steps: applyToolEvent(c.assistant.steps, evt) } }; });
        break;
      case 'token':
        if (evt.text) setTurn((t) => { const c = t?.active ? t : emptyTurn(); return { ...c, assistant: { ...c.assistant, text: c.assistant.text + evt.text } }; });
        break;
      case 'error':
        setTurn((t) => ({ ...(t?.active ? t : emptyTurn()), error: evt.message || 'The arch turn failed.' }));
        break;
      default:
        break; // session / usage / done carry nothing the live turn renders
    }
  }, []);

  // The stream for the current run is over (normally, stopped, or lost).
  const settle = useCallback(async (outcome) => {
    handleRef.current = null;
    if (!alive.current) return;
    // Re-pull the transcript BEFORE the turn reads as settled: the hand-over
    // (settled turn vs. transcript) must be judged against a transcript read
    // after the run ended. The one the page holds now was read mid-turn and
    // may already carry this turn's partial reply — judged against that, the
    // live copy would be dropped the instant it settled.
    try { await onEndedRef.current?.(outcome); } catch { /* the poll will catch up */ }
    if (!alive.current) return;
    setTurn((t) => {
      if (!t?.active) return t;
      // Nothing to show (no run on the server, or a run whose events this
      // page never saw): drop the placeholder rather than keep an empty
      // settled turn around.
      const empty = !t.user && !t.assistant.text && t.assistant.steps.length === 0;
      if (outcome === 'none' || empty) return null;
      return { ...t, active: false, assistant: { ...t.assistant, steps: settleSteps(t.assistant.steps) } };
    });
  }, []);

  // Attach to the arch run (idempotent: a no-op while a reader is live). Called
  // right after a composer send and whenever the poll sees a running turn with
  // no reader (page load / reload / loop-driven turn).
  const attach = useCallback(() => {
    if (handleRef.current || !alive.current) return;
    setTurn((t) => (t?.active ? t : emptyTurn()));
    (async () => {
      if (hubSupported()) {
        const handle = hubAttach({
          repoId: '@arch', lane: 'builder',
          getAfter: () => seqRef.current,
          onEvent: applyEvent,
        });
        handleRef.current = handle;
        const outcome = await handle.done;
        if (handleRef.current !== handle) return; // superseded by an explicit abort
        if (outcome !== 'unsupported') { await settle(outcome); return; }
        // 'unsupported' -> the legacy per-run stream below.
      }
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_MS));
        if (!alive.current) return;
        const controller = new AbortController();
        const handle = { abort: () => controller.abort() };
        handleRef.current = handle;
        try {
          await apiStreamGet(`/arch/stream?after=${seqRef.current}`, createSseParser(applyEvent), { signal: controller.signal });
          await settle('ended');
          return;
        } catch (err) {
          if (err.name === 'AbortError') { if (handleRef.current === handle) await settle('aborted'); return; }
          if (err.status === 404) { await settle('none'); return; }
          // transient — retry
        }
      }
      await settle('lost');
    })();
  }, [applyEvent, settle]);

  // Drop a settled local turn once the transcript carries it (or a new turn
  // starts). The caller decides when; this just clears.
  const discard = useCallback(() => setTurn((t) => (t?.active ? t : null)), []);

  // The server's seq went backwards (harness restart): start over so the next
  // attach replays the new run from its first event.
  const noteServerSeq = useCallback((lastSeq) => {
    if (typeof lastSeq === 'number' && lastSeq < seqRef.current) seqRef.current = 0;
  }, []);

  // True when the server has buffered events this page has not consumed —
  // the signal that a run the page thought settled is in fact a newer one.
  const behind = useCallback((lastSeq) => typeof lastSeq === 'number' && lastSeq > seqRef.current, []);

  const attached = useCallback(() => !!handleRef.current, []);

  // One stable object per turn change, so effects keyed on it do not re-run
  // every render.
  return useMemo(() => ({ turn, attached, attach, discard, noteServerSeq, behind }), [turn, attached, attach, discard, noteServerSeq, behind]);
}
