using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace ClaudeWeb.Services.FleetProxy;

/// <summary>
/// This computer's browser proxy setup script (openspec fleet-proxy): the current Windows user's
/// "Use setup script" address, which Chrome and Edge follow. The harness only ever writes ITS OWN
/// address and only ever removes it when it is still its own — a setup script the Operator set by
/// hand is reported, never overwritten.
/// </summary>
public static class BrowserProxy
{
    private const string Key = @"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    private const string Value = "AutoConfigURL";

    /// <summary>An isolated test instance must never touch the real browser setting.</summary>
    public static bool Disabled => Environment.GetEnvironmentVariable("CLAUDEWEB_PROXY_NO_BROWSER") == "1";

    public static string? Current()
    {
        try { using var k = Registry.CurrentUser.OpenSubKey(Key); return k?.GetValue(Value) as string; }
        catch { return null; }
    }

    /// <summary>"set" (ours), "other" (someone else's script — left alone), "off".</summary>
    public static string State(string ours)
    {
        var cur = Current();
        if (string.IsNullOrEmpty(cur)) return "off";
        return string.Equals(cur, ours, StringComparison.OrdinalIgnoreCase) ? "set" : "other";
    }

    /// <summary>Sets ours unless another script is there. Returns the resulting state.</summary>
    public static string Ensure(string ours)
    {
        if (Disabled) return "disabled";
        var state = State(ours);
        if (state != "off") return state;
        try
        {
            using var k = Registry.CurrentUser.CreateSubKey(Key);
            k.SetValue(Value, ours, RegistryValueKind.String);
            Notify();
            return "set";
        }
        catch { return "error"; }
    }

    /// <summary>Removes ours (only ours). Returns the resulting state.</summary>
    public static string Remove(string ours)
    {
        if (Disabled) return "disabled";
        if (State(ours) != "set") return State(ours);
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(Key, writable: true);
            k?.DeleteValue(Value, throwOnMissingValue: false);
            Notify();
            return "off";
        }
        catch { return "error"; }
    }

    // Tell WinINet (and so Chrome / Edge) that the proxy settings changed.
    [DllImport("wininet.dll", SetLastError = true)]
    private static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
    private const int SettingsChanged = 39, Refresh = 37;
    private static void Notify()
    {
        try { InternetSetOption(IntPtr.Zero, SettingsChanged, IntPtr.Zero, 0); InternetSetOption(IntPtr.Zero, Refresh, IntPtr.Zero, 0); }
        catch { /* best effort: the browser re-reads on its next start */ }
    }
}
