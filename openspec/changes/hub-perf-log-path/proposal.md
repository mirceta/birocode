# Hub performance: the log path was the leak, the spin and the crash

Fleet task `3bcaff3a537e430fa8620c8572edddbe` (Operator, 2026-09-28).

## Why

On the hub the harness was seen at 130–140 % CPU, the Management dashboard had become slow
to load, and the process "slurred" over time. Measured on the hub and reproduced in a lab
(the branch's `perf-measure.mjs` / `perf-logpump.mjs`, see `design.md`):

1. **Every request from the LAN wrote a log line.** The IP filter logged
   `Admitted <ip> via LAN bypass` per request; with two browsers polling the dashboards the
   hub wrote up to 25k such lines an hour (85 MB of log on busy days), each a flushed write
   under the one global logger lock.
2. **Every log line was appended to the WinForms activity box, one `BeginInvoke` +
   `AppendText` + `ScrollToCaret` at a time, into a `RichTextBox` that was never capped.**
   That box grew with the day's log (tens of MB of text), each append got dearer, resident
   memory grew ~700 bytes per request for the life of the process, and the UI thread was
   busy for a growing share of every second — a full core on a day like the 27th. In the
   lab the unmodified build **crashed** with an `AccessViolationException` inside
   `RichTextBox.WndProc` ← `ScrollToCaret` after 160k lines; Windows' Application log shows
   the hub dying the very same way on 2026-09-17 04:19 and 2026-09-22 11:31.
3. **Two stores were held or re-read whole:** the autopilot audit (177k entries, 55 MB) was
   deserialized into memory in full and kept there; the analytics activity file was re-read
   and re-parsed on every 5-second Scoreboard poll.
4. **Per-poll work that scaled with uptime:** the fleet status re-serialized every collector
   event's anonymous source object to find its repo id, once per repo per poll (~20k JSON
   round trips per poll once the feed reached its 1000-event cap); the Dashboard's activity
   digest copied every dock's whole message list every 5 s; the policeman endpoint shipped
   every in-flight card's transcript tail (1.5 MB) every 5 s.
5. **Hidden tabs kept polling:** eight pollers ignored `document.hidden`, so a dashboard left
   open overnight held the hub at ~0.8 requests/s (and 0.8 log lines/s) all night.

## What changes

- Logger: buffered writer flushed 4×/s (and on every error and at exit) instead of per line.
- Activity box: lines are queued and appended in one batch 4×/s; the box keeps ~400 KB and
  drops the oldest lines when it passes 600 KB; the request/error counters coalesce; the
  queue itself is capped so a starved UI thread can never grow it.
- IP filter: one `Admitted` line per address per 5 minutes, with the request count.
- Autopilot audit: the newest 20k entries stay in memory; the file is untouched.
- Analytics: the activity file is parsed once per change (length + write time), not per poll.
- Collector events carry their repo id from append time; the fleet status groups this
  machine's events by repo once per poll instead of scanning all of them per repo.
- The Dashboard's per-dock activity digest is read from the end of the cached transcript
  under its lock — no list copy.
- The policeman endpoint sends a card's transcript tail only for the card the drawer asked
  about, and defaults to the newest 60 journal entries.
- The eight unguarded client pollers stop while the tab is hidden.

## Not changed here (documented in `design.md`)

`git` spawns per dock status (~4 processes/s on the hub — a separate process, not the
harness's CPU), the policeman journal's 2.5 MB rewrite per pass, the `TrafficStats` lock
storm, the transcript accumulators' unbounded per-session growth, and the message cache's
24-file capacity against a 64-dock roster.
