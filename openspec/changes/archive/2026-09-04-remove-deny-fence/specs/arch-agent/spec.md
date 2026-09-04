## MODIFIED Requirements

### Requirement: Arch sends are fenced, capped, and audited like loop sends
The drive cap, the suggest/drive mode, and the audit log SHALL apply to arch sends
unchanged. The text of a send SHALL NOT be word-filtered (the deny-word fence was
removed, openspec remove-deny-fence). A send beyond the cap SHALL return `capped`. In
suggest mode the wake prompt SHALL pre-fill the Arch tab composer instead of being sent.

#### Scenario: Risky words do not block an arch send
- **WHEN** the arch agent calls `send_task` on an armed loop with text such as "commit and push, then merge"
- **THEN** the send proceeds through the normal availability, slot and audit path

#### Scenario: Suggest mode holds the wake prompt
- **WHEN** the arch loop is armed in suggest mode and a managed repo publishes `turn.ended`
- **THEN** the composed wake prompt appears in the Arch tab composer and no arch turn runs until the Operator sends it
