# Troubleshooting Guide

## Common Issues & Solutions

### ❌ "Agent not found" error

**Error message:**
```
Error: Agent "my-agent" not found
```

**Causes:**
1. Agent file doesn't exist
2. Filename doesn't match agent name
3. File is in wrong directory

**Solutions:**

```bash
# Step 1: Check agents directory
ls ~/.claude/plugins/agent-pool/agents/

# Step 2: Verify file exists
# Should show: my-agent.md

# Step 3: Check filename matches agent name
# In my-agent.md, verify frontmatter:
cat ~/.claude/plugins/agent-pool/agents/my-agent.md
# Should have: name: my-agent

# Step 4: Restart Claude Code and try again
```

---

### ❌ Task times out (waits 5+ minutes then fails)

**Error message:**
```
Error: Task timeout after 300000ms
```

**Causes:**
1. Agent process frozen or hung
2. Claude CLI crashed
3. Task is legitimately slow
4. Process killed by system

**Solutions:**

**Option 1: Reset the agent**
```javascript
// Kills stuck agent, respawns on next invoke
mcp__agent-pool__reset({ agent: "code-reviewer" })
```

**Option 2: Increase timeout**
```bash
# Set to 10 minutes (600000ms)
export TASK_TIMEOUT_MS=600000

# Verify it's set
echo $TASK_TIMEOUT_MS
# Output: 600000
```

**Option 3: Check agent logs**
```bash
# Look for error messages in Claude Code console
# Or check system process list:
ps aux | grep claude

# If you see multiple "claude" processes, one may be hung
# Kill it manually:
kill -9 <pid>
```

**Option 4: Check file size**
```bash
# If agent file is huge, task may be slow
wc -l ~/.claude/plugins/agent-pool/agents/code-reviewer.md

# If > 5000 lines, consider splitting into skills/expertise
```

---

### ❌ Agent process crashed (exit code 1)

**Error message (in server logs):**
```
[code-reviewer:exit] code=1 signal=null
```

**Causes:**
1. Agent file has invalid markdown/YAML
2. Claude CLI version too old
3. System out of memory
4. Missing permissions

**Solutions:**

**Step 1: Validate agent file**
```bash
# Check file syntax
cat ~/.claude/plugins/agent-pool/agents/code-reviewer.md

# Look for:
# - Invalid YAML frontmatter (--- at start/end)
# - Unclosed code blocks
# - Invalid markdown headers
```

**Step 2: Check agent file is readable**
```bash
# Verify permissions
ls -la ~/.claude/plugins/agent-pool/agents/code-reviewer.md

# Should show: -rw-r--r--

# If not, fix:
chmod 644 ~/.claude/plugins/agent-pool/agents/code-reviewer.md
```

**Step 3: Upgrade Claude CLI**
```bash
# Check version
claude --version

# Should be: 2.0.0+

# If old, upgrade:
# Visit https://claude.com/claude-code
```

**Step 4: Check system resources**
```bash
# Check available memory
free -h  # Linux
vm_stat  # macOS

# If memory low (<500MB free), close other apps
```

**Step 5: Respawn agent**
```javascript
// Reset and respawn
mcp__agent-pool__reset({ agent: "code-reviewer" })

// Then try again
mcp__agent-pool__warmup({ agent: "code-reviewer" })
```

---

### ❌ Tokens not being saved (same cost as native Task)

**Symptom:**
```
Expected: 2,500 tokens for 5 tasks
Actual: 9,000 tokens (like native Task)
```

**Causes:**
1. Agent is being respawned each time (process not persisting)
2. Context reset isn't working
3. Different system prompts (not using cache)

**Debugging:**

```javascript
// Check 1: Verify process is persistent
const agents1 = await mcp__agent-pool__list()
console.log("Before task:", agents1)
// Output: [{ name: "code-reviewer", pid: 12345 }]

// Send a task
await mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Test task 1"
})

// Check 2: Verify same PID
const agents2 = await mcp__agent-pool__list()
console.log("After task:", agents2)
// Should show SAME pid: 12345

// If PID changes → process is being respawned (bug!)
```

**Solutions:**

**If process is persisting but tokens still high:**
- Context reset may not be working
- Check Claude CLI version supports `/clear` command
- Check server logs for errors

```bash
# View MCP server logs
# In Claude Code Settings > Debug > Show Logs
```

---

### ❌ Plugin not loading in Claude Code

**Symptom:**
- Plugins list doesn't show "agent-pool"
- Can't use mcp__agent-pool__ tools

**Causes:**
1. Plugin file missing or invalid
2. Plugin not registered
3. Incorrect path

**Solutions:**

**Step 1: Verify plugin file exists**
```bash
ls ~/.claude/plugins/agent-pool/plugin.json

# If not found:
# Re-clone: git clone https://github.com/sceat/agent-pool.git ~/.claude/plugins/agent-pool
```

**Step 2: Verify plugin.json is valid**
```bash
# Check syntax (JSON must be valid)
cat ~/.claude/plugins/agent-pool/plugin.json

# Should have:
# - "name": "agent-pool"
# - "mcpServers": {...}
# - "hooks": {...}
```

**Step 3: Register plugin**
```bash
# Try adding again
claude plugins remove agent-pool
claude plugins add ~/.claude/plugins/agent-pool
```

**Step 4: Cold restart Claude Code**
```bash
# Not just reload, fully close and reopen
# ⌘Q (Mac) or Ctrl+Q (Windows/Linux) to close
# Then open Claude Code again
```

**Step 5: Check permissions**
```bash
# Ensure plugin directory is readable
chmod -R 755 ~/.claude/plugins/agent-pool
chmod 644 ~/.claude/plugins/agent-pool/plugin.json
```

