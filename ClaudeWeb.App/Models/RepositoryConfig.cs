namespace ClaudeWeb.Models;

/// <summary>
/// One repository the operator has made available. Clients reference a repo by
/// its stable <see cref="Id"/> (sent in the X-Repo-Id header); the server maps
/// that id to a trusted <see cref="Path"/> on disk. Clients never send paths,
/// so a client cannot point Claude or the file browser at an arbitrary folder.
/// </summary>
public class RepositoryConfig
{
    /// <summary>Stable identifier (GUID string). Survives renames and path moves.</summary>
    public string Id { get; set; } = "";

    /// <summary>Friendly name shown in the picker. Defaults to the folder name.</summary>
    public string Name { get; set; } = "";

    /// <summary>Absolute path to the repository folder Claude operates in.</summary>
    public string Path { get; set; } = "";

    /// <summary>
    /// True for the harness's own source repository (pinned at startup). It is
    /// non-removable and serves as the default project, so "improve this app" is
    /// always one selection away.
    /// </summary>
    public bool IsSelf { get; set; }

    /// <summary>
    /// Per-project UI-mode visibility (plans/project-visibility.md):
    /// "basic" = listed in both Basic and Advanced mode, "advanced" = listed in
    /// Advanced mode only. Defaults to "advanced", so entries predating this
    /// field (absent in repositories.json) load as advanced-only.
    /// </summary>
    public string Visibility { get; set; } = "advanced";

    /// <summary>
    /// LEGACY single Local-tab port (plans/local-app-tab.md). Superseded by
    /// <see cref="LocalApps"/> (plans/multiple-local-apps.md): a repo may now
    /// expose several local apps. Kept for back-compat — when LocalApps is empty
    /// but this is set, the registry reads it as one app, and mutating the app
    /// list migrates it into LocalApps and clears this. Null = not set.
    /// </summary>
    public int? LocalPort { get; set; }

    /// <summary>
    /// The local apps this repo exposes on the Local tab, each on its own port
    /// (plans/multiple-local-apps.md). The first is the default (what the bare
    /// <c>/api/localview/{repoId}/</c> proxy and the Exposure check target).
    /// Empty = none (or, for an un-migrated entry, see <see cref="LocalPort"/>).
    /// </summary>
    public List<LocalAppConfig> LocalApps { get; set; } = new();

    /// <summary>
    /// Per-project permission preset for this repo's chat <c>claude -p</c> calls
    /// (openspec add-per-project-claude-permissions): "readonly" | "standard" |
    /// "full". Null/absent ⇒ Read-only — the SAFE DEFAULT — so both existing
    /// entries and freshly-added projects are read-only until the Operator opts
    /// them up in the desktop app. Set only from the WinForms GUI; the web reads
    /// but never mutates it.
    /// </summary>
    public string? PermissionPolicy { get; set; }
}

/// <summary>
/// One local app a repo exposes on the Local tab (plans/multiple-local-apps.md).
/// </summary>
public class LocalAppConfig
{
    /// <summary>Stable, URL-safe id; appears in the proxy path
    /// <c>/api/localview/{repoId}/app/{Id}/</c>.</summary>
    public string Id { get; set; } = "";

    /// <summary>Friendly label shown in the Local-tab app switcher.</summary>
    public string Name { get; set; } = "";

    /// <summary>Loopback port the harness proxy dials for this app.</summary>
    public int Port { get; set; }

    /// <summary>
    /// "repo" = a product the repo serves (started on demand); "harness" = a
    /// harness-provided, always-on app (e.g. the future Understanding app).
    /// </summary>
    public string Kind { get; set; } = "repo";
}
