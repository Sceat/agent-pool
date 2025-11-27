#!/usr/bin/env node
/**
 * Hook: Block Task tool from spawning custom subagents
 * Intercepts Task tool calls and blocks custom agents defined in .claude/agents/
 * Built-in agents are allowed to pass through
 */

const fs = require('node:fs')
const path = require('node:path')

const BUILT_IN_AGENTS = new Set([
  'general-purpose',
  'Explore',
  'Plan',
  'claude-code-guide',
  'statusline-setup',
])

const approve = JSON.stringify({ decision: 'allow' })

async function main() {
  let input = ''
  for await (const chunk of process.stdin) {
    input += chunk
  }

  let data
  try {
    data = JSON.parse(input)
  } catch (error) {
    console.error(`Hook parse error: ${error.message}`)
    console.log(approve)
    return
  }

  // Only intercept Task tool
  if (data.tool_name !== 'Task') {
    console.log(approve)
    return
  }

  const { tool_input: args = {} } = data
  const subagent_type = args.subagent_type

  if (!subagent_type) {
    console.log(approve)
    return
  }

  // Allow built-in agents
  if (BUILT_IN_AGENTS.has(subagent_type)) {
    console.log(approve)
    return
  }

  // Check if custom agent exists in .claude/agents/
  const cwd = process.cwd()
  const agents_dir = path.resolve(cwd, '.claude', 'agents')
  const agent_path = path.resolve(agents_dir, `${subagent_type}.md`)

  if (!agent_path.startsWith(agents_dir)) {
    console.log(
      JSON.stringify({
        decision: 'block',
        reason: `Invalid agent name: path traversal detected`,
      }),
    )
    return
  }

  if (fs.existsSync(agent_path)) {
    console.log(
      JSON.stringify({
        decision: 'block',
        reason: `Custom agent "${subagent_type}" detected. Use mcp__agent-pool__invoke instead of Task tool for custom subagents. The Task tool is reserved for built-in Claude agents only.`,
      }),
    )
    return
  }

  // Unknown agent type - allow (might be a new built-in)
  console.log(approve)
}

main().catch(error => {
  console.error(`Hook error: ${error.message}`)
  console.log(approve)
})
