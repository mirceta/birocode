using System.Diagnostics;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using ClaudeWebInstaller.Models;

namespace ClaudeWebInstaller.Services;

/// <summary>
/// All installer business logic for Claude Web. Holds the step list, runs
/// checks/installs, and reports progress purely through events -- it has no
/// reference to any UI type. Shell commands route through cmd.exe /c so that
/// batch-script tools (npm.cmd, dotnet, claude, git, node) resolve via PATH.
/// </summary>
public class InstallerService
{
    private readonly List<InstallStep> _steps;
    private readonly string _settingsPath;

    /// <summary>Absolute path to the shared settings.json (installer + deployer sections).</summary>
    public string SettingsPath => _settingsPath;

    // Resolved app paths (derived from ClaudeWebRoot).
    public string ClaudeWebRoot { get; private set; } = "";
    public string AppProjectDir => Path.Combine(ClaudeWebRoot, "ClaudeWeb.App");
    public string AppSolution => Path.Combine(ClaudeWebRoot, "ClaudeWeb.sln");
    public string AppSettingsPath => Path.Combine(AppProjectDir, "appsettings.json");
    public string ClientDir => Path.Combine(ClaudeWebRoot, "client");
    public string BuiltExePath =>
        Path.Combine(AppProjectDir, "bin", "Debug", "net8.0-windows", "ClaudeWeb.exe");

    // Settings-panel values (persisted to settings.json next to the exe).
    public string WorkingDirectory { get; private set; } = "";
    public int Port { get; private set; } = 5099;
    public string AuthPassword { get; private set; } = "";

    public IReadOnlyList<InstallStep> Steps => _steps;

    public event Action<int, StepStatus, string>? StepStatusChanged;
    public event Action<string>? LogMessage;

    public InstallerService(string basePath)
    {
        // basePath is the bin output dir (installer/bin/Debug/net8.0-windows/).
        // 3 levels up = installer/, then .. = claude-web/.
        var installerRoot = Path.GetFullPath(Path.Combine(basePath, "..", "..", ".."));
        _settingsPath = Path.Combine(installerRoot, "settings.json");
        ClaudeWebRoot = Path.GetFullPath(Path.Combine(installerRoot, ".."));

        LoadSettings();
        LoadDefaultsFromAppSettings();
        _steps = BuildSteps();
    }

    /// <summary>True when the resolved root looks like a real claude-web checkout.</summary>
    public bool IsValidClaudeWebRoot =>
        !string.IsNullOrWhiteSpace(ClaudeWebRoot) && File.Exists(AppSolution);

    // ---------------- Settings persistence ----------------

