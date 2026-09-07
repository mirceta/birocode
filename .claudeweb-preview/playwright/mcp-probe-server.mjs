// A dependency-free MCP stdio server with ONE tool, `harness_probe`, used by the
// Codex authenticated evidence run (openspec codex-real-run) to prove that a Codex
// turn driven by the harness's `-c mcp_servers.<name>.command/args` overrides can
// call an MCP tool end to end. It answers a fixed, recognisable string so the check
// can find it in the agent's final message. Protocol: JSON-RPC 2.0 over stdio,
// newline-delimited (MCP 2024-11-05 / 2025-03-26 initialize handshake).
import { createInterface } from 'node:readline'

const TOOL = {
  name: 'harness_probe',
  description: 'Returns the harness probe token. Call it when asked to prove MCP works.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}
const TOKEN = process.env.HARNESS_PROBE_TOKEN || 'PROBE-TOKEN-UNSET'

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n') }

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  line = line.trim()
  if (!line) return
  let req
  try { req = JSON.parse(line) } catch { return }
  const { id, method, params } = req
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'harness-probe', version: '1.0.0' } } })
  }
  if (method === 'notifications/initialized') return
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } })
  if (method === 'tools/call') {
    if (params?.name === TOOL.name) {
      process.stderr.write(`[harness-probe] tool called\n`)
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `harness probe token: ${TOKEN}` }], isError: false } })
    }
    return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool ${params?.name}` } })
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } })
})
rl.on('close', () => process.exit(0))
