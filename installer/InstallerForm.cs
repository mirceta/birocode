using ClaudeWebInstaller.Models;
using ClaudeWebInstaller.Services;

namespace ClaudeWebInstaller;

/// <summary>
/// The installer window. Pure UI: it builds controls, subscribes to service
/// events, and forwards button clicks to the service. No business logic lives
/// here -- all checks/installs are in InstallerService.
/// </summary>
public class InstallerForm : Form
{
    private readonly InstallerService _service;

    private readonly TextBox _rootBox;
    private readonly TextBox _workingDirBox;
    private readonly TextBox _portBox;
    private readonly TextBox _passwordBox;
    private readonly Button _rootBrowse;
    private readonly Button _workingDirBrowse;

    private readonly ListView _stepList;
    private readonly TextBox _logBox;
    private readonly Button _checkButton;
    private readonly Button _installButton;
    private readonly Button _testButton;
    private readonly Label _statusLabel;

    private CancellationTokenSource? _cts;

    public InstallerForm()
    {
        Text = "Claude Web Installer";
        Size = new Size(780, 720);
        MinimumSize = new Size(640, 560);
        StartPosition = FormStartPosition.CenterScreen;

        _service = new InstallerService(AppContext.BaseDirectory);

        // -- Header --
        var header = new Label
        {
            Text = "Claude Web",
            Font = new Font(Font.FontFamily, 14, FontStyle.Bold),
            Dock = DockStyle.Top,
            Height = 30,
            Padding = new Padding(8, 4, 0, 0)
        };
        var subtitle = new Label
        {
            Text = "Local setup and diagnostics for the phone-accessible Claude Code workspace",
            Dock = DockStyle.Top,
            Height = 22,
            Padding = new Padding(8, 0, 0, 0)
        };

        // -- Settings panel --
        var settingsPanel = new Panel { Dock = DockStyle.Top, Height = 140, Padding = new Padding(8, 4, 8, 4) };

        const int labelX = 8, fieldX = 130, fieldW = 470, browseX = 608, browseW = 80;
        int y = 8;

        var rootLabel = new Label { Text = "Claude Web folder:", AutoSize = true, Location = new Point(labelX, y + 3) };
        _rootBox = new TextBox
        {
            Location = new Point(fieldX, y), Width = fieldW, Text = _service.ClaudeWebRoot,
            PlaceholderText = "Folder that contains ClaudeWeb.sln"
        };
        _rootBox.TextChanged += OnRootChanged;
        _rootBrowse = new Button { Text = "Browse...", Location = new Point(browseX, y - 1), Width = browseW };
        _rootBrowse.Click += (_, _) => BrowseFolder("Select the claude-web folder (contains ClaudeWeb.sln)", _rootBox);

        y += 32;
        var wdLabel = new Label { Text = "Working directory:", AutoSize = true, Location = new Point(labelX, y + 3) };
        _workingDirBox = new TextBox
        {
            Location = new Point(fieldX, y), Width = fieldW, Text = _service.WorkingDirectory,
            PlaceholderText = "Folder Claude edits (must be / will become a git repo)"
        };
        _workingDirBox.TextChanged += (_, _) => _service.SetWorkingDirectory(_workingDirBox.Text);
        _workingDirBrowse = new Button { Text = "Browse...", Location = new Point(browseX, y - 1), Width = browseW };
        _workingDirBrowse.Click += (_, _) => BrowseFolder("Select the working directory Claude will edit", _workingDirBox);

        y += 32;
        var portLabel = new Label { Text = "Port:", AutoSize = true, Location = new Point(labelX, y + 3) };
        _portBox = new TextBox { Location = new Point(fieldX, y), Width = 80, Text = _service.Port.ToString() };
        _portBox.TextChanged += OnPortChanged;

        var pwLabel = new Label { Text = "Access password:", AutoSize = true, Location = new Point(fieldX + 110, y + 3) };
        _passwordBox = new TextBox
        {
            Location = new Point(fieldX + 230, y), Width = 240, Text = _service.AuthPassword,
            PlaceholderText = "Shared access code"
        };
        _passwordBox.TextChanged += (_, _) => _service.SetAuthPassword(_passwordBox.Text);

        y += 34;
        var settingsHint = new Label
        {
            Text = "Working directory, Port and Access password are written to appsettings.json on Install All.",
            AutoSize = true, ForeColor = SystemColors.GrayText, Location = new Point(labelX, y)
        };

        settingsPanel.Controls.AddRange(new Control[]
        {
            rootLabel, _rootBox, _rootBrowse,
            wdLabel, _workingDirBox, _workingDirBrowse,
            portLabel, _portBox, pwLabel, _passwordBox,
            settingsHint
        });

        // -- Step checklist --
        _stepList = new ListView
        {
            View = View.Details,
            FullRowSelect = true,
            GridLines = true,
            Dock = DockStyle.Fill,
            HeaderStyle = ColumnHeaderStyle.Nonclickable
        };
        _stepList.Columns.Add("#", 30);
        _stepList.Columns.Add("Phase", 60);
        _stepList.Columns.Add("Step", 200);
        _stepList.Columns.Add("Status", 80);
        _stepList.Columns.Add("Details", 360);

        foreach (var step in _service.Steps)
        {
            var item = new ListViewItem(step.Number.ToString());
            item.SubItems.Add(step.Phase.ToString());
            item.SubItems.Add(step.Name);
            item.SubItems.Add("Pending");
            item.SubItems.Add(step.Description);
            _stepList.Items.Add(item);
        }
        _stepList.DoubleClick += OnStepDoubleClick;

        // -- Log panel --
        _logBox = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Dock = DockStyle.Bottom,
            Height = 200,
            Font = new Font("Consolas", 9)
        };

