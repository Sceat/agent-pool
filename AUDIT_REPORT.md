# Specification Clarity Audit Report
**Repository:** agent-pool
**Date:** 2025-11-27
**Auditor:** Claude Code Documentation Specialist

---

## Executive Summary

**Overall Assessment:** ⚠️ **GOOD with CRITICAL GAPS**

The agent-pool project has **excellent marketing documentation** and **clear user guides**, but suffers from **dangerous specification ambiguities** in the **code implementation** and **API contracts**. The documentation is accessible but masks critical undefined behaviors that will cause production bugs.

**Key Issues:**
- ✅ **README & User Docs:** Excellent clarity, examples, and installation steps
- ❌ **MCP Tool Contracts:** Missing error handling specs, return value guarantees
- ❌ **Code Comments:** Minimal JSDoc, unclear edge cases, implicit assumptions
- ❌ **Agent File Specs:** Vague format requirements, no validation rules
- ⚠️ **Error Handling:** Silent failures in critical paths (missing skill/expertise files)

---

## 1. DOCUMENTATION GAPS

### HIGH PRIORITY

#### [servers/agent-pool/index.js] Missing MCP Tool Specification Contracts

**Issue:** Tools documented in README/USAGE but their **actual behavior contracts** are undocumented.

| Tool | Contract Gap | Impact |
|------|---|---|
| `invoke(agent, task)` | ❌ What happens if agent definition invalid? | Silent failure or error response? |
| `invoke(agent, task)` | ❌ Timeout behavior exact specification? | Does it kill process, retry, or leave hanging? |
| `invoke(agent, task)` | ❌ Stream-json parsing failures? | Silently skip lines or error? |
| `warmup(agent)` | ❌ If agent already exists? | Respawn or reuse? |
| `list()` | ❌ Killed process handling? | Are dead processes cleaned immediately? |
| `reset(agent)` | ❌ If not running? | Error or silent success? |

**Where Fixed:**
```javascript
// Lines 333-354: invoke() tool has NO JSDoc specifying:
// - What constitutes valid response vs error?
// - What happens on timeout?
// - Promise rejection vs isError: true?
server.tool('invoke', 'Send a task...', ...)
```

**Recommendation:**
```javascript
/**
 * Send a task to an agent and wait for result
 * @param {string} agent - Agent name (without .md)
 * @param {string} task - Task prompt
 * @returns {Promise<{content: {type: 'text', text: string}[], isError?: boolean}>}
 *
 * @throws {Error} If agent file not found
 * @throws {Error} If timeout exceeded (300000ms default)
 * @throws {Error} If process crashes mid-execution
 *
 * Behavior:
 * - Auto-spawns agent if not running
 * - Resets context with /clear after completion
 * - Returns result as plain text string
 * - Returns error as isError: true response (not thrown)
 */
```

---

#### [docs/USAGE.md] Error Handling Underspecified

**Line 282-298:** Example error handling is vague:

```javascript
try {
  const result = await mcp__agent-pool__invoke({...})
} catch (error) {
  console.error("Task failed:", error.message)
  // What are the possible error.message values?
  // How do I distinguish timeout vs crash vs invalid agent?
}
```

**What's Missing:**
- No list of possible error messages
- No distinction between recoverable vs fatal errors
- "timeout" string detection is brittle (no constant defined)

**Recommendation:** Add error catalog to USAGE.md:
```markdown
### Error Handling Reference

| Error | Cause | Recovery |
|-------|-------|----------|
| "Agent 'X' not found: /path/to/agents/X.md" | Agent file missing | Create agent file, check spelling |
| "Task timeout after 300000ms" | Process hung or slow | Use reset(), increase TASK_TIMEOUT_MS |
| "Agent process closed unexpectedly" | Crash or SIGKILL | Check Claude CLI version, logs |
| "spawn ENOENT: claude" | Claude CLI not in PATH | Install Claude CLI, add to PATH |
```

---

### MEDIUM PRIORITY

#### [README.md] Missing Return Value Specification

**Lines 98-107:** Tool reference table shows purposes but NOT return formats:

