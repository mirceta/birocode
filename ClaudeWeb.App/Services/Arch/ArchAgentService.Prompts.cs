using ClaudeWeb.Services.Prompts;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's CACHED PROMPTS tools (openspec arch-custom-prompts, fleet task ebc91192):
/// parity with the repo agents' "add to cached prompts" — the arch can save a prompt the
/// Operator just used (ONLY when they ask), list the library and remove one. Same store the
/// Arch agent panel edits (<see cref="PromptsService"/>, owner <see cref="PromptsService.OwnerArch"/>).
/// </summary>
public partial class ArchAgentService
{
    private readonly PromptsService? _prompts;

    private static object PromptView(PromptsService.Prompt p) => new
    {
        id = p.Id, emoji = p.Emoji, label = p.Label, text = p.Text, category = p.Category, hint = p.Hint,
        seeded = p.SeedId is not null, seedId = p.SeedId, edited = p.Edited, createdAt = p.CreatedAt,
    };

    public ToolOutcome ToolCachePrompt(string? label, string? text, string? category, string? hint, string? emoji)
    {
        if (_prompts is null) return new ToolOutcome(false, "unavailable", "cached prompts are not available on this harness");
        if (string.IsNullOrWhiteSpace(text)) { AuditTool("cache_prompt", null, "error"); return new ToolOutcome(false, "error", "text is required: the prompt as the Operator would type it (placeholders like {machine}, {agent}, {task}, {pr}, {url}, {branch} become fill-in chips)"); }
        var dup = _prompts.List(PromptsService.OwnerArch).FirstOrDefault(p => string.Equals(p.Text.Trim(), text.Trim(), StringComparison.OrdinalIgnoreCase));
        if (dup is not null)
        {
            AuditTool("cache_prompt", null, $"exists {dup.Id}");
            return new ToolOutcome(true, "exists", $"that prompt is already cached as \"{dup.Label}\" ({dup.Id}); nothing added", PromptView(dup));
        }
        var p = _prompts.Add(string.IsNullOrWhiteSpace(emoji) ? "💬" : emoji, label, text, PromptsService.OwnerArch,
            string.IsNullOrWhiteSpace(category) ? ArchPromptSeeds.GroupAsk : category, hint);
        if (p is null) return new ToolOutcome(false, "error", "the prompt could not be stored");
        AuditTool("cache_prompt", null, $"cached {p.Id} \"{p.Label}\"");
        _logger.Info($"[ARCH] cached prompt {p.Id} \"{p.Label}\" ({p.Category})");
        return new ToolOutcome(true, "cached", $"cached \"{p.Label}\" under {p.Category} ({_prompts.List(PromptsService.OwnerArch).Count} arch prompts); the Operator sees it in the Arch agent tab's Cached prompts panel", PromptView(p));
    }

    public ToolOutcome ToolListCachedPrompts(string? category)
    {
        if (_prompts is null) return new ToolOutcome(false, "unavailable", "cached prompts are not available on this harness");
        var all = _prompts.List(PromptsService.OwnerArch);
        var list = string.IsNullOrWhiteSpace(category) ? all : all.Where(p => string.Equals(p.Category, category.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();
        AuditTool("list_cached_prompts", null, $"{list.Count} prompt(s)");
        return new ToolOutcome(true, "ok", $"{list.Count} cached prompt(s){(string.IsNullOrWhiteSpace(category) ? "" : $" under {category}")} in {all.Select(p => p.Category).Distinct().Count()} group(s): {string.Join("; ", list.Select(p => $"{p.Label} ({p.Id[..8]})"))}",
            new { groups = ArchPromptSeeds.Groups, prompts = list.Select(PromptView).ToList() });
    }

    public ToolOutcome ToolRemoveCachedPrompt(string? id)
    {
        if (_prompts is null) return new ToolOutcome(false, "unavailable", "cached prompts are not available on this harness");
        if (string.IsNullOrWhiteSpace(id)) return new ToolOutcome(false, "error", "id is required (list_cached_prompts shows the ids)");
        var p = _prompts.List(PromptsService.OwnerArch).FirstOrDefault(x => x.Id == id.Trim() || x.Id.StartsWith(id.Trim(), StringComparison.Ordinal));
        if (p is null) { AuditTool("remove_cached_prompt", null, "not-found"); return new ToolOutcome(false, "not-found", $"no cached arch prompt \"{id}\""); }
        _prompts.Delete(p.Id);
        AuditTool("remove_cached_prompt", null, $"removed {p.Id} \"{p.Label}\"");
        return new ToolOutcome(true, "removed", $"removed \"{p.Label}\" ({p.Id}); {_prompts.List(PromptsService.OwnerArch).Count} arch prompt(s) left", PromptView(p));
    }
}
