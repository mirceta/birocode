using System.Text;
using ClaudeWeb.Services.HubFs;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// A repo agent's side of the hub file system (openspec hub-file-system): <c>hub_upload</c>,
/// <c>hub_download</c>, <c>hub_files</c> against THIS harness's store. Local paths are always
/// inside the agent's own repo folder — an upload reads a file under the repo, a download
/// writes under it (<c>hub-downloads/</c> by default) — and the hub path grammar is the
/// store's; so neither side of a transfer can reach outside its sandbox. Who uploaded is the
/// agent's handle, from which machine the harness's label, so the arch can name the file to
/// another agent and the File System tab can show its provenance.
/// </summary>
public sealed partial class RepoAgentToolbox
{
    public const string DownloadFolder = "hub-downloads";

    private static (string? Full, string? Error) LocalPathUnder(string repoPath, string? localPath, string what)
    {
        if (string.IsNullOrWhiteSpace(localPath)) return (null, $"{what} is required: a path relative to your repo folder");
        var rel = localPath.Trim();
        if (Path.IsPathRooted(rel) || rel.Contains(':')) return (null, $"{what} must be relative to your repo folder ({repoPath}), not absolute");
        string full;
        try { full = Path.GetFullPath(Path.Combine(repoPath, rel)); } catch (Exception ex) { return (null, $"{what}: {ex.Message}"); }
        var root = Path.GetFullPath(repoPath).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return (null, $"{what} leaves your repo folder — only files under {repoPath} can be moved");
        return (full, null);
    }

    private object FileView(HubFileStore.Entry e, string machine) => new
    {
        machine, path = e.Path, size = e.Size, sizeHuman = HubFileStore.Human(e.Size), sha256 = e.Sha256, contentType = e.ContentType,
        uploadedBy = e.UploadedBy, uploadedFrom = e.Machine, uploadedAt = e.UploadedAt, updatedAt = e.UpdatedAt, version = e.Version, note = e.Note, via = e.Via,
    };

