// Incremental SSE parser for the chat stream.
//
// M4's apiStream() hands us raw decoded text chunks, not parsed events. A
// single SSE `data:` line can be split across two network chunks, so we keep
// a rolling buffer and only emit a parsed event once we have seen a full
// line. The M1 contract sends one JSON object per `data:` line, separated by
// newlines.
//
// Usage:
//   const parse = createSseParser((event) => { ... });
//   apiStream(path, body, parse);
export function createSseParser(onEvent) {
  let buffer = '';

  return function feed(chunk) {
    buffer += chunk;

    // SSE events are separated by newlines. Process every complete line and
    // keep the trailing partial line in the buffer for the next chunk.
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      emitLine(line, onEvent);
    }
  };
}

function emitLine(line, onEvent) {
  if (!line) return;

  // Strip the optional SSE "data:" prefix; the payload is JSON.
  const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
  if (!payload || payload === '[DONE]') return;

  try {
    onEvent(JSON.parse(payload));
  } catch {
    // A malformed or partial line we could not parse -- ignore it rather
    // than crash the stream. The next complete line will recover.
  }
}
