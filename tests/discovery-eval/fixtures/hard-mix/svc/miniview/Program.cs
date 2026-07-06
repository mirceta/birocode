// Miniview — embedded C# HttpListener server on a fixed dual-stack loopback port.
using System.Net;

var port = 5414;
var root = AppContext.BaseDirectory;
// When run via `dotnet run`, content files sit next to the project; probe both.
var pageFile = File.Exists(Path.Combine(root, "index.html"))
    ? Path.Combine(root, "index.html")
    : Path.Combine(Directory.GetCurrentDirectory(), "index.html");

var listener = new HttpListener();
listener.Prefixes.Add($"http://127.0.0.1:{port}/");
listener.Prefixes.Add($"http://[::1]:{port}/");
listener.Start();
Console.WriteLine($"miniview on http://127.0.0.1:{port}/ and http://[::1]:{port}/");

while (listener.IsListening)
{
    var ctx = listener.GetContext();
    if (ctx.Request.Url?.AbsolutePath is "/" or "/index.html")
    {
        var bytes = File.ReadAllBytes(pageFile);
        ctx.Response.ContentType = "text/html; charset=utf-8";
        ctx.Response.OutputStream.Write(bytes);
    }
    else
    {
        ctx.Response.StatusCode = 404;
    }
    ctx.Response.Close();
}
