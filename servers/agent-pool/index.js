#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const {
  AGENTS_DIR = join(process.cwd(), '.claude', 'agents'),
  SKILLS_DIR = join(process.cwd(), '.claude', 'skills'),
  EXPERTISE_DIR = join(process.cwd(), '.claude', 'expertise'),
  TASK_TIMEOUT_MS = '300000',
  // CLI executable - allows override for testing or custom installations
  CLAUDE_CLI = 'claude',
} = process.env

// Task execution timeout in milliseconds (default: 5 minutes)
const TIMEOUT_MS = Number(TASK_TIMEOUT_MS)

// Signal used for graceful agent termination
const TERMINATION_SIGNAL = 'SIGTERM'

/** @type {Map<string, { process: import('node:child_process').ChildProcess, buffer: string }>} */
const agent_pool = new Map()

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content
 * @returns {{ skills: string[], expertise: string[], body: string }}
 */
function parse_frontmatter(content) {
  const result = { skills: [], expertise: [], body: content }

  const frontmatter_match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!frontmatter_match) return result

  const [, yaml_block, body] = frontmatter_match
  result.body = body

  // Parse skills array
  const skills_match = yaml_block.match(/skills:\s*\n((?:\s*-\s*.+\n?)+)/i)
  if (skills_match) {
    result.skills = skills_match[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean)
  }

  // Parse expertise array
  const expertise_match = yaml_block.match(/expertise:\s*\n((?:\s*-\s*.+\n?)+)/i)
  if (expertise_match) {
    result.expertise = expertise_match[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean)
  }

  return result
}

/**
 * Load a skill file content
 * @param {string} skill_name
 * @returns {string | null}
 */
function load_skill(skill_name) {
  const skill_path = resolve(SKILLS_DIR, skill_name, 'SKILL.md')
  if (!skill_path.startsWith(resolve(SKILLS_DIR))) {
    throw new Error(`Invalid skill name: path traversal detected`)
  }
  if (!existsSync(skill_path)) {
    console.error(`[agent-pool] Skill not found: ${skill_path}`)
    return null
  }
  return readFileSync(skill_path, 'utf-8')
}

/**
 * Load an expertise file content
 * @param {string} expertise_name
 * @returns {string | null}
 */
function load_expertise(expertise_name) {
  const expertise_path = resolve(EXPERTISE_DIR, `${expertise_name}.md`)
  if (!expertise_path.startsWith(resolve(EXPERTISE_DIR))) {
    throw new Error(`Invalid expertise name: path traversal detected`)
  }
  if (!existsSync(expertise_path)) {
    console.error(`[agent-pool] Expertise not found: ${expertise_path}`)
    return null
  }
  return readFileSync(expertise_path, 'utf-8')
}

/**
 * Compose full agent prompt with skills and expertise
 * @param {string} agent_name
 * @returns {string}
 */
function compose_agent_prompt(agent_name) {
  const agent_path = resolve(AGENTS_DIR, `${agent_name}.md`)
  if (!agent_path.startsWith(resolve(AGENTS_DIR))) {
    throw new Error(`Invalid agent name: path traversal detected`)
  }

  if (!existsSync(agent_path)) {
    throw new Error(`Agent not found: ${agent_path}`)
  }

  const content = readFileSync(agent_path, 'utf-8')
  const { skills, expertise, body } = parse_frontmatter(content)

  const sections = []

  // Environment header
  sections.push(`# Environment
Working directory: ${process.cwd()}
Date: ${new Date().toISOString()}
---
`)

  // Inject skills
  for (const skill_name of skills) {
    const skill_content = load_skill(skill_name)
    if (skill_content) {
      sections.push(`# Skill: ${skill_name}\n${skill_content}\n`)
    }
  }

  // Inject expertise
  for (const expertise_name of expertise) {
    const expertise_content = load_expertise(expertise_name)
    if (expertise_content) {
      sections.push(`# Expertise: ${expertise_name}\n${expertise_content}\n`)
    }
  }

  // Agent body
  sections.push(body)

  return sections.join('\n')
}

/**
 * Spawn a Claude CLI subprocess with stream-json mode
 * @param {string} agent_name
 * @returns {import('node:child_process').ChildProcess}
 */
function spawn_agent(agent_name) {
  const composed_prompt = compose_agent_prompt(agent_name)

  const child = spawn(
    CLAUDE_CLI,
    [
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--system-prompt',
      composed_prompt,
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
        } catch (error) {
          // SyntaxError expected for non-JSON lines (e.g. progress output)
          if (!(error instanceof SyntaxError)) {
            console.error(`[${agent_name}:parse] Unexpected error: ${error}`)
          }
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

  agent.process.kill(TERMINATION_SIGNAL)
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
      if (!agent) {
        throw new Error('Missing required parameter: agent')
      }
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
