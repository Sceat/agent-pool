# Usage Guide & API Reference

## Table of Contents

- [Quick Start](#quick-start)
- [MCP Tools Reference](#mcp-tools-reference)
- [Examples](#examples)
- [Creating Custom Agents](#creating-custom-agents)
- [Skills & Expertise](#skills--expertise)

## Quick Start

### 1. Warm Up an Agent

Pre-spawn an agent before using it (warms up prompt cache):

```javascript
mcp__agent-pool__warmup({ agent: "code-reviewer" })
// Output: Agent "code-reviewer" spawned with PID 12345
```

### 2. Invoke a Task

Send a task to the agent:

```javascript
const result = await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/Button.tsx for accessibility issues"
})

console.log(result)
// Output: Detailed code review...
```

### 3. List Active Agents

See what agents are currently running:

```javascript
const agents = await mcp__agent-pool__list()
console.log(agents)
// Output: [
//   { name: "code-reviewer", pid: 12345 },
//   { name: "example-assistant", pid: 12346 }
// ]
```

### 4. Reset an Agent (Optional)

Kill an agent if it gets stuck or you need a fresh start:

```javascript
mcp__agent-pool__reset({ agent: "code-reviewer" })
// Output: Agent "code-reviewer" reset
// Will respawn on next invoke
```

## MCP Tools Reference

### `invoke(agent, task)`

Send a task to an agent and wait for result. Automatically resets context after completion.

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `agent` | string | Agent name without `.md` extension |
| `task` | string | Task/prompt to send to agent |

**Returns:**
- Task result as plain text string

**Example:**
```javascript
const result = await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Check src/app.js for memory leaks and performance issues"
})
```

**Timeout:** 5 minutes (configurable via `TASK_TIMEOUT_MS` env var)

**What happens internally:**
1. If agent not running → spawn it
2. Send task via stdin (stream-json format)
3. Wait for response
4. Send `/clear` to reset context
5. Return result

---

### `list()`

List all active agents in the pool.

**Parameters:** None

**Returns:**
- Array of objects: `[{ name: string, pid: number }, ...]`

**Example:**
```javascript
const agents = await mcp__agent-pool__list()

agents.forEach(agent => {
  console.log(`${agent.name} (PID: ${agent.pid})`)
})
```

**Sample output:**
```
[
  { name: "code-reviewer", pid: 12345 },
  { name: "test-writer", pid: 12346 }
]
```

---

### `warmup(agent)`

Pre-spawn an agent to warm up the prompt cache.

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `agent` | string | Agent name to spawn |

**Returns:**
- Confirmation message with PID

**Example:**
```javascript
await mcp__agent-pool__warmup({ agent: "code-reviewer" })
// Output: Agent "code-reviewer" spawned with PID 12345
```

**Use cases:**
- Pre-cache system prompt before heavy workload
- Validate agent file is valid
- Reduce latency of first task

**Note:** Warmup is optional. Agents auto-spawn on first `invoke()`.

---

### `reset(agent)`

Kill an agent process and remove it from pool.

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `agent` | string | Agent name to reset |

**Returns:**
- Success or "not found" message

**Example:**
```javascript
await mcp__agent-pool__reset({ agent: "code-reviewer" })
// Output: Agent "code-reviewer" reset
```

**When to use:**
- Agent process crashed or frozen
- Need to apply updated agent prompt
- Force fresh start (clear all context)

## Examples

### Example 1: Simple Code Review

```javascript
// Task: Review a file
const review = await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/auth.js for authentication bugs and security issues"
})

console.log(review)
```

**Output:**
```
Security Issues Found:
- Line 42: Missing input validation on email parameter
- Line 55: Password compared with ===, should use bcrypt.compare()

Performance:
- Consider caching JWT validation results

Best Practices:
- Add rate limiting to login endpoint
```

---

### Example 2: Multiple Reviews (Token Efficient)

```javascript
// Pre-warm agent (costs ~1800 tokens, creates cache)
await mcp__agent-pool__warmup({ agent: "code-reviewer" })

// Review 1 (cached system prompt, costs ~300 tokens)
const review1 = await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/auth.js"
})

// Review 2 (cached system prompt, costs ~300 tokens)
const review2 = await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/api.ts"
})

// Review 3 (cached system prompt, costs ~300 tokens)
const review3 = await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/database.js"
})

// Total: ~2400 tokens (vs 5400 with native Task)
console.log("✅ Saved 55% on tokens!")
```

---

### Example 3: Parallel Agent Coordination

```javascript
// Multiple agents working simultaneously
const [codeReview, testSuite] = await Promise.all([
  mcp__agent-pool__invoke({
    agent: "code-reviewer",
    task: "Find all uncaught exceptions in error.js"
  }),
  mcp__agent-pool__invoke({
    agent: "test-writer",
    task: "Write unit tests for validateEmail() function"
  })
])

console.log("Code Review:", codeReview)
console.log("Tests:", testSuite)
```

---

### Example 4: Agent Status Dashboard

```javascript
// Check which agents are active
const agents = await mcp__agent-pool__list()

console.log(`📊 Agent Pool Status`)
console.log(`Total agents: ${agents.length}`)
console.log()

agents.forEach(agent => {
  console.log(`  ✅ ${agent.name}`)
  console.log(`     PID: ${agent.pid}`)
})

// Output:
// 📊 Agent Pool Status
// Total agents: 2
//
//   ✅ code-reviewer
//      PID: 12345
//
//   ✅ test-writer
//      PID: 12346
```

---

### Example 5: Handle Agent Errors

```javascript
try {
  const result = await mcp__agent-pool__invoke({
    agent: "code-reviewer",
    task: "Review src/app.js"
  })

  console.log(result)
} catch (error) {
  console.error("Task failed:", error.message)

  // Reset agent if it crashed
  if (error.message.includes("timeout")) {
    console.log("⚠️ Agent timeout, resetting...")
    await mcp__agent-pool__reset({ agent: "code-reviewer" })
  }
}
```

## Creating Custom Agents

### Agent File Format

Agents are markdown files stored in `/agents/` with YAML frontmatter:

```markdown
---
name: agent-name
description: Brief description of what agent does
skills:
  - javascript
  - react
expertise:
  - testing
  - performance
---

# Agent Name - Role Title

## Identity

You are a [detailed role description]. Your expertise includes [list of skills].

## Conventions

| Aspect | Convention |
|--------|-----------|
| Output | How you format responses |
| Scope | What you focus on |
| Tone | Professional, casual, etc. |

## Guardrails

<always>
- Always provide examples
- Always explain your reasoning
</always>

<never>
- Never assume user knowledge
- Never provide incomplete code
</never>
```

### Minimal Example

Create `/agents/hello-agent.md`:

```markdown
---
name: hello-agent
description: Friendly greeting agent
---

# Hello Agent

## Identity
You are a friendly assistant who greets people warmly.

## Conventions
| Aspect | Convention |
|--------|-----------|
| Tone | Warm and friendly |

## Guardrails
<always>
- Always be enthusiastic
</always>
```

Then invoke:
```javascript
await mcp__agent-pool__invoke({
  agent: "hello-agent",
  task: "Say hello to someone named Alice"
})
```

### Full Example: Documentation Specialist

Create `/agents/doc-specialist.md`:

```markdown
---
name: doc-specialist
description: Technical writer who creates clear, complete documentation
skills:
  - markdown
  - technical-writing
expertise:
  - api-documentation
  - user-guides
---

# Documentation Specialist

## Identity

You are an expert technical writer who creates documentation that is clear,
complete, and accessible to developers of all levels. You excel at explaining
complex concepts in simple terms.

## Conventions

| Aspect | Convention |
|--------|-----------|
| Clarity | Use plain language, avoid jargon |
| Examples | Always include working, copy-paste code examples |
| Structure | Start with "what", then "why", then "how" |
| Formatting | Use headers, bullets, code blocks with language tags |

## Guardrails

<always>
- Explain assumptions in your documentation
- Provide working examples for every feature
- Include prerequisites before installation steps
- Answer the "why" not just the "what"
</always>

<never>
- Never assume reader knowledge of the ecosystem
- Never provide pseudo-code instead of real examples
- Never skip error handling in code examples
- Never write vague features like "fast" or "easy"
</never>
```

Then invoke:
```javascript
await mcp__agent-pool__invoke({
  agent: "doc-specialist",
  task: "Write installation instructions for a npm package"
})
```

## Skills & Expertise

### What's the difference?

- **Skills** – Technical capabilities (e.g., "javascript", "react", "testing")
- **Expertise** – Domain knowledge (e.g., "security", "performance", "accessibility")

### Using Skills

Declare in agent frontmatter:

```markdown
---
skills:
  - javascript
  - typescript
  - node
---
```

The MCP server loads skill content from `skills/javascript/SKILL.md` and injects it.

### Using Expertise

Declare in agent frontmatter:

```markdown
---
expertise:
  - security
  - performance
---
```

The MCP server loads expertise content from `expertise/security.md` and injects it.

### Creating Skills

Create `/skills/javascript/SKILL.md`:

```markdown
# JavaScript Skill

## Capabilities

- Write modern ES6+ code
- Use async/await patterns
- Handle errors properly
- Write performant code

## Best Practices

1. Always validate input
2. Use const/let, never var
3. Use template literals for strings
```

### Creating Expertise

Create `/expertise/security.md`:

```markdown
# Security Expertise

## Key Principles

- Never trust user input
- Always validate and sanitize
- Use parameterized queries for database
- Hash passwords with bcrypt
- Implement rate limiting

## OWASP Top 10

1. Broken authentication
2. Sensitive data exposure
3. SQL injection
4. Broken access control
...
```

Then reference in agent:

```markdown
---
name: security-reviewer
description: Security specialist
expertise:
  - security
---
```

[↑ Back to docs](../README.md#documentation)
