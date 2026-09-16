using ClaudeWeb.Services.Arch;

namespace ClaudeWeb.Services.Policeman;

/// <summary>What the loop shows the model about one card: the card, and the assignee's last words.</summary>
public sealed record CardQuestion(string CardId, string Title, string Column, string Verified, string Agent, IReadOnlyList<AgentMessage> Messages);

/// <summary>The model's one answer: which observation state, and why, in one line — or why there is
/// no answer. <see cref="Tokens"/> is what the call cost.</summary>
public sealed record CardReading(string? State, string? Summary, int Tokens, string? Error);

/// <summary>
/// The ONE thing the model decides in the policeman (openspec one-policeman): read an agent's last
/// messages and name the state it is in. Stateless, one call per question. The loop validates the
/// answer against <see cref="TaskGraph.CardObservations"/> before writing anything.
/// </summary>
public interface ICardReader
{
    Task<CardReading> ReadAsync(CardQuestion question, CancellationToken ct);
}
