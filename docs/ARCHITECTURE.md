# Architecture Guide

## Table of Contents

- [Overview](#overview)
- [Component Diagram](#component-diagram)
- [Process Flow](#process-flow)
- [Prompt Caching](#prompt-caching)
- [File Structure](#file-structure)

## Overview

agent-pool is a persistent agent orchestration system that manages long-lived Claude CLI subprocesses and leverages prompt caching to achieve ~90% token savings on repeated tasks.

### Key Innovation: Context Reset Without Kill

Most multi-agent systems either:
- ❌ **Kill agent** after each task → loses prompt cache
- ❌ **Keep agent alive** → context grows, confuses agent

**agent-pool:** Send `/clear` command to reset conversation history while keeping process alive:

```
Agent Process (Running)
    ↓
[Task 1] → Executes → Returns result
    ↓
[Send /clear] → Resets conversation
    ↓
[Agent waits] ← Process still alive, cache still warm!
    ↓
[Task 2] → Uses cached system prompt → Fast & cheap
```

This is the "secret sauce" that enables prompt caching.

## Component Diagram

```
┌──────────────────────────────────────────────────┐
│           Claude Code (User Interface)           │
│        Slash commands, file editing, etc.        │
└────────────────────┬─────────────────────────────┘
                     │ (MCP Protocol)
         ┌───────────┴──────────┐
         │                      │
    [MCP Client]         [Other Plugins]
         │
         └────────────────────────────┐
                                      │
        ┌─────────────────────────────┴─────────────────────────┐
        │     agent-pool MCP Server (Node.js)                   │
        │     servers/agent-pool/index.js                       │
        ├─────────────────────────────────────────────────────┤
        │  MCP Tools:                                           │
        │  ├─ invoke(agent, task)     → Send task, wait, clear │
        │  ├─ list()                  → Show active agents      │
        │  ├─ warmup(agent)           → Pre-spawn for caching  │
        │  └─ reset(agent)            → Kill & respawn         │
        └──────────────┬──────────────┬──────────────┬──────────┘
                       │              │              │
         ┌─────────────┴────┐  ┌──────┴───────┐  ┌──┴──────────────┐
         │                  │  │              │  │                 │
    [code-reviewer]  [test-writer]  [doc-specialist]  [user agents]
         │                  │              │              │
         ↓                  ↓              ↓              ↓
    ┌─────────────────────────────────────────────────────────┐
    │  Claude CLI Subprocesses (stream-json mode)             │
    │                                                         │
    │  $ claude \                                             │
    │    --input-format stream-json \                         │
    │    --output-format stream-json \                        │
    │    --system-prompt-file agents/code-reviewer.md         │
    │    --dangerously-skip-permissions                       │
    └──┬──────────────────────────────────────────────────┬───┘
       │                                                  │
    ┌──┴────────────────────┐      ┌────────────────────┴─┐
    │   Process 1 (PID)      │      │   Process N (PID)    │
    │   ├─ System prompt     │      │   ├─ System prompt   │
    │   ├─ Prompt cache      │      │   ├─ Prompt cache    │
    │   └─ Context (reset)   │      │   └─ Context (reset) │
    └────────────────────────┘      └──────────────────────┘
```

## Process Flow

### Task Invocation Flow

```
User calls: mcp__agent-pool__invoke({ agent: "code-reviewer", task: "Review app.js" })
│
├─ Step 1: Check if agent exists in pool
│   ├─ YES → Use existing process (cache warm!)
│   └─ NO → Spawn new process
│
├─ Step 2: Load agent definition
│   ├─ Read /agents/code-reviewer.md
│   ├─ Parse YAML frontmatter (skills, expertise)
│   ├─ Load skill content from /skills/*
│   ├─ Load expertise content from /expertise/*
│   └─ Compose full system prompt
│
├─ Step 3: Send task to agent via stdin
│   ├─ Format: stream-json protocol
│   ├─ Wait for response
│   └─ Parse JSON output
│
├─ Step 4: Return result to user
│   └─ Plain text response
│
└─ Step 5: Reset context
    ├─ Send "/clear" command
    ├─ Agent resets conversation history
    └─ Process waits for next task (cache still alive!)
```

### Prompt Cache Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│  Task 1: First invocation of code-reviewer                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ System Prompt: [1500 tokens] ← Cache created (~$0.045)      │
│ Task Content:  [300 tokens]                                 │
│ ─────────────────────────                                   │
│ Total Cost:    1,800 tokens   ← Full cost, cache written    │
│                                                              │
│ Prompt cache state: [■■■■■■■■■■] 100% cached             │
└──────────────────────────────────────────────────────────────┘
                           ↓
              [Context reset with /clear]
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  Task 2: Reuse cached code-reviewer                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ System Prompt: [150 tokens] ← Read from cache (~$0.0045)    │
│ Task Content:  [300 tokens]                                 │
│ ─────────────────────────                                   │
│ Total Cost:    450 tokens     ← 90% savings on system!      │
│                                                              │
│ Prompt cache state: [■■■■■■■■■■] Still 100% cached       │
└──────────────────────────────────────────────────────────────┘
```

**Cost comparison:**
- New agent each time: 1,800 × 2 = 3,600 tokens
- Cached agent: 1,800 + 450 = 2,250 tokens
- **Savings: 1,350 tokens (37%)**

At scale (10 tasks): 18,000 vs 3,000 tokens = **83% savings**

## Prompt Caching

### How Claude's Prompt Cache Works

1. **Write Phase** (1st request)
   - System prompt sent to API
   - Cached in Anthropic's servers
   - Cost: ~$0.03/million tokens (cache write)
   - Cache is valid for 5 minutes

2. **Read Phase** (2nd+ requests within 5 min)
   - System prompt retrieved from cache
   - Cost: ~$0.003/million tokens (cache read)
   - 90% savings vs writing

3. **Requirements**
   - Same system prompt (word-for-word identical)
   - Same model
   - Within 5-minute window
   - Minimum cache value (usually 1024 tokens to worth caching)

### Why agent-pool's Approach Works

```
Native Task Tool:
─────────────────
Task 1: New process → system prompt → 1,500 tokens (no cache)
Task 2: New process → system prompt → 1,500 tokens (no cache)
Task 3: New process → system prompt → 1,500 tokens (no cache)
Total: 4,500 tokens (expensive)

agent-pool:
──────────
Warmup:  Spawn agent → system prompt → 1,500 tokens (cache write)
Task 1:  Reuse agent → system cached → 150 tokens (cache read)
Task 2:  Reuse agent → system cached → 150 tokens (cache read)
Task 3:  Reuse agent → system cached → 150 tokens (cache read)
Total: 1,950 tokens (60% savings)
```

The key: **Same process = same system prompt = cacheable**

## File Structure

```
agent-pool/
│
├── README.md                        # Main documentation (this file)
├── LICENSE                          # MIT license
├── plugin.json                      # Claude Code plugin manifest
├── CONTRIBUTING.md                  # Contribution guidelines
│
├── docs/                            # Detailed documentation
│   ├── INSTALLATION.md             # Setup guide
│   ├── USAGE.md                    # API reference & examples
│   ├── ARCHITECTURE.md             # This file
│   └── TROUBLESHOOTING.md          # Common issues
│
├── agents/                          # Agent definitions (user-editable)
│   ├── code-reviewer.md            # Built-in: code quality specialist
│   ├── example-assistant.md        # Built-in: general helper
│   ├── example.md                  # Template for custom agents
│   └── my-custom-agent.md          # User-created agents
│
├── skills/                          # Reusable skill definitions
│   ├── javascript/
│   │   └── SKILL.md                # JavaScript/TypeScript skills
│   ├── react/
│   │   └── SKILL.md                # React expertise
│   └── testing/
│       └── SKILL.md                # Testing frameworks
│
├── expertise/                       # Domain expertise
│   ├── security.md                 # Security best practices
│   ├── performance.md              # Performance optimization
│   ├── accessibility.md            # A11y guidelines
│   └── testing.md                  # Testing strategies
│
├── commands/                        # Claude Code slash commands
│   └── pool-status.md             # /pool-status command
│
├── hooks/                           # Claude Code hooks
│   └── block-custom-subagents.cjs  # Blocks native Task tool
│
├── servers/agent-pool/              # MCP server (Node.js)
│   ├── package.json                # npm dependencies
│   ├── index.js                    # Main server code
│   └── node_modules/               # Installed dependencies
│
└── assets/                          # Static assets
    ├── banner.png                  # Plugin banner
    └── logo.svg                    # Plugin logo
```

### Key Files Explained

#### `plugin.json`
Registers the plugin with Claude Code:
```json
{
  "name": "agent-pool",
  "mcpServers": {
    "agent-pool": {
      "command": "node",
      "args": ["./servers/agent-pool/index.js"]
    }
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Task",
        "command": "node",
        "args": ["./hooks/block-custom-subagents.cjs"]
      }
    ]
  }
}
```

#### `servers/agent-pool/index.js`
The MCP server that:
1. Spawns/manages Claude CLI subprocesses
2. Implements `invoke()`, `list()`, `warmup()`, `reset()` tools
3. Loads agent definitions from `/agents/`
4. Composes skill/expertise content
5. Handles stream-json protocol

#### `hooks/block-custom-subagents.cjs`
Prevents expensive native `Task` tool calls by intercepting them.

#### `/agents/*.md`
Agent system prompts. Format:
```markdown
---
name: agent-name
description: What this agent does
skills: [list]
expertise: [list]
---

# Agent Title

## Identity
You are...

## Conventions
[Table]

## Guardrails
<always>...</always>
<never>...</never>
```

#### `/skills/name/SKILL.md`
Reusable technical skill content injected into agents that declare it.

#### `/expertise/name.md`
Domain expertise content injected into agents that declare it.

## Performance Characteristics

### Startup Time
- **First agent spawn:** ~1-2 seconds (Claude CLI startup)
- **Subsequent agents:** ~1-2 seconds each (concurrent spawns)
- **Reusing warm agent:** ~100ms (already running)

### Memory Usage
- **Per agent process:** ~150-300 MB (Claude CLI memory)
- **MCP server overhead:** ~50 MB
- **5 agents:** ~750-1500 MB total

### Token Efficiency
- **Warmup cost:** ~1,800 tokens (first system prompt + cache write)
- **Per task cost:** ~300-500 tokens (depends on task size)
- **Cache savings per task:** ~1,200+ tokens (90% on system prompt)

### Limits
- **Max concurrent agents:** Limited by system memory (typically 20-50)
- **Task timeout:** 5 minutes (configurable)
- **Cache duration:** 5 minutes (Anthropic API limit)

[↑ Back to docs](../README.md#documentation)
