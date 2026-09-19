## ADDED Requirements

### Requirement: A repo agent can upload to, download from and list the hub file system
The `claude-web` server SHALL offer `hub_upload(path, localPath | text, note?, overwrite?)`,
`hub_download(path, localPath?, overwrite?)` and `hub_files(prefix?)` against the agent's own
machine's store. An upload SHALL read a single file under the agent's repo folder (or a text)
and store it under the hub path as the agent's handle from the harness's machine label; a
download SHALL write inside the agent's repo folder — `hub-downloads/<hub path>` unless
`localPath` names a relative file or folder — and SHALL refuse to replace an existing local
file without `overwrite`; both SHALL refuse absolute paths and paths leaving the repo folder;
a download of a file not on this machine SHALL say that the arch's `hub_transfer` brings it
here. The Tools lane SHALL list the three with the rest of the catalogue.

#### Scenario: Upload then list
- **WHEN** an agent on repo prg calls `hub_upload` with path `prg/fixtures/customers.json` and localPath `tests/fixtures/customers.json`
- **THEN** the file is on the store with uploadedBy the agent's handle and machine the harness's label, and `hub_files` with prefix `prg` lists it

#### Scenario: A download never clobbers silently
- **WHEN** an agent downloads a hub file into a folder where a file of that name exists, without overwrite
- **THEN** the call answers `exists` and the local file is untouched
