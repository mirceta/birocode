using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace ClaudeWeb.Services.Terminal;

/// <summary>
/// Minimal ConPTY (Windows pseudo-console) wrapper: starts a console process
/// attached to a pseudo-console and exposes its input/output as streams.
/// This is the documented ConPTY recipe (CreatePseudoConsole +
/// PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE); .NET has no built-in PTY API.
/// ConPTY speaks UTF-8 VT sequences in both directions.
/// </summary>
public sealed class ConPty : IDisposable
{
    private readonly IntPtr _hpc;
    private readonly SafeFileHandle _outputRead;
    private readonly SafeFileHandle _inputWrite;
    private readonly PROCESS_INFORMATION _process;
    private bool _disposed;

    /// <summary>Read side of the PTY output (what the terminal displays).</summary>
    public FileStream Output { get; }

    /// <summary>Write side of the PTY input (keystrokes).</summary>
    public FileStream Input { get; }

    public int ProcessId => _process.dwProcessId;

    public ConPty(string commandLine, string workingDirectory, short cols, short rows)
    {
        // Pipes: we write input into inputWrite; ConPTY reads it from inputRead.
        // ConPTY writes output into outputWrite; we read it from outputRead.
        if (!CreatePipe(out var inputRead, out var inputWriteRaw, IntPtr.Zero, 0))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreatePipe(input)");
        if (!CreatePipe(out var outputReadRaw, out var outputWrite, IntPtr.Zero, 0))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreatePipe(output)");

        var size = new COORD { X = cols, Y = rows };
        var hr = CreatePseudoConsole(size, inputRead, outputWrite, 0, out _hpc);
        if (hr != 0) throw new Win32Exception(hr, "CreatePseudoConsole");

        // The pseudo-console holds its own references to the child-side pipe
        // ends; release ours so EOF propagates when it closes.
        CloseHandle(inputRead);
        CloseHandle(outputWrite);

        var attrListSize = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attrListSize);
        var attrList = Marshal.AllocHGlobal(attrListSize);
        try
        {
            if (!InitializeProcThreadAttributeList(attrList, 1, 0, ref attrListSize))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "InitializeProcThreadAttributeList");
            if (!UpdateProcThreadAttribute(
                    attrList, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
                    _hpc, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "UpdateProcThreadAttribute");

            var si = new STARTUPINFOEX();
            si.StartupInfo.cb = Marshal.SizeOf<STARTUPINFOEX>();
            si.lpAttributeList = attrList;

            if (!CreateProcessW(
                    null, commandLine, IntPtr.Zero, IntPtr.Zero, false,
                    EXTENDED_STARTUPINFO_PRESENT, IntPtr.Zero, workingDirectory,
                    ref si, out _process))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcessW");
        }
        finally
        {
            DeleteProcThreadAttributeList(attrList);
            Marshal.FreeHGlobal(attrList);
        }

        _outputRead = new SafeFileHandle(outputReadRaw, ownsHandle: true);
        _inputWrite = new SafeFileHandle(inputWriteRaw, ownsHandle: true);
        Output = new FileStream(_outputRead, FileAccess.Read);
        Input = new FileStream(_inputWrite, FileAccess.Write);
    }

    public void Resize(short cols, short rows)
    {
        if (_disposed) return;
        ResizePseudoConsole(_hpc, new COORD { X = cols, Y = rows });
    }

    public bool HasExited
    {
        get
        {
            if (_disposed) return true;
            return GetExitCodeProcess(_process.hProcess, out var code) && code != STILL_ACTIVE;
        }
    }

    /// <summary>Terminates the process tree, then tears down the console and
    /// pipes (this order avoids the documented ClosePseudoConsole hang).</summary>
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { TerminateProcess(_process.hProcess, 1); } catch { /* already gone */ }
        ClosePseudoConsole(_hpc);
        try { Input.Dispose(); } catch { /* broken pipe */ }
        try { Output.Dispose(); } catch { /* broken pipe */ }
        CloseHandle(_process.hProcess);
        CloseHandle(_process.hThread);
    }

    // --- interop ------------------------------------------------------------

    private const int PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016;
    private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
    private const uint STILL_ACTIVE = 259;

    [StructLayout(LayoutKind.Sequential)]
    private struct COORD { public short X; public short Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb;
        public string? lpReserved;
        public string? lpDesktop;
        public string? lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars;
        public int dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFOEX
    {
        public STARTUPINFO StartupInfo;
        public IntPtr lpAttributeList;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, IntPtr lpPipeAttributes, int nSize);

    [DllImport("kernel32.dll")]
    private static extern int CreatePseudoConsole(COORD size, IntPtr hInput, IntPtr hOutput, uint dwFlags, out IntPtr phPC);

    [DllImport("kernel32.dll")]
    private static extern int ResizePseudoConsole(IntPtr hPC, COORD size);

    [DllImport("kernel32.dll")]
    private static extern void ClosePseudoConsole(IntPtr hPC);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);

    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr attribute, IntPtr lpValue, IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessW(
        string? lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags,
        IntPtr lpEnvironment, string? lpCurrentDirectory, ref STARTUPINFOEX lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);
}
