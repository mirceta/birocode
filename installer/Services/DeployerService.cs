using System.Diagnostics;
using System.Net.Http;
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
/// Service. "Deploy" means put IIS (ARR reverse proxy + TLS) in front of the
/// in-session app and autostart that app at logon. ClaudeWeb.App source is
/// never modified -- hardening gaps are reported as warnings only.
///
/// Shell routing: cmd.exe /c for netsh and friends, powershell.exe -Command for
/// IIS cmdlets (WebAdministration). IIS/cert/ARR steps require Administrator.
/// </summary>
public class DeployerService
{
    private readonly InstallerService _installer;
    private readonly List<DeployStep> _steps;
    private readonly string _settingsPath;

    // Deployer settings panel values (persisted to the shared settings.json
    // under a "Deploy" section so the installer's own keys are untouched).
    public string Domain { get; private set; } = "";
    public int ProxyPort { get; private set; }
    public string PfxPath { get; private set; } = "";
    public string PfxPassword { get; private set; } = "";
    public string CertThumbprint { get; private set; } = "";
    public string SiteName { get; private set; } = "ClaudeWeb";

    /// <summary>Physical folder that holds the IIS site's web.config.</summary>
    public string SitePhysicalPath =>
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
            PfxPath = d["PfxPath"]?.GetValue<string>() ?? "";
            PfxPassword = d["PfxPassword"]?.GetValue<string>() ?? "";
            CertThumbprint = d["CertThumbprint"]?.GetValue<string>() ?? "";
            SiteName = d["SiteName"]?.GetValue<string>() ?? "ClaudeWeb";
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
            ["PfxPath"] = PfxPath,
            ["PfxPassword"] = PfxPassword,
            ["CertThumbprint"] = CertThumbprint,
            ["SiteName"] = SiteName
        };

        File.WriteAllText(_settingsPath,
            obj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    public void SetDomain(string value) { Domain = value?.Trim() ?? ""; SaveSettings(); }
    public void SetProxyPort(int value) { ProxyPort = value; SaveSettings(); }
    public void SetPfxPath(string value) { PfxPath = value?.Trim() ?? ""; SaveSettings(); }
    public void SetPfxPassword(string value) { PfxPassword = value ?? ""; SaveSettings(); }
    public void SetCertThumbprint(string value)
    {
        // Normalize: strip spaces / non-hex so thumbprint compares cleanly.
        CertThumbprint = new string((value ?? "").Where(Uri.IsHexDigit).ToArray()).ToUpperInvariant();
        SaveSettings();
    }
    public void SetSiteName(string value)
    {
        SiteName = string.IsNullOrWhiteSpace(value) ? "ClaudeWeb" : value.Trim();
        SaveSettings();
    }

    /// <summary>True once the minimum settings to run Deploy All are present.</summary>
    public bool CanDeploy =>
        !string.IsNullOrWhiteSpace(Domain)
        && ProxyPort is > 0 and <= 65535
        && (!string.IsNullOrWhiteSpace(PfxPath) || !string.IsNullOrWhiteSpace(CertThumbprint));

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
            // -- PreFlight (checks only; change nothing) --
            new DeployStep(1, "Local Setup passed",
                "Backend (ClaudeWeb.exe) and frontend (client/dist) are built",
                DeployPhase.PreFlight, CheckLocalSetup),

            new DeployStep(2, "App responding",
                "GET http://localhost:<port>/api/health returns 200",
                DeployPhase.PreFlight, CheckAppResponding),

            new DeployStep(3, "Hardening review",
                "CORS / rate-limit / default password warnings (never blocks)",
                DeployPhase.PreFlight, CheckHardening),

            // -- IisProxy (need Administrator) --
            new DeployStep(4, "IIS installed",
                "Web-Server feature / W3SVC service present",
                DeployPhase.IisProxy, CheckIisInstalled),

            new DeployStep(5, "ARR module present",
                "Application Request Routing global module is installed",
                DeployPhase.IisProxy, CheckArrPresent),

            new DeployStep(6, "ARR proxy enabled",
                "Server-level system.webServer/proxy enabled = True",
                DeployPhase.Configure, CheckArrProxyEnabled, EnableArrProxy),

            new DeployStep(7, "IIS site + SSL binding",
                "Site on 443 bound to the domain with the TLS certificate",
                DeployPhase.IisProxy, CheckIisSite, CreateIisSite),

            new DeployStep(8, "web.config written",
                "Reverse proxy + HTTPS redirect + SSE + websockets in site path",
                DeployPhase.Configure, CheckWebConfig, WriteWebConfig),

            // -- Autostart (no admin needed) --
            new DeployStep(9, "Autostart at logon",
                "Shortcut to ClaudeWeb.exe in the current user's Startup folder",
                DeployPhase.Autostart, CheckAutostart, CreateAutostart),

            // -- Verify --
            new DeployStep(10, "Local health 200",
                "GET http://localhost:<port>/api/health -> 200",
                DeployPhase.Verify, CheckAppResponding),

            new DeployStep(11, "Public health 200",
                "GET https://<domain>/api/health -> 200 (through IIS)",
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

    // ---------------- IIS / ARR checks ----------------

    private async Task<(StepStatus, string)> CheckIisInstalled(CancellationToken ct)
    {
        // W3SVC service is the most reliable signal and works without admin.
        var (code, stdout, _) = await RunPowerShell(
            "(Get-Service -Name W3SVC -ErrorAction SilentlyContinue).Status", ct);
        if (code == 0 && stdout.Trim().Length > 0 && !stdout.Contains("Cannot find"))
            return (StepStatus.Ok, $"W3SVC service: {stdout.Trim()}");

        return (StepStatus.Missing,
            "IIS (W3SVC) not detected. Install IIS with the URL Rewrite and ARR modules, then re-check.");
    }

    private async Task<(StepStatus, string)> CheckArrPresent(CancellationToken ct)
    {
        var (code, stdout, stderr) = await RunPowerShell(
            "Get-WebGlobalModule -Name ApplicationRequestRouting -ErrorAction SilentlyContinue | " +
            "Select-Object -ExpandProperty Name", ct);
        if (code == 0 && stdout.Contains("ApplicationRequestRouting", StringComparison.OrdinalIgnoreCase))
            return (StepStatus.Ok, "ApplicationRequestRouting module present");

        return (StepStatus.Missing,
            "ARR not installed. Install Application Request Routing (and URL Rewrite) from the Microsoft Web Platform, then re-check. " +
            (stderr.Trim().Length > 0 ? $"[{stderr.Trim()}]" : ""));
    }

    private async Task<(StepStatus, string)> CheckArrProxyEnabled(CancellationToken ct)
    {
        var (code, stdout, _) = await RunPowerShell(
            "(Get-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' " +
            "-filter 'system.webServer/proxy' -name 'enabled' -ErrorAction SilentlyContinue).Value", ct);
        if (code == 0 && stdout.Trim().Equals("True", StringComparison.OrdinalIgnoreCase))
            return (StepStatus.Ok, "ARR proxy enabled at server level");
        return (StepStatus.Missing, "ARR proxy not enabled at server level");
    }

    private async Task<(StepStatus, string)> CheckIisSite(CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(Domain))
            return (StepStatus.Missing, "Set the public domain in the settings panel first");

        var (code, stdout, _) = await RunPowerShell(
            $"$s = Get-Website -Name '{SiteName}' -ErrorAction SilentlyContinue; " +
            "if ($s) { ($s.bindings.Collection | ForEach-Object { $_.bindingInformation }) -join ';' }", ct);
        if (code != 0 || stdout.Trim().Length == 0)
            return (StepStatus.Missing, $"IIS site '{SiteName}' does not exist");

        bool has443 = stdout.Contains(":443:");
        bool hasDomain = stdout.Contains(Domain, StringComparison.OrdinalIgnoreCase);
        return has443 && hasDomain
            ? (StepStatus.Ok, $"Site '{SiteName}' bound to {Domain}:443")
            : (StepStatus.Missing,
                $"Site '{SiteName}' exists but is not bound to {Domain}:443 (bindings: {stdout.Trim()})");
    }

    private async Task<(StepStatus, string)> CheckWebConfig(CancellationToken ct)
    {
        await Task.CompletedTask;
        var path = Path.Combine(SitePhysicalPath, "web.config");
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
            return (StepStatus.Missing, "Set the public domain first");
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

    private async Task<(bool, string)> EnableArrProxy(CancellationToken ct)
    {
        if (!IsAdministrator()) return NotElevated();
        var (code, stdout, stderr) = await RunPowerShell(
            "Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' " +
            "-filter 'system.webServer/proxy' -name 'enabled' -value 'True'", ct);
        return code == 0
            ? (true, "ARR proxy enabled")
            : (false, $"Failed to enable ARR proxy.\n{stdout}\n{stderr}");
    }

    private async Task<(bool, string)> CreateIisSite(CancellationToken ct)
    {
        if (!IsAdministrator()) return NotElevated();
        if (string.IsNullOrWhiteSpace(Domain))
            return (false, "Public domain is required");

        Directory.CreateDirectory(SitePhysicalPath);

        // 1. Resolve the certificate thumbprint -- import the .pfx if a path was given.
        string thumb = CertThumbprint;
        if (!string.IsNullOrWhiteSpace(PfxPath))
        {
            if (!File.Exists(PfxPath))
                return (false, $"PFX file not found: {PfxPath}");

            Log($"  Importing PFX into LocalMachine\\My: {PfxPath}");
            string pwExpr = string.IsNullOrEmpty(PfxPassword)
                ? "$null"
                : $"(ConvertTo-SecureString -String '{PsEscape(PfxPassword)}' -AsPlainText -Force)";
            var (icode, istdout, istderr) = await RunPowerShell(
                $"$c = Import-PfxCertificate -FilePath '{PsEscape(PfxPath)}' " +
                $"-CertStoreLocation Cert:\\LocalMachine\\My -Password {pwExpr}; " +
                "$c.Thumbprint", ct);
            if (icode != 0)
                return (false, $"PFX import failed.\n{istdout}\n{istderr}");
            thumb = new string(istdout.Where(Uri.IsHexDigit).ToArray()).ToUpperInvariant();
            Log($"  Imported cert thumbprint: {thumb}");
        }

        if (string.IsNullOrWhiteSpace(thumb))
            return (false, "No certificate thumbprint resolved (provide a .pfx path or a thumbprint)");

        // 2. Create the site if missing (HTTP placeholder binding -- the SSL
        //    binding is added in the next step via New-WebBinding + netsh).
        var (ccode, cstdout, cstderr) = await RunPowerShell(
            $"if (-not (Get-Website -Name '{SiteName}' -ErrorAction SilentlyContinue)) {{ " +
            $"New-WebSite -Name '{SiteName}' -Port 80 -HostHeader '{Domain}' " +
            $"-PhysicalPath '{PsEscape(SitePhysicalPath)}' -Force | Out-Null }} " +
            $"if (-not (Get-WebBinding -Name '{SiteName}' -Protocol https -Port 443 -ErrorAction SilentlyContinue)) {{ " +
            $"New-WebBinding -Name '{SiteName}' -Protocol https -Port 443 -HostHeader '{Domain}' -SslFlags 1 }}", ct);
        if (ccode != 0)
            return (false, $"Failed to create/ensure IIS site.\n{cstdout}\n{cstderr}");

        // 3. Bind the certificate (SNI) to domain:443 via netsh.
        Log($"  Binding cert {thumb} to {Domain}:443 (SNI)");
        string appId = "{" + Guid.NewGuid() + "}";
        var (ncode, nstdout, nstderr) = await RunCmd(
            $"netsh http add sslcert hostnameport={Domain}:443 certhash={thumb} " +
            $"appid={appId} certstorename=MY", ct);
        if (ncode != 0)
        {
            // A pre-existing binding is fine; report other failures.
            string combined = nstdout + nstderr;
            if (!combined.Contains("exists", StringComparison.OrdinalIgnoreCase)
                && !combined.Contains("1312", StringComparison.OrdinalIgnoreCase))
                return (false, $"netsh sslcert binding failed.\n{combined}");
            Log("  (SSL binding already existed -- leaving it in place)");
        }

        return (true, $"Site '{SiteName}' bound to {Domain}:443 with cert {thumb}");
    }

    private async Task<(bool, string)> WriteWebConfig(CancellationToken ct)
    {
        if (!IsAdministrator()) return NotElevated();
        await Task.CompletedTask;
        try
        {
            Directory.CreateDirectory(SitePhysicalPath);
            var path = Path.Combine(SitePhysicalPath, "web.config");
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
        <rule name=""HttpsRedirect"" stopProcessing=""true"">
          <match url=""(.*)"" />
          <conditions>
            <add input=""{{HTTPS}}"" pattern=""^OFF$"" />
          </conditions>
          <action type=""Redirect"" url=""https://{{HTTP_HOST}}/{{R:1}}"" redirectType=""Permanent"" />
        </rule>
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
        (false, "Run the program as Administrator to configure IIS / certificates.");

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
            Log("  NOTE: not elevated -- Deploy All's IIS/cert steps will require relaunch as Administrator.");
    }

    /// <summary>
    /// Runs deploy delegates for steps that are Missing/Failed and have one.
    /// Re-checks first and skips anything already in place. IIS/cert steps
    /// require Administrator (marked Failed with a clear hint when not elevated).
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

    /// <summary>Runs only the Verify-phase steps (10-11).</summary>
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
            $"Domain:        {Domain}",
            $"Proxy target:  http://localhost:{ProxyPort}",
            $"IIS site:      {SiteName} (physical path {SitePhysicalPath})",
            $"TLS:           {(string.IsNullOrWhiteSpace(PfxPath) ? $"thumbprint {CertThumbprint}" : $"import {PfxPath}")}",
            "",
            "Steps to run (already-done steps are skipped):"
        };
        lines.AddRange(pending.Count == 0 ? new[] { "  (nothing pending)" } : pending.ToArray());
        if (!IsAdministrator())
            lines.Add("\nWARNING: not running as Administrator -- IIS/cert steps will be skipped/failed.");
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

    /// <summary>Runs a command via cmd.exe /c (netsh, etc.).</summary>
    private Task<(int ExitCode, string Stdout, string Stderr)> RunCmd(string command, CancellationToken ct)
        => RunProcess("cmd.exe", $"/c {command}", $"cmd /c {command}", ct);

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