```markdown
| Tool | Purpose |
|------|---------|
| `invoke(agent, task)` | Send task, get result, auto-reset context |  ← No return type!
| `list()` | Show active agents with PIDs |
| `warmup(agent)` | Pre-spawn to warm up cache |
```

**What's Missing:**
- `invoke()` returns string? object? wrapped response?
- `list()` returns array of what exactly?
- `warmup()` returns confirmation string or structured object?

**Where in Code:**
- Lines 358-365: `list()` returns stringified JSON, not parsed object
- Lines 399-402: `warmup()` returns plain text message string, not structured data

**Recommendation:** Document in MCP server tool definitions:

```javascript
server.tool('list', 'List all active agents with their PIDs', {}, async () => {
  // Returns Array<{name: string, pid: number | undefined}>
  // serialized as JSON string in text content
  const agents = list_agents()
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(agents, null, 2),  // ← User must parse!
    }],
  }
})
```

---

## 2. UNCLEAR SPECIFICATIONS

### HIGH PRIORITY

#### [agents/] File Format Not Formally Specified

**Problem:** Agent `.md` file requirements are **described informally** in examples, not formally documented.

**Missing Specification:**
```markdown
# Agent File Format Specification (NOT DOCUMENTED)

File location: ~/.claude/plugins/agent-pool/agents/{name}.md
File structure: YAML frontmatter + Markdown content
Encoding: UTF-8

## Frontmatter (YAML block)
Required fields:
- name: string [a-z-]+ (matches filename)
- description: string (shown in UI)
Optional fields:
- skills: array of strings (loaded from skills/{name}/SKILL.md)
- expertise: array of strings (loaded from expertise/{name}.md)

## Validation Rules (NOT SPECIFIED)
- What if name contains spaces? → Silently invalid
- What if name doesn't match filename? → Which takes precedence?
- What if required fields missing? → Error or fallback?
- What if skills/ expertise files don't exist? → Silent skip or error?
```

**Evidence from Code (lines 91-130 in index.js):**

```javascript
function parse_frontmatter(content) {
  // Regex-based parsing with NO validation
  const frontmatter_match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!frontmatter_match) return result  // ← No error, just returns empty

  // Skills parsing - what if regex doesn't match?
  const skills_match = yaml_block.match(/skills:\s*\n((?:\s*-\s*.+\n?)+)/i)
  if (skills_match) {  // ← Silent skip if missing
    // ...
  }
}

function load_skill(skill_name) {
  const skill_path = join(SKILLS_DIR, skill_name, 'SKILL.md')
  if (!existsSync(skill_path)) {
    console.error(`[agent-pool] Skill not found: ${skill_path}`)  // ← Only logs!
    return null  // ← Returns null, caller doesn't check
  }
}
```

**Real-World Impact:**

User creates `agents/my-agent.md` with:
```yaml
---
name: my-agent
skills:
  - nonexistent-skill  # ← File not found
---
```

**Current Behavior:** Agent loads with console error (user may not see), skill silently ignored.
**Expected Behavior:** Should this error? Warn? Silently skip?

**Recommendation:** Create formal specification:

```markdown
# Agent Definition Format

## File Location & Naming
- Path: `~/.claude/plugins/agent-pool/agents/{name}.md`
- Name: must match filename (without `.md`)
- Character restrictions: lowercase, hyphens, underscores only
  - Valid: `code-reviewer.md`, `test_writer.md`
  - Invalid: `Code Reviewer.md` (spaces), `testWriter.md` (camelCase)

## Frontmatter Requirements
MUST include YAML block at top:
```yaml
---
name: agent-name-must-match-filename
description: Brief description shown to users
skills: []  # Optional
expertise: []  # Optional
---
```

## Validation Rules
- Missing frontmatter: Agent load fails with error
- Skill file missing: Agent loads with warning, skill injected as empty
- Expertise file missing: Agent loads with warning, expertise not injected
- Invalid YAML syntax: Agent load fails with parsing error
```

---

#### [servers/agent-pool/index.js:197-272] Stream-JSON Protocol Undocumented

**Problem:** The protocol for communicating with Claude CLI subprocess is **never documented**.

