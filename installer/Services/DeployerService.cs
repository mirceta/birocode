using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClaudeWebInstaller.Models;

namespace ClaudeWebInstaller.Services;

/// <summary>
/// All Internet-Deployment business logic for Claude Web. Holds the deploy step
/// list, runs checks/deploys, and reports progress purely through events -- it
/// has no reference to any UI type (same contract as <see cref="InstallerService"/>).
///
/// Deployment model: the backend runs as the existing WinForms app in the
/// operator's logged-in session. There is NO headless mode and NO Windows
/// Service. TLS is IIS's job: the operator's existing IIS site already owns the
/// public domain and its certificate (same as the api-chatbot deployment), and
/// the hop from IIS to our app is plain HTTP. This tool does NOT manage
/// certificates or HTTPS bindings. "Deploy" means: verify our backend, open the
/// backend's inbound firewall port, drop the ARR reverse-proxy web.config into
/// the operator's existing IIS site folder, and autostart the app at logon.
/// ClaudeWeb.App source is never modified -- hardening gaps are warnings only.
///
/// Shell routing: cmd.exe /c for netsh and friends, powershell.exe -Command for
/// IIS cmdlets (WebAdministration). The web.config step requires Administrator.
/// </summary>
public class DeployerService
{
    private readonly InstallerService _installer;
    private readonly List<DeployStep> _steps;
    private readonly string _settingsPath;

    // Deployer settings panel values (persisted to the shared settings.json
    // under a "Deploy" section so the installer's own keys are untouched).
    /// <summary>Public domain. OPTIONAL -- used only for the public health verify.</summary>
    public string Domain { get; private set; } = "";
    public int ProxyPort { get; private set; }

