// Home bridge — a one-way forward proxy on the Hub (openspec change home-bridge-proxy).
//
// The Hub sits on two networks: home (network A, 192.168.1.x, maximal trust) and business
// (network B, 192.168.0.x, must never see home). This proxy lets ONE home computer open
// business addresses (http://192.168.0.42:5099 …) in Chrome, unchanged, and nothing else:
//
//   * it listens only on the Hub's home-side address (found in listenSubnet), never on B,
//     so nothing on the business network can even connect to it;
//   * it serves only clients in allowClients (checked here, on top of the firewall rule);
//   * it forwards only to IPv4 literals inside allowTargets (no host names, no internet,
//     no other home machines) — it is not an open proxy;
//   * IP forwarding stays off: B gets no route to A. Every connection is started from A.
//
// GET /proxy.pac (asked of the proxy itself) returns the setup script for the home PC.
// One log line per request in <exe dir>/logs/homebridge-yyyyMMdd.log.

using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace HomeBridge;

public sealed record Config(string ListenSubnet, int Port, string[] AllowClients, string[] AllowTargets);

public static class Program
{
    static Config _cfg = null!;
    static List<(IPAddress Net, int Bits)> _targets = new();
    static HashSet<IPAddress> _clients = new();
    static IPAddress _listen = IPAddress.None;
    static readonly object LogLock = new();
    static string _logDir = "";