    /// <summary>Upload a file from the repo (or a text) to the hub store at <paramref name="path"/>.</summary>
    public ToolOutcome HubUpload(string? repoId, string? path, string? localPath, string? text, string? note, bool overwrite = false)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.HubFiles is null) return new ToolOutcome(false, "unavailable", "hub_upload is not available on this harness (no hub file store)");
        var repo = env.Repo(repoId);
        if (repo is null) return new ToolOutcome(false, "error", $"unknown repo {repoId}");
        var norm = HubFileStore.Normalize(path, out var perr);
        if (norm is null) return new ToolOutcome(false, "error", "path: " + perr);
        byte[] bytes;
        string source;
        if (!string.IsNullOrWhiteSpace(localPath))
        {
            var (full, lerr) = LocalPathUnder(repo.Path, localPath, "localPath");
            if (full is null) return new ToolOutcome(false, "error", lerr!);
            if (Directory.Exists(full)) return new ToolOutcome(false, "error", $"{localPath} is a folder — upload one file at a time (zip a folder first, or upload its files one by one under a common hub prefix)");
            if (!File.Exists(full)) return new ToolOutcome(false, "error", $"no file {localPath} under your repo folder");
            var len = new FileInfo(full).Length;
            if (len > HubFileStore.MaxFileBytes) return new ToolOutcome(false, "error", $"{localPath} is {HubFileStore.Human(len)}; the hub takes files up to {HubFileStore.Human(HubFileStore.MaxFileBytes)}");
            try { bytes = File.ReadAllBytes(full); } catch (Exception ex) { return new ToolOutcome(false, "error", $"could not read {localPath}: {ex.Message}"); }
            source = localPath.Trim();
        }
        else if (text is not null)
        {
            bytes = Encoding.UTF8.GetBytes(text);
            source = "text";
        }
        else return new ToolOutcome(false, "error", "give localPath (a file under your repo folder) or text (the content to store)");
        var by = _label(null, repoId);
        var (entry, err) = env.HubFiles.Put(norm, bytes, by, env.Machine, note, overwrite);
        if (entry is null) return new ToolOutcome(false, "error", err!);
        return new ToolOutcome(true, "uploaded",
            $"{norm} ({HubFileStore.Human(entry.Size)}, v{entry.Version}) is on {env.Machine}'s hub store as {by}{(source == "text" ? "" : $" from {source}")}. Tell the Operator or the arch the hub path; an agent on another machine needs the arch to hub_transfer it there first.",
            FileView(entry, env.Machine));
    }

    /// <summary>Download a hub file into the repo (<c>hub-downloads/&lt;path&gt;</c> unless <paramref name="localPath"/> says where).</summary>
    public ToolOutcome HubDownload(string? repoId, string? path, string? localPath, bool overwrite = false)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.HubFiles is null) return new ToolOutcome(false, "unavailable", "hub_download is not available on this harness (no hub file store)");
        var repo = env.Repo(repoId);
        if (repo is null) return new ToolOutcome(false, "error", $"unknown repo {repoId}");
        var norm = HubFileStore.Normalize(path, out var perr);
        if (norm is null) return new ToolOutcome(false, "error", "path: " + perr);
        var got = env.HubFiles.Get(norm);
        if (got is null)
        {
            var near = env.HubFiles.List().Select(e => e.Path).Where(p => p.Contains(Path.GetFileName(norm), StringComparison.OrdinalIgnoreCase)).Take(5).ToList();
            return new ToolOutcome(false, "not-found", $"no file {norm} on {env.Machine}'s hub store{(near.Count > 0 ? $"; similar: {string.Join(", ", near)}" : "")}. If it was uploaded on another machine, the arch must hub_transfer it to {env.Machine} first (hub_files shows what is here).");
        }
        var (entry, bytes) = got.Value;
        var target = string.IsNullOrWhiteSpace(localPath) ? Path.Combine(DownloadFolder, norm.Replace('/', Path.DirectorySeparatorChar)) : localPath.Trim();
        var (full, lerr) = LocalPathUnder(repo.Path, target, "localPath");
        if (full is null) return new ToolOutcome(false, "error", lerr!);
        if (Directory.Exists(full)) full = Path.Combine(full, Path.GetFileName(norm));
        if (File.Exists(full) && !overwrite) return new ToolOutcome(false, "exists", $"{Path.GetRelativePath(repo.Path, full)} already exists in your repo; pass overwrite to replace it");
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            File.WriteAllBytes(full, bytes);
        }
        catch (Exception ex) { return new ToolOutcome(false, "error", $"could not write {target}: {ex.Message}"); }
        var rel = Path.GetRelativePath(repo.Path, full);
        return new ToolOutcome(true, "downloaded",
            $"{norm} ({HubFileStore.Human(entry.Size)}, uploaded by {entry.UploadedBy} on {entry.Machine}, v{entry.Version}) written to {rel} in your repo",
            new { localPath = rel, fullPath = full, file = FileView(entry, env.Machine) });
    }

    /// <summary>What is on this harness's hub store (optionally under a prefix).</summary>
    public ToolOutcome HubFilesList(string? repoId, string? prefix)
    {
        var env = Environment;
        if (env?.HubFiles is null) return new ToolOutcome(false, "unavailable", "hub_files is not available on this harness (no hub file store)");
        var entries = env.HubFiles.List(prefix);
        var files = entries.Select(e => FileView(e, env.Machine)).ToList();
        var names = entries.Select(e => e.Path).ToList();
        var stats = env.HubFiles.GetStats();
        return new ToolOutcome(true, "ok",
            files.Count == 0
                ? $"nothing on {env.Machine}'s hub store{(string.IsNullOrWhiteSpace(prefix) ? "" : $" under {prefix}")}; a file uploaded on another machine gets here when the arch hub_transfers it"
                : $"{files.Count} file(s) on {env.Machine}'s hub store: {string.Join(", ", names.Take(20))}{(files.Count > 20 ? ", …" : "")}",
            new { machine = env.Machine, files, stats });
    }
}