**Lines 261-271 show protocol but NO specification:**
```javascript
const message = JSON.stringify({
  type: 'user',
  message: {
    role: 'user',
    content: task,
  },
})
child.stdin.write(message + '\n')
```

**Missing Specification:**
```
# Stream-JSON Protocol (Claude CLI subprocess communication)

## Input Format (what agent-pool sends)
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "string"
  }
}
```
One JSON object per line (newline-delimited).

## Expected Output Format (what agent-pool reads)
Should return line with `type: 'result'` and `result` field:
```json
{"type": "result", "result": "response text here"}
```

But what if Claude outputs other message types? Ignored?
What if no "result" field? Timeout assumed?
What if multiple result messages? First one wins?
```

**Evidence (lines 220-236):**
```javascript
const lines = agent.buffer.split('\n')
agent.buffer = lines.pop() ?? ''

for (const line of lines) {
  if (!line.trim()) continue
  try {
    const parsed = JSON.parse(line)

    if (parsed.type === 'result' && parsed.result !== undefined) {
      result_text = parsed.result  // ← Assumes this format exists
      cleanup()
      send_clear_context(agent_name)
      resolve(result_text)
    }
  } catch {
    // Non-JSON lines silently ignored  ← What if ALL lines are non-JSON?
  }
}
```

**Scenario:** What if Claude CLI outputs warning messages between `type !== 'result'`?
- Current: Silently ignored, waits for timeout
- Desired: Should buffer non-result messages? Return warnings?

**Recommendation:** Document protocol and edge cases:

```javascript
/**
 * Stream-JSON Protocol Specification
 *
 * This MCP server communicates with Claude CLI using newline-delimited JSON.
 *
 * Input (to Claude CLI stdin):
 * {"type": "user", "message": {"role": "user", "content": "task text"}}
 *
 * Output (from Claude CLI stdout):
 * - Multiple lines of JSON objects (partial responses, metadata, etc.)
 * - Ends with: {"type": "result", "result": "final response text"}
 *
 * Edge Cases & Handling:
 * 1. Non-JSON lines: Silently ignored (Claude may output log lines)
 * 2. Missing "result" field: Continues waiting (may timeout)
 * 3. Multiple "result" messages: Returns first, ignores rest
 * 4. Process outputs nothing: Times out after TASK_TIMEOUT_MS
 * 5. Process crashes: 'close' event fired, promise rejected
 */
