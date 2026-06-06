using ClaudeWebInstaller.Models;
using ClaudeWebInstaller.Services;

namespace ClaudeWebInstaller;

/// <summary>
/// The Setup and Deploy window. Pure UI: it builds controls, subscribes to
/// service events, and forwards button clicks to the services. No business
/// logic lives here -- all checks/installs are in InstallerService and all
/// deploy logic is in DeployerService.
///
/// Two tabs:
///   - "Local Setup" hosts the existing installer UI (behavior unchanged).
///   - "Internet Deployment" hosts the new deployer UI, disabled until the
///     Local Setup tab's Check All has passed (InstallerService.AllChecksPassed).
/// </summary>
public class InstallerForm : Form
{
    private readonly InstallerService _service;
    private readonly DeployerService _deployer;

    // -- Local Setup controls --
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

    // -- Tabs --
    private readonly TabControl _tabs;
    private readonly TabPage _deployTab;

    // -- Deploy controls --
    private readonly TextBox _domainBox;
    private readonly TextBox _proxyPortBox;
    private readonly TextBox _siteFolderBox;
    private readonly Button _siteFolderBrowse;
    private readonly ListView _deployList;
    private readonly TextBox _deployLogBox;
    private readonly Button _deployCheckButton;
    private readonly Button _deployButton;
    private readonly Button _verifyButton;
    private readonly Label _deployStatusLabel;
    private readonly Label _deployHintLabel;
    private readonly Panel _deployPanel;

    private CancellationTokenSource? _cts;

