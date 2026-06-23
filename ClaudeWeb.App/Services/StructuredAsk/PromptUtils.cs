namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Helpers for turning a raw model reply into parseable JSON. Ported ~verbatim from
/// web-flow-autodev (app/Autodev.AgenticStage/PromptUtils.cs); see
/// openspec/changes/discover-local-apps/design.md (D1).
/// </summary>
public static class PromptUtils
{
    /// <summary>
    /// Strips any text before the first { and after the matching last }, and drops
    /// markdown code fences. Handles the common case where the model prefixes or
    /// wraps its JSON with conversational text.
    /// </summary>
    public static string ExtractJson(string raw)
    {
        var lines = raw.Split('\n');
        var cleaned = string.Join("\n",
            lines.Where(l => !l.TrimStart().StartsWith("```")));

        var start = cleaned.IndexOf('{');
        if (start < 0) return raw;

        var depth = 0;
        var inString = false;
        var escape = false;
        for (var i = start; i < cleaned.Length; i++)
        {
            var c = cleaned[i];
            if (escape) { escape = false; continue; }
            if (c == '\\' && inString) { escape = true; continue; }
            if (c == '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c == '{') depth++;
            else if (c == '}') { depth--; if (depth == 0) return cleaned[start..(i + 1)]; }
        }

        return raw;
    }
}
