using Microsoft.Extensions.DependencyInjection;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// The policeman (openspec one-policeman): one loop in harness code — the verifier and the judge
/// in <c>TaskGraph</c>, and here the reading half around them: <see cref="PolicemanSweep"/>
/// (trace PRs to cards · one question per card with new words · flags by rule), the one model
/// call it makes (<see cref="ICardReader"/>, <see cref="CliCardReader"/>), its settings, and its
/// journal. The <see cref="TaskGraph.TaskVerificationPoller"/> runs the whole loop every minute.
/// </summary>
public static class PolicemanModuleExtensions
{
    public static IServiceCollection AddPolicemanModule(this IServiceCollection services)
    {
        services.AddSingleton(_ => new PolicemanSettings(AppPaths.DataDir));
        services.AddSingleton(_ => new PolicemanJournal(AppPaths.DataDir));
        services.AddSingleton<ICardReader, CliCardReader>();
        services.AddSingleton<PolicemanSweep>();
        return services;
    }
}
