using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.OpenspecCockpit;

/// <summary>
/// Read-only OpenSpec state aggregation for the harness Cockpit (openspec change
/// openspec-cockpit-in-harness). A C# port of the proven aggregation in
/// <c>openspec-port-app/serve.mjs</c>, but bound to a working directory supplied
/// per-call by the controller (resolved from the SELECTED repository via the repo
/// selector) instead of to the folder that physically contains the app.
///
/// Everything here only READS: it runs `openspec … --json` and reads files under
/// <c>openspec/</c>. No mutating verb is exposed. Drill-in ids are gated by the
/// same lowercase-dash safe-name rule the Control Room used before they reach a
/// command. `openspec` is an npm shim (.cmd/.ps1) on Windows, so it is spawned via
/// <c>cmd.exe /c</c> rather than directly (the .NET equivalent of serve.mjs's
/// <c>shell:true</c>).
/// </summary>
public partial class OpenspecCockpitService
{
    private readonly Logger _logger;

    public OpenspecCockpitService(Logger logger) => _logger = logger;

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,63}$")]
    private static partial Regex SafeNameRegex();

    /// <summary>True when <paramref name="id"/> is a valid change/spec id.</summary>
    public static bool IsSafeName(string? id) => !string.IsNullOrEmpty(id) && SafeNameRegex().IsMatch(id);

    public sealed record ExecResult(bool Ok, int Code, string Cmd, string StdOut, string StdErr);
    public sealed record Readiness(bool OpenspecOnPath, bool OpenspecDirPresent);
    public sealed record SetupResult(
        bool Ok, string Action, int ExitCode, string StdOut, string StdErr,
        bool AlreadyInitialized, Readiness Ready);

    // ── exec ─────────────────────────────────────────────────────────
    private ExecResult RunOpenspec(string workingDir, params string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        if (!string.IsNullOrEmpty(workingDir) && Directory.Exists(workingDir))
            psi.WorkingDirectory = workingDir;

        // cmd.exe resolves the openspec.cmd shim; every token below is a server
        // constant or a safe-name-gated id, so nothing the client sends is a verb.
        psi.ArgumentList.Add("/c");
        psi.ArgumentList.Add("openspec");
        foreach (var a in args) psi.ArgumentList.Add(a);

        try
        {
            using var process = new Process { StartInfo = psi };
            process.Start();
            var stdout = process.StandardOutput.ReadToEnd();
            var stderr = process.StandardError.ReadToEnd();
            process.WaitForExit();
            var cmd = "openspec " + string.Join(' ', args);
            return new ExecResult(process.ExitCode == 0, process.ExitCode, cmd, stdout, stderr);
        }
        catch (Exception ex)
        {
            return new ExecResult(false, -1, "openspec " + string.Join(' ', args), "", ex.Message);
        }
    }

    private (JsonNode? Json, ExecResult Exec, string? ParseError) ExecJson(string workingDir, params string[] args)
    {
        var r = RunOpenspec(workingDir, args);
        JsonNode? json = null;
        string? parseError = null;
        if (!string.IsNullOrWhiteSpace(r.StdOut))
        {
            try { json = JsonNode.Parse(r.StdOut); }
            catch (Exception e) { parseError = e.Message; }
        }
        return (json, r, parseError);
    }

    // ── readiness ────────────────────────────────────────────────────
    public Readiness CheckReadiness(string workingDir)
    {
        var version = RunOpenspec(workingDir, "--version");
        var onPath = version.Ok; // a missing shim makes cmd.exe return non-zero
        var dirPresent = !string.IsNullOrEmpty(workingDir)
            && Directory.Exists(Path.Combine(workingDir, "openspec"));
        return new Readiness(onPath, dirPresent);
    }

    // ── setup: the ONE state-changing action this service exposes ─────
    // The cockpit is otherwise read-only (see the class summary and the
    // openspec-cockpit spec). This method runs exactly one fixed OpenSpec verb,
    // chosen here from a closed action set — never a caller-supplied command or
    // args — in the resolved repo working dir. `init` is guarded against
    // clobbering an existing openspec/ tree.
    public SetupResult RunSetup(string workingDir, string action)
    {
        switch (action)
        {
            case "init":
            {
                // No-clobber guard: refuse to run init over an existing tree.
                // Enforced here so the destructive case is unreachable from the
                // API regardless of what the UI sends.
                var dirPresent = !string.IsNullOrEmpty(workingDir)
                    && Directory.Exists(Path.Combine(workingDir, "openspec"));
                if (dirPresent)
                    return new SetupResult(true, action, 0, "", "", true, CheckReadiness(workingDir));

                var r = RunOpenspec(workingDir, "init", "--tools", "claude");
                return new SetupResult(r.Ok, action, r.Code, r.StdOut, r.StdErr, false, CheckReadiness(workingDir));
            }
            case "update":
            {
                var r = RunOpenspec(workingDir, "update");
                return new SetupResult(r.Ok, action, r.Code, r.StdOut, r.StdErr, false, CheckReadiness(workingDir));
            }
            default:
                // Defense-in-depth: the controller already whitelists the action.
                throw new ArgumentException($"unknown setup action \"{action}\"", nameof(action));
        }
    }

    // ── shipped (archived) changes — no CLI lists them, so read disk ──
    [GeneratedRegex(@"^(\d{4}-\d{2}-\d{2})-(.+)$")]
    private static partial Regex ArchiveFolderRegex();

    public List<JsonObject> ReadArchive(string workingDir)
    {
        var dir = Path.Combine(workingDir, "openspec", "changes", "archive");
        var outList = new List<JsonObject>();
        if (!Directory.Exists(dir)) return outList;
        foreach (var path in Directory.GetDirectories(dir))
        {
            var name = Path.GetFileName(path);
            var m = ArchiveFolderRegex().Match(name);
            var date = m.Success ? m.Groups[1].Value : "";
            var slug = m.Success ? m.Groups[2].Value : name;
            var title = slug;
            var proposal = Path.Combine(path, "proposal.md");
            if (File.Exists(proposal))
            {
                var h = Regex.Match(File.ReadAllText(proposal), @"^#\s+(.+?)\s*$", RegexOptions.Multiline);
                if (h.Success) title = h.Groups[1].Value.Trim();
            }
            outList.Add(new JsonObject { ["id"] = name, ["date"] = date, ["slug"] = slug, ["title"] = title });
        }
        // date-prefixed name sorts newest-first when reversed
        outList.Sort((a, b) => string.CompareOrdinal((string?)b["id"], (string?)a["id"]));
        return outList;
    }

    // ── tasks.md checklist (not in `show --json`) ─────────────────────
    public JsonArray? ReadTasksFromDir(string changeDir)
    {
        var file = Path.Combine(changeDir, "tasks.md");
        if (!File.Exists(file)) return null;
        var tasks = new JsonArray();
        var section = "";
        foreach (var line in File.ReadAllLines(file))
        {
            var h = Regex.Match(line, @"^##\s+(.+?)\s*$");
            if (h.Success) { section = h.Groups[1].Value.Trim(); continue; }
            var m = Regex.Match(line, @"^\s*-\s+\[([ xX])\]\s*(.+?)\s*$");
            if (m.Success)
                tasks.Add(new JsonObject
                {
                    ["done"] = m.Groups[1].Value.ToLowerInvariant() == "x",
                    ["text"] = m.Groups[2].Value.Trim(),
                    ["section"] = section,
                });
        }
        return tasks;
    }

    // ── delta-spec parsing (for archived drill-in + change touches) ───
    public JsonArray ParseDeltaSpec(string md, string specName)
    {
        var deltas = new JsonArray();
        string? op = null;
        JsonArray? reqs = null;
        JsonObject? curReq = null;
        List<string>? curScn = null;
        var needText = false;

        void FlushScn()
        {
            if (curReq != null && curScn != null)
            {
                ((JsonArray)curReq["scenarios"]!).Add(new JsonObject { ["rawText"] = string.Join("\n", curScn).Trim() });
                curScn = null;
            }
        }
        void FlushReq()
        {
            FlushScn();
            if (curReq != null && string.IsNullOrEmpty((string?)curReq["text"]))
                curReq["text"] = (string?)curReq["title"];
            curReq = null;
            needText = false;
        }
        void FlushOp()
        {
            FlushReq();
            if (op != null && reqs != null && reqs.Count > 0)
                deltas.Add(new JsonObject { ["operation"] = op, ["spec"] = specName, ["requirements"] = reqs });
            op = null;
            reqs = null;
        }

        foreach (var line in md.Split('\n'))
        {
            var mOp = Regex.Match(line, @"^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\b", RegexOptions.IgnoreCase);
            if (mOp.Success) { FlushOp(); op = mOp.Groups[1].Value.ToUpperInvariant(); reqs = new JsonArray(); continue; }
            var mReq = Regex.Match(line, @"^###\s+Requirement:\s*(.*)$", RegexOptions.IgnoreCase);
            if (mReq.Success)
            {
                FlushReq();
                curReq = new JsonObject { ["text"] = "", ["title"] = mReq.Groups[1].Value.Trim(), ["scenarios"] = new JsonArray() };
                reqs?.Add(curReq);
                needText = true;
                continue;
            }
            var mScn = Regex.Match(line, @"^####\s+Scenario:\s*(.*)$", RegexOptions.IgnoreCase);
            if (mScn.Success) { FlushScn(); curScn = new List<string>(); continue; }
            if (curScn != null) { curScn.Add(line); continue; }
            if (needText && curReq != null && line.Trim().Length > 0) { curReq["text"] = line.Trim(); needText = false; }
        }
        FlushOp();
        return deltas;
    }

    /// <summary>Capabilities an active change's delta specs touch, with their operations.</summary>
    public JsonArray ChangeTouches(string workingDir, string name)
    {
        var touches = new JsonArray();
        var specsDir = Path.Combine(workingDir, "openspec", "changes", name, "specs");
        if (!Directory.Exists(specsDir)) return touches;
        foreach (var capDir in Directory.GetDirectories(specsDir))
        {
            var specFile = Path.Combine(capDir, "spec.md");
            if (!File.Exists(specFile)) continue;
            var ops = new HashSet<string>();
            foreach (var d in ParseDeltaSpec(File.ReadAllText(specFile), Path.GetFileName(capDir)))
            {
                var o = (string?)d!["operation"];
                if (!string.IsNullOrEmpty(o)) ops.Add(o);
            }
            var opsArr = new JsonArray();
            foreach (var o in ops) opsArr.Add(o);
            touches.Add(new JsonObject { ["spec"] = Path.GetFileName(capDir), ["operations"] = opsArr });
        }
        return touches;
    }

    private static string? ReadDoc(string changeDir, string name)
    {
        var f = Path.Combine(changeDir, name);
        return File.Exists(f) ? File.ReadAllText(f) : null;
    }

    // ── one fetch, four sources (mirrors serve.mjs cockpitState) ──────
    public JsonObject GetCockpit(string workingDir)
    {
        var changesR = ExecJson(workingDir, "list", "--json");
        var specsR = ExecJson(workingDir, "spec", "list", "--json");
        var validR = ExecJson(workingDir, "validate", "--all", "--strict", "--json");
        var archived = ReadArchive(workingDir);

        // validity keyed by type:id; validate exits non-zero on invalid, so trust json.items
        var validity = new Dictionary<string, (bool Valid, int Issues)>();
        if (validR.Json?["items"] is JsonArray items)
            foreach (var it in items)
            {
                var id = (string?)it!["id"];
                var type = (string?)it["type"];
                if (id is null || type is null) continue;
                var issues = (it["issues"] as JsonArray)?.Count ?? 0;
                validity[$"{type}:{id}"] = ((bool?)it["valid"] ?? false, issues);
            }

        JsonArray Stamp(JsonArray? arr, string type, string key)
        {
            var outArr = new JsonArray();
            if (arr is null) return outArr;
            foreach (var o in arr)
            {
                var obj = (JsonObject)o!.DeepClone();
                var k = (string?)obj[key];
                if (k != null && validity.TryGetValue($"{type}:{k}", out var v))
                {
                    obj["valid"] = v.Valid;
                    obj["issues"] = v.Issues;
                }
                outArr.Add(obj);
            }
            return outArr;
        }

        var activeChanges = Stamp(changesR.Json?["changes"] as JsonArray, "change", "name");
        foreach (var c in activeChanges)
            ((JsonObject)c!)["touches"] = ChangeTouches(workingDir, (string?)c["name"] ?? "");

        var specs = Stamp(specsR.Json as JsonArray, "spec", "id");

        var archivedArr = new JsonArray();
        foreach (var a in archived) archivedArr.Add(a.DeepClone());

        return new JsonObject
        {
            ["activeChanges"] = activeChanges,
            ["specs"] = specs,
            ["archived"] = archivedArr,
            ["errors"] = new JsonObject
            {
                ["changes"] = changesR.Exec.Ok ? null : (changesR.Exec.StdErr.Trim().Length > 0 ? changesR.Exec.StdErr.Trim() : changesR.ParseError ?? $"exit {changesR.Exec.Code}"),
                ["specs"] = specsR.Exec.Ok ? null : (specsR.Exec.StdErr.Trim().Length > 0 ? specsR.Exec.StdErr.Trim() : specsR.ParseError ?? $"exit {specsR.Exec.Code}"),
            },
        };
    }

    // ── drill-in: active change via `openspec show <id> --json` ───────
    public JsonObject Show(string workingDir, string id)
    {
        var r = ExecJson(workingDir, "show", id, "--json");
        var data = new JsonObject
        {
            ["ok"] = r.Exec.Ok && r.Json != null,
            ["code"] = r.Exec.Code,
            ["cmd"] = r.Exec.Cmd,
            ["json"] = r.Json?.DeepClone(),
            ["stderr"] = r.Exec.StdErr,
        };
        if (r.Json?["deltas"] is JsonArray)
        {
            var dir = Path.Combine(workingDir, "openspec", "changes", id);
            data["tasks"] = ReadTasksFromDir(dir);
            data["proposal"] = ReadDoc(dir, "proposal.md");
            data["design"] = ReadDoc(dir, "design.md");
        }
        return data;
    }

    // ── drill-in: archived change (invisible to `openspec show`) ──────
    public JsonObject ReadArchivedChange(string workingDir, string id)
    {
        var baseDir = Path.Combine(workingDir, "openspec", "changes", "archive", id);
        if (!Directory.Exists(baseDir))
            return new JsonObject { ["ok"] = false, ["json"] = null, ["stderr"] = $"archived change \"{id}\" not found" };

        var slug = ArchiveFolderRegex().Match(id) is { Success: true } m ? m.Groups[2].Value : id;
        var proposal = ReadDoc(baseDir, "proposal.md");
        var design = ReadDoc(baseDir, "design.md");
        var title = slug;
        if (proposal != null)
        {
            var h = Regex.Match(proposal, @"^#\s+(.+?)\s*$", RegexOptions.Multiline);
            if (h.Success) title = h.Groups[1].Value.Trim();
        }
        var deltas = new JsonArray();
        var specsDir = Path.Combine(baseDir, "specs");
        if (Directory.Exists(specsDir))
            foreach (var capDir in Directory.GetDirectories(specsDir))
            {
                var specFile = Path.Combine(capDir, "spec.md");
                if (!File.Exists(specFile)) continue;
                foreach (var d in ParseDeltaSpec(File.ReadAllText(specFile), Path.GetFileName(capDir)))
                    deltas.Add(d!.DeepClone());
            }
        return new JsonObject
        {
            ["ok"] = true,
            ["json"] = new JsonObject { ["id"] = id, ["title"] = title, ["archived"] = true, ["deltaCount"] = deltas.Count, ["deltas"] = deltas },
            ["tasks"] = ReadTasksFromDir(baseDir),
            ["proposal"] = proposal,
            ["design"] = design,
        };
    }
}
