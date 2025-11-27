# agent-pool <img src="https://raw.githubusercontent.com/sceat/agent-pool/main/assets/logo.svg" align="right" width="120" />

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Plugin-9E5EFF)](https://claude.com/claude-code)

> **Persistent multi-agent orchestration with prompt caching.** Spawn agents once, reuse with automatic context reset—90% token savings on repeated tasks.

## Table of Contents

- [Features](#features)
- [Problem It Solves](#problem-it-solves)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [MCP Tools Reference](#mcp-tools-reference)
- [Creating Custom Agents](#creating-custom-agents)
- [Architecture](#architecture)
- [Token Savings](#token-savings)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

- ✅ **Persistent agent processes** – Spawn once, reuse across tasks with zero startup overhead
- ✅ **Automatic prompt caching** – Same process = system prompt cached = 90% token savings on 2nd+ calls
- ✅ **Context reset without kill** – `/clear` command resets conversation while keeping process (and cache) alive
- ✅ **Multi-agent pool** – Manage multiple concurrent agents with simple MCP interface
- ✅ **Pre-warming** – Spawn agents ahead of time for instant first invocations
- ✅ **Legacy blocker** – Built-in hook prevents expensive `subagent-runner` calls
- ✅ **Stream-JSON protocol** – Efficient streaming I/O with Claude CLI
- ✅ **Agent templates** – Define agents as `.md` files with system prompts and identity

## Problem It Solves

### The Native Task Tool Issue

Claude Code's native `Task` tool spawns fresh subprocesses for each task:

```
Each spawn:
├─ Start new Claude process
├─ Parse system prompt (token cost)
├─ No prompt caching
└─ Full cost × N tasks = expensive

Task 1: 2000 tokens (system + task)
Task 2: 2000 tokens (system + task) ← Duplicated!
Task 3: 2000 tokens (system + task) ← Duplicated!
─────────────────────────────────
Total:  6000 tokens
```

**References:** Claude Code issues [#7020](https://github.com/anthropics/anthropic-sdk-python/issues/7020), [#4580](https://github.com/anthropics/anthropic-sdk-python/issues/4580)

### agent-pool Solution

Persistent processes with prompt caching:

```
Single spawn:
├─ Start Claude process (once)
├─ Cache system prompt
└─ Reuse + /clear

Task 1: 2000 tokens (system + task, cache created)
Task 2:  150 tokens (task only, system cached!)
Task 3:  150 tokens (task only, system cached!)
─────────────────────────────────
Total:  2300 tokens (88% savings)
```

## How It Works

### 1. Persistent Subprocesses

Agents are spawned as Claude CLI subprocesses with stream-JSON mode:

```bash
claude \
  --input-format stream-json \
  --output-format stream-json \
  --system-prompt-file agents/code-reviewer.md \
  --dangerously-skip-permissions
```

### 2. Agent Pool Management

The MCP server maintains a pool of active agent processes:

```javascript
// Agents are spawned on-demand, reused indefinitely
{
  "code-reviewer": { process: <ChildProcess>, pid: 12345 },
  "code-assistant": { process: <ChildProcess>, pid: 12346 },
}
```

### 3. Context Reset (The Secret Sauce)

After each task, the pool sends `/clear` to reset conversation without killing the process:

- ✅ Kills conversation history (reset context)
- ✅ Keeps process alive (keeps system prompt cached)
- ❌ Doesn't lose prompt cache

```
invoke_agent("code-reviewer", "Review src/app.js")
  ↓
[Process receives task, executes, returns result]
  ↓
send_clear_context()  ← Resets for next task
  ↓
[Process waits, cache still warm]
```

### 4. Prompt Caching

Claude's prompt cache works automatically:
- **1st request:** System prompt processed, cached (~$0.03/MTok cache write)
- **2nd+ requests:** System prompt retrieved from cache (~$0.003/MTok cache read)
- **Savings:** ~90% on system prompt tokens

## Installation

### Prerequisites

- **Claude CLI** with version 2.0+ (with `--input-format stream-json` support)
  - [Install Claude CLI](https://claude.com/claude-code)
- **Node.js 18+** (for MCP server)
  - [Install Node.js](https://nodejs.org)
- Claude Code plugin system

### Install agent-pool

```bash
# Clone the plugin repository
git clone https://github.com/sceat/agent-pool.git ~/.claude/plugins/agent-pool

# Install MCP server dependencies
cd ~/.claude/plugins/agent-pool/servers/agent-pool
npm install

# Restart Claude Code
# The plugin auto-registers via plugin.json
```

### Alternative: Install from Path

If you're developing locally:

```bash
# In Claude Code, add plugin:
claude plugins add /path/to/agent-pool

# Install dependencies
cd servers/agent-pool && npm install

# Restart Claude Code
```

## Quick Start

### 1. Use a Built-in Agent

The plugin includes pre-configured agents. Invoke them directly:

```javascript
// In Claude Code, use the MCP tool:
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/components/Button.tsx for security issues and best practices"
})
```

**Available agents:**
- `code-reviewer` – Code quality analysis (security, bugs, performance, style)
- `example-assistant` – General-purpose helper
- Add your own in `/agents/*.md`

### 2. List Active Agents

```javascript
mcp__agent-pool__list()
// Returns:
// [
//   { name: "code-reviewer", pid: 12345 },
//   { name: "example-assistant", pid: 12346 }
// ]
```

### 3. Pre-warm an Agent

Spawn an agent before you need it (cache gets ready):

```javascript
mcp__agent-pool__warmup({ agent: "code-reviewer" })
// Agent is now spawned with cache ready for first task
```

### 4. Reset an Agent

Kill an agent process (useful if it gets stuck or needs fresh start):

```javascript
mcp__agent-pool__reset({ agent: "code-reviewer" })
// Agent killed and removed from pool
// Will respawn on next invoke
```

## Examples

### Example 1: Code Review Workflow

```javascript
// Spawn code reviewer (cache warms)
mcp__agent-pool__warmup({ agent: "code-reviewer" })

// First review task (uses cached system prompt)
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/auth.js for authentication vulnerabilities"
})

// Second review task (cache hit, ~90% token savings)
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/database.js for SQL injection risks"
})

// Third review task (still cache hit)
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/api.ts for rate limiting and input validation"
})
```

**Cost breakdown:**
- Warmup: ~100 tokens (system prompt cache creation)
- Task 1: ~1,800 tokens (1,500 system cached + 300 task)
- Task 2: ~300 tokens (task only, system cached)
- Task 3: ~300 tokens (task only, system cached)
- **Total: ~2,500 tokens** (vs 5,400 with native Task)

### Example 2: Parallel Agent Coordination

```javascript
// Multiple agents working on different aspects simultaneously
const [reviewResult, testResult] = await Promise.all([
  mcp__agent-pool__invoke({
    agent: "code-reviewer",
    task: "Find all uncaught exceptions in error.js"
  }),
  mcp__agent-pool__invoke({
    agent: "test-writer",
    task: "Write unit tests for validateEmail() function"
  })
])
```

### Example 3: Checking Pool Status

```javascript
// View all active agents
const status = await mcp__agent-pool__list()

console.log("Active agents:")
status.forEach(agent => {
  console.log(`  - ${agent.name} (PID: ${agent.pid})`)
})
```

## MCP Tools Reference

### `invoke(agent, task)`

Send a task to an agent and wait for result. Automatically resets context after completion.

**Parameters:**
- `agent` (string): Agent name without `.md` extension (e.g., `"code-reviewer"`)
- `task` (string): Task or prompt to send to the agent

**Returns:**
- Task result as plain text

**Example:**
```javascript
await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Check src/app.js for memory leaks"
})
```

**Timeout:** 5 minutes (configurable via `TASK_TIMEOUT_MS` env var)

---

### `list()`

List all active agents in the pool with their process IDs.

**Parameters:** None

**Returns:**
- Array of `{ name: string, pid: number }`

**Example:**
```javascript
const agents = await mcp__agent-pool__list()
// [
//   { name: "code-reviewer", pid: 12345 },
//   { name: "example-assistant", pid: 12346 }
// ]
```

---

### `reset(agent)`

Kill and remove an agent from the pool. It will respawn on the next `invoke` call.

**Parameters:**
- `agent` (string): Agent name to reset

**Returns:**
- Success message or "not found" message

**Example:**
```javascript
await mcp__agent-pool__reset({ agent: "code-reviewer" })
// Agent "code-reviewer" has been reset
```

**Use cases:**
- Agent process crashed or frozen
- Need to apply agent prompt updates
- Clear old context completely

---

### `warmup(agent)`

Pre-spawn an agent without a task. Useful for warming up cache before first invocation.

**Parameters:**
- `agent` (string): Agent name to spawn

**Returns:**
- Spawn confirmation with PID

**Example:**
```javascript
await mcp__agent-pool__warmup({ agent: "code-reviewer" })
// Agent "code-reviewer" warmed up with PID 12345
```

**Use cases:**
- Pre-cache system prompt before heavy workload
- Validate agent files are correct
- Reduce latency of first task

## Creating Custom Agents

### Agent File Format

Agents are defined as markdown files in `/agents/` with YAML frontmatter:

```markdown
---
name: my-agent
description: Brief description of agent role
---

# Agent Name - Role Title

## Identity

You are a [role description]. Your expertise includes [skills].

## Conventions

| Aspect | Convention |
|--------|-----------|
| Style | How this agent formats output |
| Scope | What this agent focuses on |
| Tone  | Professional, casual, etc. |

## Guardrails

<always>
- Always do X
- Always prioritize Y
</always>

<never>
- Never do Z
- Never assume W
</never>
```

### Example: Create a "Documentation Specialist" Agent

```markdown
---
name: doc-specialist
description: Generates clear, complete documentation with examples
---

# Documentation Specialist

## Identity

You are an expert technical writer who creates documentation that is clear, complete, and accessible to developers of all levels.

## Conventions

| Aspect | Convention |
|--------|-----------|
| Clarity | Use plain language, avoid jargon |
| Examples | Always include copy-paste-ready code examples |
| Structure | Start with "what", then "why", then "how" |

## Guardrails

<always>
- Explain assumptions in your documentation
- Provide working examples for every feature
- Include prerequisites before installation steps
</always>

<never>
- Assume reader knowledge of the ecosystem
- Provide pseudo-code instead of real examples
- Skip error handling in examples
</never>
```

### Invoke Custom Agent

Once saved to `/agents/doc-specialist.md`:

```javascript
mcp__agent-pool__invoke({
  agent: "doc-specialist",
  task: "Write installation instructions for our CLI tool"
})
```

## Architecture

### Component Diagram

```
Claude Code (User Interface)
        ↓
   MCP Client
        ↓
┌───────────────────────────┐
│  agent-pool MCP Server    │
│  (index.js)               │
├───────────────────────────┤
│  Tools:                   │
│  ├─ invoke()              │
│  ├─ list()                │
│  ├─ reset()               │
│  └─ warmup()              │
└───────────┬───────────────┘
            │
      ┌─────┴──────┬──────────┬──────────┐
      │            │          │          │
   [Agent Pool] [Agent 1]  [Agent 2]  [Agent N]
                   │          │          │
                   ↓          ↓          ↓
            Claude CLI Processes (stream-json)
                   ↓          ↓          ↓
              /agents/code-reviewer.md
              /agents/example-assistant.md
              /agents/doc-specialist.md
```

### Process Flow

```
User calls: mcp__agent-pool__invoke({ agent: "X", task: "Y" })
    ↓
[get_or_create_agent("X")]
    ↓
Agent process already running?
    ├─ YES → Use existing (cache warm!)
    └─ NO → Spawn new process
    ↓
[invoke_agent("X", "Y")]
    ├─ Send task via stdin (stream-json format)
    ├─ Wait for result
    ├─ Parse JSON response
    └─ Return result
    ↓
[send_clear_context("X")]
    ├─ Send "/clear" command
    └─ Reset conversation history
    ↓
Process ready for next task (cache still warm)
```

### File Structure

```
agent-pool/
├── README.md                     # You are here
├── LICENSE                       # MIT license
├── plugin.json                   # Claude Code plugin manifest
│
├── agents/                       # Agent definitions
│   ├── code-reviewer.md         # Code quality specialist
│   ├── example-assistant.md     # General-purpose agent
│   └── example.md               # Template
│
├── commands/                     # Claude Code slash commands
│   └── pool-status.md           # /pool-status command
│
├── hooks/                        # Claude Code hooks
│   └── block-legacy-subagent.sh # Blocks old subagent-runner calls
│
├── servers/agent-pool/           # MCP server (Node.js)
│   ├── package.json
│   ├── index.js                 # Main MCP server code
│   └── node_modules/            # Dependencies
│
└── assets/                       # (Optional) Logo, diagrams, etc.
```

## Token Savings

### Comparison: Native Task vs agent-pool

| Scenario | Native Task | agent-pool | Savings |
|----------|------------|-----------|---------|
| **Single task** | 2,000 tokens | 2,000 tokens | 0% |
| **2 identical tasks** | 4,000 tokens | 2,150 tokens | 46% |
| **5 identical tasks** | 10,000 tokens | 2,600 tokens | 74% |
| **10 identical tasks** | 20,000 tokens | 3,100 tokens | 85% |
| **Typical session** (3-5 tasks) | 6,000-10,000 | 2,500-3,000 | 60-70% |

### Cost Example

**Scenario:** Code reviewer runs 5 reviews in a session

**Native Task (Spawn per task):**
- System prompt: 1,500 tokens × 5 = 7,500 tokens
- Task content: 300 tokens × 5 = 1,500 tokens
- **Total: 9,000 tokens** (~$0.27 at $0.03/MTok)

**agent-pool (Persistent + cache):**
- System prompt (1st call): 1,500 tokens (cache write)
- System prompt (calls 2-5): 150 tokens (cache read) × 4 = 600 tokens
- Task content: 300 tokens × 5 = 1,500 tokens
- **Total: 3,600 tokens** (~$0.12 at $0.03/MTok)
- **Savings: $0.15 per session** (56% reduction)

*At scale (100+ reviews/month): ~$45/month savings*

## Troubleshooting

### Agent not found error

**Error:** `Agent "my-agent" not found`

**Cause:** Agent file doesn't exist or filename is wrong

**Fix:**
```bash
# Check agents directory
ls ~/.claude/plugins/agent-pool/agents/

# Ensure file exists as: my-agent.md (without .md extension in tool call)
mcp__agent-pool__invoke({ agent: "my-agent", task: "..." })
```

---

### Task timeout error

**Error:** `Task timeout after 300000ms`

**Cause:** Agent process hung or took >5 minutes to respond

**Solutions:**

1. **Reset the agent:**
   ```javascript
   mcp__agent-pool__reset({ agent: "code-reviewer" })
   ```

2. **Increase timeout** (environment variable):
   ```bash
   export TASK_TIMEOUT_MS=600000  # 10 minutes
   ```

3. **Check agent logs:**
   ```bash
   # Claude CLI will show error in stderr
   # Check system logs or agent process output
   ```

---

### Agent process crashed

**Error:** `[agent-name:exit] code=1 signal=null` (in server logs)

**Cause:** Claude CLI crashed or agent file has syntax error

**Fix:**

1. **Validate agent file syntax:**
   ```bash
   # Check markdown is valid
   cat ~/.claude/plugins/agent-pool/agents/my-agent.md
   ```

2. **Reset agent to respawn:**
   ```javascript
   mcp__agent-pool__reset({ agent: "my-agent" })
   ```

3. **Upgrade Claude CLI:**
   ```bash
   claude --version
   # Ensure version >= 2.0 with stream-json support
   ```

---

### Cache not being used (tokens not savings)

**Symptom:** Token usage same as native Task tool

**Cause:** Process is being respawned each time

**Check:**
```javascript
// List agents to see if process persists
const agents = await mcp__agent-pool__list()
console.log(agents)  // Should show same PID across tasks
```

**Fix:**
- Ensure `/clear` is working (no errors in server logs)
- Check process isn't being killed by system
- Verify Claude CLI version supports stream-json mode

---

### Cannot find claude command

**Error:** `spawn ENOENT: claude`

**Cause:** Claude CLI not installed or not in PATH

**Fix:**
```bash
# Verify Claude CLI is installed
which claude

# If not found, install:
# Follow https://claude.com/claude-code

# Ensure it's in PATH
export PATH="/opt/claude/bin:$PATH"
```

---

### Plugin not loading in Claude Code

**Error:** `agent-pool` doesn't appear in plugins list

**Cause:** Plugin not registered or path is wrong

**Fix:**
```bash
# Check plugin installation
ls ~/.claude/plugins/agent-pool/plugin.json

# Re-register plugin
claude plugins add ~/.claude/plugins/agent-pool

# Restart Claude Code completely
# (Cold restart, not just reload)
```

---

### Legacy subagent-runner still being called

**Error:** Still seeing `mcp__subagent-runner__spawn` calls

**Cause:** Hook may not be active yet

**Fix:**
```bash
# Restart Claude Code to activate hook

# Verify hook file exists
cat ~/.claude/plugins/agent-pool/hooks/block-legacy-subagent.sh

# Check hook is registered in plugin.json
cat ~/.claude/plugins/agent-pool/plugin.json
```

## Contributing

Contributions welcome! Areas for improvement:

- **New agent templates** – Add specialized agents to `/agents/`
- **Performance optimizations** – Improve token efficiency further
- **Documentation** – Expand guides and examples
- **Features** – Request enhancements via issues

### Development Setup

```bash
git clone https://github.com/sceat/agent-pool.git
cd agent-pool/servers/agent-pool
npm install

# Run with local agent pool
npm start
```

### Adding a New Agent

1. Create `/agents/my-agent.md` with system prompt
2. Test with: `mcp__agent-pool__invoke({ agent: "my-agent", task: "..." })`
3. Submit PR with agent and documentation

## License

[MIT License](LICENSE) – See [LICENSE](LICENSE) file for full details.

---

**Made with ❤️ for Claude Code plugin developers**

[↑ Back to top](#)
