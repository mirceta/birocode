using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Chat;

/// <summary>Auxiliary jobs use the repo's engine without resuming or changing its live conversation.</summary>
public class AgentHelperRunner(CliRunnerService runner, RepositoryRegistry repos)
{
    public async Task<string> RunAsync(string prompt, string cwd, bool readOnly, CancellationToken ct,
        string? model = null, string? provider = null)
    {
        var repo = repos.GetAll().FirstOrDefault(r => NativeTranscripts.SamePath(r.Path, cwd));
        provider ??= repo?.Provider ?? "claude";
        model ??= repo?.Model;
        var output = new StringBuilder();
        string? error = null;
        bool done = false;
        await runner.RunAsync(prompt, null, cwd, model, evt =>
        {
            var e = JsonSerializer.SerializeToElement(evt);
            switch (NativeTranscripts.Str(e, "type"))
            {
                case "token": output.Append(NativeTranscripts.Str(e, "text")); break;
                case "error": error = NativeTranscripts.Str(e, "message"); break;
                case "done": done = true; break;
            }
            return Task.CompletedTask;
        }, ct, readOnly: readOnly, provider: provider, ephemeral: true);
        ct.ThrowIfCancellationRequested();
        if (error != null || !done) throw new InvalidOperationException(error ?? "Agent helper ended without a completed reply.");
        return output.ToString();
    }
}