    /// <summary>
    /// Physical path of the operator's existing IIS site, where web.config is
    /// written. Defaults to a ProgramData fallback only; the operator should
    /// point this at their real site folder.
    /// </summary>
    public string SiteWebConfigFolder { get; private set; } =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "ClaudeWeb", "site");

    public IReadOnlyList<DeployStep> Steps => _steps;

    public event Action<int, StepStatus, string>? StepStatusChanged;
    public event Action<string>? LogMessage;

    public DeployerService(InstallerService installer)
    {
        _installer = installer;
        _settingsPath = installer.SettingsPath;

        // Default the proxy port to the installer's configured app port.
        ProxyPort = installer.Port;

        LoadSettings();
        _steps = BuildSteps();
    }

    // ---------------- Settings persistence ----------------

    private void LoadSettings()
    {
        if (!File.Exists(_settingsPath)) return;
        try
        {
            var root = JsonNode.Parse(File.ReadAllText(_settingsPath));
            var d = root?["Deploy"];
            if (d == null) return;

            Domain = d["Domain"]?.GetValue<string>() ?? "";
            var port = d["ProxyPort"]?.GetValue<int>() ?? 0;
            if (port > 0) ProxyPort = port;
            var folder = d["SiteWebConfigFolder"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(folder)) SiteWebConfigFolder = folder;
        }
        catch { /* ignore corrupt settings */ }
    }

    /// <summary>
    /// Writes the "Deploy" section while preserving the installer's top-level
    /// keys already in the shared settings.json.
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

        obj["Deploy"] = new JsonObject
        {
            ["Domain"] = Domain,
            ["ProxyPort"] = ProxyPort,
            ["SiteWebConfigFolder"] = SiteWebConfigFolder
        };

        File.WriteAllText(_settingsPath,
            obj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    public void SetDomain(string value) { Domain = value?.Trim() ?? ""; SaveSettings(); }
    public void SetProxyPort(int value) { ProxyPort = value; SaveSettings(); }
    public void SetSiteWebConfigFolder(string value)
    {
        SiteWebConfigFolder = value?.Trim() ?? "";
        SaveSettings();
    }

    /// <summary>True once the minimum settings to run Deploy All are present.</summary>
    public bool CanDeploy =>
        ProxyPort is > 0 and <= 65535
        && !string.IsNullOrWhiteSpace(SiteWebConfigFolder);

    public string HealthUrlLocal => $"http://localhost:{ProxyPort}/api/health";
    public string HealthUrlPublic => $"https://{Domain}/api/health";

    // ---------------- Elevation ----------------

    /// <summary>True when the process runs with the Administrator role.</summary>
    public static bool IsAdministrator()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch { return false; }
    }

    // ---------------- Step list ----------------

    private List<DeployStep> BuildSteps()
    {
        return new List<DeployStep>
        {
            // -- PreFlight --
            new DeployStep(1, "Local Setup passed",
                "Backend (ClaudeWeb.exe) and frontend (client/dist) are built",
                DeployPhase.PreFlight, CheckLocalSetup),

            // -- Backend (our system) --
            new DeployStep(2, "Backend responding (localhost)",
                "GET http://localhost:<port>/api/health returns 200",
                DeployPhase.Backend, CheckAppResponding),

            new DeployStep(3, "Backend reachable on the network",
                "Health responds on this machine's LAN IP (bound to 0.0.0.0, not just localhost)",
                DeployPhase.Backend, CheckLanReachable),

            new DeployStep(4, "Proxy target matches backend port",
                "appsettings Port equals the port the reverse proxy forwards to",
                DeployPhase.Backend, CheckPortMatch),

            new DeployStep(5, "Security notes",
                "Access code / CORS / rate-limit (informational -- never blocks)",
                DeployPhase.Backend, CheckHardening),

            // -- Firewall (open the inbound port our backend needs) --
            new DeployStep(6, "Firewall: backend port open",
                "Inbound TCP allowed on the backend port",
                DeployPhase.Firewall, CheckFirewallBackendPort, OpenFirewallBackendPort),

            // -- Reverse-proxy web.config into the operator's existing IIS site --
            new DeployStep(7, "Reverse-proxy web.config written",
                "ARR rewrite -> http://localhost:<port>, SSE, websockets (TLS stays IIS's job)",
                DeployPhase.Configure, CheckWebConfig, WriteWebConfig),

            // -- Autostart (no admin needed) --
            new DeployStep(8, "Autostart at logon",
                "Shortcut to ClaudeWeb.exe in the current user's Startup folder",
                DeployPhase.Autostart, CheckAutostart, CreateAutostart),

            // -- Verify --
            new DeployStep(9, "Local health 200",
                "GET http://localhost:<port>/api/health -> 200",
                DeployPhase.Verify, CheckAppResponding),

            new DeployStep(10, "Public health 200",
                "GET https://<domain>/api/health -> 200 (skipped if no domain set)",
                DeployPhase.Verify, CheckPublicHealth),
        };
    }

    // ---------------- PreFlight checks ----------------

    private async Task<(StepStatus, string)> CheckLocalSetup(CancellationToken ct)
    {
        await Task.CompletedTask;
        if (!_installer.AllChecksPassed)
            return (StepStatus.Missing,
                "Local Setup checks have not all passed -- run Check All on the Local Setup tab first.");

        bool backend = File.Exists(_installer.BuiltExePath);
        bool frontend = File.Exists(Path.Combine(_installer.ClientDir, "dist", "index.html"));
        if (!backend)
            return (StepStatus.Missing, $"Backend not built: {_installer.BuiltExePath} missing");
        if (!frontend)
            return (StepStatus.Missing, "Frontend not built: client/dist/index.html missing");
        return (StepStatus.Ok, "Backend and frontend are built");
    }

    private async Task<(StepStatus, string)> CheckAppResponding(CancellationToken ct)
    {
        string url = HealthUrlLocal;
        Log($"  GET {url}");
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var resp = await http.GetAsync(url, ct);
            Log($"  HTTP {(int)resp.StatusCode}");
            return resp.IsSuccessStatusCode
                ? (StepStatus.Ok, $"HTTP {(int)resp.StatusCode} from {url}")
                : (StepStatus.Missing, $"HTTP {(int)resp.StatusCode} from {url}");
        }
        catch (Exception ex)
        {
            Log($"  (no response: {ex.Message})");
            return (StepStatus.Missing,
                $"App not responding at {url}. Start it from the Local Setup tab / run ClaudeWeb.exe, then re-check.");
        }
    }

    /// <summary>
    /// Hardening review. Reads ClaudeWeb.App source/config read-only and emits
    /// yellow warnings only -- it NEVER modifies the app and NEVER blocks deploy.
    /// </summary>
    private async Task<(StepStatus, string)> CheckHardening(CancellationToken ct)
    {
        await Task.CompletedTask;
        var warnings = new List<string>();

        // Default / weak access password.
        if (string.IsNullOrWhiteSpace(_installer.AuthPassword)
            || _installer.AuthPassword.Equals("changeme", StringComparison.OrdinalIgnoreCase))
            warnings.Add("AuthPassword is empty or still 'changeme' -- set a strong code before public exposure.");

        // CORS allow-all and missing rate limit are known gaps in ClaudeWeb.App.
        warnings.Add("CORS is allow-all -- recommend restricting it to https://" +
                     (string.IsNullOrWhiteSpace(Domain) ? "<your-domain>" : Domain) + " for production.");
        warnings.Add("No rate limit on the password gate -- brute-force risk on a public URL.");

        Log("  Hardening warnings (informational, never block deploy):");
        foreach (var w in warnings) Log($"    - {w}");

        return (StepStatus.Warning, string.Join("  |  ", warnings));
    }

    // ---------------- Backend (our system) checks ----------------

    /// <summary>
    /// Confirms the backend is reachable on the machine's LAN IP, not just
    /// localhost -- i.e. it is bound to 0.0.0.0 so a reverse proxy / other hosts
    /// can reach it. (The app binds 0.0.0.0 by default; this catches a
    /// misconfiguration or a not-running app.)
    /// </summary>
    private async Task<(StepStatus, string)> CheckLanReachable(CancellationToken ct)
    {
        string? ip = GetLanIPv4();
        if (ip == null)
            return (StepStatus.Warning, "No LAN IPv4 address found -- cannot test network reachability");

        string url = $"http://{ip}:{ProxyPort}/api/health";
        Log($"  GET {url}");
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var resp = await http.GetAsync(url, ct);
            Log($"  HTTP {(int)resp.StatusCode}");
            return resp.IsSuccessStatusCode
                ? (StepStatus.Ok, $"Reachable at {url} (bound to the network interface)")
                : (StepStatus.Missing, $"HTTP {(int)resp.StatusCode} from {url}");
        }
        catch (Exception ex)
        {
            Log($"  (no response: {ex.Message})");
            return (StepStatus.Missing,
                $"Not reachable at {url}. If localhost works but this does not, the app is bound to localhost only (or is not running).");
        }
    }

    /// <summary>The reverse proxy target port must equal the port the backend listens on.</summary>
    private async Task<(StepStatus, string)> CheckPortMatch(CancellationToken ct)
    {
        await Task.CompletedTask;
        int appPort = ReadAppConfiguredPort();
        if (appPort <= 0)
            return (StepStatus.Warning, $"Could not read Port from {_installer.AppSettingsPath}");
        return appPort == ProxyPort
            ? (StepStatus.Ok, $"Backend listens on {appPort}; proxy targets {ProxyPort}")
            : (StepStatus.Missing,
                $"Mismatch: backend Port={appPort} but proxy target={ProxyPort}. Set the proxy port to {appPort} (or change appsettings).");
    }

    private int ReadAppConfiguredPort()
    {
        try
        {
            if (!File.Exists(_installer.AppSettingsPath)) return 0;
            var node = JsonNode.Parse(File.ReadAllText(_installer.AppSettingsPath));
            return node?["Port"]?.GetValue<int>() ?? 0;
        }
        catch { return 0; }
    }

    /// <summary>First non-loopback, non-APIPA IPv4 address of an up interface.</summary>
    private static string? GetLanIPv4()
    {
        try
        {
            return NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up
                         && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                .SelectMany(n => n.GetIPProperties().UnicastAddresses)
                .Select(a => a.Address)
                .Where(a => a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
                         && !IPAddress.IsLoopback(a))
                .Select(a => a.ToString())
                .FirstOrDefault(ip => !ip.StartsWith("169.254"));
        }
        catch { return null; }
    }

    // ---------------- Firewall checks ----------------

    private Task<(StepStatus, string)> CheckFirewallBackendPort(CancellationToken ct)
        => CheckFirewallPort(ProxyPort, ct);

    private Task<(bool, string)> OpenFirewallBackendPort(CancellationToken ct)
        => OpenFirewallPort(ProxyPort, $"Claude Web backend ({ProxyPort})", ct);

    /// <summary>
    /// True if ANY enabled inbound Allow rule covers this TCP port (ours or one
    /// IIS/api-chatbot already created), so we never add a duplicate.
    /// </summary>
    private async Task<(StepStatus, string)> CheckFirewallPort(int port, CancellationToken ct)
    {
        string ps =
            "$open = Get-NetFirewallRule -Direction Inbound -Action Allow -Enabled True -ErrorAction SilentlyContinue | " +
            "Get-NetFirewallPortFilter | Where-Object { $_.Protocol -eq 'TCP' -and " +
            "($_.LocalPort -contains '" + port + "' -or $_.LocalPort -eq 'Any') }; " +
            "if ($open) { 'OPEN' } else { 'CLOSED' }";
        var (code, stdout, _) = await RunPowerShell(ps, ct);
        if (code == 0 && stdout.Contains("OPEN"))
            return (StepStatus.Ok, $"Inbound TCP {port} is allowed");
        if (code == 0 && stdout.Contains("CLOSED"))
            return (StepStatus.Missing, $"No inbound firewall rule allows TCP {port}");
        return (StepStatus.Warning, $"Could not determine the firewall state for TCP {port}");
    }

    private async Task<(bool, string)> OpenFirewallPort(int port, string ruleName, CancellationToken ct)
    {
        if (!IsAdministrator()) return NotElevated();
        var (code, stdout, stderr) = await RunPowerShell(
            $"New-NetFirewallRule -DisplayName '{PsEscape(ruleName)}' -Direction Inbound " +
            $"-Protocol TCP -LocalPort {port} -Action Allow | Out-Null", ct);
        return code == 0
            ? (true, $"Opened inbound TCP {port} ('{ruleName}')")
            : (false, $"Failed to add firewall rule for TCP {port}.\n{stdout}\n{stderr}");
    }

    private async Task<(StepStatus, string)> CheckWebConfig(CancellationToken ct)
    {
        await Task.CompletedTask;
        var path = Path.Combine(SiteWebConfigFolder, "web.config");
        if (!File.Exists(path))
            return (StepStatus.Missing, $"web.config missing at {path}");
        var text = File.ReadAllText(path);
        bool proxy = text.Contains($"http://localhost:{ProxyPort}/", StringComparison.OrdinalIgnoreCase);
        return proxy
            ? (StepStatus.Ok, $"web.config present, proxies to http://localhost:{ProxyPort}/")
            : (StepStatus.Missing, $"web.config present but does not target port {ProxyPort}");
    }

    private async Task<(StepStatus, string)> CheckAutostart(CancellationToken ct)
    {
        await Task.CompletedTask;
        var shortcut = AutostartShortcutPath;
        return File.Exists(shortcut)
            ? (StepStatus.Ok, $"Startup shortcut present: {shortcut}")
            : (StepStatus.Missing, $"No startup shortcut at {shortcut}");
    }

    private async Task<(StepStatus, string)> CheckPublicHealth(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(Domain))
            return (StepStatus.Warning,
                "No public domain set -- skipped (internal/LAN access uses http://<host>:<port> directly)");
        string url = HealthUrlPublic;
        Log($"  GET {url}");
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var resp = await http.GetAsync(url, ct);
            string body = await resp.Content.ReadAsStringAsync(ct);
            Log($"  HTTP {(int)resp.StatusCode} -- {Truncate(body.Trim(), 120)}");
            return resp.IsSuccessStatusCode
                ? (StepStatus.Ok, $"HTTP {(int)resp.StatusCode} from {url}")
                : (StepStatus.Failed,
                    $"HTTP {(int)resp.StatusCode} from {url}\n\nBody:\n{body}");
        }
        catch (Exception ex)
        {
            return (StepStatus.Failed,
                $"Public health check failed for {url}.\n\nException:\n{ex}");
        }
    }

    // ---------------- Deploy actions ----------------

    /// <summary>
    /// Ensures ARR proxy is enabled at server level (best-effort, idempotent),
    /// then writes web.config into the operator's existing IIS site folder. TLS
    /// and any HTTP->HTTPS redirect stay IIS's edge policy -- this tool only
    /// drops in the reverse-proxy rule.
    /// </summary>
    private async Task<(bool, string)> WriteWebConfig(CancellationToken ct)
    {
        if (!IsAdministrator()) return NotElevated();

        // Ensure ARR reverse-proxy is enabled at server level. The box already
        // runs api-chatbot this way so it is normally on; enabling it is
        // idempotent and required for the rewrite rule to proxy out.
        Log("  Ensuring ARR proxy is enabled at server level...");
        await RunPowerShell(
            "Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' " +
            "-filter 'system.webServer/proxy' -name 'enabled' -value 'True'", ct);

        try
        {
            Directory.CreateDirectory(SiteWebConfigFolder);
            var path = Path.Combine(SiteWebConfigFolder, "web.config");
            Log($"  Writing: {path}");
            File.WriteAllText(path, BuildWebConfig(ProxyPort));
            return (true, $"web.config written to {path}");
        }
        catch (Exception ex)
        {
            return (false, $"Failed to write web.config: {ex.Message}");
        }
    }

    private static string BuildWebConfig(int port) =>
        $@"<?xml version=""1.0"" encoding=""utf-8""?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name=""ReverseProxy"" stopProcessing=""true"">
          <match url=""(.*)"" />
          <action type=""Rewrite"" url=""http://localhost:{port}/{{R:1}}"" />
        </rule>
      </rules>
    </rewrite>
    <handlers>
      <add name=""SSEHandler"" path=""*"" verb=""*"" resourceType=""Unspecified"" responseBufferLimit=""0"" />
    </handlers>
    <webSocket enabled=""true"" />
  </system.webServer>
