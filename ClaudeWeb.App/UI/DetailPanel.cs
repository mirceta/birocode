using System.Text;
using ClaudeWeb.Models;

namespace ClaudeWeb.UI;

/// <summary>
/// Scrollable right-side panel that renders the full detail of one
/// <see cref="CallRecord"/>: status/meta summary, the exact command line,
/// timing, token + cost breakdown, tools used, the prompt, the response, and
/// an error section (shown only when the record has an error). Mirrors
/// ClaudeMonitor's detail view but as an embedded panel (no WebView2/chat).
///
/// Call <see cref="Render"/> on the UI thread whenever the selected record
/// changes or the selected record is updated in place.
/// </summary>
public class DetailPanel : Panel
{
    private readonly Label _title;
    private readonly TextBox _meta;
    private readonly TextBox _commandLine;
    private readonly Label _promptHeader;
    private readonly TextBox _prompt;
    private readonly Label _responseHeader;
    private readonly TextBox _response;
    private readonly Label _errorHeader;
    private readonly TextBox _error;

    public DetailPanel()
    {
        AutoScroll = true;
        BackColor = Color.White;
        Padding = new Padding(12);

        // Controls are docked Top inside a flow-like stack; widths follow the
        // panel. Add in reverse order so the first added ends up on top.
        _error = MakeMultiline(Color.FromArgb(60, 12, 12), Color.FromArgb(255, 190, 190), 140);
        _errorHeader = MakeSectionHeader("Error", Color.FromArgb(180, 40, 40), Color.White);

        _response = MakeMultiline(Color.FromArgb(248, 250, 252), Color.FromArgb(20, 30, 40), 220);
        _responseHeader = MakeSectionHeader("Response", Color.FromArgb(240, 250, 240), Color.FromArgb(30, 120, 60));

        _prompt = MakeMultiline(Color.FromArgb(250, 250, 252), Color.FromArgb(30, 30, 46), 140);
        _promptHeader = MakeSectionHeader("Prompt", Color.FromArgb(245, 245, 248), Color.FromArgb(120, 100, 40));

        _commandLine = new TextBox
        {
            Dock = DockStyle.Top,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Horizontal,
            WordWrap = false,
            Font = new Font("Consolas", 8.5f),
            BackColor = Color.FromArgb(35, 45, 60),
            ForeColor = Color.FromArgb(160, 180, 200),
            BorderStyle = BorderStyle.FixedSingle,
            Height = 40,
        };

        _meta = new TextBox
        {
            Dock = DockStyle.Top,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            WordWrap = false,
            Font = new Font("Consolas", 9f),
            BackColor = Color.FromArgb(248, 248, 250),
            ForeColor = Color.FromArgb(40, 40, 50),
            BorderStyle = BorderStyle.FixedSingle,
            Height = 230,
        };

        _title = new Label
        {
            Dock = DockStyle.Top,
            Height = 30,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            ForeColor = Color.FromArgb(35, 45, 60),
            Text = "Select a request",
        };

        // Reverse Z-order add: bottom-most sections first.
        Controls.Add(_error);
        Controls.Add(_errorHeader);
        Controls.Add(_response);
        Controls.Add(_responseHeader);
        Controls.Add(_prompt);
        Controls.Add(_promptHeader);
        Controls.Add(_commandLine);
        Controls.Add(MakeSectionHeader("Command line", Color.FromArgb(35, 45, 60), Color.FromArgb(140, 160, 180)));
        Controls.Add(_meta);
        Controls.Add(_title);

        ShowEmpty();
    }

    /// <summary>Renders the given record into the panel (call on the UI thread).</summary>
    public void Render(CallRecord r)
    {
        _title.Text = $"Request #{r.Number} -- {r.Status}";
        _meta.Text = BuildMeta(r);
        _commandLine.Text = r.CommandLine;

        _prompt.Text = r.Prompt.Length > 0 ? r.Prompt : "(no prompt)";
        _response.Text = r.Output.Length > 0
            ? r.Output.ToString()
            : (r.Status == "Running" ? "(streaming...)" : "(no output)");

        var error = BuildError(r);
        var hasError = error.Length > 0;
        _errorHeader.Visible = hasError;
        _error.Visible = hasError;
        if (hasError) _error.Text = error;
    }

