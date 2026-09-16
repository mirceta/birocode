## 1. Build

- [x] 1.1 `Services/Policeman/`: `PolicemanIdentity`, `PolicemanToolPolicy`, `PolicemanPrompt` (steps as data),
      `PolicemanLifecycleRules`, `PolicemanLifecycle` (an `IArchConversationHook`), `PolicemanTools`, module registration.
- [x] 1.2 Arch side: `IArchConversationHost`, `IArchConversationHook`, `IAgentDirectory`; `ArchAgentService.Hooks.cs`
      implements them and drives the hooks; lazy hook injection; `DisallowedToolsFor` via the policy.
- [x] 1.3 Callers moved: `ArchMcpServer` → `PolicemanTools`; `ArchController` → `PolicemanLifecycle`; `AutopilotService` →
      `TickConversationHooks`; `ArchStateStore` → `PolicemanLifecycleRules`.
- [x] 1.4 `ArchAgentService.Policeman.cs` and `ArchPoliceman.cs` deleted.

## 2. Verify

- [x] 2.1 Full backend suite green with the names moved; four new rule tests.
- [x] 2.2 Understanding app refreshed to the parts: tab 0 "The parts" (main machine → sub-machine → fences → tools → the board), tabs 1–3 named by the part that owns them, the pass steps in plain words; unit + screenshot tests updated.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word.
