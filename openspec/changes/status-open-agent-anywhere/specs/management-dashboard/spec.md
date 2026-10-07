## ADDED Requirements

### Requirement: Opening an agent from the Status tab works whatever its tab is doing
Double-clicking an agent chip on Status → Agents, and the details' primary "Open harness" control, SHALL open the agent:
they SHALL show that agent in its per-agent harness tab for every managed repo agent, local
or remote: a new tab when none exists, the existing tab switched to the agent when it shows a
harness (same origin or another machine), the existing tab navigated back to the agent when it
was parked on another page, and a fresh tab when the management page itself occupies the agent's
named tab. The harness tab SHALL activate the agent's dock tab, opening one when the repo has
none, and land on the Agent tab. The Status tab SHALL say what happened after every open, and
when the agent's tab may not have come to the front (no answer, pop-up blocked, another window)
SHALL keep a visible line with a link that opens the agent in a new tab. A machine with an
unknown address gets no action and no hint.

#### Scenario: The agent's tab already exists and shows another agent
- **WHEN** the Operator double-clicks pers-dec while its tab shows a different dock
- **THEN** no second tab opens, the existing tab switches to pers-dec, and the Status tab says it was switched

#### Scenario: The dashboard sits in the agent's own tab
- **WHEN** the Management App is loaded in the tab that carries pers-dec's name and the Operator double-clicks pers-dec
- **THEN** pers-dec opens in a new tab beside the dashboard, the dashboard stays where it is, and the Status tab says so

#### Scenario: Nothing came to the front
- **WHEN** the agent's tab does not answer within a second or the browser blocked the pop-up
- **THEN** the Status tab keeps a line saying why, with "open … in a new tab"
