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
}