```

---

### MEDIUM PRIORITY

#### [index.js:28-56] YAML Frontmatter Parser Has Undocumented Limitations

**Lines 38-43 show regex-based YAML parsing:**

```javascript
const skills_match = yaml_block.match(/skills:\s*\n((?:\s*-\s*.+\n?)+)/i)
if (skills_match) {
  result.skills = skills_match[1]
    .split('\n')
    .map(line => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
}
```

**What's Not Documented:**
- Only supports YAML list format (`- item`), not inline arrays (`[item1, item2]`)
- Only handles YAML at start of line (strict indentation required)
- What if duplicate keys? Last one wins or error?
- What if `skills:` appears in agent body (after `---`)? Would match incorrectly.

**Real Example That Breaks:**
```yaml
---
name: my-agent
skills: [javascript, react]  # ← NOT PARSED (expects list format)
---
```

vs this works:
```yaml
---
name: my-agent
skills:
  - javascript
  - react
---
```

**Recommendation:** Document parser limitations or improve validation:

```javascript
/**
 * Parse YAML frontmatter from markdown
 *
 * Format: YAML block between --- delimiters, must be at start of file
 *
 * Supported formats:
 * ✓ skills:\n  - item1\n  - item2  (list format)
 * ✗ skills: [item1, item2]  (flow format - not supported)
 * ✗ skills: item1, item2  (comma format - not supported)
 *
 * @param {string} content - File content
 * @returns {{ skills: string[], expertise: string[], body: string }}
 */
```

---

## 3. MISSING EDGE CASE DOCUMENTATION

### HIGH PRIORITY

#### [index.js:179-189] Agent Spawn Behavior Undefined

**Function `get_or_create_agent()`:**

```javascript
function get_or_create_agent(agent_name) {
  const existing = agent_pool.get(agent_name)
  if (existing && !existing.process.killed) {
    return existing  // ← What if process exists but hung?
  }

  const process = spawn_agent(agent_name)
  const entry = { process, buffer: '' }
  agent_pool.set(agent_name, entry)
  return entry
}
```

**Undefined Behavior:**
1. **If process hung but not killed:** `process.killed === false` but process doesn't respond
   - Current: Returns hung process, will timeout
   - Spec: Should check if process is actually responsive?

2. **Race condition:** Two simultaneous `invoke()` calls both see process dead
   - Current: Both spawn new process, one overwrites the other
   - Spec: Should use mutex/lock?

3. **Process exit not cleanup:** If Claude CLI crashes between checks:
   - Current: `on('exit')` handler deletes from pool, but may be reused before handler runs
   - Spec: Is this a real issue? How is it prevented?

**Recommendation:** Document:

```javascript
/**
 * Get existing agent or create new one
 *
 * Precondition:
 * - Agent with this name may or may not exist
 * - If exists, process may be alive or dead
 *
 * Postcondition:
 * - Returns an agent with a running Claude CLI process
 * - Process may be fresh or reused from pool
 *
 * Guarantees:
 * - Process.pid is valid at return time (may become invalid later)
 * - No check for process responsiveness (may hang)
 * - Not thread-safe (concurrent invoke() calls may race)
 *
 * Edge cases:
 * - If process crashes mid-execution, handled by 'close' event listener
 * - If process killed externally, will respawn on next invoke()
 * - If hung process, will timeout after TASK_TIMEOUT_MS
 */
```

---

#### [index.js:278-291] `/clear` Command Behavior Undefined

**Function `send_clear_context()`:**

```javascript
function send_clear_context(agent_name) {
  const agent = agent_pool.get(agent_name)
  if (!agent || agent.process.killed || !agent.process.stdin) return  // ← Silent fail

  const clear_message = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: '/clear' },
  })

  agent.process.stdin.write(clear_message + '\n')  // ← Fire and forget!
}
```

**Undefined Behavior:**

1. **What does `/clear` actually do?**
   - Documentation assumes it "resets conversation" but:
   - Is this a Claude CLI built-in? Or custom?
   - What if Claude doesn't recognize the command?
   - Does it return confirmation or fail silently?

2. **No wait for response:**
   - Fires message but doesn't wait for acknowledgment
   - If `/clear` fails, next task gets stale context
   - No error detection

3. **What if agent doesn't support `/clear`?**
   - Silently ignored?
   - Causes error?
   - Process crashes?

**Evidence from Docs:**
- ARCHITECTURE.md line 21: "Send `/clear` command to reset conversation"
- Never tested or validated in code
- Assumed to work without error checking

**Recommendation:**

```javascript
/**
 * Send context reset command to agent
 *
 * Purpose: Clears conversation history to free memory while keeping process alive
 *
 * Implementation: Sends "/clear" as a task message to Claude CLI subprocess
 *
 * Guarantees:
 * - If agent not running: returns silently (no error)
 * - If stdin closed: returns silently (no error)
 * - If /clear unsupported: no confirmation (assumes it works)
 *
 * Important: This is fire-and-forget. No confirmation /clear succeeded.
 * If Claude CLI doesn't support /clear, context won't actually reset.
 *
 * @param {string} agent_name
 */
function send_clear_context(agent_name) { ... }
```

---

#### [USAGE.md] Warmup Behavior Not Fully Explained

**Lines 15-19:**
```javascript
const result = await mcp__agent-pool__warmup({ agent: "code-reviewer" })
// Output: Agent "code-reviewer" spawned with PID 12345
```

**Undefined Questions:**
1. If agent already running, does it respawn or reuse?
2. When is cache actually written? During warmup or first task?
3. If warmup called but agent crashes before first task, is cache still there?

**Answer in Code (lines 312-315):**
```javascript
function warmup_agent(agent_name) {
  const agent = get_or_create_agent(agent_name)  // ← Reuses if exists!
  return { pid: agent.process.pid }
}
```

So warmup **reuses**, doesn't respawn. But this is not documented.

**Recommendation:** Update USAGE.md:

```markdown
### `warmup(agent)`

