# discover-local-apps — delta for import-discovery-findings

## ADDED Requirements

### Requirement: Import externally produced findings into the cache

The system SHALL let the operator import discovery findings produced outside the
harness — a JSON array of findings (`name`, `port`, `folder`, `evidence`,
`startCommand`), or the equivalent report object — into the caller's repository's
discovery cache, surfaced as an import action in the Discover Local Apps panel
(paste, or choose a `.json` file that fills the same input) and backed by a harness
endpoint. A successful import SHALL merge the findings into the on-disk cache with
the same union-by-port semantics as a completed scan: new ports added, a cached
finding whose port matches an imported finding replaced by the imported one,
unmatched cached ports kept. Each imported finding's last-discovered time SHALL be
the import time. After a successful import (with no scan in flight) the merged set
SHALL be what cache loads, discovery-status reads, Run-by-port, and Check see, and
the endpoint SHALL return the updated snapshot. The import SHALL be validated
all-or-nothing: malformed JSON, a payload that is not an array/report object, or
any finding without a non-empty name and folder and a port in 1..65535 SHALL
reject the entire import with an explicit error and leave the cache and in-memory
result unchanged. When a discovery scan for the repository is in flight, the import
SHALL merge into the on-disk cache without disturbing the running job, and the
scan's own completion merge SHALL surface the imported findings. Importing SHALL
NOT modify the repository's files, SHALL NOT run the discovery agent, and SHALL NOT
register or start any app. The import affordance is an Advanced-mode affordance
under the existing discovery capability.

#### Scenario: Imported findings are unioned into the cache

- **WHEN** the operator imports a JSON array of findings for a repository whose cache already holds other ports
- **THEN** the cache afterwards holds the union — imported ports added or replacing matching cached ports, other cached ports kept — and each imported finding's last-discovered time is the import time

#### Scenario: Imported findings are immediately actionable

- **WHEN** an import succeeds while no scan is in flight
- **THEN** the panel shows the merged findings from the returned snapshot, and register / Run / Check / delete work on imported rows exactly as on scanned rows

#### Scenario: Invalid payload rejects the whole import

- **WHEN** the operator submits malformed JSON, a non-array/non-report payload, or an array in which any finding lacks a valid name, folder, or port
- **THEN** the system returns an explicit error naming the problem, and the cache and any in-memory discovery result are unchanged — no finding from the payload is imported

#### Scenario: Import during a running scan does not disturb the scan

- **WHEN** the operator imports findings while a discovery scan for the repository is running
- **THEN** the import merges into the on-disk cache, the running scan continues unaffected, and when the scan completes its result is unioned with the imported findings

#### Scenario: Import is passive toward the repository

- **WHEN** findings are imported for a repository
- **THEN** no file inside the repository is created, modified, or deleted, no discovery agent runs, and no app is registered or started as a side effect
