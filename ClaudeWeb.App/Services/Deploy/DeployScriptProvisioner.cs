using System.Reflection;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Deploy;

/// <summary>
/// Seeds the off-repo deploy tooling (swap.ps1 / rollback.ps1 / arm.ps1) on first
/// run, the same LoadOrSeed pattern AuthService uses for auth.json. The scripts
/// live OUTSIDE the repo at runtime (rollback reverts the working tree, so its own
/// scripts must not sit inside it — see <see cref="ClaudeWeb.Models.AppConfig.DeployScriptsDir"/>),
/// but their canonical source is committed as embedded-resource templates under
/// <c>Deploy/templates/*.ps1.tmpl</c>. That makes the deploy procedure reproducible
/// on any machine: a fresh checkout writes correct, path-substituted scripts for
/// THAT box.
///
/// Missing-only: an existing script is never overwritten, so a machine that already
/// has hand-tuned scripts (e.g. the original dev box) is left untouched.
/// </summary>
public static class DeployScriptProvisioner
{
    private static readonly string[] Scripts = { "swap.ps1", "rollback.ps1", "arm.ps1" };

    /// <summary>
    /// Resolves the deploy-scripts directory for this machine. Honors an explicit
    /// configured value; otherwise defaults to <c>&lt;parent-of-repo&gt;/claudeweb-rollback</c>
    /// — off-repo but next to the tree it deploys. Returns null if neither a config
    /// value nor a repo root is available (an install shipped without the source tree).
    /// </summary>
    public static string? ResolveDir(string? configured, string? repoRoot)
    {
        if (!string.IsNullOrWhiteSpace(configured)) return configured;
        if (string.IsNullOrWhiteSpace(repoRoot)) return null;
        var parent = Directory.GetParent(repoRoot.TrimEnd('\\', '/'))?.FullName;
        return parent is null ? null : Path.Combine(parent, "claudeweb-rollback");
    }

    /// <summary>
    /// Ensures <paramref name="deployDir"/> exists and contains each deploy script,
    /// writing any missing one from its embedded template with the machine's repo
    /// root and deploy dir substituted in. Best-effort: never throws into startup.
    /// </summary>
    public static void EnsureSeeded(string? deployDir, string? repoRoot, Logger logger)
    {
        if (string.IsNullOrWhiteSpace(deployDir) || string.IsNullOrWhiteSpace(repoRoot))
        {
            // No repo root (source-less install) or no dir -> nothing to deploy from/to.
            return;
        }

        try
        {
            Directory.CreateDirectory(deployDir);
            foreach (var name in Scripts)
            {
                var dest = Path.Combine(deployDir, name);
                if (File.Exists(dest)) continue; // never clobber an existing script

                var template = ReadTemplate(name);
                if (template is null)
                {
                    logger.Error($"[DEPLOY] Template for {name} not found in assembly resources; skipped seeding.");
                    continue;
                }

                var body = template
                    .Replace("__REPO__", repoRoot)
                    .Replace("__DEPLOYDIR__", deployDir);
                File.WriteAllText(dest, body);
                logger.Info($"[DEPLOY] Seeded deploy script {dest}");
            }
        }
        catch (Exception ex)
        {
            // Seeding is best-effort; the Deployments tab surfaces a missing-script
            // failure later rather than taking the whole harness down at startup.
            logger.Error($"[DEPLOY] Failed to seed deploy scripts in {deployDir}: {ex.Message}");
        }
    }

    private static string? ReadTemplate(string scriptName)
    {
        var asm = Assembly.GetExecutingAssembly();
        // Embedded as ClaudeWeb.Deploy.templates.<script>.tmpl (RootNamespace = ClaudeWeb).
        var resource = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith($"templates.{scriptName}.tmpl", StringComparison.OrdinalIgnoreCase));
        if (resource is null) return null;
        using var stream = asm.GetManifestResourceStream(resource);
        if (stream is null) return null;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