    private void ShowEmpty()
    {
        _meta.Text = "";
        _commandLine.Text = "";
        _prompt.Text = "";
        _response.Text = "";
        _errorHeader.Visible = false;
        _error.Visible = false;
    }

    private static string BuildMeta(CallRecord r)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Status:        {r.Status}");
        sb.AppendLine($"Model:         {(string.IsNullOrEmpty(r.Model) ? "-" : r.Model)}");
        sb.AppendLine($"Session id:    {(r.SessionId == "" ? "-" : r.SessionId)}");
        sb.AppendLine($"Resuming:      {(r.Resuming ? "yes" : "no")}");
        sb.AppendLine($"Working dir:   {(r.WorkingDirectory == "" ? "-" : r.WorkingDirectory)}");
        sb.AppendLine($"Started:       {r.StartedAt:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"Finished:      {(r.FinishedAt.HasValue ? r.FinishedAt.Value.ToString("yyyy-MM-dd HH:mm:ss") : "-")}");
        sb.AppendLine($"Duration:      {r.DurationDisplay}");
        sb.AppendLine($"TTFT:          {r.TtftDisplay}");
        sb.AppendLine($"Throughput:    {r.TokensPerSecondDisplay}");
        sb.AppendLine($"Tokens in:     {r.InputTokens:N0}");
        sb.AppendLine($"Tokens out:    {r.OutputTokens:N0}");
        sb.AppendLine($"Cache read:    {r.CacheReadTokens:N0}");
        sb.AppendLine($"Cache create:  {r.CacheCreationTokens:N0}");
        sb.AppendLine($"Cost:          {r.CostDisplay}  (Max plan estimate -- not billed)");
        sb.AppendLine($"Turns:         {r.NumTurns}");
        sb.AppendLine($"Stop reason:   {(string.IsNullOrEmpty(r.StopReason) ? "-" : r.StopReason)}");
        sb.AppendLine($"Throttled:     {(r.WasThrottled ? "YES" : "no")}");
        sb.AppendLine($"Tools used:    {(r.Tools.Count > 0 ? string.Join(", ", r.Tools) : "-")}");
        return sb.ToString();
    }

    private static string BuildError(CallRecord r)
    {
        if (!r.HasError && string.IsNullOrEmpty(r.ErrorMessage) &&
            string.IsNullOrEmpty(r.StdErr) && !r.ExitCode.HasValue)
            return "";
        if (r.Status != "Error" && string.IsNullOrEmpty(r.ErrorMessage) && string.IsNullOrEmpty(r.StdErr))
            return "";

        var parts = new List<string>();
        if (!string.IsNullOrEmpty(r.ErrorMessage))
        {
            parts.Add("=== ERROR MESSAGE ===");
            parts.Add(r.ErrorMessage);
            parts.Add("");
        }
        if (r.ExitCode.HasValue)
        {
            parts.Add($"=== EXIT CODE: {r.ExitCode} ===");
            parts.Add("");
        }
        if (!string.IsNullOrEmpty(r.StdErr))
        {
            parts.Add("=== STDERR ===");
            parts.Add(r.StdErr);
        }
        return parts.Count > 0 ? string.Join(Environment.NewLine, parts) : "";
    }

    private static Label MakeSectionHeader(string text, Color back, Color fore) => new()
    {
        Text = "  " + text,
        Dock = DockStyle.Top,
        Height = 24,
        Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
        ForeColor = fore,
        BackColor = back,
        TextAlign = ContentAlignment.MiddleLeft,
    };

    private static TextBox MakeMultiline(Color back, Color fore, int height) => new()
    {
        Dock = DockStyle.Top,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Both,
        WordWrap = false,
        Font = new Font("Consolas", 9f),
        BackColor = back,
        ForeColor = fore,
        BorderStyle = BorderStyle.FixedSingle,
        Height = height,
    };
}
