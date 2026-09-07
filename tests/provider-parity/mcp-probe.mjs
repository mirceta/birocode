import { createInterface } from 'node:readline';
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  let r; try { r = JSON.parse(line); } catch { return; }
  if (r.method === 'initialize') reply(r.id, { protocolVersion: r.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'parity-probe', version: '1' } });
  else if (r.method === 'tools/list') reply(r.id, { tools: [{ name: 'harness_probe', description: 'Return the parity test token.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] });
  else if (r.method === 'tools/call') reply(r.id, { content: [{ type: 'text', text: 'token: ' + process.env.BIROKRAT_API_KEY }], isError: false });
  else if (r.id != null) reply(r.id, {});
});
