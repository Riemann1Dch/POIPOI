// PoiPoi Launcher - Double-click to start the desktop pet
// Compile: csc /target:winexe /win32icon:public\pet-icon.ico launcher.cs
// No runtime dependencies beyond .NET Framework 4.0+

using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class PoiPoiLauncher
{
    static void Main()
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;

        if (!Directory.Exists(appDir))
        {
            MessageBox.Show(
                "Cannot find PoiPoi application directory:\n" + appDir,
                "PoiPoi Launcher",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c cd /d \"" + appDir + "\" && npm start",
                WorkingDirectory = appDir,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = false,
            };

            using (var proc = Process.Start(psi))
            {
                if (proc == null)
                {
                    MessageBox.Show(
                        "Failed to start PoiPoi.\nCommand: npm start",
                        "PoiPoi Launcher",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Error launching PoiPoi:\n" + ex.Message,
                "PoiPoi Launcher",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
