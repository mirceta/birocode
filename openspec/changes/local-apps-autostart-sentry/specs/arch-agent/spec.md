## ADDED Requirements

### Requirement: The arch can report the fleet's autostart local apps
The arch agent SHALL have a read-only tool `local_apps_status` (optionally for one machine) that returns, per machine, how many local apps are flagged for autostart and how many are up, down or failing, with each down or failing app's machine, agent, app, port and last error. Its guidance SHALL say to report failing apps to the Operator and never to start, stop or flag local apps itself.

#### Scenario: A failing app after a reboot
- **WHEN** the Operator asks the arch whether everything came back after a reboot and one flagged app is failing
- **THEN** the arch calls local_apps_status and names that app with its last error, without starting it