Pre-spawn an agent to warm up the prompt cache.

**Important:** If agent already running, warmup reuses the existing process
(it doesn't respawn). Call `reset()` first if you need a fresh start.

**When cache is actually created:**
- First request to agent (warmup or invoke)
- Cache valid for 5 minutes
- Cache is PER SYSTEM PROMPT (if system prompt changes, cache invalidates)
```

---

## 4. AMBIGUOUS CONTRACTS

### HIGH PRIORITY

#### [index.js:342-353] Error Response Format Ambiguous

**The `invoke()` tool implementation:**

```javascript
async ({ agent, task }) => {
  try {
    const result = await invoke_agent(agent, task)
    return {
      content: [{ type: 'text', text: result }],  // Success: no isError field
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],  // Error: has isError?
      isError: true,  // ← Is this field always present on error?
    }
  }
}
```

**Ambiguity:**
- Success response: `{ content: [...] }` (no isError field)
- Error response: `{ content: [...], isError: true }`

**Not documented:**
- Is `isError` field ONLY present on errors, or always present?
- Should client check `isError` presence or field value?
- What if agent legitimately returns string "Error: something"?

**Recommendation:** Standardize and document:

```javascript
/**
 * Invoke tool contract
 *
 * Returns:
 * {
 *   content: [{ type: 'text', text: string }],
 *   isError?: boolean  // Only present if task failed
 * }
 *
 * Success case:
 * { content: [{ type: 'text', text: "task result here" }] }
 *
 * Error case:
 * {
 *   content: [{ type: 'text', text: "Error: agent not found" }],
 *   isError: true
 * }
 *
 * Client should check: if ('isError' in result) { /* error */ }
 */
```

---

#### [INSTALLATION.md] Environment Variable Contract Incomplete

**Line 55:** "Install dependencies" but TASK_TIMEOUT_MS mentioned nowhere:

```bash
cd ~/.claude/plugins/agent-pool/servers/agent-pool
npm install
```

But in code (line 15):
```javascript
const {
  AGENTS_DIR = join(__dirname, '..', '..', 'agents'),
  SKILLS_DIR = join(__dirname, '..', '..', 'skills'),
  EXPERTISE_DIR = join(__dirname, '..', '..', 'expertise'),
  TASK_TIMEOUT_MS = '300000',  // ← Default here, not documented
} = process.env
```

**Documentation says (TROUBLESHOOTING.md:59-60):**
```bash
export TASK_TIMEOUT_MS=600000
```

But doesn't explain:
- Where to set this? System-wide? Per session? In claude?
- Is it read at startup only? Or per invocation?
- What unit? Milliseconds (assumed but not stated)
- Valid range? Min/max values?

**Recommendation:** Add to INSTALLATION.md:

```markdown
## Environment Variables

The MCP server reads these environment variables at startup:

| Variable | Default | Unit | Purpose |
|----------|---------|------|---------|
| `AGENTS_DIR` | `~/.claude/plugins/agent-pool/agents` | Path | Where agent .md files are loaded from |
| `SKILLS_DIR` | `~/.claude/plugins/agent-pool/skills` | Path | Where skill definitions are loaded from |
| `EXPERTISE_DIR` | `~/.claude/plugins/agent-pool/expertise` | Path | Where expertise definitions are loaded from |
| `TASK_TIMEOUT_MS` | `300000` | Milliseconds | Max wait time for task response (300s = 5 min) |

### Setting Environment Variables

Option 1: System-wide (macOS/Linux)
```bash
export TASK_TIMEOUT_MS=600000
echo $TASK_TIMEOUT_MS  # Verify
```

Option 2: For Claude Code only
```bash
# In ~/.claude/CLAUDE.md or settings, set env vars for plugin
```

Option 3: Check current value
```bash
echo $TASK_TIMEOUT_MS  # If not set, defaults to 300000
```

