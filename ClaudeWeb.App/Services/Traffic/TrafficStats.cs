using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace ClaudeWeb.Services.Traffic;

/// <summary>
/// In-memory throughput counters for everything the harness serves
/// (openspec change traffic-monitor). Fed by TrafficMiddleware for every
/// request — static files, /api/*, and the localview proxy legs alike — and
/// read by GET /api/traffic.
///
/// Model: per endpoint bucket, a ring of one-second slots RingSeconds deep,
/// indexed by unix-second modulo. A slot is lazily reset when its stored
/// second no longer matches, so idle buckets cost nothing and rates decay to
/// zero on their own. Writes take a per-bucket lock — harness traffic is tens
/// of requests/sec at worst, so contention is irrelevant and the lock keeps
/// the reset-then-add sequence trivially correct.
///
/// Bucket cardinality is capped: once MaxBuckets distinct keys exist, further
/// keys are lumped into "other" so a path scanner can't grow the table.
/// Everything resets on harness restart by design — this is monitoring, not
/// billing.
/// </summary>
public class TrafficStats
{
    public const int RingSeconds = 900;   // 15 min of 1s slots
    public const int MaxBuckets = 100;
    public const string OverflowBucket = "other";

    private sealed class Bucket
    {
        public readonly long[] Second = new long[RingSeconds];
        public readonly long[] Requests = new long[RingSeconds];
        public readonly long[] BytesIn = new long[RingSeconds];
        public readonly long[] BytesOut = new long[RingSeconds];
        public readonly object Gate = new();
    }

    private readonly ConcurrentDictionary<string, Bucket> _buckets = new();

    private static long NowSec() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    public void Record(string bucketKey, long bytesIn, long bytesOut)
    {
        if (_buckets.Count >= MaxBuckets && !_buckets.ContainsKey(bucketKey))
            bucketKey = OverflowBucket;
        var b = _buckets.GetOrAdd(bucketKey, _ => new Bucket());

        var now = NowSec();
        var idx = (int)(now % RingSeconds);
        lock (b.Gate)
        {
            if (b.Second[idx] != now)
            {
                b.Second[idx] = now;
                b.Requests[idx] = 0;
                b.BytesIn[idx] = 0;
                b.BytesOut[idx] = 0;
            }
            b.Requests[idx]++;
            b.BytesIn[idx] += Math.Max(0, bytesIn);
            b.BytesOut[idx] += Math.Max(0, bytesOut);
        }
    }

    public record WindowRates(double ReqPerSec, double BytesInPerSec, double BytesOutPerSec);
    public record BucketRow(string Key, long Requests, long BytesIn, long BytesOut);
    public record HistorySlot(long Requests, long BytesOut);

    /// <summary>Totals for one bucket over the trailing <paramref name="windowSec"/> seconds.</summary>
    private static (long req, long bin, long bout) Sum(Bucket b, long now, int windowSec)
    {
        long req = 0, bin = 0, bout = 0;
        lock (b.Gate)
        {
            for (var s = now - windowSec + 1; s <= now; s++)
            {
                var idx = (int)(s % RingSeconds);
                if (b.Second[idx] != s) continue; // slot is stale/idle
                req += b.Requests[idx];
                bin += b.BytesIn[idx];
                bout += b.BytesOut[idx];
            }
        }
        return (req, bin, bout);
    }

    public WindowRates Rates(int windowSec)
    {
        var now = NowSec();
        long req = 0, bin = 0, bout = 0;
        foreach (var b in _buckets.Values)
        {
            var (r, i, o) = Sum(b, now, windowSec);
            req += r; bin += i; bout += o;
        }
        return new WindowRates(
            (double)req / windowSec,
            (double)bin / windowSec,
            (double)bout / windowSec);
    }

    /// <summary>All-bucket totals per second for the trailing <paramref name="seconds"/>
    /// seconds, oldest first — sparkline food.</summary>
    public List<HistorySlot> History(int seconds)
    {
        var now = NowSec();
        var slots = new List<HistorySlot>(seconds);
        for (var s = now - seconds + 1; s <= now; s++)
        {
            long req = 0, bout = 0;
            var idx = (int)(s % RingSeconds);
            foreach (var b in _buckets.Values)
            {
                lock (b.Gate)
                {
                    if (b.Second[idx] != s) continue;
                    req += b.Requests[idx];
                    bout += b.BytesOut[idx];
                }
            }
            slots.Add(new HistorySlot(req, bout));
        }
        return slots;
    }

    /// <summary>Top buckets by response bytes over the trailing window.</summary>
    public List<BucketRow> Top(int windowSec, int count)
    {
        var now = NowSec();
        return _buckets
            .Select(kv =>
            {
                var (r, i, o) = Sum(kv.Value, now, windowSec);
                return new BucketRow(kv.Key, r, i, o);
            })
            .Where(row => row.Requests > 0)
            .OrderByDescending(row => row.BytesOut)
            .ThenByDescending(row => row.Requests)
            .Take(count)
            .ToList();
    }
}
