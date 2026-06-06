using ClaudeWeb.Models;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.UI;
using Microsoft.Extensions.Configuration;

namespace ClaudeWeb;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();

        // Load strongly typed config from appsettings.json (copied next to the exe).
        var config = LoadConfig();
        EnsureWorkingDirectory(config);

        // Shared singletons -- registered in DI by EmbeddedApi so all modules inject them.
        var logger = new Logger();

        // Start the embedded Kestrel server on a background thread.
        var api = new EmbeddedApi(config, logger);
        api.Start();

        // Launch the monitoring GUI (blocks on the WinForms message loop).
        var form = new MainForm(config, logger, api);
        Application.Run(form);

        // Shut the server down cleanly when the GUI closes.
        api.Stop();
    }

    private static AppConfig LoadConfig()
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
            .Build();

        var config = new AppConfig();
        configuration.Bind(config);
        return config;
    }

    private static void EnsureWorkingDirectory(AppConfig config)
    {
        try { Directory.CreateDirectory(config.WorkingDirectory); }
        catch { /* directory creation is best-effort; GUI surfaces issues later */ }
    }
}