    private void LoadSettings()
    {
        if (!File.Exists(_settingsPath)) return;
        try
        {
            var node = JsonNode.Parse(File.ReadAllText(_settingsPath));
            if (node == null) return;
            var root = node["ClaudeWebRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(root)) ClaudeWebRoot = root;
            WorkingDirectory = node["WorkingDirectory"]?.GetValue<string>() ?? "";
            var port = node["Port"]?.GetValue<int>() ?? 0;
            if (port > 0) Port = port;
            AuthPassword = node["AuthPassword"]?.GetValue<string>() ?? "";
        }
        catch { /* ignore corrupt settings */ }
    }

    /// <summary>
    /// Persists this service's settings while preserving any other top-level
    /// sections (e.g. the deployer's "Deploy" object) already in the file.
    /// </summary>
    private void SaveSettings()
    {
        JsonObject obj;
        try
        {
            obj = (File.Exists(_settingsPath)
                ? JsonNode.Parse(File.ReadAllText(_settingsPath)) as JsonObject
                : null) ?? new JsonObject();
        }
        catch { obj = new JsonObject(); }

        obj["ClaudeWebRoot"] = ClaudeWebRoot;
        obj["WorkingDirectory"] = WorkingDirectory;
        obj["Port"] = Port;
        obj["AuthPassword"] = AuthPassword;

        File.WriteAllText(_settingsPath,
            obj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    /// <summary>
    /// Seed Working directory / Port / Password defaults from the app's
    /// appsettings.json when the user has not overridden them in settings.json.
    /// </summary>
    private void LoadDefaultsFromAppSettings()
    {
        if (!File.Exists(AppSettingsPath)) return;
        try
        {
            var node = JsonNode.Parse(File.ReadAllText(AppSettingsPath));
            if (node == null) return;

            if (string.IsNullOrWhiteSpace(WorkingDirectory))
                WorkingDirectory = node["WorkingDirectory"]?.GetValue<string>() ?? WorkingDirectory;

            var portNode = node["Port"];
            if (portNode != null && Port == 5099)
                Port = portNode.GetValue<int>();

            if (string.IsNullOrWhiteSpace(AuthPassword))
                AuthPassword = node["AuthPassword"]?.GetValue<string>() ?? AuthPassword;
        }
        catch { /* ignore -- defaults stay as-is */ }
    }

    public void SetClaudeWebRoot(string path)
    {
        ClaudeWebRoot = string.IsNullOrWhiteSpace(path) ? "" : Path.GetFullPath(path);
        SaveSettings();
    }

    public void SetWorkingDirectory(string path)
    {
        WorkingDirectory = path?.Trim() ?? "";
        SaveSettings();
    }

    public void SetPort(int port)
    {
        Port = port;
        SaveSettings();
    }

    public void SetAuthPassword(string password)
    {
        AuthPassword = password ?? "";
        SaveSettings();
    }

    // ---------------- Step list ----------------

    private List<InstallStep> BuildSteps()
    {
        return new List<InstallStep>
        {
            // -- CHECK phase --
            new InstallStep(1, ".NET 8 Desktop Runtime",
                "Runtime to run the WinForms app (plus SDK to build it)",
                StepPhase.Check, CheckDotnetDesktopRuntime),

            new InstallStep(2, "Claude CLI installed",
                "The 'claude' command is on PATH",
                StepPhase.Check, CheckClaudeInstalled),

            new InstallStep(3, "Claude CLI authenticated",
                "Signed in -- makes one tiny real request to verify",
                StepPhase.Check, CheckClaudeAuthenticated),

            new InstallStep(4, "git installed",
                "git is on PATH (used by Save / History)",
                StepPhase.Check, CheckGit),

            new InstallStep(5, "Node.js + npm",
                "Node and npm are available to build the frontend",
                StepPhase.Check, CheckNodeAndNpm),

            new InstallStep(6, "Working directory valid",
                "WorkingDirectory exists and is a git repository",
                StepPhase.Check, CheckWorkingDirectory,
                FixWorkingDirectory),

            new InstallStep(7, "Frontend built",
                "client/dist/index.html exists",
                StepPhase.Check, CheckFrontendBuilt,
                BuildFrontend),

            new InstallStep(8, "Port free",
                "The configured port is available to bind",
                StepPhase.Check, CheckPortFree),

            new InstallStep(9, "Access password set",
                "AuthPassword is set and not the default 'changeme'",
                StepPhase.Check, CheckAuthPassword),

            // -- INSTALL phase --
            new InstallStep(10, "Apply settings",
                "Write WorkingDirectory / Port / AuthPassword to appsettings.json",
                StepPhase.Install, CheckSettingsApplied,
                ApplySettings),

            new InstallStep(11, "npm install",
                "Install frontend dependencies in client/",
                StepPhase.Install, CheckNodeModules,
                RunNpmInstall),

            // -- BUILD phase --
            new InstallStep(12, "npm run build",
                "Build the React frontend into client/dist",
                StepPhase.Build, CheckFrontendBuilt,
                BuildFrontend),

            new InstallStep(13, "dotnet build",
                "Build the backend (ClaudeWeb.sln)",
                StepPhase.Build, CheckBackendBuilt,
                BuildBackend),
        };
    }

    // ---------------- Check functions ----------------

    private async Task<(StepStatus, string)> CheckDotnetDesktopRuntime(CancellationToken ct)
    {
        var (rtCode, rtOut) = await RunCommand("dotnet", "--list-runtimes", ct);
        if (rtCode != 0)
            return (StepStatus.Missing, "dotnet not found -- install the .NET 8 Desktop Runtime");

        bool hasDesktop8 = rtOut
            .Split('\n')
            .Any(l => l.TrimStart().StartsWith("Microsoft.WindowsDesktop.App 8.", StringComparison.OrdinalIgnoreCase));

        // SDK note (needed to build from source).
        var (sdkCode, sdkOut) = await RunCommand("dotnet", "--version", ct);
        string sdkNote = sdkCode == 0 ? $"SDK {sdkOut.Trim()}" : "SDK not detected (needed to build)";

        return hasDesktop8
            ? (StepStatus.Ok, $"WindowsDesktop.App 8.x present; {sdkNote}")
            : (StepStatus.Missing, $".NET 8 Desktop Runtime not found; {sdkNote}");
    }

    private async Task<(StepStatus, string)> CheckClaudeInstalled(CancellationToken ct)
    {
        var (code, output) = await RunCommand("claude", "--version", ct);
        return code == 0 && !string.IsNullOrWhiteSpace(output)
            ? (StepStatus.Ok, output.Trim())
            : (StepStatus.Missing, "claude CLI not found on PATH");
    }

    private async Task<(StepStatus, string)> CheckClaudeAuthenticated(CancellationToken ct)
    {
        // Critical, easy-to-miss check: probe with a tiny real request.
        Log("  NOTE: this makes ONE small real request to Claude to verify sign-in.");
        string workDir = Directory.Exists(WorkingDirectory) ? WorkingDirectory : ClaudeWebRoot;
        var (code, stdout, stderr) = await RunCommandFull(
            "claude", "-p \"hi\" --output-format json", workDir, ct, timeoutMs: 40_000);

        string combined = (stdout + "\n" + stderr);
        if (LooksLikeAuthError(combined))
            return (StepStatus.Missing,
                "Claude CLI is installed but not signed in -- run `claude` and log in");

        if (code != 0)
            return (StepStatus.Missing,
                $"Claude probe failed (exit {code}). First output: {Truncate(combined.Trim(), 160)}");

        // Expect JSON with a non-error result.
        try
        {
            var node = JsonNode.Parse(stdout.Trim());
            if (node == null)
                return (StepStatus.Missing, "Claude returned no JSON result");

            string? type = node["type"]?.GetValue<string>();
            string? subtype = node["subtype"]?.GetValue<string>();
            bool? isError = node["is_error"]?.GetValue<bool>();
            string? result = node["result"]?.GetValue<string>();

            if (isError == true || string.Equals(subtype, "error_during_execution", StringComparison.OrdinalIgnoreCase))
                return (StepStatus.Missing, $"Claude reported an error: {Truncate(result ?? subtype ?? "", 160)}");

            return (StepStatus.Ok, $"Signed in (got {(type ?? "result")} response)");
        }
        catch (JsonException)
        {
            return (StepStatus.Missing,
                $"Claude output was not valid JSON: {Truncate(stdout.Trim(), 160)}");
        }
    }

    private static bool LooksLikeAuthError(string text)
    {
        string t = text.ToLowerInvariant();
        return t.Contains("login") || t.Contains("log in") || t.Contains("authenticate")
            || t.Contains("not authenticated") || t.Contains("unauthorized")
            || t.Contains("please run claude") || t.Contains("invalid api key")
            || t.Contains("sign in") || t.Contains("not logged in");
    }

    private async Task<(StepStatus, string)> CheckGit(CancellationToken ct)
    {
        var (code, output) = await RunCommand("git", "--version", ct);
        return code == 0
            ? (StepStatus.Ok, output.Trim())
            : (StepStatus.Missing, "git not found on PATH");
    }

    private async Task<(StepStatus, string)> CheckNodeAndNpm(CancellationToken ct)
    {
        var (nodeCode, nodeOut) = await RunCommand("node", "--version", ct);
        if (nodeCode != 0)
            return (StepStatus.Missing, "Node.js not found");

        var (npmCode, npmOut) = await RunCommand("npm", "--version", ct);
        if (npmCode != 0)
            return (StepStatus.Missing, $"Node {nodeOut.Trim()} present but npm not found");

        return (StepStatus.Ok, $"node {nodeOut.Trim()}, npm {npmOut.Trim()}");
    }

    private async Task<(StepStatus, string)> CheckWorkingDirectory(CancellationToken ct)
    {
        string dir = WorkingDirectory;
        Log($"  Checking working directory: {dir}");
        if (string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir))
            return (StepStatus.Missing, $"Folder does not exist: {dir}");

        var (code, stdout, _) = await RunCommandFull(
            "git", $"-C \"{dir}\" rev-parse --is-inside-work-tree", null, ct);
        bool isRepo = code == 0 && stdout.Trim().StartsWith("true", StringComparison.OrdinalIgnoreCase);
        return isRepo
            ? (StepStatus.Ok, $"{dir} (git repo)")
            : (StepStatus.Missing, $"{dir} exists but is not a git repository");
    }

    private async Task<(StepStatus, string)> CheckFrontendBuilt(CancellationToken ct)
    {
        await Task.CompletedTask;
        var indexHtml = Path.Combine(ClientDir, "dist", "index.html");
        Log($"  Checking path: {indexHtml}");
        return File.Exists(indexHtml)
            ? (StepStatus.Ok, "client/dist/index.html present")
            : (StepStatus.Missing, "client/dist/index.html missing -- run the build");
    }

    private async Task<(StepStatus, string)> CheckPortFree(CancellationToken ct)
    {
        await Task.CompletedTask;
        Log($"  Trying to bind TcpListener on port {Port}...");
        TcpListener? listener = null;
        try
        {
            listener = new TcpListener(System.Net.IPAddress.Loopback, Port);
            listener.Start();
            return (StepStatus.Ok, $"Port {Port} is free");
        }
        catch (SocketException)
        {
            string pid = await FindPortOwnerPid(Port, ct);
            string by = string.IsNullOrEmpty(pid) ? "" : $" (PID {pid})";
            return (StepStatus.Missing, $"Port {Port} is in use{by}");
        }
        finally
        {
            listener?.Stop();
        }
    }

    private async Task<string> FindPortOwnerPid(int port, CancellationToken ct)
    {
        try
        {
            var (_, output) = await RunCommand("netstat", "-ano", ct);
            foreach (var line in output.Split('\n'))
            {
                if (line.Contains($":{port} ") && line.Contains("LISTENING"))
                {
                    var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length > 0) return parts[^1].Trim();
                }
            }
        }
        catch { /* best effort */ }
        return "";
    }

    private async Task<(StepStatus, string)> CheckAuthPassword(CancellationToken ct)
    {
        await Task.CompletedTask;
        if (string.IsNullOrWhiteSpace(AuthPassword))
            return (StepStatus.Warning, "Access password is empty -- set one before exposing the app");
        if (AuthPassword.Equals("changeme", StringComparison.OrdinalIgnoreCase))
            return (StepStatus.Warning, "Still the default 'changeme' -- change it before remote exposure");
        return (StepStatus.Ok, "Access password is set");
    }

    private async Task<(StepStatus, string)> CheckSettingsApplied(CancellationToken ct)
    {
        await Task.CompletedTask;
        if (!File.Exists(AppSettingsPath))
            return (StepStatus.Missing, "appsettings.json not found");
        try
        {
            var node = JsonNode.Parse(File.ReadAllText(AppSettingsPath));
            string curWd = node?["WorkingDirectory"]?.GetValue<string>() ?? "";
            int curPort = node?["Port"]?.GetValue<int>() ?? 0;
            string curPw = node?["AuthPassword"]?.GetValue<string>() ?? "";
            bool match = string.Equals(curWd, WorkingDirectory, StringComparison.OrdinalIgnoreCase)
                && curPort == Port
                && string.Equals(curPw, AuthPassword, StringComparison.Ordinal);
            return match
                ? (StepStatus.Ok, "appsettings.json matches the settings panel")
                : (StepStatus.Missing, "appsettings.json differs from the settings panel");
        }
        catch (Exception ex)
        {
            return (StepStatus.Missing, $"Could not read appsettings.json: {ex.Message}");
        }
    }

    private async Task<(StepStatus, string)> CheckNodeModules(CancellationToken ct)
    {
        await Task.CompletedTask;
        var nodeModules = Path.Combine(ClientDir, "node_modules");
        Log($"  Checking path: {nodeModules}");
        return Directory.Exists(nodeModules)
            ? (StepStatus.Ok, "client/node_modules present")
            : (StepStatus.Missing, "client/node_modules not found");
    }

    private async Task<(StepStatus, string)> CheckBackendBuilt(CancellationToken ct)
    {
        await Task.CompletedTask;
        Log($"  Checking path: {BuiltExePath}");
        return File.Exists(BuiltExePath)
            ? (StepStatus.Ok, "ClaudeWeb.exe present")
            : (StepStatus.Missing, "ClaudeWeb.exe not built yet");
    }

    // ---------------- Install / fix functions ----------------

    private async Task<(bool, string)> FixWorkingDirectory(CancellationToken ct)
    {
        string dir = WorkingDirectory;
        if (string.IsNullOrWhiteSpace(dir))
            return (false, "Working directory is empty -- set it in the settings panel first");

        if (!Directory.Exists(dir))
        {
            Log($"  Creating folder: {dir}");
            Directory.CreateDirectory(dir);
        }

        var (initOk, initOut) = await RunInstallCommand("git", "init", dir, ct);
        if (!initOk) return (false, initOut);

        // Initial empty commit so the History feature has a starting point.
        // Pass author inline in case the machine has no global git identity.
        const string author = "--author \"Claude Web <claude-web@localhost>\"";
        var (commitOk, commitOut) = await RunInstallCommand(
            "git",
            $"-c user.email=claude-web@localhost -c user.name=\"Claude Web\" commit --allow-empty {author} -m \"Initialize claude-web workspace\"",
            dir, ct);
        return commitOk ? (true, "Initialized git repo with an empty commit") : (false, commitOut);
    }

    private async Task<(bool, string)> ApplySettings(CancellationToken ct)
    {
        await Task.CompletedTask;
        if (!File.Exists(AppSettingsPath))
            return (false, $"appsettings.json not found at {AppSettingsPath}");
        try
        {
            Log($"  Updating: {AppSettingsPath}");
            var node = JsonNode.Parse(File.ReadAllText(AppSettingsPath)) as JsonObject ?? new JsonObject();
            node["WorkingDirectory"] = WorkingDirectory;
            node["Port"] = Port;
            node["AuthPassword"] = AuthPassword;
            File.WriteAllText(AppSettingsPath,
                node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            Log($"  WorkingDirectory={WorkingDirectory}, Port={Port}, AuthPassword set");
            return (true, "appsettings.json updated");
        }
        catch (Exception ex)
        {
            return (false, $"Failed to write appsettings.json: {ex.Message}");
        }
    }

    private async Task<(bool, string)> RunNpmInstall(CancellationToken ct)
        => await RunInstallCommand("npm", "install", ClientDir, ct);

    private async Task<(bool, string)> BuildFrontend(CancellationToken ct)
        => await RunInstallCommand("npm", "run build", ClientDir, ct);

    private async Task<(bool, string)> BuildBackend(CancellationToken ct)
        => await RunInstallCommand("dotnet", "build ClaudeWeb.sln", ClaudeWebRoot, ct);

    // ---------------- Orchestration ----------------

    public async Task CheckAllAsync(CancellationToken ct)
    {
        for (int i = 0; i < _steps.Count; i++)
        {
            var step = _steps[i];
            step.Status = StepStatus.Running;
            StepStatusChanged?.Invoke(i, step.Status, "Checking...");
            Log($"[CHECK] {step.Number}. {step.Name}...");

            var (status, details) = await step.CheckFunc(ct);
            step.Status = status;
            step.Details = details;
            StepStatusChanged?.Invoke(i, status, details);
            Log($"  -> {status}: {details}");
        }
    }

    public async Task InstallAllAsync(CancellationToken ct)
    {
        for (int i = 0; i < _steps.Count; i++)
        {
            var step = _steps[i];

            // Re-check first; only fix what is missing.
            var (checkStatus, checkDetails) = await step.CheckFunc(ct);
            if (checkStatus is StepStatus.Ok or StepStatus.Warning)
            {
                step.Status = checkStatus;
                step.Details = checkDetails;
                StepStatusChanged?.Invoke(i, checkStatus, checkDetails);
                Log($"[SKIP] {step.Name}: {checkStatus} ({checkDetails})");
                continue;
            }

            if (step.InstallFunc == null)
            {
                step.Status = StepStatus.Missing;
                step.Details = checkDetails + " (no auto-fix available)";
                StepStatusChanged?.Invoke(i, StepStatus.Missing, step.Details);
                Log($"[FAIL] {step.Name}: {step.Details}");
                continue;
            }

            step.Status = StepStatus.Running;
            StepStatusChanged?.Invoke(i, StepStatus.Running, "Installing...");
            Log($"[INSTALL] {step.Number}. {step.Name}...");

            var (success, output) = await step.InstallFunc(ct);
            if (success)
            {
                var (postStatus, postDetails) = await step.CheckFunc(ct);
                step.Status = postStatus;
                step.Details = postDetails;
                StepStatusChanged?.Invoke(i, postStatus, postDetails);
                Log($"  -> {postStatus}: {postDetails}");
            }
            else
            {
                step.Status = StepStatus.Failed;
                step.Details = output;
                StepStatusChanged?.Invoke(i, StepStatus.Failed, output);
                Log($"  -> FAILED: {output}");
            }
        }
    }

    /// <summary>All check-phase steps pass (Warning counts as a pass).</summary>
    public bool AllChecksPassed =>
        _steps.Where(s => s.Phase == StepPhase.Check)
              .All(s => s.Status is StepStatus.Ok or StepStatus.Warning);

    /// <summary>Every step passed (used to gate further actions / messaging).</summary>
    public bool AllStepsPassed =>
        _steps.All(s => s.Status is StepStatus.Ok or StepStatus.Warning);

    /// <summary>Short human-readable summary of which steps would be fixed by Install All.</summary>
    public string DescribePendingInstalls()
    {
        var pending = _steps
            .Where(s => s.InstallFunc != null && s.Status is StepStatus.Missing or StepStatus.Failed)
            .Select(s => $"  - {s.Number}. {s.Name}")
            .ToList();
        return pending.Count == 0
            ? "Nothing to install -- everything is already in place."
            : string.Join(Environment.NewLine, pending);
    }

    // ---------------- Test ----------------

    /// <summary>
    /// Launches the built exe, polls /api/health for up to ~25s, then stops the
    /// process it started. Returns success plus a diagnostic message.
    /// </summary>
    public async Task<(bool Success, string Output)> TestAsync(CancellationToken ct)
    {
        if (!File.Exists(BuiltExePath))
            return (false, $"ClaudeWeb.exe not found at {BuiltExePath} -- build first");

        string url = $"http://127.0.0.1:{Port}/api/health";
        Log("[TEST] Launching ClaudeWeb.exe...");
        Log($"  Exe: {BuiltExePath}");
        Log($"  Working directory: {AppProjectDir}");

        Process? process = null;
        var startupErrors = new StringBuilder();
        try
        {
            process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = BuiltExePath,
                    WorkingDirectory = AppProjectDir,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            process.OutputDataReceived += (_, e) => { if (e.Data != null) Log($"  app: {e.Data}"); };
            process.ErrorDataReceived += (_, e) =>
            {
                if (e.Data != null) { startupErrors.AppendLine(e.Data); Log($"  app stderr: {e.Data}"); }
            };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            Log($"  Process started (PID {process.Id})");

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            Log($"  Polling {url} for up to ~25s...");
            for (int attempt = 0; attempt < 25; attempt++)
            {
                ct.ThrowIfCancellationRequested();
                if (process.HasExited)
                {
                    Log($"  Process exited early with code {process.ExitCode}");
                    return (false,
                        $"App exited with code {process.ExitCode} before responding.\n\nStderr:\n{startupErrors}");
                }
                try
                {
                    var resp = await http.GetAsync(url, ct);
                    Log($"  HTTP {(int)resp.StatusCode}");
                    if (resp.IsSuccessStatusCode)
                    {
                        Log("[TEST] Health check passed.");
                        return (true, $"Health check returned HTTP 200 at {url}");
                    }
                }
                catch (Exception ex)
                {
                    Log($"  (not up yet: {ex.Message})");
                }
                await Task.Delay(1000, ct);
            }

            return (false,
                $"No HTTP 200 from {url} within 25s.\n\nStderr:\n{startupErrors}");
        }
        catch (Exception ex)
        {
            Log($"  Exception: {ex.Message}");
            return (false, $"{ex.Message}\n\nStderr:\n{startupErrors}");
        }
        finally
        {
            if (process != null && !process.HasExited)
            {
                try
                {
                    Log($"  Stopping app (PID {process.Id})...");
                    process.Kill(entireProcessTree: true);
                    await process.WaitForExitAsync(CancellationToken.None);
                    Log("  App stopped.");
                }
                catch (Exception ex) { Log($"  Could not stop app cleanly: {ex.Message}"); }
            }
            process?.Dispose();
        }
    }

    // ---------------- Run / Stop / Status (persistent backend) ----------------

    /// <summary>Process name of the backend exe (no extension), as GetProcessesByName expects.</summary>
    private const string BackendProcessName = "ClaudeWeb";

    /// <summary>
    /// Starts the backend as a normal detached GUI process in the user session
    /// (UseShellExecute = true -- no output redirection, not killed by this tool).
    /// No-ops if it is already healthy. Unlike TestAsync, this is a persistent start.
    /// </summary>
    public async Task<(bool Ok, string Message)> StartBackend()
    {
        if (!File.Exists(BuiltExePath))
        {
            Log("[RUN] Backend not built.");
            return (false, "Backend not built -- run Install All first");
        }

        if (await IsHealthyAsync(CancellationToken.None))
        {
            Log("[RUN] Backend is already running.");
            return (true, "Backend is already running");
        }

        try
        {
            Log($"[RUN] Starting backend: {BuiltExePath}");
            Process.Start(new ProcessStartInfo
            {
                FileName = BuiltExePath,
                WorkingDirectory = AppProjectDir,
                UseShellExecute = true
            });
            Log("[RUN] Backend launch requested.");
            return (true, $"Started ClaudeWeb.exe -- open http://localhost:{Port}/");
        }
        catch (Exception ex)
        {
            Log($"[RUN] Failed to start backend: {ex.Message}");
            return (false, $"Failed to start backend: {ex.Message}");
        }
    }

    /// <summary>Kills any running ClaudeWeb backend process and reports how many were stopped.</summary>
    public (bool Ok, string Message) StopBackend()
    {
        var processes = Process.GetProcessesByName(BackendProcessName);
        if (processes.Length == 0)
        {
            Log("[STOP] No ClaudeWeb process running.");
            return (true, "Backend is not running");
        }

        int stopped = 0;
        foreach (var p in processes)
        {
            try
            {
                Log($"[STOP] Killing ClaudeWeb (PID {p.Id})...");
                p.Kill(entireProcessTree: true);
                p.WaitForExit(5000);
                stopped++;
            }
            catch (Exception ex)
            {
                Log($"[STOP] Could not kill PID {p.Id}: {ex.Message}");
            }
            finally { p.Dispose(); }
        }

        bool ok = stopped > 0;
        string msg = ok ? $"Stopped {stopped} ClaudeWeb process(es)" : "Found ClaudeWeb but could not stop it";
        Log($"[STOP] {msg}.");
        return (ok, msg);
    }

    /// <summary>
    /// Reports the current backend state without changing anything: whether a
    /// process exists, whether /api/health responds, plus the URLs to open.
    /// </summary>
    public async Task<BackendStatus> GetBackendStatusAsync(CancellationToken ct)
    {
        bool processRunning = Process.GetProcessesByName(BackendProcessName).Length > 0;
        bool healthOk = await IsHealthyAsync(ct);
        bool distPresent = File.Exists(Path.Combine(ClientDir, "dist", "index.html"));
        string localUrl = $"http://localhost:{Port}/";
        string? lanIp = GetLanIPv4();
        string? lanUrl = lanIp == null ? null : $"http://{lanIp}:{Port}/";

        return new BackendStatus(processRunning, healthOk, Port, distPresent, localUrl, lanUrl);
    }

    /// <summary>GET /api/health; true only on HTTP 200.</summary>
    private async Task<bool> IsHealthyAsync(CancellationToken ct)
    {
        try
        {
            // Use 127.0.0.1 (not localhost): the backend binds IPv4 0.0.0.0, but
            // "localhost" resolves to IPv6 ::1 first on Windows, which fails and
            // can exhaust the timeout before falling back to IPv4.
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
            var resp = await http.GetAsync($"http://127.0.0.1:{Port}/api/health", ct);
            return resp.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>First up, non-loopback, non-link-local (169.254.x) IPv4 address, or null.</summary>
    private static string? GetLanIPv4()
    {
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                foreach (var addr in nic.GetIPProperties().UnicastAddresses)
                {
                    if (addr.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    var ip = addr.Address.ToString();
                    if (ip.StartsWith("169.254.")) continue; // link-local / APIPA
                    return ip;
                }
            }
        }
        catch { /* best effort */ }
        return null;
    }

    // ---------------- Shell helpers ----------------

    private static ProcessStartInfo ShellStartInfo(string command, string? workingDirectory)
    {
        // cmd.exe /c so batch-script tools (npm.cmd, dotnet, claude, git) resolve.
        return new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c {command}",
            WorkingDirectory = workingDirectory ?? "",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };
    }

    /// <summary>Runs a command, returns (exit code, combined stdout+stderr).</summary>
    private async Task<(int ExitCode, string Output)> RunCommand(
        string fileName, string arguments, CancellationToken ct)
    {
        var (code, stdout, stderr) = await RunCommandFull(fileName, arguments, null, ct);
        return (code, stdout + stderr);
    }

    /// <summary>
    /// Runs a command with separate stdout/stderr capture and an optional
    /// timeout. Logs the exact command line, working dir, and exit code.
    /// </summary>
    private async Task<(int ExitCode, string Stdout, string Stderr)> RunCommandFull(
        string fileName, string arguments, string? workingDirectory,
        CancellationToken ct, int timeoutMs = 0)
    {
        var fullCommand = $"{fileName} {arguments}";
        Log($"  > cmd /c {fullCommand}");
        if (!string.IsNullOrEmpty(workingDirectory))
            Log($"  Working directory: {workingDirectory}");
        try
        {
            using var process = new Process { StartInfo = ShellStartInfo(fullCommand, workingDirectory) };
            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = process.StandardError.ReadToEndAsync(ct);

            if (timeoutMs > 0)
            {
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                var waitTask = process.WaitForExitAsync(timeoutCts.Token);
                var completed = await Task.WhenAny(waitTask, Task.Delay(timeoutMs, ct));
                if (completed != waitTask)
                {
                    Log($"  Timed out after {timeoutMs}ms -- killing process tree");
                    try { process.Kill(entireProcessTree: true); } catch { /* ignore */ }
                    return (-1, await SafeAwait(stdoutTask), await SafeAwait(stderrTask) + "\n[timed out]");
                }
            }
            else
            {
                await process.WaitForExitAsync(ct);
            }

            string stdout = await SafeAwait(stdoutTask);
            string stderr = await SafeAwait(stderrTask);
            Log($"  Exit code: {process.ExitCode}");
            return (process.ExitCode, stdout, stderr);
        }
        catch (Exception ex)
        {
            Log($"  Exception: {ex.Message}");
            return (-1, "", ex.Message);
        }
    }

    private static async Task<string> SafeAwait(Task<string> t)
    {
        try { return await t; } catch { return ""; }
    }

    /// <summary>
    /// Runs an install/build command, streaming output line by line to the log.
    /// Returns success plus the full combined output (for the error dialog).
    /// </summary>
    private async Task<(bool Success, string Output)> RunInstallCommand(
        string fileName, string arguments, string? workingDirectory, CancellationToken ct)
    {
        var fullCommand = $"{fileName} {arguments}";
        Log($"  > cmd /c {fullCommand}");
        if (!string.IsNullOrEmpty(workingDirectory))
            Log($"  Working directory: {workingDirectory}");

        var collected = new StringBuilder();
        try
        {
            using var process = new Process { StartInfo = ShellStartInfo(fullCommand, workingDirectory) };
            process.OutputDataReceived += (_, e) => { if (e.Data != null) { collected.AppendLine(e.Data); Log(e.Data); } };
            process.ErrorDataReceived += (_, e) => { if (e.Data != null) { collected.AppendLine(e.Data); Log(e.Data); } };

            process.Start();
            Log($"  Process started (PID {process.Id})");
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await process.WaitForExitAsync(ct);

            Log($"  Exit code: {process.ExitCode}");
            if (process.ExitCode == 0)
                return (true, $"Exit code: 0");

            string detail = $"Command: cmd /c {fullCommand}\n" +
                            $"Working directory: {workingDirectory ?? "(default)"}\n" +
                            $"Exit code: {process.ExitCode}\n\nOutput:\n{collected}";
            return (false, detail);
        }
        catch (Exception ex)
        {
            Log($"  Exception: {ex.Message}");
            return (false, $"Command: cmd /c {fullCommand}\nException: {ex}");
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s.Substring(0, max) + "...";

    private void Log(string message) => LogMessage?.Invoke(message);
}
