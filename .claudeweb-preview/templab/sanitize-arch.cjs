// Lab only (fleet task 64dcb229): make the COPIED arch.json harmless — the arch keeps its goal records (the Subagents
// list) but manages nothing: no repos, no fleet, no fleet sends / upgrades / provisioning. With no loops.json and no
// collector sources copied, the lab arch has no one to send to.   node sanitize-arch.cjs <path-to-copied-arch.json>
const fs = require('fs');
const f = process.argv[2];
const a = JSON.parse(fs.readFileSync(f, 'utf8'));
a.ManagedRepoIds = [];
a.ManagedFleet = Array.isArray(a.ManagedFleet) ? [] : {};
a.AcceptFleetSends = false;
a.AcceptFleetUpgrades = false;
a.AcceptFleetProvisioning = false;
a.StandingLoopMode = null;
for (const c of a.Conversations || []) { c.SessionId = null; c.StandingLoopMode = null; c.Watermark = -1; }
fs.writeFileSync(f, JSON.stringify(a, null, 2));
console.log(`sanitized: ${a.Conversations.length} conversations, managed 0`);