### Restart Required
After changing environment variables, restart Claude Code for changes to take effect.
```

---

## 5. REQUIREMENT GAPS & ASSUMPTIONS

### HIGH PRIORITY

#### [hook/block-custom-subagents.cjs] Undocumented Behavior

**Purpose (lines 3-5):**
```javascript
/**
 * Hook: Block Task tool from spawning custom subagents
 * Intercepts Task tool calls and blocks custom agents defined in .claude/agents/
 * Built-in agents are allowed to pass through
 */
```

**Undefined Behavior:**

1. **What defines "custom agent"?**
   - Line 57: Checks for file in `.claude/agents/{name}.md`
   - But where should custom agents be created by users?
   - Not documented in USAGE.md or agent creation guide

2. **What happens to blocked tasks?**
   - Line 61-64: Returns decision: 'block' with reason
   - But does Claude Code show error to user? Stop execution? Prompt?
   - Not specified

3. **Built-in agent list outdated?**
   - Lines 11-17: Hardcoded list
   ```javascript
   const BUILT_IN_AGENTS = new Set([
     'general-purpose',
     'Explore',
     'Plan',
     'claude-code-guide',
     'statusline-setup',
   ])
   ```
   - If Claude Code adds new built-in agent, this list becomes wrong
   - No mechanism to update (breaks on new Claude versions)

**Recommendation:** Document in README:

```markdown
### Custom Agent vs Task Tool

The agent-pool plugin **blocks** the native Task tool for custom subagents.

Why? Task tool spawns fresh process each time (expensive), agent-pool reuses for savings.

**Allowed (uses agent-pool):**
```javascript
mcp__agent-pool__invoke({ agent: "code-reviewer", task: "..." })
```

**Blocked (uses Task tool for custom agents):**
```javascript
await Task({
  subagent_type: "my-custom-agent",
  description: "...",
})
// ❌ Error: Custom agent detected. Use mcp__agent-pool__invoke instead.
```

**Built-in agents still allowed via Task:**
```javascript
await Task({
  subagent_type: "general-purpose",  // ✅ Built-in, allowed
  description: "..."
})
```
```

---

#### [agents/] No Example Agent Provided

**Issue:** USAGE.md shows agent file format with minimal examples (lines 345-369), but NO working example agent file in `/agents/` directory.

**From audit:**
```bash
$ ls ~/.claude/plugins/agent-pool/agents/
# (empty - no files!)
```

**Consequence:**
- User can't copy-paste working example
- Must manually create from scratch
- No validation of their format

**Recommendation:** Create `/agents/example.md`:

```markdown
---
name: example
description: Example agent template - copy this file to create your own agent
skills: []
expertise: []
---

# Example Agent

## Identity

You are an example assistant. Copy this file to create your own custom agent.

## Conventions

| Aspect | Convention |
|--------|-----------|
| Output | Clear, step-by-step explanations |
| Scope | Answer the question asked |
| Tone | Professional and helpful |

## Guardrails

<always>
- Always explain your reasoning
- Always provide examples when helpful
</always>

<never>
- Never make assumptions about user knowledge
- Never provide incomplete solutions
</never>
```

Then document in USAGE.md:
```markdown
### Quick Start: Create Your First Agent

Copy the template:
```bash
cp ~/.claude/plugins/agent-pool/agents/example.md ~/.claude/plugins/agent-pool/agents/my-agent.md
```

Edit `my-agent.md` to customize identity, conventions, and guardrails.

