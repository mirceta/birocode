using System.ComponentModel;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Renders a typed report's schema as a JSON skeleton string for inclusion in the
/// prompt sent to the agent. The schema is derived from the report Type via
/// reflection -- single source of truth, no drift between code and the prompt's
/// "respond in this format" footer.
///
/// Ported ~verbatim from web-flow-autodev
/// (app/Autodev.AgenticStage/agentic_stage/OutputFormatRenderer.cs); see
/// openspec/changes/discover-local-apps/design.md (D1). Each property's hint value
/// comes from a [Description] attribute when present, otherwise type-appropriate
/// defaults ("..." for string, 0 for int, false for bool, [] for arrays).
/// </summary>
public static class OutputFormatRenderer
{
    private static readonly JsonSerializerOptions PrettyOptions = new() { WriteIndented = true };

    public static string Render(Type type, IReadOnlyList<string>? topLevelSubset = null)
    {
        var node = RenderObject(type, topLevelSubset);
        return node.ToJsonString(PrettyOptions);
    }

    private static JsonObject RenderObject(Type type, IReadOnlyList<string>? topLevelSubset)
    {
        var obj = new JsonObject();
        foreach (var prop in type.GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            if (!prop.CanRead) continue;
            var jsonName = prop.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name ?? prop.Name;
            if (topLevelSubset != null && !topLevelSubset.Contains(jsonName)) continue;

            var description = prop.GetCustomAttribute<DescriptionAttribute>()?.Description;
            obj[jsonName] = RenderValue(prop.PropertyType, description);
        }
        return obj;
    }

    private static JsonNode RenderValue(Type type, string? description)
    {
        var underlying = Nullable.GetUnderlyingType(type) ?? type;

        var leaf = RenderLeafIfScalar(underlying, description);
        if (leaf != null) return leaf;

        if (underlying.IsArray)
        {
            var elem = underlying.GetElementType()!;
            return new JsonArray(RenderValue(elem, null));
        }
        if (underlying.IsGenericType && typeof(System.Collections.IEnumerable).IsAssignableFrom(underlying))
        {
            var elem = underlying.GetGenericArguments()[0];
            return new JsonArray(RenderValue(elem, null));
        }

        return RenderObject(underlying, topLevelSubset: null);
    }

    private static JsonNode? RenderLeafIfScalar(Type t, string? description)
    {
        var has = !string.IsNullOrEmpty(description);

        if (t == typeof(string))
            return JsonValue.Create(has ? description : "...");

        if (t == typeof(bool))
            return has && bool.TryParse(description, out var b) ? JsonValue.Create(b) : JsonValue.Create(false);

        if (t == typeof(int) || t == typeof(short) || t == typeof(byte))
            return has && int.TryParse(description, out var i) ? JsonValue.Create(i) : JsonValue.Create(0);

        if (t == typeof(long))
            return has && long.TryParse(description, out var l) ? JsonValue.Create(l) : JsonValue.Create(0L);

        if (t == typeof(double) || t == typeof(float) || t == typeof(decimal))
            return has && double.TryParse(description, System.Globalization.CultureInfo.InvariantCulture, out var d)
                ? JsonValue.Create(d) : JsonValue.Create(0.0);

        if (t == typeof(DateTime) || t == typeof(DateTimeOffset))
            return JsonValue.Create(has ? description : "yyyy-mm-ddTHH:MM:SSZ");

        if (t.IsEnum)
            return JsonValue.Create(has ? description : string.Join(" | ", Enum.GetNames(t)));

        return null;
    }
}