</configuration>
";

    private async Task<(bool, string)> CreateAutostart(CancellationToken ct)
    {
        await Task.CompletedTask;
        var exe = _installer.BuiltExePath;
        if (!File.Exists(exe))
            return (false, $"ClaudeWeb.exe not found at {exe} -- build it on the Local Setup tab first");

        var shortcut = AutostartShortcutPath;
        var workDir = Path.GetDirectoryName(exe) ?? "";
        Log($"  Creating startup shortcut: {shortcut}");

        // Use WScript.Shell via PowerShell to author the .lnk (no extra deps).
        var (code, stdout, stderr) = await RunPowerShell(
            "$ws = New-Object -ComObject WScript.Shell; " +
            $"$sc = $ws.CreateShortcut('{PsEscape(shortcut)}'); " +
            $"$sc.TargetPath = '{PsEscape(exe)}'; " +
            $"$sc.WorkingDirectory = '{PsEscape(workDir)}'; " +
            "$sc.Save()", ct);
        if (code != 0 || !File.Exists(shortcut))
            return (false, $"Failed to create startup shortcut.\n{stdout}\n{stderr}");
        return (true, $"Startup shortcut created: {shortcut}");
    }

    private string AutostartShortcutPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Startup), "ClaudeWeb.lnk");

    private static (bool, string) NotElevated() =>
        (false, "Run the program as Administrator to write web.config into the IIS site folder.");

    // ---------------- Orchestration ----------------

    /// <summary>Runs every check (PreFlight + state). Changes nothing.</summary>
    public async Task CheckAllAsync(CancellationToken ct)
    {
        bool admin = IsAdministrator();
        for (int i = 0; i < _steps.Count; i++)
        {
            var step = _steps[i];
            // IIS-touching checks still read fine without admin; only deploy needs it.
            step.Status = StepStatus.Running;
            StepStatusChanged?.Invoke(i, step.Status, "Checking...");
            Log($"[CHECK] {step.Number}. {step.Name}...");

            var (status, details) = await step.CheckFunc(ct);
            step.Status = status;
            step.Details = details;
            StepStatusChanged?.Invoke(i, status, details);
            Log($"  -> {status}: {details}");
        }
        if (!admin)
            Log("  NOTE: not elevated -- Deploy All's web.config step will require relaunch as Administrator.");
    }

    /// <summary>
    /// Runs deploy delegates for steps that are Missing/Failed and have one.
    /// Re-checks first and skips anything already in place. The web.config step
    /// requires Administrator (marked Failed with a clear hint when not elevated).
    /// </summary>
    public async Task DeployAllAsync(CancellationToken ct)
    {
        for (int i = 0; i < _steps.Count; i++)
        {
            var step = _steps[i];

            // Re-check; only deploy what is missing.
            var (checkStatus, checkDetails) = await step.CheckFunc(ct);
            if (checkStatus is StepStatus.Ok or StepStatus.Warning)
            {
                step.Status = checkStatus;
                step.Details = checkDetails;
                StepStatusChanged?.Invoke(i, checkStatus, checkDetails);
                Log($"[SKIP] {step.Name}: {checkStatus} ({checkDetails})");
                continue;
            }

            if (step.DeployFunc == null)
            {
                step.Status = checkStatus;
                step.Details = checkDetails + " (no auto-deploy -- resolve manually, then re-check)";
                StepStatusChanged?.Invoke(i, step.Status, step.Details);
                Log($"[BLOCKED] {step.Name}: {step.Details}");
                continue;
            }

            step.Status = StepStatus.Running;
            StepStatusChanged?.Invoke(i, StepStatus.Running, "Deploying...");
            Log($"[DEPLOY] {step.Number}. {step.Name}...");

            var (success, output) = await step.DeployFunc(ct);
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

    /// <summary>Runs only the Verify-phase steps (9-10).</summary>
    public async Task VerifyAsync(CancellationToken ct)
    {
        for (int i = 0; i < _steps.Count; i++)
        {
            var step = _steps[i];
            if (step.Phase != DeployPhase.Verify) continue;

            step.Status = StepStatus.Running;
            StepStatusChanged?.Invoke(i, step.Status, "Verifying...");
            Log($"[VERIFY] {step.Number}. {step.Name}...");

            var (status, details) = await step.CheckFunc(ct);
            step.Status = status;
            step.Details = details;
            StepStatusChanged?.Invoke(i, status, details);
            Log($"  -> {status}: {details}");
        }
    }

    /// <summary>Human-readable summary of what Deploy All will change.</summary>
    public string DescribePendingDeploys()
    {
        var pending = _steps
            .Where(s => s.DeployFunc != null && s.Status is StepStatus.Missing or StepStatus.Failed or StepStatus.Pending)
            .Select(s => $"  - {s.Number}. {s.Name}")
            .ToList();

        var lines = new List<string>
        {
            $"Proxy target:    http://localhost:{ProxyPort}",
            $"web.config into: {SiteWebConfigFolder}",
            $"Public domain:   {(string.IsNullOrWhiteSpace(Domain) ? "(none -- public health verify skipped)" : Domain)}",
            "TLS:             handled by IIS (this tool does not manage certificates)",
            "",
            "Steps to run (already-done steps are skipped):"
        };
        lines.AddRange(pending.Count == 0 ? new[] { "  (nothing pending)" } : pending.ToArray());
        if (!IsAdministrator())
            lines.Add("\nWARNING: not running as Administrator -- the web.config step will be skipped/failed.");
        return string.Join(Environment.NewLine, lines);
    }

    /// <summary>All PreFlight steps pass (Warning counts as a pass).</summary>
    public bool PreFlightPassed =>
        _steps.Where(s => s.Phase == DeployPhase.PreFlight)
              .All(s => s.Status is StepStatus.Ok or StepStatus.Warning);

    // ---------------- Shell helpers ----------------

    private static ProcessStartInfo ShellStartInfo(string fileName, string arguments, string? workingDirectory) =>
        new()
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory ?? "",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };

    /// <summary>Runs a PowerShell command (IIS cmdlets / WebAdministration).</summary>
    private Task<(int ExitCode, string Stdout, string Stderr)> RunPowerShell(string command, CancellationToken ct)
        => RunProcess("powershell.exe",
            $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"{command.Replace("\"", "\\\"")}\"",
            $"powershell -Command {command}", ct);

    private async Task<(int ExitCode, string Stdout, string Stderr)> RunProcess(
        string fileName, string arguments, string logLine, CancellationToken ct)
    {
        Log($"  > {logLine}");
        try
        {
            using var process = new Process { StartInfo = ShellStartInfo(fileName, arguments, null) };
            process.Start();
            var stdoutTask = process.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);
            string stdout = await SafeAwait(stdoutTask);
            string stderr = await SafeAwait(stderrTask);
            Log($"  Exit code: {process.ExitCode}");
            if (!string.IsNullOrWhiteSpace(stdout)) Log($"  stdout: {Truncate(stdout.Trim(), 400)}");
            if (!string.IsNullOrWhiteSpace(stderr)) Log($"  stderr: {Truncate(stderr.Trim(), 400)}");
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

    /// <summary>Escapes a string for embedding inside a PowerShell single-quoted literal.</summary>
    private static string PsEscape(string s) => (s ?? "").Replace("'", "''");

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s.Substring(0, max) + "...";

    private void Log(string message) => LogMessage?.Invoke(message);
}
