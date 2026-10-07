## ADDED Requirements

### Requirement: An Arch examples tab catalogues what the Operator asks the arch for
The Management dashboard SHALL offer an "Arch examples" tab that charts the Operator's requests to the arch agent by category and lists one card per category. The data SHALL come from a miner over this machine's arch conversations — the arch transcripts (Operator turns only, harness-written turns excluded), the Operator-started goal conversations and the repo-agent requests — classified by the ordered rules committed at `management/arch-example-categories.json`, with secrets and e-mail addresses scrubbed. Each card SHALL show the category's name, count, description, a template prompt with a copy-to-clipboard control, up to two real examples with their dates, the arch tools typically used, a phrasing tip, and whether it usually ends in a goal conversation; the tab SHALL be filterable by keyword and SHALL show a bar chart by frequency and a per-week sparkline. On the hub a Re-mine control SHALL re-run the extraction; on a machine without arch conversations the tab SHALL show the snapshot committed with the harness and say so.

#### Scenario: A newcomer wants to redeploy the hub
- **WHEN** they open Arch examples and search "redeploy"
- **THEN** the "Pull main and redeploy this hub" card shows with real examples, and Copy prompt puts its template on the clipboard

#### Scenario: Re-mine on the hub
- **WHEN** the Operator presses Re-mine on DESKTOP-POAPPP3
- **THEN** every arch transcript, goal and repo-agent request is read again and the chart and cards update, with the source line naming the counts

#### Scenario: Another machine
- **WHEN** the tab is opened on a harness with no arch conversations
- **THEN** it shows the committed snapshot and says it was mined on the hub, and offers no Re-mine
