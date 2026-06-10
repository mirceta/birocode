using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

namespace ClaudeWeb.Services.Screen;

/// <summary>
/// Captures the host desktop (or a single top-level window) as JPEG bytes for
/// the Screen tab (plans/screen-tab.md). Works because the Harness runs as a
/// WinForms app inside the interactive desktop session. If that session is
/// locked or RDP-disconnected, captures come back black -- by design.
/// </summary>
public class ScreenService
{
    private const int JpegQuality = 60;
    private const uint PwRenderFullContent = 2;

    public sealed record WindowInfo(long Hwnd, string Title);

    /// <summary>Visible top-level windows with a non-empty title.</summary>
    public IReadOnlyList<WindowInfo> ListWindows()
    {
        var windows = new List<WindowInfo>();
        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd)) return true;
            var len = GetWindowTextLength(hwnd);
            if (len == 0) return true;
            var sb = new StringBuilder(len + 1);
            GetWindowText(hwnd, sb, sb.Capacity);
            var title = sb.ToString().Trim();
            if (title.Length > 0)
                windows.Add(new WindowInfo(hwnd.ToInt64(), title));
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    /// <summary>
    /// JPEG snapshot of the whole virtual desktop (hwnd null) or one window.
    /// </summary>
    public byte[] Capture(long? hwnd)
    {
        using var bitmap = hwnd is long h ? CaptureWindow(new IntPtr(h)) : CaptureDesktop();
        return EncodeJpeg(bitmap);
    }

    private static Bitmap CaptureDesktop()
    {
        var bounds = System.Windows.Forms.SystemInformation.VirtualScreen;
        var bitmap = new Bitmap(bounds.Width, bounds.Height);
        using var g = Graphics.FromImage(bitmap);
        g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size);
        return bitmap;
    }

    private static Bitmap CaptureWindow(IntPtr hwnd)
    {
        if (!GetWindowRect(hwnd, out var rect))
            throw new ArgumentException("Window not found (it may have been closed).");
        var width = Math.Max(1, rect.Right - rect.Left);
        var height = Math.Max(1, rect.Bottom - rect.Top);

        var bitmap = new Bitmap(width, height);
        using (var g = Graphics.FromImage(bitmap))
        {
            var hdc = g.GetHdc();
            var ok = PrintWindow(hwnd, hdc, PwRenderFullContent);
            g.ReleaseHdc(hdc);
            if (!ok)
            {
                // Some windows (e.g. hardware-accelerated) refuse PrintWindow;
                // fall back to copying the window's screen region.
                g.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height));
            }
        }
        return bitmap;
    }

    private static byte[] EncodeJpeg(Bitmap bitmap)
    {
        var codec = ImageCodecInfo.GetImageEncoders()
            .First(c => c.FormatID == ImageFormat.Jpeg.Guid);
        using var ep = new EncoderParameters(1);
        ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)JpegQuality);
        using var ms = new MemoryStream();
        bitmap.Save(ms, codec, ep);
        return ms.ToArray();
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLength(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
}