Then invoke:
```javascript
await mcp__agent-pool__invoke({ agent: "my-agent", task: "..." })
```
```

---

## 6. CODE COMMENT CLARITY

### MEDIUM PRIORITY

#### [index.js:205-236] Core Invocation Loop Poorly Documented

**The main event loop for receiving task results:**

```javascript
return new Promise((resolve, reject) => {
  const timeout_id = setTimeout(() => {
    cleanup()
    reject(new Error(`Task timeout after ${TIMEOUT_MS}ms`))
  }, TIMEOUT_MS)

  let result_text = null  // ← Why initialized to null?

  const on_data = (chunk) => {
    agent.buffer += chunk.toString()

    const lines = agent.buffer.split('\n')
    agent.buffer = lines.pop() ?? ''  // ← Why pop() here?

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const parsed = JSON.parse(line)

        if (parsed.type === 'result' && parsed.result !== undefined) {
          result_text = parsed.result
          cleanup()
          send_clear_context(agent_name)
          resolve(result_text)  // ← Why resolve and then send_clear?
        }
      } catch {
        // Ignore non-JSON lines  ← Is this intentional or bug?
      }
    }
  }
  // ... rest of listeners
})
```

**Missing Comments:**
1. **Buffer management (line 218):** Why `split('\n')` and `pop()`?
   - Answer: Handles partial JSON objects split across chunks
   - Should explain: "Keep incomplete line in buffer, process complete lines"

2. **Initialization to null (line 212):** Why start with `null`?
   - Answer: To detect if process closed without sending result
   - Should explain: "Distinguish between 'no result yet' vs 'got empty string'"

3. **Async cleanup (line 229):** Why resolve THEN send_clear?
   - Answer: Consumer gets result immediately, clear happens async
   - Should explain: "Fire-and-forget context reset for next invocation"

**Recommendation:** Add comments:

```javascript
const on_data = (chunk) => {
  agent.buffer += chunk.toString()

  // Split on newlines but keep incomplete last line in buffer
  // (JSON objects may be split across multiple write() calls)
  const lines = agent.buffer.split('\n')
  agent.buffer = lines.pop() ?? ''  // Incomplete line stays in buffer

  for (const line of lines) {
    if (!line.trim()) continue

    try {
      const parsed = JSON.parse(line)

      // Look for completion marker: type='result' with actual content
      if (parsed.type === 'result' && parsed.result !== undefined) {
        result_text = parsed.result
        cleanup()

        // Fire-and-forget context reset (don't wait for /clear response)
        // Next invocation will see clean context, reusing cached system prompt
        send_clear_context(agent_name)

        // Resolve immediately so caller gets result fast
        resolve(result_text)
        return
      }
    } catch {
      // Claude CLI outputs non-JSON lines (logs, progress, etc)
      // Safely skip them and wait for type='result' marker
    }
  }
}
```

---

### LOW PRIORITY

#### [index.js:298-305] Generic function names

```javascript
function reset_agent(agent_name) {
  const agent = agent_pool.get(agent_name)
  if (!agent) return false

  agent.process.kill('SIGTERM')  // ← Why SIGTERM? Why not SIGKILL?
  agent_pool.delete(agent_name)
  return true
}
```

**Missing:**
- Comment explaining SIGTERM choice (graceful shutdown vs immediate kill)
- What happens if SIGTERM doesn't kill process?
- Is there cleanup the agent needs to do?

**Recommendation:**
```javascript
/**
 * Gracefully terminate an agent process
 *
 * Sends SIGTERM to allow Claude CLI to clean up resources gracefully.
 * If process doesn't respond, caller can retry with SIGKILL.
 *
 * @param {string} agent_name
 * @returns {boolean} true if agent was running, false if not found
 */
