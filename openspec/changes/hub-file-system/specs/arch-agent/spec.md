## ADDED Requirements

### Requirement: The arch lists the fleet's hub files and moves them between machines
The arch's MCP server SHALL offer `hub_files(machine?, prefix?)` — this hub's store and every
reachable peer's, rows carrying the machine, provenance, size, version and note, with
machines that did not answer named in the detail — and `hub_transfer(path, from?, to?,
overwrite?)`, which SHALL fetch a peer's file into the hub, push a hub file to a peer, or move
peer → peer through the hub, refusing a push when this Operator has not allowed sends to that
machine and relaying the peer's `not-accepting` when its Operator has not opted in. The role
prompt SHALL teach the ritual: send the uploader its hub path, wait for its reply, transfer,
send the downloader the hub path — and that the transfer step is unnecessary on one machine.

#### Scenario: The Operator asks for A's fixtures on B
- **WHEN** the Operator says "have spacex/prg#1 upload its fixtures to the hub as prg/fixtures/, then have MONSTER/web#1 download them"
- **THEN** the arch sends A the upload instruction naming `prg/fixtures/<name>`, transfers each path to MONSTER after A's reply, and sends B the download instruction naming the same paths