    public static async Task<int> Main(string[] args)
    {
        var dir = AppContext.BaseDirectory;
        var cfgPath = args.Length > 0 ? args[0] : Path.Combine(dir, "homebridge.json");
        _cfg = JsonSerializer.Deserialize<Config>(File.ReadAllText(cfgPath), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
               ?? throw new InvalidOperationException("empty config");
        _targets = _cfg.AllowTargets.Select(ParseCidr).ToList();
        _clients = _cfg.AllowClients.Select(IPAddress.Parse).ToHashSet();
        _logDir = Path.Combine(dir, "logs");
        Directory.CreateDirectory(_logDir);
        var home = ParseCidr(_cfg.ListenSubnet);

        // Bind to the home-side address; if it disappears (Wi-Fi down, DHCP change), stop
        // listening and bind again to whatever home-side address comes back.
        while (true)
        {
            var found = LocalIPv4().FirstOrDefault(a => InCidr(a, home));
            if (found == null) { Log($"waiting: no local address in {_cfg.ListenSubnet}"); await Task.Delay(TimeSpan.FromSeconds(30)); continue; }
            _listen = found;
            var listener = new TcpListener(_listen, _cfg.Port);
            try { listener.Start(); }
            catch (SocketException ex) { Log($"cannot listen on {_listen}:{_cfg.Port}: {ex.Message}"); await Task.Delay(TimeSpan.FromSeconds(30)); continue; }
            Log($"started: listening on {_listen}:{_cfg.Port} · clients {string.Join(",", _cfg.AllowClients)} · targets {string.Join(",", _cfg.AllowTargets)}");

            using var gone = new CancellationTokenSource();
            _ = Task.Run(async () =>
            {
                while (LocalIPv4().Contains(_listen)) await Task.Delay(TimeSpan.FromSeconds(30));
                Log($"address {_listen} is gone: re-binding");
                gone.Cancel();
            });
            try
            {
                while (true)
                {
                    var client = await listener.AcceptTcpClientAsync(gone.Token);
                    _ = Task.Run(() => HandleAsync(client));
                }
            }
            catch (OperationCanceledException) { }
            finally { listener.Stop(); }
        }
    }

    static async Task HandleAsync(TcpClient client)
    {
        using var _ = client;
        var remote = ((IPEndPoint)client.Client.RemoteEndPoint!).Address.MapToIPv4();
        var stream = client.GetStream();
        try
        {
            if (!_clients.Contains(remote)) { Log($"{remote} DENIED client"); return; }

            var (head, extra) = await ReadHeadAsync(stream);
            if (head == null) return;
            var lines = head.Split("\r\n");
            var parts = lines[0].Split(' ');
            if (parts.Length < 3) { await RespondAsync(stream, 400, "bad request line"); return; }
            var (method, target) = (parts[0], parts[1]);

            if (method == "CONNECT")
            {
                if (!TryTarget(target, out var ep)) { Log($"{remote} DENIED CONNECT {target}"); await RespondAsync(stream, 403, $"home bridge: {target} is not on the business network"); return; }
                using var upstream = await ConnectAsync(ep);
                if (upstream == null) { Log($"{remote} FAILED CONNECT {target}"); await RespondAsync(stream, 502, $"home bridge: {target} does not answer"); return; }
                await stream.WriteAsync(Encoding.ASCII.GetBytes("HTTP/1.1 200 Connection Established\r\n\r\n"));
                var (up, down) = await PipeAsync(stream, upstream.GetStream(), extra);
                Log($"{remote} CONNECT {target} ↑{up} ↓{down}");
                return;
            }

            if (target.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            {
                var uri = new Uri(target);
                var hostPort = $"{uri.Host}:{uri.Port}";
                if (!TryTarget(hostPort, out var ep)) { Log($"{remote} DENIED {method} {target}"); await RespondAsync(stream, 403, $"home bridge: {uri.Host} is not on the business network"); return; }
                using var upstream = await ConnectAsync(ep);
                if (upstream == null) { Log($"{remote} FAILED {method} {target}"); await RespondAsync(stream, 502, $"home bridge: {hostPort} does not answer"); return; }

                // Origin-form request line; one request per connection (a pooled proxy connection
                // may next ask another host), so the proxy-only and hop-by-hop headers go.
                var upgrade = lines.Any(l => l.StartsWith("Upgrade:", StringComparison.OrdinalIgnoreCase));
                var sb = new StringBuilder($"{method} {uri.PathAndQuery} {parts[2]}\r\n");
                foreach (var l in lines.Skip(1))
                {
                    if (l.Length == 0) continue;
                    var name = l.Split(':', 2)[0].Trim();
                    if (name.Equals("Proxy-Connection", StringComparison.OrdinalIgnoreCase) || name.Equals("Proxy-Authorization", StringComparison.OrdinalIgnoreCase)
                        || name.Equals("Keep-Alive", StringComparison.OrdinalIgnoreCase)
                        || (!upgrade && name.Equals("Connection", StringComparison.OrdinalIgnoreCase))) continue;
                    sb.Append(l).Append("\r\n");
                }
                if (!upgrade) sb.Append("Connection: close\r\n");
                sb.Append("\r\n");
                var us = upstream.GetStream();
                await us.WriteAsync(Encoding.ASCII.GetBytes(sb.ToString()));
                var (up, down) = await PipeAsync(stream, us, extra);
                Log($"{remote} {method} {target} ↑{up} ↓{down}");
                return;
            }

            // Asked of the proxy itself.
            if (method == "GET" && target.Split('?')[0] == "/proxy.pac") { await RespondAsync(stream, 200, Pac(), "application/x-ns-proxy-autoconfig"); Log($"{remote} PAC"); return; }
            if (method == "GET" && target == "/") { await RespondAsync(stream, 200, $"home bridge on {_listen}:{_cfg.Port}: business addresses {string.Join(", ", _cfg.AllowTargets)} for {string.Join(", ", _cfg.AllowClients)}. Setup script: http://{_listen}:{_cfg.Port}/proxy.pac\n"); return; }
            await RespondAsync(stream, 404, "home bridge: not a proxy request");
        }
        catch (Exception ex) when (ex is IOException or SocketException or ObjectDisposedException or UriFormatException)
        {
            Log($"{remote} error {ex.GetType().Name}: {ex.Message}");
        }
    }

    // The setup script: business addresses through the bridge, everything else direct.
    static string Pac()
    {
        var conds = string.Join(" || ", _targets.Select(t => $"isInNet(host, \"{t.Net}\", \"{Mask(t.Bits)}\")"));
        return "function FindProxyForURL(url, host) {\n" +
               $"  if (/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(host) && ({conds})) return \"PROXY {_listen}:{_cfg.Port}\";\n" +
               "  return \"DIRECT\";\n}\n";
    }

    static bool TryTarget(string hostPort, out IPEndPoint ep)
    {
        ep = null!;
        var i = hostPort.LastIndexOf(':');
        if (i <= 0 || !int.TryParse(hostPort[(i + 1)..], out var port) || port is < 1 or > 65535) return false;
        if (!IPAddress.TryParse(hostPort[..i], out var ip) || ip.AddressFamily != AddressFamily.InterNetwork) return false; // IPv4 literals only
        if (!_targets.Any(t => InCidr(ip, t))) return false;
        ep = new IPEndPoint(ip, port);
        return true;
    }

    static async Task<TcpClient?> ConnectAsync(IPEndPoint ep)
    {
        var c = new TcpClient(AddressFamily.InterNetwork);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        try { await c.ConnectAsync(ep, cts.Token); return c; }
        catch { c.Dispose(); return null; }
    }

    static async Task<(long Up, long Down)> PipeAsync(NetworkStream client, NetworkStream upstream, byte[] extra)
    {
        if (extra.Length > 0) await upstream.WriteAsync(extra);
        var upTask = CopyAsync(client, upstream);
        var downTask = CopyAsync(upstream, client);
        var first = await Task.WhenAny(upTask, downTask);
        // The client finished sending: half-close upstream and keep streaming the answer.
        // The upstream finished first: the answer is complete; the caller closes both sides.
        if (first == upTask) { try { upstream.Socket.Shutdown(SocketShutdown.Send); } catch { } await downTask; }
        else { try { client.Socket.Shutdown(SocketShutdown.Send); } catch { } }
        return (extra.Length + (upTask.IsCompletedSuccessfully ? upTask.Result : 0), downTask.Result);
    }

    static async Task<long> CopyAsync(NetworkStream from, NetworkStream to)
    {
        var buf = new byte[32 * 1024];
        long total = 0;
        try
        {
            int n;
            while ((n = await from.ReadAsync(buf)) > 0) { await to.WriteAsync(buf.AsMemory(0, n)); total += n; }
        }
        catch (IOException) { }
        catch (ObjectDisposedException) { }
        return total;
    }

    // Reads up to the blank line; returns the head and any body bytes read past it.
    static async Task<(string? Head, byte[] Extra)> ReadHeadAsync(NetworkStream s)
    {
        var buf = new byte[64 * 1024];
        var len = 0;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (len < buf.Length)
        {
            var n = await s.ReadAsync(buf.AsMemory(len), cts.Token);
            if (n == 0) return (null, Array.Empty<byte>());
            len += n;
            var end = IndexOf(buf, len, "\r\n\r\n"u8);
            if (end >= 0) return (Encoding.ASCII.GetString(buf, 0, end), buf[(end + 4)..len]);
        }
        return (null, Array.Empty<byte>());
    }

    static int IndexOf(byte[] buf, int len, ReadOnlySpan<byte> pat) => buf.AsSpan(0, len).IndexOf(pat);

    static async Task RespondAsync(NetworkStream s, int code, string body, string type = "text/plain; charset=utf-8")
    {
        var b = Encoding.UTF8.GetBytes(body);
        var reason = code switch { 200 => "OK", 400 => "Bad Request", 403 => "Forbidden", 404 => "Not Found", _ => "Bad Gateway" };
        var head = $"HTTP/1.1 {code} {reason}\r\nContent-Type: {type}\r\nContent-Length: {b.Length}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        await s.WriteAsync(Encoding.ASCII.GetBytes(head));
        await s.WriteAsync(b);
    }

    static IEnumerable<IPAddress> LocalIPv4() =>
        System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .Select(u => u.Address)
            .Where(a => a.AddressFamily == AddressFamily.InterNetwork);

    static (IPAddress Net, int Bits) ParseCidr(string s)
    {
        var p = s.Split('/');
        return (IPAddress.Parse(p[0]), p.Length > 1 ? int.Parse(p[1]) : 32);
    }

    static bool InCidr(IPAddress ip, (IPAddress Net, int Bits) c)
    {
        var a = BitConverter.ToUInt32(ip.MapToIPv4().GetAddressBytes().Reverse().ToArray());
        var n = BitConverter.ToUInt32(c.Net.GetAddressBytes().Reverse().ToArray());
        var mask = c.Bits == 0 ? 0u : uint.MaxValue << (32 - c.Bits);
        return (a & mask) == (n & mask);
    }

    static string Mask(int bits)
    {
        var m = bits == 0 ? 0u : uint.MaxValue << (32 - bits);
        return new IPAddress(BitConverter.GetBytes(m).Reverse().ToArray()).ToString();
    }

    static void Log(string line)
    {
        var text = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {line}";
        lock (LogLock)
        {
            try { File.AppendAllText(Path.Combine(_logDir, $"homebridge-{DateTime.Now:yyyyMMdd}.log"), text + Environment.NewLine); } catch { }
        }
    }
}
