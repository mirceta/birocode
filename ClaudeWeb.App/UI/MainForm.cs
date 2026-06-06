using ClaudeWeb.Models;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Monitoring;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.UI;

/// <summary>
/// The operator-facing monitoring GUI. Shows the fixed working directory
/// (with a Change button), server status, a list of chat requests with a
/// right-side detail panel, a scrolling read-only activity log fed by the
/// shared Logger, and a status bar with request/error counts.
///
/// Layout:
///   +--------------------------------------------------------------------+
///   | Working Dir: C:\...                                  [Change]      |
///   | Server: http://0.0.0.0:5099  [Running]                             |
///   |--------------------------------------------------------------------|
///   | LEFT (split horizontally)        |  RIGHT (detail panel)           |
///   |  +----------------------------+  |  Status / Model / Session ...   |
///   |  | Requests ListView          |  |  Command line                   |
///   |  |  # Time Status Model ...   |  |  Started / Finished / Duration  |
///   |  +----------------------------+  |  Tokens / Cost / Tools          |
///   |  | Activity Log               |  |  Prompt (read-only)             |
///   |  |  timestamped log lines ... |  |  Response (read-only)           |
///   |  +----------------------------+  |  Error section (when present)   |
///   |--------------------------------------------------------------------|
///   | Requests: 0    Errors: 0                                           |
///   +--------------------------------------------------------------------+
///
/// The shared <see cref="CallLog"/> drives the list: CallStarted inserts a row,
/// CallChanged updates it (and refreshes the detail panel if it is the selected
/// record). All callbacks are marshaled onto the UI thread via SafeInvoke.
/// </summary>
public class MainForm : Form
{
    private readonly AppConfig _config;
    private readonly Logger _logger;
    private readonly EmbeddedApi _api;
    private readonly CallLog _callLog;
    private readonly RepositoryRegistry _repositories;

    private readonly Label _workingDirLabel;
    private readonly Label _serverLabel;
    private readonly RichTextBox _activityLog;
    private readonly ListView _requestList;
    private readonly DetailPanel _detail;
    private readonly ToolStripStatusLabel _requestsStatus;
    private readonly ToolStripStatusLabel _errorsStatus;

    // Maps a CallRecord.Number to its ListView row for in-place updates.
    private readonly Dictionary<int, ListViewItem> _rowsByNumber = new();

    public MainForm(AppConfig config, Logger logger, EmbeddedApi api, CallLog callLog, RepositoryRegistry repositories)
    {
        _config = config;
        _logger = logger;
        _api = api;
        _callLog = callLog;
        _repositories = repositories;

        Text = "Claude Web";
        Size = new Size(1200, 720);
        MinimumSize = new Size(800, 480);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White;

        var headerPanel = CreateHeaderPanel(out _workingDirLabel, out _serverLabel);
        var statusStrip = CreateStatusStrip(out _requestsStatus, out _errorsStatus);

        // Main horizontal split: requests/log on the left, detail on the right.
        var mainSplit = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            SplitterWidth = 5,
        };

