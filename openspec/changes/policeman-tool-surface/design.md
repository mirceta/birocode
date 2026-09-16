# Design — the policeman's tool surface

## D1. One rule, three fences

`ArchPoliceman.AllowedTools` is the single rule. It is applied at three points, from the
outside in: the catalogue the session is OFFERED (`ToolsList(conversation)`), the CLI's
`--disallowedTools` (`DisallowedToolsFor(key)` = built-in denials + `mcp__arch__<withheld>`),
and the call-time refusal in `tools/call`. Any one of them alone is enough; all three means
a model never even sees a tool it may not use, and a bug in one fence is caught by the next.

## D2. Same skeleton, conversation-aware content

The policeman subtab already embeds the Arch page (chat · tools · history · loops). Nothing
about that skeleton changes. The Tools lane now receives `conv` like the History lane
always did, and reads `GET /api/arch/tools?conv=`. Its shape is the same object as the Arch
tab's plus `conversation`, `policy`, `withheldTools`, `catalogueCount`; `tools` is what
`tools/list` would answer that conversation, so the lane can never drift from the real
surface. Usage counts are filtered by conversation (the policeman's calls are audited under
its own key), so the arch's lane no longer counts the policeman's calls and vice versa.

## D3. Not changed

`KnownToolNames` (the -32602 unknown-tool check) stays the full catalogue: an unknown name
is unknown for everybody, a known-but-withheld name answers `policeman-observe-only` if it
ever reaches the server. The preflight's "tools/list answers N/N" runs without a
conversation (the arch's full surface). The home's `settings.json` deny list is shared by
all conversations and unchanged — the CLI flag is the enforced fence.