    public InstallerForm()
    {
        Text = "Claude Web Setup & Deploy";
        Size = new Size(820, 760);
        MinimumSize = new Size(680, 600);
        StartPosition = FormStartPosition.CenterScreen;

        _service = new InstallerService(AppContext.BaseDirectory);
        _deployer = new DeployerService(_service);

        _tabs = new TabControl { Dock = DockStyle.Fill };
        var localTab = new TabPage("Local Setup");
        _deployTab = new TabPage("Internet Deployment") { Enabled = false };

        // ==================== LOCAL SETUP TAB ====================

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

        _stepList = BuildChecklist();
        foreach (var step in _service.Steps)
            AddStepRow(_stepList, step.Number, step.Phase.ToString(), step.Name, step.Description);
        _stepList.DoubleClick += OnStepDoubleClick;

        _logBox = BuildLogBox();

        var actionBar = new Panel { Dock = DockStyle.Bottom, Height = 44, Padding = new Padding(8, 4, 8, 4) };
        _checkButton = new Button { Text = "Check All", Location = new Point(8, 8), Width = 100 };
        _checkButton.Click += OnCheckAll;
        _installButton = new Button { Text = "Install All", Location = new Point(116, 8), Width = 100, Enabled = false };
        _installButton.Click += OnInstallAll;
        _testButton = new Button { Text = "Test", Location = new Point(224, 8), Width = 80, Enabled = false };
        _testButton.Click += OnTest;
        _statusLabel = new Label { Text = "", AutoSize = true, Location = new Point(320, 13) };
        actionBar.Controls.AddRange(new Control[] { _checkButton, _installButton, _testButton, _statusLabel });

        // Layout (reverse dock order) inside the Local Setup tab.
        localTab.Controls.Add(_stepList);
        localTab.Controls.Add(_logBox);
        localTab.Controls.Add(actionBar);
        localTab.Controls.Add(settingsPanel);
        localTab.Controls.Add(subtitle);
        localTab.Controls.Add(header);

        // ==================== INTERNET DEPLOYMENT TAB ====================

        var deployHeader = new Label
        {
            Text = "Internet Deployment",
            Font = new Font(Font.FontFamily, 14, FontStyle.Bold),
            Dock = DockStyle.Top, Height = 30, Padding = new Padding(8, 4, 0, 0)
        };
        var deploySubtitle = new Label
        {
            Text = "Drop the IIS reverse-proxy web.config in front of the in-session app and autostart it at logon (TLS stays IIS's job)",
            Dock = DockStyle.Top, Height = 22, Padding = new Padding(8, 0, 0, 0)
        };
        _deployHintLabel = new Label
        {
            Text = "Complete Local Setup first.",
            Dock = DockStyle.Top, Height = 20, Padding = new Padding(8, 0, 0, 0),
            ForeColor = Color.Firebrick
        };

        // _deployPanel holds everything that should grey out until Local Setup passes.
        _deployPanel = new Panel { Dock = DockStyle.Fill, Enabled = false };

        var deploySettings = new Panel { Dock = DockStyle.Top, Height = 132, Padding = new Padding(8, 4, 8, 4) };
        int dy = 8;

        var siteFolderLabel = new Label { Text = "IIS site folder:", AutoSize = true, Location = new Point(labelX, dy + 3) };
        _siteFolderBox = new TextBox
        {
            Location = new Point(fieldX, dy), Width = fieldW, Text = _deployer.SiteWebConfigFolder,
            PlaceholderText = "Physical path of the operator's IIS site (web.config target)"
        };
        _siteFolderBox.TextChanged += OnDeployFieldChanged;
        _siteFolderBrowse = new Button { Text = "Browse...", Location = new Point(browseX, dy - 1), Width = browseW };
        _siteFolderBrowse.Click += (_, _) => BrowseFolder("Select the operator's IIS site folder (web.config target)", _siteFolderBox);

        dy += 32;
        var proxyPortLabel = new Label { Text = "Backend port:", AutoSize = true, Location = new Point(labelX, dy + 3) };
        _proxyPortBox = new TextBox { Location = new Point(fieldX, dy), Width = 80, Text = _deployer.ProxyPort.ToString() };
        _proxyPortBox.TextChanged += OnDeployFieldChanged;

        dy += 32;
        var domainLabel = new Label { Text = "Public domain (optional):", AutoSize = true, Location = new Point(labelX, dy + 3) };
        _domainBox = new TextBox
        {
            Location = new Point(fieldX, dy), Width = fieldW, Text = _deployer.Domain,
            PlaceholderText = "claudeweb.example.com  (only used for the public health verify)"
        };
        _domainBox.TextChanged += OnDeployFieldChanged;

        dy += 34;
        var deploySettingsHint = new Label
        {
            Text = "IIS owns TLS and the public domain. Provide the IIS site folder + backend port to enable Deploy All; " +
                   "the public domain is optional and only used to verify https://<domain>/api/health. " +
                   "Settings persist to settings.json (Deploy section).",
            AutoSize = true, ForeColor = SystemColors.GrayText, Location = new Point(labelX, dy),
            MaximumSize = new Size(fieldW + 200, 0)
        };

        deploySettings.Controls.AddRange(new Control[]
        {
            siteFolderLabel, _siteFolderBox, _siteFolderBrowse,
            proxyPortLabel, _proxyPortBox,
            domainLabel, _domainBox,
            deploySettingsHint
        });

        _deployList = BuildChecklist();
        foreach (var step in _deployer.Steps)
            AddStepRow(_deployList, step.Number, step.Phase.ToString(), step.Name, step.Description);
        _deployList.DoubleClick += OnDeployStepDoubleClick;

        _deployLogBox = BuildLogBox();

        var deployActionBar = new Panel { Dock = DockStyle.Bottom, Height = 44, Padding = new Padding(8, 4, 8, 4) };
        _deployCheckButton = new Button { Text = "Check All", Location = new Point(8, 8), Width = 100 };
        _deployCheckButton.Click += OnDeployCheckAll;
        _deployButton = new Button { Text = "Deploy All", Location = new Point(116, 8), Width = 100, Enabled = false };
        _deployButton.Click += OnDeployAll;
        _verifyButton = new Button { Text = "Verify", Location = new Point(224, 8), Width = 80 };
        _verifyButton.Click += OnVerify;
        _deployStatusLabel = new Label { Text = "", AutoSize = true, Location = new Point(320, 13) };
        deployActionBar.Controls.AddRange(new Control[]
        {
            _deployCheckButton, _deployButton, _verifyButton, _deployStatusLabel
        });

        _deployPanel.Controls.Add(_deployList);
        _deployPanel.Controls.Add(_deployLogBox);
        _deployPanel.Controls.Add(deployActionBar);
        _deployPanel.Controls.Add(deploySettings);

        _deployTab.Controls.Add(_deployPanel);
        _deployTab.Controls.Add(_deployHintLabel);
        _deployTab.Controls.Add(deploySubtitle);
        _deployTab.Controls.Add(deployHeader);

        // ==================== ASSEMBLE ====================

        _tabs.TabPages.Add(localTab);
        _tabs.TabPages.Add(_deployTab);
        Controls.Add(_tabs);

        _service.StepStatusChanged += OnStepStatusChanged;
        _service.LogMessage += OnLogMessage;
        _deployer.StepStatusChanged += OnDeployStepStatusChanged;
        _deployer.LogMessage += OnDeployLogMessage;

        ApplyRootValidity();
        UpdateDeployButtonStates();
    }

