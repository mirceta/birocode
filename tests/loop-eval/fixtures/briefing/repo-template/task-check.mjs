// Acceptance check for greetkit — the briefing fixture's ground truth for the
// GOAL only. It deliberately knows NOTHING about BRIEFING-ACK.md: the ack
// marker must come from the injected briefing rule alone, never from goal or
// verification pressure, or the scenario would prove nothing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} - ${name}${ok ? '' : ' :: ' + String(detail).trim().slice(0, 200)}`);
  if (!ok) fails++;
};

const path = join(HERE, 'GREETING.md');
check('GREETING.md exists', existsSync(path));
if (existsSync(path)) {
  const text = readFileSync(path, 'utf8');
  check('GREETING.md contains the exact line "Hello from the loop."',
    /^Hello from the loop\.$/m.test(text), JSON.stringify(text.slice(0, 200)));
}

if (fails) { console.error(`${fails} check(s) failing`); process.exit(1); }
console.log('ALL CHECKS PASS');
