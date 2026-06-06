using ClaudeWeb.Models;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.UI;

/// <summary>
/// The operator-facing monitoring GUI. Shows the fixed working directory
/// (with a Change button), server status, a scrolling read-only activity
/// log fed by the shared Logger, and a status bar with request/error counts.
///
/// Layout:
///   +------------------------------------------------------------+
///   | Working Dir: C:\...                            [Change]    |
///   | Server: http://0.0.0.0:5099  [Running]                     |
///   |------------------------------------------------------------|
///   | Activity Log                                               |
///   | +--------------------------------------------------------+ |
///   | | timestamped log lines ...                              | |
///   | +--------------------------------------------------------+ |
///   | Requests: 0    Errors: 0                                   |
///   +------------------------------------------------------------+
/// </summary>
public class MainForm : Form
{
    private readonly AppConfig _config;
    private readonly Logger _logger;
    private readonly EmbeddedApi _api;

    private readonly Label _workingDirLabel;
    private readonly Label _serverLabel;
    private readonly RichTextBox _activityLog;
    private readonly ToolStripStatusLabel _requestsStatus;
    private readonly ToolStripStatusLabel _errorsStatus;

    public MainForm(AppConfig config, Logger logger, EmbeddedApi api)
    {
        _config = config;
        _logger = logger;
        _api = api;

        Text = "Claude Web";
        Size = new Size(900, 600);
        MinimumSize = new Size(640, 400);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White;

        var headerPanel = CreateHeaderPanel(out _workingDirLabel, out _serverLabel);
        var logLabel = CreateLogLabel();
        _activityLog = CreateActivityLog();
        var statusStrip = CreateStatusStrip(out _requestsStatus, out _errorsStatus);

        // Add in reverse Z-order so docked controls stack correctly.
        Controls.Add(_activityLog);
        Controls.Add(logLabel);
        Controls.Add(headerPanel);
        Controls.Add(statusStrip);

        // Subscribe to the shared logger; marshal back to the UI thread.
        _logger.OnLog += AppendLog;
        _logger.OnCountsChanged += UpdateCounts;

        var serverTimer = new System.Windows.Forms.Timer { Interval = 1500 };
        serverTimer.Tick += (_, _) => RefreshServerStatus();
        serverTimer.Start();
        RefreshServerStatus();
    }

    // --- UI construction ---------------------------------------------------

    private Panel CreateHeaderPanel(out Label workingDirLabel, out Label serverLabel)
    {
        var panel = new Panel
        {
            Dock = DockStyle.Top,
            Height = 70,
            BackColor = Color.FromArgb(30, 35, 45),
            Padding = new Padding(12, 8, 12, 8)
        };

        workingDirLabel = new Label
        {
            Text = $"Working Dir: {_config.WorkingDirectory}",
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(200, 210, 220),
            Location = new Point(12, 10),
            AutoSize = true
        };

        var changeButton = new Button
        {
            Text = "Change",
            Size = new Size(80, 26),
            Location = new Point(700, 6),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            BackColor = Color.FromArgb(60, 70, 85),
            ForeColor = Color.FromArgb(200, 210, 220),
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 9f),
            Cursor = Cursors.Hand
        };
        changeButton.FlatAppearance.BorderColor = Color.FromArgb(80, 90, 110);
        changeButton.Click += OnChangeWorkingDirectory;

        serverLabel = new Label
        {
            Text = $"Server: http://0.0.0.0:{_config.Port}  [Starting...]",
            Font = new Font("Consolas", 9.5f),
            ForeColor = Color.FromArgb(200, 200, 100),
            Location = new Point(12, 38),
            AutoSize = true
        };

        panel.Controls.Add(workingDirLabel);
        panel.Controls.Add(serverLabel);
        panel.Controls.Add(changeButton);
        return panel;
    }

    private static Label CreateLogLabel() => new()
    {
        Text = "  Activity Log",
        Dock = DockStyle.Top,
        Height = 22,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Color.FromArgb(60, 70, 80),
        BackColor = Color.FromArgb(245, 245, 248),
        TextAlign = ContentAlignment.MiddleLeft
    };

    private static RichTextBox CreateActivityLog() => new()
    {
        Dock = DockStyle.Fill,
        ReadOnly = true,
        Font = new Font("Consolas", 9.5f),
        BackColor = Color.FromArgb(250, 250, 250),
        BorderStyle = BorderStyle.None,
        WordWrap = false,
        ScrollBars = RichTextBoxScrollBars.Both
    };

    private static StatusStrip CreateStatusStrip(out ToolStripStatusLabel requests, out ToolStripStatusLabel errors)
    {
        requests = new ToolStripStatusLabel("Requests: 0");
        errors = new ToolStripStatusLabel("Errors: 0") { ForeColor = Color.FromArgb(70, 70, 70) };

        var strip = new StatusStrip { BackColor = Color.FromArgb(240, 240, 243) };
        strip.Items.Add(requests);
        strip.Items.Add(new ToolStripStatusLabel("   "));
        strip.Items.Add(errors);
        return strip;
    }

    // --- Event handlers ----------------------------------------------------

    private void OnChangeWorkingDirectory(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Select the working directory Claude operates in",
            SelectedPath = Directory.Exists(_config.WorkingDirectory) ? _config.WorkingDirectory : "",
            ShowNewFolderButton = true
        };

        if (dialog.ShowDialog() == DialogResult.OK)
        {
            _config.WorkingDirectory = dialog.SelectedPath;
            _workingDirLabel.Text = $"Working Dir: {_config.WorkingDirectory}";
            _logger.Info($"[CONFIG] Working directory changed to {_config.WorkingDirectory}");
        }
    }

    private void RefreshServerStatus()
    {
        var running = _api.IsRunning;
        _serverLabel.Text = $"Server: http://0.0.0.0:{_config.Port}  [{(running ? "Running" : "Starting...")}]";
        _serverLabel.ForeColor = running
            ? Color.FromArgb(120, 200, 140)
            : Color.FromArgb(200, 200, 100);
    }

    private void AppendLog(string line)
    {
        SafeInvoke(() =>
        {
            _activityLog.AppendText(line + Environment.NewLine);
            _activityLog.SelectionStart = _activityLog.TextLength;
            _activityLog.ScrollToCaret();
        });
    }

    private void UpdateCounts(int requests, int errors)
    {
        SafeInvoke(() =>
        {
            _requestsStatus.Text = $"Requests: {requests}";
            _errorsStatus.Text = $"Errors: {errors}";
            _errorsStatus.ForeColor = errors > 0 ? Color.FromArgb(180, 60, 60) : Color.FromArgb(70, 70, 70);
        });
    }

    private void SafeInvoke(Action action)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
            try { BeginInvoke(action); } catch { }
        else
            action();
    }
}
