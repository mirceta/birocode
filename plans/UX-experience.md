# Expected User Experience

This is what the user sees. She is non-technical, uses only her phone,
and has never heard of git, CLI, or tokens. The app must feel like a
messaging app she already knows.

---

## Chat Screen (default, lands here)

She opens a URL on her phone. She sees this:

```
+----------------------------------+
|  Claude Web               [Save] |
|----------------------------------|
|                                  |
|  Hi! How can I help you today?   |
|                                  |
|          Can you update the      |
|          financial projections   |
|          section? The revenue    |
|          should be 500k not 300k |
|                                  |
|  Sure! I'll update the revenue   |
|  figures in your financial       |
|  projections...                  |
|                                  |
|  [Editing financial-plan.md...]  |
|                                  |
|  Done! I've updated the revenue  |
|  from 300k to 500k in three      |
|  places:                         |
|  - Executive summary             |
|  - Revenue table                 |
|  - Cash flow forecast            |
|                                  |
|----------------------------------|
| Type a message...         [Send] |
|----------------------------------|
| [Chat]    [Files]     [History]  |
+----------------------------------+
```

Key details:
- Her messages are right-aligned (like iMessage/WhatsApp)
- Claude's messages are left-aligned
- Responses stream in token by token (like ChatGPT)
- Tool-use feedback appears inline: "[Editing financial-plan.md...]"
- A thinking indicator (animated dots) shows before the first token
- The input box is always visible at the bottom
- Save button is always visible at the top-right

---

## Files Screen

She taps "Files" to verify Claude made the changes she asked for:

```
+----------------------------------+
|  Claude Web               [Save] |
|----------------------------------|
|  Home > business-plan            |
|                                  |
|  [folder] market-research/       |
|  [folder] financials/            |
|  [file]   executive-summary.md   |
|  [file]   team-bios.md           |
|  [file]   pitch-deck-notes.md    |
|                                  |
|                                  |
|                                  |
|                                  |
|                                  |
|                                  |
|                                  |
|                                  |
|                                  |
|----------------------------------|
| [Chat]    [Files]     [History]  |
+----------------------------------+
```

She taps a file to read it:

```
+----------------------------------+
|  [<- Back]  executive-summary.md |
|----------------------------------|
|                                  |
|  # Executive Summary             |
|                                  |
|  Our company projects revenue    |
|  of 500,000 EUR in the first     |
|  year of operations...           |
|                                  |
|  ## Key Highlights               |
|                                  |
|  - Revenue target: 500k EUR      |
|  - Break-even: Month 8           |
|  - Team size: 4 people           |
|                                  |
|                                  |
|                                  |
|                                  |
|                                  |
|----------------------------------|
| [Chat]    [Files]     [History]  |
+----------------------------------+
```

Key details:
- Folders first, then files, alphabetical
- Breadcrumbs show where she is (Home > folder > subfolder)
- Tap a folder to go in, tap breadcrumb to go back
- File viewer is read-only -- she edits via chat, not here
- Monospace font for file contents

---

## History Screen

She taps "Save" to checkpoint, then "History" to see all saves:

```
+----------------------------------+
|  Claude Web               [Save] |
|----------------------------------|
|                                  |
|  Today, 2:30 PM                  |
|  "Updated revenue to 500k"       |
|                        [Go back] |
|  ................................ |
|  Today, 11:15 AM                 |
|  "Added team bios section"       |
|                        [Go back] |
|  ................................ |
|  Yesterday, 4:00 PM              |
|  "First draft of business plan"  |
|                        [Go back] |
|                                  |
|                                  |
|                                  |
|                                  |
|----------------------------------|
| [Chat]    [Files]     [History]  |
+----------------------------------+
```

She taps "Go back" and gets a confirmation:

```
+----------------------------------+
|                                  |
|  +----------------------------+  |
|  |                            |  |
|  |  Go back to this version?  |  |
|  |                            |  |
|  |  This will undo all        |  |
|  |  changes made after:       |  |
|  |                            |  |
|  |  "First draft of           |  |
|  |   business plan"           |  |
|  |  Yesterday, 4:00 PM        |  |
|  |                            |  |
|  |  [Cancel]     [Go back]    |  |
|  |                            |  |
|  +----------------------------+  |
|                                  |
|                                  |
|----------------------------------|
| [Chat]    [Files]     [History]  |
+----------------------------------+
```

Key details:
- "Save" and "Go back" -- never "commit" or "checkout"
- Save optionally asks for a short note ("What changed?")
- Timeline is most recent first
- Friendly dates: "Today, 2:30 PM" not "2026-06-06T14:30:00Z"
- Confirmation dialog before restoring (destructive action)

---

## Save Flow

The Save button is on every screen. When she taps it:

```
Step 1: She taps [Save]

+----------------------------------+
|                                  |
|  +----------------------------+  |
|  |                            |  |
|  |  Save your work            |  |
|  |                            |  |
|  |  What changed? (optional)  |  |
|  |  +----------------------+  |  |
|  |  | Updated revenue...   |  |  |
|  |  +----------------------+  |  |
|  |                            |  |
|  |  [Cancel]       [Save]     |  |
|  |                            |  |
|  +----------------------------+  |
|                                  |
+----------------------------------+

Step 2: She taps [Save] in the modal

+----------------------------------+
|  Claude Web           [Saved!]   |
|  (checkmark fades after 2s)      |
+----------------------------------+
```

---

## Session Management

When she has multiple conversations, she can switch between them.
This appears as a list above the chat or as a slide-out panel:

```
+----------------------------------+
|  Claude Web               [Save] |
|----------------------------------|
|  Your conversations              |
|                                  |
|  [+] New conversation            |
|  ................................ |
|  Business plan updates           |
|  Today, 2:30 PM -- 12 messages   |
|  ................................ |
|  Market research questions       |
|  Yesterday -- 8 messages         |
|  ................................ |
|  Financial projections review    |
|  Jun 4 -- 24 messages            |
|                                  |
|                                  |
|                                  |
|                                  |
|----------------------------------|
| [Chat]    [Files]     [History]  |
+----------------------------------+
```

Key details:
- Most recent conversation at top
- Shows title (AI-generated), date, message count
- Tap to continue a conversation
- "New conversation" starts fresh
- No "session" or "thread" jargon -- just "conversations"

---

## Navigation Map

```
                  +---[Chat]---+
                  |            |
[Open URL] ----> |  3 tabs    |---[Files]-----> File browser
                  |  at the   |                  (read only)
                  |  bottom    |
                  |            |---[History]----> Save timeline
                  +------------+                  (go back)

                  [Save] button visible on ALL screens
```

Every screen is one tap from every other screen via the bottom nav.
Save is always visible. Maximum depth is 2 taps (tab + action).

---

## UX Principles

- **No technical jargon anywhere.** These words must never appear in
  the UI: git, commit, repository, CLI, session, token, branch,
  checkout, terminal, deploy
- **Large, clear buttons.** Minimum 44px touch targets. Designed for
  thumbs, not mouse pointers.
- **Instant feedback.** Loading states on every action. Streaming text
  in chat. "Saved!" confirmation. Never a silent wait.
- **Warm, approachable design.** Not a developer tool aesthetic.
  Rounded corners, soft colors, friendly copy.
- **Maximum 2 taps** to reach any feature from any screen.
- **Familiar patterns.** Chat looks like WhatsApp/iMessage. Files
  looks like a phone file manager. History looks like a timeline.