        // Left side: list on top, activity log below (nested horizontal split).
        var leftSplit = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
        };

        _requestList = CreateRequestList();
        _requestList.SelectedIndexChanged += (_, _) => OnSelectionChanged();
        leftSplit.Panel1.Controls.Add(_requestList);

        _activityLog = CreateActivityLog();
        var logLabel = CreateLogLabel();
        leftSplit.Panel2.Controls.Add(_activityLog);
        leftSplit.Panel2.Controls.Add(logLabel);

        mainSplit.Panel1.Controls.Add(leftSplit);

        _detail = new DetailPanel { Dock = DockStyle.Fill };
        mainSplit.Panel2.Controls.Add(_detail);

        // Add in reverse Z-order so docked controls stack correctly.
        Controls.Add(mainSplit);
        Controls.Add(headerPanel);
        Controls.Add(statusStrip);

        // Position splitters after the form has a real size.
        Load += (_, _) =>
        {
            SetSplitterSafe(mainSplit, 360, 280, 0.45);
            SetSplitterSafe(leftSplit, 120, 80, 0.55);
        };

        // Subscribe to the shared logger; marshal back to the UI thread.
        _logger.OnLog += AppendLog;
        _logger.OnCountsChanged += UpdateCounts;

        // Subscribe to the shared call log for the request list + detail panel.
        _callLog.CallStarted += OnCallStarted;
        _callLog.CallChanged += OnCallChanged;

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
            Text = RepositoriesSummary(),
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(200, 210, 220),
            Location = new Point(12, 10),
            AutoSize = true
        };

        var changeButton = new Button
        {
            Text = "Repositories...",
            Size = new Size(110, 26),
            Location = new Point(670, 6),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            BackColor = Color.FromArgb(60, 70, 85),
            ForeColor = Color.FromArgb(200, 210, 220),
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 9f),
            Cursor = Cursors.Hand
        };
        changeButton.FlatAppearance.BorderColor = Color.FromArgb(80, 90, 110);
        changeButton.Click += OnManageRepositories;

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

    private static ListView CreateRequestList()
    {
        var list = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = false,
            Font = new Font("Segoe UI", 9f),
            BorderStyle = BorderStyle.None,
        };
        list.Columns.Add("#", 40, HorizontalAlignment.Right);
        list.Columns.Add("Time", 70);
        list.Columns.Add("Status", 70);
        list.Columns.Add("Model", 90);
        list.Columns.Add("Duration", 70, HorizontalAlignment.Right);
        list.Columns.Add("Tokens", 130);
        list.Columns.Add("Prompt", 320);
        return list;
    }

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

    // --- CallLog event handlers --------------------------------------------

    private void OnCallStarted(CallRecord record)
    {
        SafeInvoke(() =>
        {
            var item = new ListViewItem(BuildRowCells(record)) { Tag = record };
            ApplyRowColor(item, record);

            // Newest on top.
            _requestList.Items.Insert(0, item);
            _rowsByNumber[record.Number] = item;

            if (_requestList.SelectedItems.Count == 0)
                item.Selected = true;
        });
    }

    private void OnCallChanged(CallRecord record)
    {
        SafeInvoke(() =>
        {
            if (_rowsByNumber.TryGetValue(record.Number, out var item))
            {
                var cells = BuildRowCells(record);
                for (int i = 0; i < cells.Length && i < item.SubItems.Count; i++)
                    item.SubItems[i].Text = cells[i];
                ApplyRowColor(item, record);
            }

            // Refresh the detail panel only when this record is selected.
            if (_requestList.SelectedItems.Count > 0 &&
                _requestList.SelectedItems[0].Tag is CallRecord selected &&
                selected.Number == record.Number)
            {
                _detail.Render(record);
            }
        });
    }

    private void OnSelectionChanged()
    {
        if (_requestList.SelectedItems.Count > 0 &&
            _requestList.SelectedItems[0].Tag is CallRecord record)
            _detail.Render(record);
    }

    private static string[] BuildRowCells(CallRecord r) =>
    [
        r.Number.ToString(),
        r.StartedAt.ToString("HH:mm:ss"),
        r.Status,
        r.ModelShort,
        r.DurationDisplay,
        r.TokenSummary,
        r.PromptPreview,
    ];

    private static void ApplyRowColor(ListViewItem item, CallRecord r)
    {
        item.BackColor = r.Status switch
        {
            "Success" => Color.FromArgb(225, 245, 225),   // pale green
            "Running" => Color.FromArgb(252, 250, 215),   // pale yellow
            "Throttled" => Color.FromArgb(252, 232, 205),  // pale orange
            "Error" => Color.FromArgb(250, 222, 222),       // pale red
            _ => Color.White,
        };
    }

    // --- Event handlers ----------------------------------------------------

    private void OnManageRepositories(object? sender, EventArgs e)
    {
        using var dialog = new RepositoriesForm(_repositories);
        dialog.ShowDialog(this);
        // The dialog persists changes as it goes; just refresh the header summary.
        _workingDirLabel.Text = RepositoriesSummary();
    }

    private string RepositoriesSummary()
    {
        var repos = _repositories.GetAll();
        if (repos.Count == 0) return "Repositories: none (click Repositories... to add one)";
        if (repos.Count == 1) return $"Repository: {repos[0].Name}  ({repos[0].Path})";
        return $"Repositories: {repos.Count}  -- {string.Join(", ", repos.Select(r => r.Name))}";
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

    // Apply the panel min sizes and splitter distance only once the control has
    // a real size. Setting Panel*MinSize while the SplitContainer is still its
    // tiny default size forces an out-of-range SplitterDistance and throws.
    private static void SetSplitterSafe(SplitContainer splitter, int panel1Min, int panel2Min, double ratio)
    {
        var size = splitter.Orientation == Orientation.Horizontal ? splitter.Height : splitter.Width;
        if (size > panel1Min + panel2Min + splitter.SplitterWidth)
        {
            splitter.Panel1MinSize = panel1Min;
            splitter.Panel2MinSize = panel2Min;
        }
        var min = splitter.Panel1MinSize;
        var max = size - splitter.Panel2MinSize - splitter.SplitterWidth;
        if (max <= min) return;
        splitter.SplitterDistance = Math.Max(min, Math.Min(max, (int)(size * ratio)));
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
