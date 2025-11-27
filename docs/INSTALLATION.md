# Installation Guide

## Prerequisites

Before installing agent-pool, ensure you have:

### 1. Claude CLI 2.0+

The plugin requires Claude CLI with stream-json I/O support.

```bash
# Check version
claude --version

# Should output: claude 2.0.0 or higher
```

If you don't have Claude CLI:
1. Visit https://claude.com/claude-code
2. Follow installation instructions for your OS
3. Verify: `claude --version`

### 2. Node.js 18+

The MCP server requires Node.js runtime.

```bash
# Check version
node --version

# Should output: v18.0.0 or higher
```

If you don't have Node.js:
1. Visit https://nodejs.org
2. Download LTS version (18.x or 20.x)
3. Verify: `node --version`

### 3. Claude Code Plugin System

Claude Code must be installed and working. You should see "Plugins" option in settings.

## Installation Methods

### Method 1: GitHub Clone (Recommended)

Best for users, easiest updates:

```bash
# Clone to plugins directory
git clone https://github.com/sceat/agent-pool.git ~/.claude/plugins/agent-pool

# Install dependencies
cd ~/.claude/plugins/agent-pool/servers/agent-pool
npm install

# Restart Claude Code completely
# (Not just reload, full cold restart)
```

### Method 2: Local Path (Development)

If developing the plugin locally:

```bash
# Use absolute path to your local clone
claude plugins add /absolute/path/to/agent-pool

# Install dependencies
cd /absolute/path/to/agent-pool/servers/agent-pool
npm install

# Restart Claude Code
```

### Method 3: Manual Registration

If above methods don't work:

```bash
# Navigate to plugin directory
cd ~/.claude/plugins/agent-pool

# Verify plugin.json exists
ls -la plugin.json

# Restart Claude Code and check Settings > Plugins
# agent-pool should now appear in list
```

## Verification

After installation, verify everything is working:

### 1. Check Plugin Loads

In Claude Code, use MCP tools:

```javascript
// Should return empty array (no agents spawned yet)
mcp__agent-pool__list()
```

### 2. List Available Agents

```bash
# Check agents directory
ls ~/.claude/plugins/agent-pool/agents/

# Should show:
# code-reviewer.md
# example-assistant.md
```

### 3. Warm Up an Agent

```javascript
// Should output: Agent "code-reviewer" spawned with PID: XXXXX
mcp__agent-pool__warmup({ agent: "code-reviewer" })
```

### 4. List Active Agents

```javascript
// Should show the warmed agent
mcp__agent-pool__list()
// Output: [{ name: "code-reviewer", pid: 12345 }]
```

### 5. Send a Test Task

```javascript
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "What is 2 + 2?"
})
```

If all steps succeed, installation is complete! ✅

## Troubleshooting Installation

### "Plugin not appearing in Claude Code"

**Step 1:** Verify file exists
```bash
ls -la ~/.claude/plugins/agent-pool/plugin.json
```

**Step 2:** Check permissions
```bash
# Ensure plugin.json is readable
chmod 644 ~/.claude/plugins/agent-pool/plugin.json
```

**Step 3:** Restart Claude Code
- Close completely (not just reload)
- Reopen Claude Code

**Step 4:** Force re-register
```bash
claude plugins remove agent-pool
claude plugins add ~/.claude/plugins/agent-pool
```

### "npm install fails with permission errors"

```bash
# Try with force flag
cd ~/.claude/plugins/agent-pool/servers/agent-pool
npm install --force

# If still fails, try:
npm cache clean --force
npm install
```

### "Claude CLI not found error"

```bash
# Check if Claude CLI is in PATH
which claude

# If not found, try:
# 1. Reinstall Claude CLI from https://claude.com/claude-code
# 2. Or add to PATH:
export PATH="/opt/claude/bin:$PATH"
```

### "Node.js version too old"

```bash
# Check current version
node --version

# If < 18.0.0:
# 1. Update Node.js from https://nodejs.org
# 2. Or use nvm:
nvm install 18
nvm use 18
```

## Updating agent-pool

```bash
# Navigate to plugin directory
cd ~/.claude/plugins/agent-pool

# Pull latest changes
git pull origin main

# Update MCP server dependencies
cd servers/agent-pool
npm install

# Restart Claude Code
```

## Next Steps

1. **Read [USAGE.md](USAGE.md)** to learn how to use agents
2. **Create custom agents** by adding `.md` files to `/agents/`
3. **Review [ARCHITECTURE.md](ARCHITECTURE.md)** to understand how it works

[↑ Back to docs](../README.md)
