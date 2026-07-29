# agent-dock — delta

Replaces the two stacked loop sections in the dock popover with one unified
control: a loop-type picker (💡 suggestion / 📋 recipe / 🎯 goal), per-type
parameters, prompt inspection, and a single disarm. The badge now shows the
one armed mode (arming is XOR — see `autopilot-loops`). Modifies requirements
introduced by `align-dock-loop-model` (still unarchived).

## REMOVED Requirements

### Requirement: Dock loop control is grouped by loop type

**Reason**: The two-stacked-sections popover let both modes present arm
controls at once, contradicting exclusive arming and hiding the choice being
made. Replaced by the unified type-picker control.

**Migration**: The one-line per-type descriptions and the gate-closed hint
carry over into the unified control; the recipe picker becomes the recipe
type's parameter panel.

## MODIFIED Requirements

### Requirement: The dock loop badge is typed by loop type

The system SHALL type the dock card's loop indicator by the armed mode's
kind: a suggestion marker while suggestion-armed, a recipe-loop badge or
goal-loop badge while a loop is armed — with iteration progress while active,
a distinct indication of a goal loop's verify phase, and the terminal states
(with stop reason/detail) afterwards. Because arming is exclusive per agent,
the badge SHALL present a single armed mode, drawn from the read-only
projection so it stays honest while the operator gate is closed.

#### Scenario: The one armed mode is identifiable at a glance

- **WHEN** a dock card's repo has a goal loop on iteration 3 of 10
- **THEN** the card shows a goal-typed badge conveying 3/10 and no suggestion marker

#### Scenario: Verification is visible

- **WHEN** a dock card's repo has a goal loop in its verify phase
- **THEN** the badge distinguishably conveys that the loop is verifying

## ADDED Requirements

### Requirement: Unified dock loop control

The system SHALL present the dock card's loop section as one control whose
collapsed header names this agent's loop type and whether it is armed, and
whose expanded popover offers: a loop-type picker for the suggestion, recipe,
and goal types (each with a one-line description); the selected type's
parameter panel (recipe: recipe picker and cap; goal: free-text goal and cap;
suggestion: none beyond the common controls); the common suggest-or-drive
mode toggle stating plainly whether the loop only pre-fills the composer or
sends autonomously; and an arm action. While any mode is armed the control
SHALL show which mode with its live status (iterations, phase, pending
suggestion) and SHALL offer a single disarm action that clears it, plus the
mode toggle applied live. Before arming while another mode is armed, the
control SHALL state that arming replaces the currently armed mode. When the
operator gate is closed, actions SHALL surface the existing explicit
gate-closed hint rather than failing silently.

#### Scenario: One choice, then its parameters

- **WHEN** the user opens the loop popover and selects the goal type
- **THEN** only the goal type's parameters (goal text, cap) are presented for arming

#### Scenario: Disarm whatever runs from the same place

- **WHEN** any autopilot mode is armed and the user opens the popover
- **THEN** the armed mode and its status are shown with a single disarm action that clears it

#### Scenario: Replacement is stated before the click

- **WHEN** the repo is suggestion-armed and the user prepares to arm a recipe loop
- **THEN** the control states that arming will replace the suggestion arming before the arm action is taken

### Requirement: Loop prompts are inspectable from the dock

The system SHALL let the user inspect, from the dock popover, the exact
prompt text the selected loop type will (re)send — the selected recipe's full
prompt, or the goal loop's composed work and verification prompts — sourced
from the operator-gated loop detail read so the preview is byte-identical to
what the engine sends. While the operator gate is closed the popover SHALL
show the explicit gate-closed hint in place of prompt text.

#### Scenario: See the recipe prompt before arming

- **WHEN** the gate is open and the user expands the prompt inspection for a selected recipe
- **THEN** the recipe's full prompt text is shown exactly as it will be sent

#### Scenario: See the goal composition before arming

- **WHEN** the gate is open and the user has typed a goal and expands the prompt inspection
- **THEN** the composed work and verification prompts for that goal are shown as they will be stored at arm time

#### Scenario: Gate closed shows the hint, not the prompts

- **WHEN** the operator gate is closed and the user expands the prompt inspection
- **THEN** the explicit gate-closed hint is shown and no prompt text appears

### Requirement: A pending suggestion reaches the composer

The system SHALL surface a suggest-mode loop's pending prompt on the agent's
dock card and SHALL let the user place it into that agent's chat composer with
one action, so "suggest" concretely means "the next prompt appears in the
prompt textbox" for every loop type.

#### Scenario: Pending prompt fills the textbox

- **WHEN** a suggest-mode loop has a pending prompt and the user takes the use-suggestion action
- **THEN** the agent's composer is pre-filled with exactly that prompt text, and nothing is sent until the user sends it
