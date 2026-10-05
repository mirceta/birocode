// livetrace — a read-only request tracer for a RUNNING harness (openspec board-load-live).
//
// Attaches to the process over the .NET diagnostics channel (EventPipe), listens to Kestrel's
// own Request/Start, Request/Stop and Connection/Start events for N seconds, and reports every
// request the process served under its real traffic: path, duration, remote address. Nothing
// is sent to the process and no login is involved, so it measures the LIVE hub — the place a
// "slow board" actually happens — without a browser session.
//
//   dotnet run -c Release --project tools/livetrace -- <pid> <seconds> [out.jsonl]
//
// Output: one JSON line per request in out.jsonl (default livetrace.jsonl), and a table of
// the paths by total server time: count, p50, p95, max, total seconds.
using System.Diagnostics.Tracing;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Diagnostics.NETCore.Client;
using Microsoft.Diagnostics.Tracing;

if (args.Length < 2 || !int.TryParse(args[0], out var pid) || !int.TryParse(args[1], out var seconds))
{
    Console.Error.WriteLine("usage: livetrace <pid> <seconds> [out.jsonl]");
    return 2;
}
var outPath = args.Length > 2 ? args[2] : "livetrace.jsonl";
const string Kestrel = "Microsoft-AspNetCore-Server-Kestrel";

var client = new DiagnosticsClient(pid);
using var session = client.StartEventPipeSession(
    new[] { new EventPipeProvider(Kestrel, EventLevel.Verbose, -1) }, requestRundown: false, circularBufferMB: 64);
var source = new EventPipeEventSource(session.EventStream);
var conns = new Dictionary<string, string>();                       // connectionId -> remote endpoint
var open = new Dictionary<string, (double At, string Method, string Path, string Conn)>();
var done = new List<(string Key, double Ms)>();
var t0 = DateTime.UtcNow;
using var w = new StreamWriter(outPath) { AutoFlush = true };
source.Dynamic.All += e =>
{
    try
    {
        if (e.ProviderName != Kestrel) return;
        string P(string name) { try { return e.PayloadByName(name)?.ToString() ?? ""; } catch { return ""; } }
        var at = (e.TimeStamp.ToUniversalTime() - t0).TotalMilliseconds;
        switch (e.EventName)
        {
            case "Connection/Start": conns[P("connectionId")] = P("remoteEndPoint"); break;
            case "Connection/Stop": conns.Remove(P("connectionId")); break;
            case "Request/Start": open[P("connectionId") + "|" + P("requestId")] = (at, P("method"), P("path"), P("connectionId")); break;
            case "Request/Stop":
                if (open.Remove(P("connectionId") + "|" + P("requestId"), out var s))
                {
                    conns.TryGetValue(s.Conn, out var remote);
                    var ip = remote ?? "?"; var colon = ip.LastIndexOf(':'); if (colon > 0) ip = ip[..colon];
                    var ms = Math.Round(at - s.At, 1);
                    w.WriteLine(JsonSerializer.Serialize(new { at = Math.Round(s.At), ms, method = s.Method, path = s.Path, remote = ip, wall = e.TimeStamp.ToString("HH:mm:ss.fff") }));
                    done.Add((s.Method + " " + Normalize(s.Path), ms));
                }
                break;
        }
    }
    catch { /* one malformed event never stops the capture */ }
};
var stop = Task.Run(async () => { await Task.Delay(TimeSpan.FromSeconds(seconds)); session.Stop(); });
source.Process();
await stop;

Console.WriteLine($"{done.Count} requests in {seconds} s ({done.Count / (double)seconds:0.0}/s) -> {outPath}");
Console.WriteLine($"{"path",-72} {"n",5} {"p50",8} {"p95",8} {"max",8} {"total s",8}");
foreach (var g in done.GroupBy(d => d.Key).OrderByDescending(g => g.Sum(x => x.Ms)).Take(30))
{
    var v = g.Select(x => x.Ms).OrderBy(x => x).ToList();
    double Pct(double p) => v[Math.Min(v.Count - 1, (int)(v.Count * p))];
    Console.WriteLine($"{(g.Key.Length > 72 ? g.Key[..72] : g.Key),-72} {v.Count,5} {Pct(0.5),8:0} {Pct(0.95),8:0} {v[^1],8:0} {v.Sum() / 1000,8:0.0}");
}
if (open.Count > 0)
{
    Console.WriteLine($"still open at the end ({open.Count}; streams are expected here):");
    foreach (var o in open.Values.OrderBy(o => o.At).Take(12)) Console.WriteLine($"  since +{o.At / 1000:0} s: {o.Method} {o.Path}");
}
return 0;

// Ids and hashed asset names collapse so one endpoint is one row.
static string Normalize(string path)
{
    path = Regex.Replace(path, "/[0-9a-f]{32}", "/<id>");
    path = Regex.Replace(path, "/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "/<guid>");
    return Regex.Replace(path, "assets/.*", "assets/*");
}