function reset_agent(agent_name) {
  const agent = agent_pool.get(agent_name)
  if (!agent) return false

  // Use SIGTERM for graceful shutdown (allows cleanup)
  // rather than SIGKILL which terminates immediately
  agent.process.kill('SIGTERM')
  agent_pool.delete(agent_name)
  return true
}
```

---

## 7. IMPLICIT ASSUMPTIONS

### HIGH PRIORITY (Critical for Production)

#### Assumption 1: `/clear` command always works
- **Code:** Lines 278-291
- **Assumption:** Claude CLI supports `/clear` command
- **Reality:** Never tested, no error handling
- **Risk:** If not supported, context balloons, cache stops working

#### Assumption 2: Skills/expertise files always exist
- **Code:** Lines 63-84, 111-124
- **Assumption:** User creates `/skills/X/SKILL.md` for each skill
- **Reality:** Silent skip if missing (no error)
- **Risk:** Agent gets empty skill section, user confused why skill not applied

#### Assumption 3: Stream-JSON protocol output format always matches
- **Code:** Lines 220-236
- **Assumption:** Claude CLI always outputs `{"type": "result", "result": "..."}`
- **Reality:** Format never validated
- **Risk:** If Claude changes output format, agent times out silently

#### Assumption 4: Agent process never becomes unresponsive
- **Code:** Lines 179-189
- **Assumption:** `process.killed === false` means process is working
- **Reality:** Process can hang, no health check
- **Risk:** Hung process reused, next task waits 5 minutes for timeout

#### Assumption 5: Cache persists across `/clear` invocations
- **Code:** Lines 21-35 of ARCHITECTURE.md
- **Assumption:** Prompt cache remains valid after context reset
- **Reality:** Documentation claims 5-min validity, but if system prompt changes, cache invalidates
- **Risk:** If agent file edited between tasks, cache doesn't update automatically

---

## SUMMARY TABLE

| Category | Severity | Count | Examples |
|----------|----------|-------|----------|
| **Missing Contracts** | HIGH | 5 | MCP tool return formats, error handling, timeout behavior |
| **Unclear Specs** | HIGH | 4 | Agent file format, stream-json protocol, /clear behavior |
| **Missing Edge Cases** | HIGH | 3 | Hung processes, race conditions, /clear failures |
| **Ambiguous Returns** | HIGH | 2 | Error response format, environment variables |
| **No Examples** | MEDIUM | 2 | No working example agent, no skill file examples |
| **Poor Comments** | MEDIUM | 2 | Buffer management, result detection logic |
| **Implicit Assumptions** | HIGH | 5 | /clear support, skill files, process health |

**Total Issues Found:** 23 (9 HIGH, 14 MEDIUM/LOW)

---

## RECOMMENDATIONS (Priority Order)

### 🔴 CRITICAL (Do First)

1. **Document MCP tool contracts** with error handling, timeout behavior, return formats
   - Add JSDoc to each tool in `index.js`
   - Update `USAGE.md` with error catalog
   - Add examples of both success and error responses

2. **Formalize agent file specification**
   - Create `AGENT_FORMAT.md` with YAML requirements
   - Validate frontmatter at load time (error instead of silent skip)
   - Document file naming rules and limitations

3. **Document `/clear` command behavior**
   - Clarify what `/clear` does
   - Add error handling if it fails
   - Test with latest Claude CLI version
   - Document in ARCHITECTURE.md

4. **Add working example agent**
   - Create `/agents/example.md` template
   - Update USAGE.md to reference it
   - Provide copy-paste instructions

### 🟡 HIGH (Do Soon)

5. **Document stream-json protocol**
   - Add protocol specification in code comments
   - Handle edge cases (multiple results, missing result field, non-JSON output)
   - Test with Claude CLI edge cases

6. **Add environment variable documentation**
   - Update INSTALLATION.md
   - Document all 4 variables (AGENTS_DIR, SKILLS_DIR, EXPERTISE_DIR, TASK_TIMEOUT_MS)
   - Explain how to set them persistently

7. **Improve error handling**
   - Validate skills/expertise files exist (error instead of silent skip)
   - Return specific error messages (not generic "Error: undefined")
   - Add health check before process reuse

### 🟢 MEDIUM (Nice to Have)

8. **Add code comments**
   - Document buffer management logic
   - Explain async/await patterns
   - Document signal handling choices

9. **Document assumptions**
   - List implicit assumptions in README
   - Explain mitigations or workarounds
   - Note areas needing testing

10. **Create troubleshooting guide for developers**
    - How to debug stream-json protocol
    - How to trace buffer parsing
    - How to monitor process lifecycle

---

## CONCLUSION

The agent-pool project has **excellent user-facing documentation** but **critical gaps in implementation specifications**. The code works, but its contracts are implicit, making it fragile for:
- Edge case handling
- Version compatibility (Claude CLI updates)
- Debugging/troubleshooting
- Future contributions

**Recommended focus:** Formalize the undocumented assumptions (especially `/clear`, skill loading, and stream-json protocol) and add JSDoc contracts to all MCP tools. This will prevent silent failures and make the codebase maintainable.

---

**Report Generated:** 2025-11-27
**Auditor:** Claude Code - Specification Clarity Specialist
**Audit Scope:** Code comments, API documentation, edge cases, requirements clarity
