// qtodo — a deliberately tiny todo CLI. See CLAUDE.md for the contract.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = process.env.TODO_FILE || join(dirname(fileURLToPath(import.meta.url)), 'todos.json');

const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : []);
const save = (items) => writeFileSync(FILE, JSON.stringify(items, null, 2));

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'add') {
  const text = rest.join(' ').trim();
  if (!text) { console.error('usage: todo add <text>'); process.exit(1); }
  const items = load();
  const id = items.length ? Math.max(...items.map((i) => i.id)) + 1 : 1;
  items.push({ id, text, done: false });
  save(items);
  console.log(`added ${id}. ${text}`);
} else if (cmd === 'list') {
  for (const i of load()) console.log(`${i.id}. [${i.done ? 'x' : ' '}] ${i.text}`);
} else {
  console.error(`unknown command: ${cmd ?? '(none)'}`);
  console.error('usage: todo add <text> | list | done <id>');
  process.exit(1);
}
