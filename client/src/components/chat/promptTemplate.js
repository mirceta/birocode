// Prompt templates (openspec: add-prompt-templates). A custom prompt's body MAY
// contain named placeholders written as `{{name}}`; the distinct names — in
// first-appearance order — ARE the template's parameters (derived from the body,
// never stored separately, so they can't drift from the text). A body with no
// placeholders is an ordinary prompt and inserts verbatim.
//
// Double brace is deliberate: prompt bodies routinely carry shell/code with single
// `{ }` and `${VAR}`, which `{{name}}` is far less likely to collide with. The name
// grammar is letters/digits/underscore/space/dash, trimmed; surrounding whitespace
// inside the braces is ignored, so `{{ ticket }}` and `{{ticket}}` are one parameter.
const PARAM_RE = /\{\{\s*([A-Za-z0-9_ -]+?)\s*\}\}/g;

// Distinct placeholder names in first-appearance order. A name used more than once
// counts once (and later fills every occurrence). Returns [] for empty/undefined.
export function extractParams(body) {
  const out = [];
  if (!body) return out;
  const seen = new Set();
  PARAM_RE.lastIndex = 0;
  let m;
  while ((m = PARAM_RE.exec(body)) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

// Replace every `{{name}}` with the supplied value (verbatim, multi-line, empty
// allowed). A placeholder with no entry in `values` is left intact rather than
// blanked, so a partial map never silently eats text.
export function fillParams(body, values) {
  if (!body) return body;
  const map = values || {};
  return body.replace(PARAM_RE, (full, raw) => {
    const name = raw.trim();
    return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : full;
  });
}