        // -- Action bar --
        var actionBar = new Panel { Dock = DockStyle.Bottom, Height = 44, Padding = new Padding(8, 4, 8, 4) };

        _checkButton = new Button { Text = "Check All", Location = new Point(8, 8), Width = 100 };
        _checkButton.Click += OnCheckAll;
        _installButton = new Button { Text = "Install All", Location = new Point(116, 8), Width = 100, Enabled = false };
        _installButton.Click += OnInstallAll;
        _testButton = new Button { Text = "Test", Location = new Point(224, 8), Width = 80, Enabled = false };
        _testButton.Click += OnTest;
        _statusLabel = new Label { Text = "", AutoSize = true, Location = new Point(320, 13) };

        actionBar.Controls.AddRange(new Control[] { _checkButton, _installButton, _testButton, _statusLabel });

        // -- Layout (reverse dock order) --
        Controls.Add(_stepList);
        Controls.Add(_logBox);
        Controls.Add(actionBar);
        Controls.Add(settingsPanel);
        Controls.Add(subtitle);
        Controls.Add(header);

        _service.StepStatusChanged += OnStepStatusChanged;
        _service.LogMessage += OnLogMessage;

        ApplyRootValidity();
    }

    // ---------------- Settings field handlers ----------------

    private void OnRootChanged(object? sender, EventArgs e)
    {
        _service.SetClaudeWebRoot(_rootBox.Text.Trim());
        ApplyRootValidity();
    }

    private void OnPortChanged(object? sender, EventArgs e)
    {
        if (int.TryParse(_portBox.Text.Trim(), out int port) && port is > 0 and <= 65535)
        {
            _service.SetPort(port);
            _portBox.ForeColor = SystemColors.WindowText;
        }
        else
        {
            _portBox.ForeColor = Color.Red;
        }
    }

    private void ApplyRootValidity()
    {
        bool valid = _service.IsValidClaudeWebRoot;
        _checkButton.Enabled = valid;
        if (!valid)
        {
            _installButton.Enabled = false;
            _testButton.Enabled = false;
            _statusLabel.Text = "Select a valid Claude Web folder (must contain ClaudeWeb.sln).";
            _statusLabel.ForeColor = Color.Firebrick;
        }
        else
        {
            _statusLabel.Text = "Ready. Press 'Check All' to run diagnostics.";
            _statusLabel.ForeColor = SystemColors.ControlText;
        }
    }

    private void BrowseFolder(string description, TextBox target)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = description,
            UseDescriptionForTitle = true
        };
        if (Directory.Exists(target.Text)) dialog.SelectedPath = target.Text;
        if (dialog.ShowDialog() == DialogResult.OK)
            target.Text = dialog.SelectedPath;
    }

    // ---------------- Action handlers ----------------

    private async void OnCheckAll(object? sender, EventArgs e)
    {
        SetButtonsEnabled(false);
        _statusLabel.Text = "Checking...";
        _statusLabel.ForeColor = SystemColors.ControlText;
        _cts = new CancellationTokenSource();

        try { await _service.CheckAllAsync(_cts.Token); }
        catch (Exception ex) { ShowErrorDialog("Check All failed", ex.ToString()); }

        UpdateButtonStates();
    }

    private async void OnInstallAll(object? sender, EventArgs e)
    {
        string summary = _service.DescribePendingInstalls();
        var confirm = MessageBox.Show(
            "The following changes will be made:\n\n" + summary +
            "\n\nSettings (Working directory / Port / Access password) will be written to appsettings.json." +
            "\n\nProceed?",
            "Confirm Install",
            MessageBoxButtons.OKCancel,
            MessageBoxIcon.Question);
        if (confirm != DialogResult.OK) return;

        SetButtonsEnabled(false);
        _statusLabel.Text = "Installing...";
        _statusLabel.ForeColor = SystemColors.ControlText;
        _cts = new CancellationTokenSource();

        try { await _service.InstallAllAsync(_cts.Token); }
        catch (Exception ex) { ShowErrorDialog("Install All failed", ex.ToString()); }

        UpdateButtonStates();
    }

    private async void OnTest(object? sender, EventArgs e)
    {
        SetButtonsEnabled(false);
        _statusLabel.Text = "Testing...";
        _statusLabel.ForeColor = SystemColors.ControlText;
        _cts = new CancellationTokenSource();

        (bool success, string output) result;
        try { result = await _service.TestAsync(_cts.Token); }
        catch (Exception ex) { result = (false, ex.ToString()); }

        if (result.success)
        {
            _statusLabel.Text = "Test passed -- the app serves /api/health.";
            _statusLabel.ForeColor = Color.ForestGreen;
        }
        else
        {
            _statusLabel.Text = "Test failed -- see details.";
            _statusLabel.ForeColor = Color.Firebrick;
            ShowErrorDialog("Test Failed", result.output);
        }

        _checkButton.Enabled = true;
        _installButton.Enabled = !_service.AllStepsPassed;
        _testButton.Enabled = _service.AllChecksPassed;
    }

    private void UpdateButtonStates()
    {
        bool checksOk = _service.AllChecksPassed;
        bool allOk = _service.AllStepsPassed;
        _statusLabel.Text = allOk
            ? "All steps passed."
            : checksOk
                ? "Checks passed; some install/build steps remain."
                : "Some checks failed -- review the list and log.";
        _statusLabel.ForeColor = allOk ? Color.ForestGreen
            : checksOk ? SystemColors.ControlText : Color.Firebrick;

        _checkButton.Enabled = true;
        _installButton.Enabled = !allOk;
        _testButton.Enabled = checksOk;
    }

    private void SetButtonsEnabled(bool enabled)
    {
        _checkButton.Enabled = enabled && _service.IsValidClaudeWebRoot;
        _installButton.Enabled = enabled;
        _testButton.Enabled = enabled;
        _rootBrowse.Enabled = enabled;
        _workingDirBrowse.Enabled = enabled;
    }

    // ---------------- Event subscriptions ----------------

    private void OnStepDoubleClick(object? sender, EventArgs e)
    {
        if (_stepList.SelectedItems.Count == 0) return;
        int index = _stepList.SelectedItems[0].Index;
        if (index < 0 || index >= _service.Steps.Count) return;
        var step = _service.Steps[index];
        ShowErrorDialog($"Step {step.Number}: {step.Name}",
            $"Phase: {step.Phase}\nStatus: {step.Status}\n\nDetails:\n{step.Details}");
    }

    private void OnStepStatusChanged(int index, StepStatus status, string details)
    {
        if (InvokeRequired) { Invoke(() => OnStepStatusChanged(index, status, details)); return; }

        var item = _stepList.Items[index];
        item.SubItems[3].Text = status.ToString();
        item.SubItems[4].Text = details;
        item.BackColor = status switch
        {
            StepStatus.Ok => Color.FromArgb(220, 255, 220),
            StepStatus.Missing => Color.FromArgb(255, 220, 220),
            StepStatus.Failed => Color.FromArgb(255, 200, 200),
            StepStatus.Running or StepStatus.Warning => Color.FromArgb(255, 255, 210),
            _ => SystemColors.Window
        };
    }

    private void OnLogMessage(string message)
    {
        if (InvokeRequired) { Invoke(() => OnLogMessage(message)); return; }
        _logBox.AppendText(message + Environment.NewLine);
    }

    // ---------------- Error dialog ----------------

    private static void ShowErrorDialog(string title, string details)
    {
        var form = new Form
        {
            Text = title,
            Size = new Size(640, 440),
            StartPosition = FormStartPosition.CenterParent,
            MinimizeBox = false,
            MaximizeBox = false
        };
        var textBox = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            Dock = DockStyle.Fill,
            Font = new Font("Consolas", 9),
            Text = details,
            WordWrap = false
        };
        var copyBtn = new Button { Text = "Copy to Clipboard", Dock = DockStyle.Bottom, Height = 35 };
        copyBtn.Click += (_, _) => { Clipboard.SetText(details); copyBtn.Text = "Copied!"; };
        form.Controls.Add(textBox);
        form.Controls.Add(copyBtn);
        form.ShowDialog();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _cts?.Cancel();
            _cts?.Dispose();
        }
        base.Dispose(disposing);
    }
}
