using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.UI;

/// <summary>
/// Operator dialog for managing the repositories the app serves. The phone user
/// only picks from this list (over the web); adding/removing happens here, on
/// the host. Backed by the shared <see cref="RepositoryRegistry"/>, which
/// persists every change immediately.
/// </summary>
public class RepositoriesForm : Form
{
    private readonly RepositoryRegistry _registry;
    private readonly ListView _list;

    public RepositoriesForm(RepositoryRegistry registry)
    {
        _registry = registry;

        Text = "Repositories";
        Size = new Size(800, 420);
        MinimumSize = new Size(560, 320);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.White;

        _list = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = false,
            Font = new Font("Segoe UI", 9f),
        };
        _list.Columns.Add("Name", 150);
        _list.Columns.Add("Path", 340);
        _list.Columns.Add("Status", 110);
        _list.Columns.Add("Chat permissions", 160);

        var buttonBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.LeftToRight,
            Height = 48,
            Padding = new Padding(8),
            BackColor = Color.FromArgb(245, 245, 248),
        };

        var addButton = MakeButton("Add...");
        addButton.Click += OnAdd;
        var renameButton = MakeButton("Rename...");
        renameButton.Click += OnRename;
        var removeButton = MakeButton("Remove");
        removeButton.Click += OnRemove;
        var permsButton = MakeButton("Permissions...");
        permsButton.Click += OnPermissions;

        buttonBar.Controls.Add(addButton);
        buttonBar.Controls.Add(renameButton);
        buttonBar.Controls.Add(removeButton);
        buttonBar.Controls.Add(permsButton);

        Controls.Add(_list);
        Controls.Add(buttonBar);

        Refresh_();
    }

    private static Button MakeButton(string text) => new()
    {
        Text = text,
        Size = new Size(100, 30),
        FlatStyle = FlatStyle.System,
        Margin = new Padding(4),
        Cursor = Cursors.Hand,
    };

    private void Refresh_()
    {
        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var r in _registry.GetAll())
        {
            var status = !r.Exists ? "Missing" : r.IsGitRepo ? "Git repo" : "Not a git repo";
            var item = new ListViewItem(new[] { r.Name, r.Path, status, PresetLabel(r.PermissionPolicy) }) { Tag = r.Id };
            if (!r.Exists)
                item.ForeColor = Color.FromArgb(180, 60, 60);
            else if (!r.IsGitRepo)
                item.ForeColor = Color.FromArgb(160, 120, 0);
            _list.Items.Add(item);
        }
        _list.EndUpdate();
    }

    private string? SelectedId() =>
        _list.SelectedItems.Count > 0 ? _list.SelectedItems[0].Tag as string : null;

    private void OnAdd(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Select a repository folder Claude can operate in",
            ShowNewFolderButton = true,
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        try
        {
            var info = _registry.Add(dialog.SelectedPath);
            Refresh_();
            if (!info.IsGitRepo)
                MessageBox.Show(this,
                    $"Added \"{info.Name}\".\n\nNote: this folder is not a git repository, so Save / History will not work until you run 'git init' there.",
                    "Repository added", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Could not add repository",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void OnRename(object? sender, EventArgs e)
    {
        var id = SelectedId();
        if (id is null) return;

        var current = _list.SelectedItems[0].SubItems[0].Text;
        var name = Prompt("Rename repository", "New name:", current);
        if (string.IsNullOrWhiteSpace(name)) return;

        _registry.Rename(id, name);
        Refresh_();
    }

    private void OnRemove(object? sender, EventArgs e)
    {
        var id = SelectedId();
        if (id is null) return;

        var name = _list.SelectedItems[0].SubItems[0].Text;
        var confirm = MessageBox.Show(this,
            $"Remove \"{name}\" from the list?\n\nThe folder and its files are NOT deleted -- it just stops being available in the app.",
            "Remove repository", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (confirm != DialogResult.Yes) return;

        _registry.Remove(id);
        Refresh_();
    }

    // The three chat permission presets (openspec add-per-project-claude-permissions),
    // operator-set per project. value <-> label.
    private static readonly (string Value, string Label)[] Presets =
    {
        ("readonly", "Read-only (safe default)"),
        ("editonly", "Edit-only (repo, no exec)"),
        ("standard", "Standard"),
        ("full",     "Full access"),
    };

    private static string PresetLabel(string? policy)
    {
        var v = RepositoryRegistry.NormalizePolicy(policy);
        foreach (var p in Presets)
            if (p.Value == v) return p.Label;
        return Presets[0].Label;
    }

    private void OnPermissions(object? sender, EventArgs e)
    {
        var id = SelectedId();
        if (id is null) return;

        var info = _registry.GetAll().FirstOrDefault(r => r.Id == id);
        if (info is null) return;

        var chosen = ChoosePreset(info.Name, info.PermissionPolicy);
        if (chosen is null) return;

        _registry.SetPermissionPolicy(id, chosen);
        Refresh_();
    }

    /// <summary>Modal preset chooser for the selected repo's chat permissions.
    /// Returns the chosen value ("readonly"/"standard"/"full") or null if cancelled.</summary>
    private string? ChoosePreset(string repoName, string currentPolicy)
    {
        using var form = new Form
        {
            Text = $"Chat permissions — {repoName}",
            Size = new Size(450, 240),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false,
            BackColor = Color.White,
        };

        var label = new Label
        {
            Text = "Permission scope applied to this project's chat (claude -p) calls:",
            Left = 12, Top = 14, Width = 420, Height = 20,
        };
        var combo = new ComboBox
        {
            Left = 12, Top = 40, Width = 420, DropDownStyle = ComboBoxStyle.DropDownList,
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
        };
        foreach (var p in Presets) combo.Items.Add(p.Label);
        var cur = RepositoryRegistry.NormalizePolicy(currentPolicy);
        var idx = Array.FindIndex(Presets, p => p.Value == cur);
        combo.SelectedIndex = idx >= 0 ? idx : 0;

        var note = new Label
        {
            Text = "Read-only blocks edits and commands. Edit-only lets the agent edit this repo "
                 + "but run no scripts/exes and reach no network. Standard allows in-repo development "
                 + "but denies destructive/exfiltration actions. Full applies no added restriction. "
                 + "Set here only — the web UI cannot change it.",
            Left = 12, Top = 74, Width = 420, Height = 70,
            ForeColor = Color.FromArgb(110, 110, 120),
        };
        var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Left = 262, Top = 162, Width = 75, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Left = 347, Top = 162, Width = 75, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };

        form.Controls.AddRange(new Control[] { label, combo, note, ok, cancel });
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        return form.ShowDialog(this) == DialogResult.OK ? Presets[combo.SelectedIndex].Value : null;
    }

    /// <summary>Minimal single-line text prompt (WinForms has no built-in InputBox).</summary>
    private string? Prompt(string title, string label, string initial)
    {
        using var form = new Form
        {
            Text = title,
            Size = new Size(420, 160),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false,
            BackColor = Color.White,
        };

        var prompt = new Label { Text = label, Left = 12, Top = 12, AutoSize = true };
        var input = new TextBox { Text = initial, Left = 12, Top = 38, Width = 380, Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
        var ok = new Button { Text = "OK", DialogResult = DialogResult.OK, Left = 232, Top = 78, Width = 75, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Left = 317, Top = 78, Width = 75, Anchor = AnchorStyles.Bottom | AnchorStyles.Right };

        form.Controls.AddRange(new Control[] { prompt, input, ok, cancel });
        form.AcceptButton = ok;
        form.CancelButton = cancel;

        return form.ShowDialog(this) == DialogResult.OK ? input.Text.Trim() : null;
    }
}
