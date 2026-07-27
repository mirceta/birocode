using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace ClaudeWeb.Services.Traffic;

/// <summary>
/// Pass-through wrapper over Response.Body that counts written bytes
/// (openspec change traffic-monitor). This exists because
/// Response.ContentLength is null for chunked/streamed responses — the chat
/// SSE stream and the localview proxy legs, exactly the heavy traffic — so
/// the only honest count is at the write call. No buffering: every write and
/// flush is forwarded immediately, so streaming behavior is unchanged.
/// </summary>
public sealed class CountingStream : Stream
{
    private readonly Stream _inner;
    private long _written;

    public CountingStream(Stream inner) => _inner = inner;

    public long BytesWritten => Interlocked.Read(ref _written);

    public override bool CanRead => false;
    public override bool CanSeek => false;
    public override bool CanWrite => _inner.CanWrite;
    public override long Length => throw new NotSupportedException();
    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        _inner.Write(buffer, offset, count);
        Interlocked.Add(ref _written, count);
    }

    public override void Write(ReadOnlySpan<byte> buffer)
    {
        _inner.Write(buffer);
        Interlocked.Add(ref _written, buffer.Length);
    }

    public override async Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken ct)
    {
        await _inner.WriteAsync(buffer, offset, count, ct);
        Interlocked.Add(ref _written, count);
    }

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken ct = default)
    {
        await _inner.WriteAsync(buffer, ct);
        Interlocked.Add(ref _written, buffer.Length);
    }

    public override void Flush() => _inner.Flush();
    public override Task FlushAsync(CancellationToken ct) => _inner.FlushAsync(ct);

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();

    // The middleware restores the original Response.Body and owns _inner's
    // lifetime; disposing the wrapper must not close the real response stream.
    protected override void Dispose(bool disposing) { }
    public override ValueTask DisposeAsync() => ValueTask.CompletedTask;
}
