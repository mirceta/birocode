using System.Text.Json;
using ClaudeWeb.Services.Chat;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for the multiplexed chat attachment (openspec
/// reduce-connection-appetite): envelope shapes (evt / ctl:none / ctl:end),
/// verbatim inner-event embedding with seq intact, per-sub replay watermarks,
/// live events crossing the merge, and termination once every sub ends.
/// </summary>
public sealed class ChatStreamMultiplexerTests
{
    private static ChatStreamMultiplexer.Sub Sub(string repo, int after = 0, string lane = "builder", int id = 1) =>
        new(id, repo, lane, after);

    private static async Task<List<JsonDocument>> Collect(
        IReadOnlyList<(ChatStreamMultiplexer.Sub, RunSession?)> subs)
    {
        var items = new List<JsonDocument>();
        await foreach (var json in ChatStreamMultiplexer.Merge(subs))
            items.Add(JsonDocument.Parse(json));
        return items;
    }

    [Fact]
    public async Task Missing_session_yields_ctl_none_and_stream_ends()
    {
        var items = await Collect(new[] { (Sub("ghost", id: 7), (RunSession?)null) });
        var one = Assert.Single(items);
        Assert.Equal(7, one.RootElement.GetProperty("id").GetInt32());
        Assert.Equal("ghost", one.RootElement.GetProperty("repoId").GetString());
        Assert.Equal("builder", one.RootElement.GetProperty("lane").GetString());
        Assert.Equal("none", one.RootElement.GetProperty("ctl").GetString());
    }

    [Fact]
    public async Task Two_watchers_of_one_run_each_get_their_own_replay_and_end()
    {
        var s = new RunSession("repoA");
        await s.EmitAsync(new { type = "token", text = "one" });
        await s.EmitAsync(new { type = "token", text = "two" });
        s.Complete();

        // Watcher 1 is caught up to seq 1; watcher 2 wants everything.
        var items = await Collect(new[]
        {
            (Sub("repoA", after: 1, id: 1), (RunSession?)s),
            (Sub("repoA", after: 0, id: 2), (RunSession?)s),
        });

        var for1 = items.Where(i => i.RootElement.GetProperty("id").GetInt32() == 1).ToList();
        var for2 = items.Where(i => i.RootElement.GetProperty("id").GetInt32() == 2).ToList();
        // Watcher 1: only seq 2 + its own end. Watcher 2: both events + its own end.
        Assert.Equal(2, for1.Count);
        Assert.Equal("two", for1[0].RootElement.GetProperty("evt").GetProperty("text").GetString());
        Assert.Equal("end", for1[1].RootElement.GetProperty("ctl").GetString());
        Assert.Equal(3, for2.Count);
        Assert.Equal("one", for2[0].RootElement.GetProperty("evt").GetProperty("text").GetString());
        Assert.Equal("two", for2[1].RootElement.GetProperty("evt").GetProperty("text").GetString());
        Assert.Equal("end", for2[2].RootElement.GetProperty("ctl").GetString());
    }

    [Fact]
    public async Task Completed_sessions_replay_enveloped_events_then_end()
    {
        var a = new RunSession("repoA");
        await a.EmitAsync(new { type = "token", text = "hello" });
        a.Complete();
        var b = new RunSession("repoB", "ask");
        await b.EmitAsync(new { type = "token", text = "hi" });
        b.Complete();

        var items = await Collect(new[]
        {
            (Sub("repoA"), (RunSession?)a),
            (Sub("repoB", lane: "ask"), (RunSession?)b),
        });

        // Per sub: one evt envelope + one ctl:end, in order within the sub.
        var forA = items.Where(i => i.RootElement.GetProperty("repoId").GetString() == "repoA").ToList();
        Assert.Equal(2, forA.Count);
        var evt = forA[0].RootElement.GetProperty("evt");
        Assert.Equal("hello", evt.GetProperty("text").GetString());
        Assert.Equal(1, evt.GetProperty("seq").GetInt32()); // inner seq intact
        Assert.Equal("end", forA[1].RootElement.GetProperty("ctl").GetString());

        var forB = items.Where(i => i.RootElement.GetProperty("repoId").GetString() == "repoB").ToList();
        Assert.Equal("ask", forB[0].RootElement.GetProperty("lane").GetString());
        Assert.Equal("hi", forB[0].RootElement.GetProperty("evt").GetProperty("text").GetString());
    }

    [Fact]
    public async Task Replay_watermark_skips_already_seen_events()
    {
        var s = new RunSession("repoA");
        await s.EmitAsync(new { type = "token", text = "one" });
        await s.EmitAsync(new { type = "token", text = "two" });
        s.Complete();

        var items = await Collect(new[] { (Sub("repoA", after: 1), (RunSession?)s) });
        Assert.Equal(2, items.Count); // just seq 2 + end
        Assert.Equal("two", items[0].RootElement.GetProperty("evt").GetProperty("text").GetString());
        Assert.Equal("end", items[1].RootElement.GetProperty("ctl").GetString());
    }

    [Fact]
    public async Task Live_events_cross_the_merge_and_complete_ends_it()
    {
        var s = new RunSession("repoA"); // running
        var collected = Collect(new[] { (Sub("repoA"), (RunSession?)s) });

        await s.EmitAsync(new { type = "token", text = "live" });
        s.Complete();

        var items = await collected.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal("live", items[0].RootElement.GetProperty("evt").GetProperty("text").GetString());
        Assert.Equal("end", items[^1].RootElement.GetProperty("ctl").GetString());
    }

    [Fact]
    public async Task Cancellation_tears_down_without_faulting()
    {
        var s = new RunSession("repoA"); // running, never completes
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
        var items = new List<string>();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await foreach (var json in ChatStreamMultiplexer.Merge(
                new[] { (Sub("repoA"), (RunSession?)s) }, cts.Token))
                items.Add(json);
        });
    }
}
