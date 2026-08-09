## MODIFIED Requirements

### Requirement: The console groups its surfaces by loop type in a two-level hierarchy

The Autopilot console SHALL present its surfaces as a two-level navigation: a root
tab row of exactly seven entries — **Overview**, **Suggestion-based loop**,
**Loops** (the goal-root covering recipe / goal / queue loops), **Audit**,
**Tests**, **Reference**, and **📝 Drafts** — where the grouped roots expose a
second-level subtab row and Overview and Audit render directly. The
Suggestion-based loop root SHALL contain the subtabs **Control**, **Prompt
library**, **Live feed**, and **History**. The Loops root SHALL contain the
subtabs **Agents**, **Queue**, **Recipes**, and **Flags**. The Tests root SHALL
contain the console's test surfaces (unit, browser/system tests, E2E eval and its
reference views). The Reference root SHALL contain **How autopilot works**, **How
chat works**, and **Research**. The **Drafts** root SHALL contain one subtab per
repo registered in the harness's repo selector, each opening that repo's
three-type draft editor (queue-plan / goal / freestyle). The console SHALL still
open on Overview by default, and each grouped root SHALL open on its first
subtab.

#### Scenario: Root row shows seven grouped tabs

- **WHEN** the End User opens the Autopilot console
- **THEN** the root tab row shows exactly Overview, Suggestion-based loop, Loops, Audit, Tests, Reference, and Drafts

#### Scenario: Drafts subtabs mirror the repo selector

- **WHEN** the End User selects the Drafts root tab
- **THEN** a subtab row appears with one entry per registered repo, opening on the first repo, and selecting a repo shows its three-type draft editor

#### Scenario: Suggestion-based loop subtabs

- **WHEN** the End User selects the Suggestion-based loop root tab
- **THEN** a subtab row appears with Control, Prompt library, Live feed, and History, opening on Control

#### Scenario: Loops subtabs

- **WHEN** the End User selects the Loops root tab
- **THEN** a subtab row appears with Agents, Queue, Recipes, and Flags, opening on Agents

#### Scenario: Reference subtabs

- **WHEN** the End User selects the Reference root tab
- **THEN** a subtab row appears with How autopilot works, How chat works, and Research

### Requirement: The operator gate fences everything except the Overview

When the operator-side autopilot gate is off, the console SHALL render the
gate-off explanation for every root tab and subtab except the ungated reference
and capture surfaces: **Overview** SHALL remain fully readable as pure reference
content, the Reference root's **Research** subtab SHALL stay visible (it reads
committed repo files, not gated loop state), and the **Drafts** root SHALL stay
fully usable (drafting is idea capture with no send path, matching the briefing
editor's session-auth-only stance). The gate state SHALL NOT hide the navigation
itself — the user can still see what exists.

#### Scenario: Gated console still shows Overview and the hierarchy

- **WHEN** the operator gate is off and the End User opens the console
- **THEN** the Overview renders normally, all seven root tabs remain visible, and selecting a gated tab shows the gate-off notice instead of the view

#### Scenario: Gate off, Drafts still editable

- **WHEN** the operator gate is off and the End User opens Drafts → a repo → freestyle
- **THEN** the draft editor renders and Save works — no gate-off notice