    // ---------------- Shared UI builders ----------------

    private static ListView BuildChecklist()
    {
        var list = new ListView
        {
            View = View.Details,
            FullRowSelect = true,
            GridLines = true,
            Dock = DockStyle.Fill,
            HeaderStyle = ColumnHeaderStyle.Nonclickable
        };
        list.Columns.Add("#", 30);
        list.Columns.Add("Phase", 80);
        list.Columns.Add("Step", 200);
        list.Columns.Add("Status", 80);
        list.Columns.Add("Details", 380);
        return list;
    }

    private static void AddStepRow(ListView list, int number, string phase, string name, string description)
    {
        var item = new ListViewItem(number.ToString());
        item.SubItems.Add(phase);
        item.SubItems.Add(name);
        item.SubItems.Add("Pending");
        item.SubItems.Add(description);
        list.Items.Add(item);
    }

    private static TextBox BuildLogBox() => new()
    {
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical,
        Dock = DockStyle.Bottom,
        Height = 200,
        Font = new Font("Consolas", 9)
    };

    // ---------------- Local Setup field handlers ----------------

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

    // ---------------- Local Setup action handlers ----------------

    private async void OnCheckAll(object? sender, EventArgs e)
    {
        SetButtonsEnabled(false);
        _statusLabel.Text = "Checking...";
        _statusLabel.ForeColor = SystemColors.ControlText;
        _cts = new CancellationTokenSource();

        try { await _service.CheckAllAsync(_cts.Token); }
        catch (Exception ex) { ShowErrorDialog("Check All failed", ex.ToString()); }

        UpdateButtonStates();
        UpdateDeployGate();
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
        UpdateDeployGate();
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

    // ---------------- Deploy gate ----------------

    /// <summary>Enables the Internet Deployment tab once Local Setup checks pass.</summary>
    private void UpdateDeployGate()
    {
        bool gateOpen = _service.AllChecksPassed;
        _deployTab.Enabled = gateOpen;
        _deployPanel.Enabled = gateOpen;
        _deployHintLabel.Text = gateOpen
            ? "Local Setup checks passed -- Internet Deployment is available."
            : "Complete Local Setup first.";
        _deployHintLabel.ForeColor = gateOpen ? Color.ForestGreen : Color.Firebrick;

        // Default the proxy port to the installer's port if the user left it.
        if (gateOpen && string.IsNullOrWhiteSpace(_proxyPortBox.Text))
            _proxyPortBox.Text = _service.Port.ToString();

        UpdateDeployButtonStates();
    }

    // ---------------- Deploy field handlers ----------------

    private void OnDeployFieldChanged(object? sender, EventArgs e)
    {
        _deployer.SetDomain(_domainBox.Text);
        _deployer.SetSiteWebConfigFolder(_siteFolderBox.Text);

        if (int.TryParse(_proxyPortBox.Text.Trim(), out int port) && port is > 0 and <= 65535)
        {
            _deployer.SetProxyPort(port);
            _proxyPortBox.ForeColor = SystemColors.WindowText;
        }
        else
        {
            _proxyPortBox.ForeColor = Color.Red;
        }

        UpdateDeployButtonStates();
    }

    private void UpdateDeployButtonStates()
    {
        _deployButton.Enabled = _deployTab.Enabled && _deployer.CanDeploy;
    }

    // ---------------- Deploy action handlers ----------------

    private async void OnDeployCheckAll(object? sender, EventArgs e)
    {
        SetDeployButtonsEnabled(false);
        _deployStatusLabel.Text = "Checking...";
        _deployStatusLabel.ForeColor = SystemColors.ControlText;
        _cts = new CancellationTokenSource();

        try { await _deployer.CheckAllAsync(_cts.Token); }
        catch (Exception ex) { ShowErrorDialog("Deploy Check All failed", ex.ToString()); }

        UpdateDeployStatusAfterRun();
    }

    private async void OnDeployAll(object? sender, EventArgs e)
    {
        if (!DeployerService.IsAdministrator())
        {
            var go = MessageBox.Show(
                "This program is NOT running as Administrator.\n\n" +
                "The firewall and web.config (ARR) steps will be skipped or marked Failed.\n" +
                "To write web.config into the IIS site folder, close and relaunch as Administrator.\n\n" +
                "Continue anyway (autostart + checks only)?",
                "Administrator required for IIS",
                MessageBoxButtons.OKCancel, MessageBoxIcon.Warning);
            if (go != DialogResult.OK) return;
        }

        var confirm = MessageBox.Show(
            "The following will be configured:\n\n" + _deployer.DescribePendingDeploys() +
            "\n\nProceed?",
            "Confirm Deploy",
            MessageBoxButtons.OKCancel, MessageBoxIcon.Question);
        if (confirm != DialogResult.OK) return;

        SetDeployButtonsEnabled(false);
        _deployStatusLabel.Text = "Deploying...";
        _deployStatusLabel.ForeColor = SystemColors.ControlText;
        _cts = new CancellationTokenSource();

        try { await _deployer.DeployAllAsync(_cts.Token); }
        catch (Exception ex) { ShowErrorDialog("Deploy All failed", ex.ToString()); }

        UpdateDeployStatusAfterRun();
    }

    private async void OnVerify(object? sender, EventArgs e)
    {
        SetDeployButtonsEnabled(false);
        _deployStatusLabel.Text = "Verifying...";
        _deployStatusLabel.ForeColor = SystemColors.ControlText;
        _cts = new CancellationTokenSource();

        try { await _deployer.VerifyAsync(_cts.Token); }
        catch (Exception ex) { ShowErrorDialog("Verify failed", ex.ToString()); }

        var verifySteps = _deployer.Steps.Where(s => s.Phase == DeployPhase.Verify).ToList();
        bool ok = verifySteps.All(s => s.Status is StepStatus.Ok or StepStatus.Warning);
        if (ok)
        {
            _deployStatusLabel.Text = "Verify passed -- public health check OK.";
            _deployStatusLabel.ForeColor = Color.ForestGreen;
        }
        else
        {
            _deployStatusLabel.Text = "Verify failed -- see details (double-click a row).";
            _deployStatusLabel.ForeColor = Color.Firebrick;
            var failed = verifySteps.FirstOrDefault(s => s.Status == StepStatus.Failed);
            if (failed != null)
                ShowErrorDialog($"Verify: {failed.Name}", failed.Details);
        }
        SetDeployButtonsEnabled(true);
    }

    private void UpdateDeployStatusAfterRun()
    {
        bool preflight = _deployer.PreFlightPassed;
        bool allOk = _deployer.Steps.All(s => s.Status is StepStatus.Ok or StepStatus.Warning);
        _deployStatusLabel.Text = allOk
            ? "Deployment complete -- all steps OK."
            : preflight
                ? "Pre-flight OK; some deploy steps remain (see list)."
                : "Pre-flight failed -- resolve the red rows first.";
        _deployStatusLabel.ForeColor = allOk ? Color.ForestGreen
            : preflight ? SystemColors.ControlText : Color.Firebrick;
        SetDeployButtonsEnabled(true);
    }

    private void SetDeployButtonsEnabled(bool enabled)
    {
        _deployCheckButton.Enabled = enabled;
        _deployButton.Enabled = enabled && _deployer.CanDeploy;
        _verifyButton.Enabled = enabled;
        _siteFolderBrowse.Enabled = enabled;
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

    private void OnDeployStepDoubleClick(object? sender, EventArgs e)
    {
        if (_deployList.SelectedItems.Count == 0) return;
        int index = _deployList.SelectedItems[0].Index;
        if (index < 0 || index >= _deployer.Steps.Count) return;
        var step = _deployer.Steps[index];
        ShowErrorDialog($"Step {step.Number}: {step.Name}",
            $"Phase: {step.Phase}\nStatus: {step.Status}\n\nDetails:\n{step.Details}");
    }

    private void OnStepStatusChanged(int index, StepStatus status, string details)
        => UpdateRow(_stepList, index, status, details);

    private void OnDeployStepStatusChanged(int index, StepStatus status, string details)
        => UpdateRow(_deployList, index, status, details);

    private void UpdateRow(ListView list, int index, StepStatus status, string details)
    {
        if (InvokeRequired) { Invoke(() => UpdateRow(list, index, status, details)); return; }

        var item = list.Items[index];
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

    private void OnLogMessage(string message) => AppendLog(_logBox, message);
    private void OnDeployLogMessage(string message) => AppendLog(_deployLogBox, message);

    private void AppendLog(TextBox box, string message)
    {
        if (InvokeRequired) { Invoke(() => AppendLog(box, message)); return; }
        box.AppendText(message + Environment.NewLine);
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
