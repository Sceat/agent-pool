<p align="center">
  <img src="https://raw.githubusercontent.com/Sceat/agent-pool/master/assets/banner.png?v=2" alt="agent-pool banner" width="100%">
</p>

<div align="center">

# 🔄 agent-pool

<img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
<img src="https://img.shields.io/badge/Claude_Code-9E5EFF?style=for-the-badge&logo=anthropic&logoColor=white" />
<img src="https://img.shields.io/badge/MCP-Protocol-blue?style=for-the-badge" />
<img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />

**A workaround for Claude Code's memory leak issues. Spawn agents once, reuse indefinitely.**

</div>

<p align="center">

```bash
git clone https://github.com/sceat/agent-pool.git ~/.claude/plugins/agent-pool && cd ~/.claude/plugins/agent-pool/servers/agent-pool && npm install
```

</p>

---

## ⚠️ Security Warning

> **SPAWNED AGENTS RUN WITH ALL PERMISSIONS BYPASSED**

Agents are spawned with `--dangerously-skip-permissions`, meaning they can:
- Execute **any shell command** without approval
- Read/write **any file** on your system
- Access **network resources** freely
- Inherit your **full environment** (env vars, credentials, SSH keys)

This is intentional—orchestration requires agents to work autonomously. However:

- ✅ **Only use trusted agent definitions** from sources you control
- ✅ **Review agent prompts** in `agents/*.md` before running
- ❌ **Never run untrusted agents** or agent definitions from unknown sources

**You are responsible for what your agents do.**

---

## Why This Exists

Claude Code's native `Task` tool has **critical memory leak issues** that cause processes to grow from hundreds of MB to tens of GB, eventually crashing:

| Issue | Description |
|-------|-------------|
| [#7020](https://github.com/anthropics/claude-code/issues/7020) | Sub-agent orchestration: 450MB → 30GB, then crashes |
| [#4953](https://github.com/anthropics/claude-code/issues/4953) | Process grows to 120GB+ RAM, OOM killed |
| [#11315](https://github.com/anthropics/claude-code/issues/11315) | 129GB virtual memory consumption |
| [#11155](https://github.com/anthropics/claude-code/issues/11155) | Bash output stored in memory forever, 90GB+ usage |
| [#8382](https://github.com/anthropics/claude-code/issues/8382) | v2.0.0: 26GB per process |

**The root cause:** Every `Task` tool call spawns a fresh subprocess. The memory accumulates and is never released.

**agent-pool's solution:** Keep Claude CLI subprocesses alive and use `/clear` to reset context while preserving the warm prompt cache. No new processes = no memory leak.

---

## How It Works

```
Native Task Tool (leaky):              agent-pool (stable):
──────────────────────────             ──────────────────────
Task 1 → spawn → 450MB                 Warmup → spawn → 450MB
Task 2 → spawn → 900MB ↑               Task 1 → /clear → 450MB (cached)
Task 3 → spawn → 1.3GB ↑               Task 2 → /clear → 450MB (cached)
Task 4 → spawn → 1.7GB ↑               Task 3 → /clear → 450MB (cached)
...                                    ...
Task N → OOM KILLED 💀                  Task N → still 450MB ✓
```

**Bonus:** Same process = same system prompt = prompt cache hits = **~90% token savings**.

---

## Quick Start

```bash
# Install
git clone https://github.com/sceat/agent-pool.git ~/.claude/plugins/agent-pool
cd ~/.claude/plugins/agent-pool/servers/agent-pool && npm install

# Restart Claude Code
```

```javascript
// Warm up agent (optional, creates prompt cache)
mcp__agent-pool__warmup({ agent: "code-reviewer" })

// Send tasks - all reuse the same process
mcp__agent-pool__invoke({ agent: "code-reviewer", task: "Review src/auth.js" })
mcp__agent-pool__invoke({ agent: "code-reviewer", task: "Review src/api.ts" })
mcp__agent-pool__invoke({ agent: "code-reviewer", task: "Review src/db.js" })

// Check active agents
mcp__agent-pool__list()
```

---

## API Reference

| Tool | Description |
|------|-------------|
| `invoke(agent, task)` | Send task to agent, get result, auto-reset context with `/clear` |
| `warmup(agent)` | Pre-spawn agent to warm up prompt cache (optional) |
| `list()` | Show active agents with PIDs |
| `reset(agent)` | Kill agent process (respawns on next invoke) |

---

## Token Savings

| Tasks | Native Task | agent-pool | Savings |
|-------|-------------|------------|---------|
| 1 | 2,000 | 2,000 | 0% |
| 3 | 6,000 | 2,600 | 57% |
| 5 | 10,000 | 3,200 | 68% |
| 10 | 20,000 | 4,700 | 76% |

*System prompt (~1,500 tokens) is cached after first call. Subsequent calls only pay for task content.*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code                              │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP Protocol
┌──────────────────────────┴──────────────────────────────────┐
│              agent-pool MCP Server (Node.js)                 │
│  invoke() │ warmup() │ list() │ reset()                     │
└─────┬───────────┬───────────┬───────────┬───────────────────┘
      │           │           │           │
   ┌──┴──┐     ┌──┴──┐     ┌──┴──┐     ┌──┴──┐
   │Agent│     │Agent│     │Agent│     │Agent│  ← Persistent processes
   │ PID │     │ PID │     │ PID │     │ PID │    (not respawned)
   └─────┘     └─────┘     └─────┘     └─────┘
      ↑           ↑           ↑           ↑
   /clear      /clear      /clear      /clear   ← Context reset
   (cache)     (cache)     (cache)     (cache)    (cache preserved)
```

---

## Creating Custom Agents

Create `agents/my-agent.md` with YAML frontmatter:

```yaml
---
name: my-agent
description: What this agent does
skills:
  - skill-name
expertise:
  - expertise-name
---
```

### Frontmatter Headers

| Header | Description |
|--------|-------------|
| `name` | Agent identifier (used in `invoke({ agent: "name" })`) |
| `description` | What the agent does (shown in `list()` output) |
| `skills` | List of skill modules to inject (loaded from `SKILLS_DIR`) |
| `expertise` | List of expertise modules to inject (loaded from `EXPERTISE_DIR`) |

**Skills & Expertise Injection:** Content from referenced skill/expertise files gets injected into the agent's system prompt at spawn time. This allows modular composition of agent capabilities.

Then invoke: `mcp__agent-pool__invoke({ agent: "my-agent", task: "..." })`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent not found | Check `agents/name.md` exists and `name:` in frontmatter matches |
| Task timeout | Run `reset({ agent: "name" })` to kill stuck process |
| Plugin not loading | Verify `plugin.json` exists, restart Claude Code completely |
| High memory usage | Check you're using agent-pool, not native Task tool |

**Full guide:** [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

---

## Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Prerequisites and setup
- **[Usage & API](docs/USAGE.md)** - Full API reference and examples
- **[Architecture](docs/ARCHITECTURE.md)** - How it works internally
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and fixes
- **[Contributing](CONTRIBUTING.md)** - How to contribute

---

## Requirements

- **Claude CLI** 2.0+ with `--input-format stream-json` support
- **Node.js** 18+

---

## License

[MIT](LICENSE)

---

<div align="center">

**Made for Claude Code developers tired of OOM kills**

[Report Bug](https://github.com/sceat/agent-pool/issues) · [Request Feature](https://github.com/sceat/agent-pool/issues)

</div>