---

### ❌ MCP server fails to start (port already in use)

**Error message:**
```
Error: EADDRINUSE: address already in use :::3000
```

**Causes:**
1. Another agent-pool server already running
2. Another app using the port
3. Server crashed but process still running

**Solutions:**

**Step 1: Find process using port**
```bash
# macOS/Linux
lsof -i :3000

# Windows
netstat -ano | findstr :3000
```

**Step 2: Kill the process**
```bash
# macOS/Linux (from lsof output)
kill -9 <PID>

# Windows
taskkill /PID <PID> /F
```

**Step 3: Restart Claude Code**
```bash
# Close completely, then reopen
```

---

### ❌ Cannot find "claude" command

**Error message:**
```
Error: spawn ENOENT: claude
```

**Causes:**
1. Claude CLI not installed
2. Claude CLI not in PATH
3. Wrong binary name

**Solutions:**

**Step 1: Check if Claude CLI is installed**
```bash
which claude

# If "not found", Claude CLI not installed
```

**Step 2: Install Claude CLI**
```bash
# Visit: https://claude.com/claude-code
# Follow platform-specific instructions
```

**Step 3: Verify Claude CLI is in PATH**
```bash
# Test the command
claude --version

# Should output: claude 2.0.0+

# If not found, add to PATH:
# Linux/macOS: ~/.bashrc or ~/.zshrc
export PATH="/opt/claude/bin:$PATH"

# Windows: Update Environment Variables
# Add C:\Program Files\Claude\bin to PATH
```

**Step 4: Verify installation**
```bash
# Test stream-json support
claude --help | grep stream-json

# Should show stream-json options
```

---

### ❌ npm install fails in server directory

**Error message:**
```
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /home/user/.claude/plugins/agent-pool/servers/agent-pool/node_modules
```

**Causes:**
1. Permission denied on directory
2. npm cache corrupted
3. Disk full

**Solutions:**

**Step 1: Check permissions**
```bash
ls -la ~/.claude/plugins/agent-pool/servers/agent-pool/

# Should be owned by your user
# If not: chown -R $USER ~/.claude/plugins/agent-pool
```

**Step 2: Clear npm cache**
```bash
npm cache clean --force
```

**Step 3: Try install again**
```bash
cd ~/.claude/plugins/agent-pool/servers/agent-pool
npm install
```

**Step 4: If still failing, use --force**
```bash
npm install --force
```

**Step 5: Check disk space**
```bash
# macOS/Linux
df -h

# Windows
dir C:\
```

---

### ❌ Skills/Expertise files not being loaded

**Symptom:**
- Agent frontmatter declares skills but they're not injected

**Causes:**
1. Skill file doesn't exist in `/skills/name/SKILL.md`
2. Expertise file doesn't exist in `/expertise/name.md`
3. Frontmatter syntax error

**Solutions:**

**Step 1: Check file paths**
```bash
# Skills should be in:
ls ~/.claude/plugins/agent-pool/skills/javascript/SKILL.md

# Expertise should be in:
ls ~/.claude/plugins/agent-pool/expertise/security.md
```

**Step 2: Verify frontmatter syntax**
```markdown
---
name: my-agent
skills:
  - javascript      # This is the directory name
expertise:
  - security        # This is the filename (without .md)
---
```

**Step 3: Check file permissions**
```bash
chmod 644 ~/.claude/plugins/agent-pool/skills/javascript/SKILL.md
chmod 644 ~/.claude/plugins/agent-pool/expertise/security.md
```

**Step 4: Verify content exists**
```bash
# Check file isn't empty
wc -l ~/.claude/plugins/agent-pool/skills/javascript/SKILL.md

# Should be > 0 lines
```

---

### ❌ Same task produces different results

**Symptom:**
- Asking agent same question twice = different answers
- Not using cached system prompt

**Causes:**
1. Temperature/randomness in prompt (context variables changing)
2. System prompt modified between calls
3. Not using same agent name

**Solutions:**

**Step 1: Verify agent hasn't changed**
```bash
# Check file hasn't been modified
ls -la ~/.claude/plugins/agent-pool/agents/code-reviewer.md

# Compare to git:
cd ~/.claude/plugins/agent-pool
git diff agents/code-reviewer.md
```

**Step 2: Use identical task text**
```javascript
// ❌ Different text
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/app.js for issues"
})

// Then later:
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Check src/app.js for problems"  // Different phrasing
})

// ✅ Identical text (for testing cache)
mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/app.js"
})

mcp__agent-pool__invoke({
  agent: "code-reviewer",
  task: "Review src/app.js"  // Exact same
})
```

**Step 3: Check context is reset**
```javascript
// Verify /clear is working
const agents = await mcp__agent-pool__list()

// Reset and check
await mcp__agent-pool__reset({ agent: "code-reviewer" })
const agents2 = await mcp__agent-pool__list()

// If empty → process was killed (cache lost!)
```

---

## Getting Help

If your issue isn't listed above:

1. **Check logs:**
   ```bash
   # Claude Code debug logs
   # Settings > Debug > Show Logs
   ```

2. **Check GitHub issues:**
   ```
   https://github.com/sceat/agent-pool/issues
   ```

3. **Create minimal reproduction:**
   - Exact commands/code that fails
   - Expected vs actual output
   - Environment (OS, Node version, Claude CLI version)

4. **Report the issue:**
   ```
   https://github.com/sceat/agent-pool/issues/new
   ```

Include:
- Error message (full text)
- Steps to reproduce
- System info: `uname -a`, `node --version`, `claude --version`
- MCP server logs

[↑ Back to docs](../README.md#documentation)
