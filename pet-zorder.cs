// PetZOrder - Windows Z-Order utility for Pi Pet
// Compiled via PowerShell Add-Type at app startup.
// Zero runtime dependencies.

using System;
using System.Runtime.InteropServices;

class PetZOrder
{
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter,
        int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    const int GWL_EXSTYLE = -20;
    const int WS_EX_NOACTIVATE = 0x08000000;
    const int WS_EX_TOOLWINDOW = 0x00000080;
    const int WS_EX_APPWINDOW = 0x00040000;

    const uint SWP_NOSIZE = 0x0001;
    const uint SWP_NOMOVE = 0x0002;
    const uint SWP_NOACTIVATE = 0x0010;

    static readonly IntPtr HWND_BOTTOM = (IntPtr)1;
    static readonly IntPtr HWND_TOP = (IntPtr)0;

    static void Main(string[] args)
    {
        if (args.Length < 2) return;

        string action = args[0].ToLower();
        string title = string.Join(" ", args, 1, args.Length - 1);

        IntPtr hWnd = FindWindow(null, title);
        if (hWnd == IntPtr.Zero) return;

        switch (action)
        {
            case "bottom":
                // Push window behind all normal windows
                SetWindowPos(hWnd, HWND_BOTTOM, 0, 0, 0, 0,
                    SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
                // Apply WS_EX_NOACTIVATE + TOOLWINDOW, remove APPWINDOW
                int s = GetWindowLong(hWnd, GWL_EXSTYLE);
                SetWindowLong(hWnd, GWL_EXSTYLE,
                    (s | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);
                break;

            case "top":
                // Bring to top (not topmost, just top of z-order)
                SetWindowPos(hWnd, HWND_TOP, 0, 0, 0, 0,
                    SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
                break;

            case "style":
                // Ensure correct window style
                int cs = GetWindowLong(hWnd, GWL_EXSTYLE);
                SetWindowLong(hWnd, GWL_EXSTYLE,
                    (cs | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);
                break;
        }
    }
}
