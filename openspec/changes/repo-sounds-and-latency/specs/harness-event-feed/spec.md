# harness-event-feed — delta for repo-sounds-and-latency

## ADDED Requirements

### Requirement: Per-repository Device cues in the consumer app

The consumer app SHALL let the user assign its device-local audio cues **per repository**
as well as per event type. A repo-scoped assignment SHALL bind a repository name and an
event-type slot (including a `_default` slot that in repo scope applies to **any** event
type from that repository) to a user-supplied audio file, stored device-local in the
browser exactly like the existing per-type assignments. When a new event is rendered with
sound enabled, the cue SHALL resolve by precedence: the event's repository + type file;
else the repository's `_default` file; else the global per-type file; else the built-in
synthesized cue for the type; else the global `_default` file for unrecognized types; else
the default synth cue. The repository SHALL be read from the event envelope's source
(`repoName`), for self and remote events alike. Assignments made before this change SHALL
keep working unchanged as the global layer, with no migration. The app SHALL offer a scope
picker listing the global scope and each repository with assignments, and SHALL let the
user add a repository scope by name (offering repository names observed in the feed). All
repo-scoped playback SHALL respect the existing device sound toggle and audio-unlock
behavior exactly as global cues do.

#### Scenario: A repo's device sound wins over the global assignment

- **WHEN** repository R has a device file for `turn.ended`, a global `turn.ended` file also exists, sound is enabled, and a `turn.ended` event from R arrives
- **THEN** the browser plays R's file, not the global one

#### Scenario: A repo default makes every event from that repo distinctive

- **WHEN** repository R has only a repo `_default` device file, sound is enabled, and a `chat.focus` event from R arrives
- **THEN** the browser plays R's `_default` file rather than the built-in `chat.focus` synth

#### Scenario: Other repos are unaffected by one repo's assignments

- **WHEN** only repository R has repo-scoped device files and an event from repository S arrives with sound enabled
- **THEN** the cue resolves through the global files and synth cues exactly as before this change

#### Scenario: Existing device assignments survive the change

- **WHEN** the user had per-type device files assigned before this change and reloads the app after it
- **THEN** those assignments still play as the global layer, with no re-assignment needed
