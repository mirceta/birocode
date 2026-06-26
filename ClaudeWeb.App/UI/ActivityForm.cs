using ClaudeWeb.Services.Audit;

namespace ClaudeWeb.UI;

/// <summary>
/// Operator-only, read-only view of the action audit (openspec add-action-audit):
/// what every gate-passed user did — prompts, mutating tool actions, and auth events —
/// attributed to the trusted-device / guest identity. Filter by date, kind, and user.
/// There is deliberately NO edit or delete control here, and no web surface reads this;
/// the desktop is the only reader.
/// </summary>
public class ActivityForm : Form
{
    private readonly AuditService _audit;
    private readonly ListView _list;
    private readonly ComboBox _dateBox;
    private readonly ComboBox _kindBox;
    private readonly TextBox _userFilter;

    public ActivityForm(AuditService audit)
    {
        _audit = audit;

        Text = "Activity (action audit)";
        Size = new Size(1020, 580);
        MinimumSize = new Size(760, 420);
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Color.White;

        var bar = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(8, 8, 8, 4),
            BackColor = Color.FromArgb(245, 245, 248),
        };

        _dateBox = new ComboBox { Width = 130, DropDownStyle = ComboBoxStyle.DropDownList, Margin = new Padding(4) };
        _dateBox.SelectedIndexChanged += (_, _) => Refresh_();

        _kindBox = new ComboBox { Width = 110, DropDownStyle = ComboBoxStyle.DropDownList, Margin = new Padding(4) };
        _kindBox.Items.AddRange(new object[] { "all kinds", "prompt", "tool", "auth" });
        _kindBox.SelectedIndex = 0;
        _kindBox.SelectedIndexChanged += (_, _) => Refresh_();

        _userFilter = new TextBox { Width = 180, Margin = new Padding(4), PlaceholderText = "filter by user…" };
        _userFilter.TextChanged += (_, _) => Refresh_();

        var refresh = new Button { Text = "Refresh", Width = 90, Height = 26, Margin = new Padding(4), FlatStyle = FlatStyle.System, Cursor = Cursors.Hand };
        refresh.Click += (_, _) => { LoadDates(); Refresh_(); };

        bar.Controls.Add(new Label { Text = "Date:", AutoSize = true, Margin = new Padding(4, 9, 0, 0) });
        bar.Controls.Add(_dateBox);
        bar.Controls.Add(_kindBox);
        bar.Controls.Add(_userFilter);
        bar.Controls.Add(refresh);

        _list = new ListView
        {
            Dock = DockStyle.Fill,
            View = View.Details,
            FullRowSelect = true,
            MultiSelect = false,
            HideSelection = false,
            Font = new Font("Segoe UI", 9f),
        };
        _list.Columns.Add("Time", 90);
        _list.Columns.Add("Actor", 150);
        _list.Columns.Add("Kind", 60);
        _list.Columns.Add("Project", 130);
        _list.Columns.Add("Detail", 540);

        Controls.Add(_list);
        Controls.Add(bar);

        LoadDates();
        Refresh_();
    }

    private void LoadDates()
    {
        var prev = _dateBox.SelectedItem as string;
        _dateBox.Items.Clear();
        foreach (var d in _audit.AvailableDates())
            _dateBox.Items.Add(d.ToString("yyyy-MM-dd"));
        if (_dateBox.Items.Count == 0)
            _dateBox.Items.Add(DateTime.Now.ToString("yyyy-MM-dd"));
        var idx = prev != null ? _dateBox.Items.IndexOf(prev) : 0;
        _dateBox.SelectedIndex = idx >= 0 ? idx : 0;
    }

    private void Refresh_()
    {
        if (_dateBox.SelectedItem is not string ds || !DateOnly.TryParse(ds, out var day)) return;
        var kind = _kindBox.SelectedIndex <= 0 ? null : (string)_kindBox.SelectedItem!;
        var user = _userFilter.Text.Trim();

        var entries = _audit.ReadDay(day)
            .Where(e => kind == null || string.Equals(e.Kind, kind, StringComparison.OrdinalIgnoreCase))
            .Where(e => user.Length == 0 || (e.Actor?.Contains(user, StringComparison.OrdinalIgnoreCase) ?? false));

        _list.BeginUpdate();
        _list.Items.Clear();
        foreach (var e in entries)
        {
            var item = new ListViewItem(new[]
            {
                e.Ts.ToLocalTime().ToString("HH:mm:ss"),
                e.Actor ?? "",
                e.Kind,
                e.Repo ?? "",
                Detail(e),
            });
            if (e.Kind == "auth") item.ForeColor = Color.FromArgb(40, 90, 160);
            else if (e.Kind == "tool") item.ForeColor = Color.FromArgb(120, 70, 0);
            _list.Items.Add(item);
        }
        _list.EndUpdate();
    }

    private static string Detail(AuditEntry e) => e.Kind switch
    {
        "prompt" => e.Text ?? "",
        "tool" => string.IsNullOrEmpty(e.Args) ? (e.Tool ?? "") : $"{e.Tool}: {e.Args}",
        "auth" => string.IsNullOrEmpty(e.Args) ? (e.Event ?? "") : $"{e.Event} — {e.Args}",
        _ => "",
    };
}
