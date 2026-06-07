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
        Size = new Size(720, 420);
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
        _list.Columns.Add("Name", 160);
        _list.Columns.Add("Path", 380);
        _list.Columns.Add("Status", 120);

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

        buttonBar.Controls.Add(addButton);
        buttonBar.Controls.Add(renameButton);
        buttonBar.Controls.Add(removeButton);

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
            var item = new ListViewItem(new[] { r.Name, r.Path, status }) { Tag = r.Id };
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
