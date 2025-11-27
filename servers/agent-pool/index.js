import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const {
  AGENTS_DIR = join(__dirname, '..', '..', 'agents'),
  TASK_TIMEOUT_MS = '300000',
} = process.env

const TIMEOUT_MS = Number(TASK_TIMEOUT_MS)

/** @type {Map<string, { process: import('node:child_process').ChildProcess, buffer: string }>} */
const agent_pool = new Map()

/**
 * Spawn a Claude CLI subprocess with stream-json mode
 * @param {string} agent_name
 * @returns {import('node:child_process').ChildProcess}
 */
function spawn_agent(agent_name) {
  const agent_path = join(AGENTS_DIR, `${agent_name}.md`)

  const child = spawn(
    'claude',
    [
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--system-prompt-file',
      agent_path,
      '--dangerously-skip-permissions',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    },
  )

  child.stderr?.on('data', chunk => {
    console.error(`[${agent_name}:stderr] ${chunk.toString()}`)
  })

  child.on('error', error => {
    console.error(`[${agent_name}:error] ${error.message}`)
    agent_pool.delete(agent_name)
  })

  child.on('exit', (code, signal) => {
    console.error(`[${agent_name}:exit] code=${code} signal=${signal}`)
    agent_pool.delete(agent_name)
  })

  return child
}

/**
 * Get or create an agent subprocess
 * @param {string} agent_name
 * @returns {{ process: import('node:child_process').ChildProcess, buffer: string }}
 */
function get_or_create_agent(agent_name) {
  const existing = agent_pool.get(agent_name)
  if (existing && !existing.process.killed) {
    return existing
  }

  const process = spawn_agent(agent_name)
  const entry = { process, buffer: '' }
  agent_pool.set(agent_name, entry)
  return entry
}

/**
 * Send a task to an agent and wait for result
 * @param {string} agent_name
 * @param {string} task
 * @returns {Promise<string>}
 */
async function invoke_agent(agent_name, task) {
  const agent = get_or_create_agent(agent_name)
  const { process: child } = agent

  if (!child.stdin || !child.stdout) {
    throw new Error(`Agent ${agent_name} has no stdin/stdout`)
  }

  return new Promise((resolve, reject) => {
    const timeout_id = setTimeout(() => {
      cleanup()
      reject(new Error(`Task timeout after ${TIMEOUT_MS}ms`))
    }, TIMEOUT_MS)

    /** @type {string | null} */
    let result_text = null

    const on_data = (/** @type {Buffer} */ chunk) => {
      agent.buffer += chunk.toString()

      const lines = agent.buffer.split('\n')
      agent.buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const parsed = JSON.parse(line)

          if (parsed.type === 'result' && parsed.result !== undefined) {
            result_text = parsed.result
            cleanup()
            send_clear_context(agent_name)
            resolve(result_text)
          }
        } catch {
          // Ignore non-JSON lines
        }
      }
    }

    const on_error = (/** @type {Error} */ error) => {
      cleanup()
      reject(error)
    }

    const on_close = () => {
      cleanup()
      if (result_text === null) {
        reject(new Error(`Agent ${agent_name} process closed unexpectedly`))
      }
    }

    const cleanup = () => {
      clearTimeout(timeout_id)
      child.stdout?.off('data', on_data)
      child.off('error', on_error)
      child.off('close', on_close)
    }

    child.stdout.on('data', on_data)
    child.once('error', on_error)
    child.once('close', on_close)

    // Send the task as stream-json format
    const message = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: task,
      },
    })

    child.stdin.write(message + '\n')
  })
}

/**
 * Send /clear command to reset context but keep process alive
 * @param {string} agent_name
 */
function send_clear_context(agent_name) {
  const agent = agent_pool.get(agent_name)
  if (!agent || agent.process.killed || !agent.process.stdin) return

  const clear_message = JSON.stringify({
    type: 'user',
    message: {
      role: 'user',
      content: '/clear',
    },
  })

  agent.process.stdin.write(clear_message + '\n')
}

/**
 * Kill and remove an agent from the pool
 * @param {string} agent_name
 * @returns {boolean}
 */
function reset_agent(agent_name) {
  const agent = agent_pool.get(agent_name)
  if (!agent) return false

  agent.process.kill('SIGTERM')
  agent_pool.delete(agent_name)
  return true
}

/**
 * Warmup an agent (spawn without task)
 * @param {string} agent_name
 * @returns {{ pid: number | undefined }}
 */
function warmup_agent(agent_name) {
  const agent = get_or_create_agent(agent_name)
  return { pid: agent.process.pid }
}

/**
 * List all active agents
 * @returns {Array<{ name: string, pid: number | undefined }>}
 */
function list_agents() {
  return [...agent_pool.entries()]
    .filter(([, { process }]) => !process.killed)
    .map(([name, { process }]) => ({ name, pid: process.pid }))
}

// MCP Server setup
const server = new McpServer({
  name: 'agent-pool',
  version: '1.0.0',
})

server.tool(
  'invoke',
  'Send a task to an agent and wait for the result',
  {
    agent: { type: 'string', description: 'Agent name (without .md extension)' },
    task: { type: 'string', description: 'Task/prompt to send to the agent' },
  },
  async ({ agent, task }) => {
    try {
      const result = await invoke_agent(agent, task)
      return {
        content: [{ type: 'text', text: result }],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

server.tool('list', 'List all active agents with their PIDs', {}, async () => {
  const agents = list_agents()
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(agents, null, 2),
      },
    ],
  }
})

server.tool(
  'reset',
  'Kill and remove an agent from the pool',
  {
    agent: { type: 'string', description: 'Agent name to reset' },
  },
  async ({ agent }) => {
    const success = reset_agent(agent)
    return {
      content: [
        {
          type: 'text',
          text: success
            ? `Agent "${agent}" has been reset`
            : `Agent "${agent}" not found in pool`,
        },
      ],
    }
  },
)

server.tool(
  'warmup',
  'Spawn an agent without a task (pre-cache for faster first invocation)',
  {
    agent: { type: 'string', description: 'Agent name to warmup' },
  },
  async ({ agent }) => {
    try {
      const { pid } = warmup_agent(agent)
      return {
        content: [
          {
            type: 'text',
            text: `Agent "${agent}" warmed up with PID ${pid}`,
          },
        ],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      }
    }
  },
)

// Start the server
const transport = new StdioServerTransport()
await server.connect(transport)
