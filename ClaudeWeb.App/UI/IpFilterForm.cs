using ClaudeWeb.Services.IpFilter;

namespace ClaudeWeb.UI;

/// <summary>
/// Operator dialog for the IP allowlist (plans/auth-ip-filter.md). This is
/// the ONLY surface in the whole system that can APPROVE an IP — the web UI
/// can merely view and unlist. Left: approved, named guests with last-access
/// times. Right: connection attempts from unapproved IPs, from which the
/// Operator names and approves a guest. Removal takes effect immediately
/// (live connections from that IP are aborted).
///
/// Backed by the shared <see cref="IpAllowlistService"/>; refreshes live via
/// its Changed event while the dialog is open.
/// </summary>
public class IpFilterForm : Form
{
    private readonly IpAllowlistService _allowlist;
    private readonly ListView _guests;
    private readonly ListView _attempts;

    public IpFilterForm(IpAllowlistService allowlist)
    {
        _allowlist = allowlist;

        Text = "Guests (IP allowlist)";
        Size = new Size(900, 460);
        MinimumSize = new Size(700, 340);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.White;

        _guests = MakeList();
        _guests.Columns.Add("Name", 150);
        _guests.Columns.Add("IP", 130);
        _guests.Columns.Add("Last access", 130);
        _guests.Columns.Add("Approved", 130);

        _attempts = MakeList();
        _attempts.Columns.Add("IP", 130);
        _attempts.Columns.Add("Attempts", 70, HorizontalAlignment.Right);
        _attempts.Columns.Add("Last attempt", 130);

        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            SplitterWidth = 5,
        };
        split.Panel1.Controls.Add(_guests);
        split.Panel1.Controls.Add(MakeCaption("  Approved guests"));
        split.Panel2.Controls.Add(_attempts);
        split.Panel2.Controls.Add(MakeCaption("  Connection attempts (not approved)"));

        var buttonBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.LeftToRight,
            Height = 48,
            Padding = new Padding(8),
            BackColor = Color.FromArgb(245, 245, 248),
        };

        var approveAttempt = MakeButton("Approve attempt...", 130);
        approveAttempt.Click += OnApproveAttempt;
        var approveManual = MakeButton("Approve IP...", 110);
        approveManual.Click += OnApproveManual;
        var removeGuest = MakeButton("Remove guest", 110);
        removeGuest.Click += OnRemoveGuest;
        var clearAttempts = MakeButton("Clear attempts", 110);
        clearAttempts.Click += OnClearAttempts;

        buttonBar.Controls.Add(approveAttempt);
        buttonBar.Controls.Add(approveManual);
        buttonBar.Controls.Add(removeGuest);
        buttonBar.Controls.Add(clearAttempts);

        Controls.Add(split);
        Controls.Add(buttonBar);

        Load += (_, _) => split.SplitterDistance = Math.Max(300, Width / 2);

        _allowlist.Changed += OnAllowlistChanged;
        FormClosed += (_, _) => _allowlist.Changed -= OnAllowlistChanged;

        RefreshLists();
    }

    private static ListView MakeList() => new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        MultiSelect = false,
        HideSelection = false,
        Font = new Font("Segoe UI", 9f),
    };

    private static Label MakeCaption(string text) => new()
    {
        Text = text,
        Dock = DockStyle.Top,
        Height = 22,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Color.FromArgb(60, 70, 80),
        BackColor = Color.FromArgb(245, 245, 248),
        TextAlign = ContentAlignment.MiddleLeft,
    };

    private static Button MakeButton(string text, int width) => new()
    {
        Text = text,
        Size = new Size(width, 30),
        FlatStyle = FlatStyle.System,
        Margin = new Padding(4),
        Cursor = Cursors.Hand,
    };

    private void OnAllowlistChanged()
    {
        // May fire on Kestrel request threads (e.g. a knock landing while
        // the dialog is open) — marshal to the UI thread.
        if (IsDisposed) return;
        if (InvokeRequired)
            try { BeginInvoke(RefreshLists); } catch { }
        else
            RefreshLists();
    }

    private void RefreshLists()
    {
        var (guests, attempts) = _allowlist.Snapshot();

        _guests.BeginUpdate();
        _guests.Items.Clear();
        foreach (var g in guests)
            _guests.Items.Add(new ListViewItem(new[]
            {
                g.Name, g.Ip, Local(g.LastAccessUtc), Local(g.AddedUtc),
            })
            { Tag = g.Ip });
        _guests.EndUpdate();

        _attempts.BeginUpdate();
        _attempts.Items.Clear();
        foreach (var a in attempts)
            _attempts.Items.Add(new ListViewItem(new[]
            {
                a.Ip, a.Count.ToString(), Local(a.LastUtc),
            })
            { Tag = a.Ip });
        _attempts.EndUpdate();
    }

    private static string Local(DateTime? utc) =>
        utc is null ? "never" : utc.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");

    private void OnApproveAttempt(object? sender, EventArgs e)
    {
        if (_attempts.SelectedItems.Count == 0)
        {
            MessageBox.Show(this, "Select a connection attempt first.", "Approve attempt",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        ApproveFlow((string)_attempts.SelectedItems[0].Tag!);
    }

    private void OnApproveManual(object? sender, EventArgs e)
    {
        var ip = Prompt("Approve IP", "Exact IP address (no ranges):", "");
        if (string.IsNullOrWhiteSpace(ip)) return;
        ApproveFlow(ip.Trim());
    }

    private void ApproveFlow(string ip)
    {
        var name = Prompt("Approve IP", $"Name for {ip} (e.g. \"Mom's phone\"):", "");
        if (string.IsNullOrWhiteSpace(name)) return;

        if (_allowlist.Approve(ip, name) is { } error)
            MessageBox.Show(this, error, "Could not approve",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }

    private void OnRemoveGuest(object? sender, EventArgs e)
    {
        if (_guests.SelectedItems.Count == 0) return;
        var item = _guests.SelectedItems[0];
        var name = item.SubItems[0].Text;
        var ip = (string)item.Tag!;

        var confirm = MessageBox.Show(this,
            $"Remove \"{name}\" ({ip}) from the guest list?\n\nTakes effect IMMEDIATELY: live connections from this IP are terminated and every further request is rejected.",
            "Remove guest", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
        if (confirm != DialogResult.Yes) return;

        _allowlist.Remove(ip);
    }

    private void OnClearAttempts(object? sender, EventArgs e)
    {
        if (_attempts.Items.Count == 0) return;
        var confirm = MessageBox.Show(this,
            "Clear the connection-attempt log?",
            "Clear attempts", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (confirm == DialogResult.Yes)
            _allowlist.ClearAttempts();
    }

    /// <summary>Minimal single-line text prompt (same as RepositoriesForm's).</summary>
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
