# Acceptance transcripts (openspec repo-agent-arch-picture)

Built by `.claudeweb-preview/acceptance-arch-picture.py` from the SOURCE texts (the preamble constant and the request_arch description in `RepoAgentMcpServer.cs`, as restacked on openspec repo-agent-my-peers), run with `claude -p` on a fresh model that had nothing else (2026-10-06). Scenario: the prg agent on RAZVOJ2016 needs a SQL Server with the Birokrat databases in LOCAL layout that its machine lacks and may not install.

## 1. The request it writes (the arguments to request_arch)

```
```json
{
  "title": "Need a peer with SQL Server + Birokrat DBs in LOCAL layout to run and verify the invoice-import migration",
  "text": "RAZVOJ2016/prg#1 here, branch feature/invoice-import of the Birokrat ERP. The migration script is written and committed; verifying it requires running it against a Microsoft SQL Server with the Birokrat databases restored in LOCAL layout (Birokrat installed under C:\\Birokrat, databases on the same machine). RAZVOJ2016 has no SQL Server and I may not install one, so this cannot be verified here. I am not asking for a machine or an instance — please find the peer that already has that setup and hand it the branch. Because a branch can only go to an agent of the same repo, the recipient must be a Birokrat repo agent on a machine with a local-layout install; a machine-level question about who has SQL Server can go to any agent on a candidate machine. I am pushing feature/invoice-import now and leaving a run/verify note in the repo so whoever fits can pick it up without me. Any answer reaches me later as an arch@ prompt; I will carry on with the parts that do not need a database.",
  "probe": "On your machine: do you have a Microsoft SQL Server instance with the Birokrat databases restored, and is the install LOCAL layout (Birokrat program under C:\\Birokrat with its databases on that same machine, not a remote/shared SQL host)? Check it now - instance name and version, which Birokrat databases are attached, and whether C:\\Birokrat is the matching install. Also: is it safe to run a schema/data migration against those databases, i.e. are they a scratch/dev copy you can restore, or production data you must not touch? Name the risk and say whether you can take a backup first. Do not run my migration from this probe - only report.",
  "ifFits": "You are a Birokrat repo agent with local-layout SQL Server, so take the verification: fetch origin and check out feature/invoice-import (pushed by RAZVOJ2016/prg#1); read the run/verify note committed on that branch. Back up or snapshot the Birokrat databases first. Run the invoice-import migration script against the local databases, then start Birokrat from C:\\Birokrat and verify the imported invoices against the acceptance checks in the note: the migration completes without error, row counts and totals match the source, and the program opens the migrated invoices without a data error. Done looks like: a written result back to me (via the arch) with the SQL Server version and instance, which databases you ran against, pass/fail per check, and the exact error text plus the failing statement for anything that breaks. Do not merge or force-push; if you need a fix, push fixup commits to the same branch or report the failure and leave it to me. Say what state you left the databases in (restored or still migrated).",
  "ifNone": "Tell me plainly that no peer in the fleet has SQL Server with the Birokrat databases in LOCAL layout, and include what you learned: which machines have SQL Server at all, which have a C:\\Birokrat install, and whether any has only a remote/shared-DB layout. Then I know verification is blocked on the Operator and will stop waiting - I will leave the branch pushed with its run/verify note, state in the PR that the migration is unverified against a live database and why, and ask the Operator to either provision a local-layout box or point me at one.",
  "meanwhile": "Pushing feature/invoice-import to origin now and committing a short run/verify note (prerequisites, how to run the script, the acceptance checks, backup-first warning) so a peer can pick it up cold. Then I continue with what needs no database: reviewing the migration script for idempotency and rollback, and the static/offline checks of the import path."
}
```
```

No machine is asked for; the probe is for peers with a disk and a shell; the handoff names branch, steps and done; meanwhile it pushes the branch and leaves a note.

## 2. Its answer to an arch@ probe about its own machine

```
Yes on the database side, no on C:\Birokrat as-is.
Checked now: `Get-Service MSSQL$SQLEXPRESS` → SQL Server 2019 Express installed and Running; `sqlcmd -S .\SQLEXPRESS -Q "SELECT name FROM sys.databases"` → BIROKRAT_MAIN and BIROKRAT_TEST both present; `dir C:\Birokrat` + `git -C C:\Birokrat status --short` → that is the Operator's daily-use install, with uncommitted local settings in the worktree.
So a migration run against BIROKRAT_TEST is fine here; I have not run anything beyond the checks.
Risk: changing C:\Birokrat in place would modify the install the Operator uses every day and would overwrite/lose those uncommitted settings — I will not touch it without the Operator saying so.
Safe alternative if you want this landed on my machine: a fresh clone of the repo elsewhere on feature/invoice-import plus a restored copy of BIROKRAT_TEST, leaving C:\Birokrat and BIROKRAT_MAIN untouched. Say the word and I'll set that up.
```

Short, factual, checked now (names the commands), risk named, nothing executed.
