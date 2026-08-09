# Regenerates the synthetic golden example tests/loop-evals/examples/hello-notes/.
# Builds the example repo's git history in a temp dir with pinned identity + dates
# (so commit SHAs are deterministic), bundles it, and writes manifest.json,
# plan.md and conversation.jsonl with the real SHAs filled in.
#
# Run from anywhere:  powershell -NoProfile -File tests/loop-evals/tools/make-hello-notes.ps1

$ErrorActionPreference = 'Stop'

$exampleDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'examples\hello-notes'
New-Item -ItemType Directory -Force $exampleDir | Out-Null

$work = Join-Path $env:TEMP ("hello-notes-build-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null

function Write-NoBom([string]$path, [string]$text) {
    [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

# Pinned identity + timestamps => deterministic SHAs across regenerations.
$env:GIT_AUTHOR_NAME = 'loop-evals'; $env:GIT_AUTHOR_EMAIL = 'loop-evals@example.invalid'
$env:GIT_COMMITTER_NAME = 'loop-evals'; $env:GIT_COMMITTER_EMAIL = 'loop-evals@example.invalid'
$env:GIT_AUTHOR_DATE = '2026-01-01T00:00:00Z'; $env:GIT_COMMITTER_DATE = '2026-01-01T00:00:00Z'

try {
    git -C $work init --quiet --initial-branch=golden
    if ($LASTEXITCODE -ne 0) { throw "git init failed" }

    # --- eval/start: the state the task begins from -------------------------
    Write-NoBom (Join-Path $work 'README.md') "# hello-notes`n`nA tiny notes collection. The notes live in notes/.`n"
    New-Item -ItemType Directory -Force (Join-Path $work 'notes') | Out-Null
    Write-NoBom (Join-Path $work 'notes\.gitkeep') ''
    git -C $work add -A; git -C $work commit --quiet -m 'start: empty notes collection'
    git -C $work tag 'eval/start'

    # --- golden turn 1: alpha note ------------------------------------------
    Write-NoBom (Join-Path $work 'notes\alpha.md') "# Alpha`n`nFirst note: alpha ideas.`n"
    git -C $work add -A; git -C $work commit --quiet -m 'turn 1: add notes/alpha.md'
    $sha1 = (git -C $work rev-parse HEAD).Trim()

    # --- golden turn 3: beta note -------------------------------------------
    Write-NoBom (Join-Path $work 'notes\beta.md') "# Beta`n`nSecond note: beta ideas.`n"
    git -C $work add -A; git -C $work commit --quiet -m 'turn 3: add notes/beta.md'
    $sha3 = (git -C $work rev-parse HEAD).Trim()

    # --- golden turn 5: index linking both ----------------------------------
    Write-NoBom (Join-Path $work 'index.md') "# Notes index`n`n- [Alpha](notes/alpha.md)`n- [Beta](notes/beta.md)`n"
    git -C $work add -A; git -C $work commit --quiet -m 'turn 5: add index.md linking all notes'
    $sha5 = (git -C $work rev-parse HEAD).Trim()

    git -C $work tag 'eval/final'

    $bundle = Join-Path $exampleDir 'repo.bundle'
    if (Test-Path $bundle) { Remove-Item -Force $bundle }
    git -C $work bundle create $bundle --all HEAD
    if ($LASTEXITCODE -ne 0) { throw "git bundle failed" }

    # --- manifest.json ------------------------------------------------------
    $manifest = @"
{
  "id": "hello-notes",
  "description": "Synthetic: build a two-note collection with an index, the way a babysat session did it in three commits.",
  "loop": {
    "kind": "queue",
    "seed": { "mode": "plan", "items": [] }
  },
  "turns": [
    { "index": 0, "commitSha": null },
    { "index": 1, "commitSha": "$sha1" },
    { "index": 2, "commitSha": null },
    { "index": 3, "commitSha": "$sha3" },
    { "index": 4, "commitSha": null },
    { "index": 5, "commitSha": "$sha5" }
  ],
  "checks": [
    { "name": "alpha-note", "command": "findstr /C:\"# Alpha\" notes\\alpha.md" },
    { "name": "beta-note", "command": "findstr /C:\"# Beta\" notes\\beta.md" },
    { "name": "index-links-alpha", "command": "findstr /C:\"notes/alpha.md\" index.md" },
    { "name": "index-links-beta", "command": "findstr /C:\"notes/beta.md\" index.md" }
  ]
}
"@
    Write-NoBom (Join-Path $exampleDir 'manifest.json') $manifest

    # --- plan.md ------------------------------------------------------------
    $plan = @"
# Task: build the notes collection

Create a small notes collection in this repository:

1. ``notes/alpha.md`` — a note titled ``# Alpha`` with a line of content.
2. ``notes/beta.md`` — a note titled ``# Beta`` with a line of content.
3. ``index.md`` at the repo root — titled ``# Notes index``, linking to
   ``notes/alpha.md`` and ``notes/beta.md``.

Keep each file short. The task is done when all three files exist with those
titles and the index links to both notes.
"@
    Write-NoBom (Join-Path $exampleDir 'plan.md') $plan

    # --- conversation.jsonl -------------------------------------------------
    $turns = @(
        '{"index":0,"role":"user","text":"Create notes/alpha.md with an H1 title Alpha and one line of content.","label":"instruct","commitSha":null}'
        ('{"index":1,"role":"assistant","text":"Added notes/alpha.md with the Alpha title and a content line.","label":null,"commitSha":"' + $sha1 + '"}')
        '{"index":2,"role":"user","text":"Good. Now notes/beta.md the same way, titled Beta.","label":"instruct","commitSha":null}'
        ('{"index":3,"role":"assistant","text":"Added notes/beta.md titled Beta.","label":null,"commitSha":"' + $sha3 + '"}')
        '{"index":4,"role":"user","text":"We also need an index.md at the root that links to both notes.","label":"course-correct","commitSha":null}'
        ('{"index":5,"role":"assistant","text":"Added index.md linking alpha and beta.","label":null,"commitSha":"' + $sha5 + '"}')
    )
    Write-NoBom (Join-Path $exampleDir 'conversation.jsonl') (($turns -join "`n") + "`n")

    Write-Host "hello-notes regenerated at $exampleDir"
    Write-Host "  golden chain: $sha1 -> $sha3 -> $sha5"
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
