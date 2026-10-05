using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace ClaudeWeb.Services.Hosting;

/// <summary>
/// A polled JSON GET that costs no body when nothing changed (openspec board-load-live): the
/// payload is serialized with the controllers' own JSON options, tagged with a weak ETag of
/// its bytes and sent <c>private, no-cache</c>, so the browser keeps it and revalidates on
/// every poll — an unchanged payload answers <c>304</c>. For payloads that are large and
/// stable between polls (the task board: 295 KB every 5 s per open Kanban).
/// </summary>
public static class ConditionalJson
{
    public static IActionResult Result(ControllerBase controller, object payload)
    {
        var options = controller.HttpContext.RequestServices.GetService<IOptions<JsonOptions>>()?.Value.JsonSerializerOptions
            ?? new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(payload, options);
        var etag = ETagOf(bytes);
        controller.Response.Headers.ETag = etag;
        controller.Response.Headers.CacheControl = "private, no-cache";
        if (Matches(controller.Request.Headers.IfNoneMatch.ToString(), etag))
            return controller.StatusCode(StatusCodes.Status304NotModified);
        return controller.File(bytes, "application/json; charset=utf-8");
    }

    /// <summary>Weak: the same payload is one entity whatever the content-encoding on the wire.</summary>
    internal static string ETagOf(byte[] bytes) => "W/\"" + Convert.ToHexString(SHA256.HashData(bytes), 0, 12) + "\"";

    /// <summary>If-None-Match against our tag: a list, <c>*</c>, weak or strong spelling.</summary>
    internal static bool Matches(string? ifNoneMatch, string etag)
    {
        if (string.IsNullOrWhiteSpace(ifNoneMatch)) return false;
        static string Bare(string t) { t = t.Trim(); return t.StartsWith("W/", StringComparison.Ordinal) ? t[2..] : t; }
        var want = Bare(etag);
        foreach (var part in ifNoneMatch.Split(','))
        {
            var t = part.Trim();
            if (t == "*" || Bare(t) == want) return true;
        }
        return false;
    }
}
