# Contributing to agent-pool

Thanks for your interest in contributing! Here's how you can help.

## Areas for Contribution

### 🤖 New Agent Templates

Create specialized agents for common use cases:

```bash
# Add to /agents/
vim ~/.claude/plugins/agent-pool/agents/my-new-agent.md
```

Template:
```markdown
---
name: my-agent
description: What this agent does
skills: []
expertise: []
---

# My Agent

## Identity
You are a [role]. Your expertise includes [skills].

## Conventions
| Aspect | Convention |
|--------|-----------|
| Output | Description |

## Guardrails
<always>
- Rule 1
</always>

<never>
- Rule 2
</never>
```

### 💾 Reusable Skills

Create `/skills/name/SKILL.md` with technical knowledge:

```markdown
# Skill Name

## Capabilities
- Capability 1
- Capability 2

## Best Practices
1. Practice 1
2. Practice 2
```

### 📚 Domain Expertise

Create `/expertise/name.md` with domain knowledge:

```markdown
# Domain Name

## Key Principles
- Principle 1
- Principle 2

## Guidelines
1. Guideline 1
2. Guideline 2
```

### 📖 Documentation

Improve guides in `/docs/`:
- Expand examples
- Clarify confusing sections
- Add use cases
- Fix typos

### 🐛 Bug Reports

Found a bug? Report it with:
1. Clear error message
2. Steps to reproduce
3. Expected vs actual behavior
4. Your environment (OS, Node version, Claude CLI version)

### ✨ Feature Requests

Ideas for improvements? Suggest them with:
1. What problem it solves
2. Proposed solution
3. Why it matters

## Development Setup

### 1. Fork & Clone

```bash
git clone https://github.com/sceat/agent-pool.git
cd agent-pool
```

### 2. Install Dependencies

```bash
cd servers/agent-pool
npm install
```

### 3. Create a Branch

```bash
git checkout -b feat/my-feature
# or
git checkout -b fix/my-bug
```

### 4. Make Changes

```bash
# Edit agent files, documentation, or code
vim agents/my-agent.md
vim servers/agent-pool/index.js
vim docs/USAGE.md
```

### 5. Test Locally

```bash
# Install from local path
claude plugins add /path/to/your/agent-pool

# Test in Claude Code
# Use MCP tools to verify functionality
mcp__agent-pool__warmup({ agent: "code-reviewer" })
mcp__agent-pool__invoke({ agent: "code-reviewer", task: "Test" })
```

### 6. Commit & Push

```bash
git add .
git commit -m "feat: add new security agent template"
git push origin feat/my-feature
```

### 7. Create Pull Request

Open PR on GitHub with:
- Clear title
- Description of changes
- Links to related issues
- Screenshots if applicable

## Guidelines

### Agent Files

✅ **Do:**
- Use clear, descriptive names
- Include detailed identity section
- Add conventions table
- Include guardrails (always/never)
- Test thoroughly before submitting

❌ **Don't:**
- Use generic names ("agent.md", "test.md")
- Skip the conventions section
- Create agents that duplicate existing agents
- Include personal/sensitive information

### Documentation

✅ **Do:**
- Use clear, simple language
- Include working code examples
- Add context for why something matters
- Format with proper markdown headers
- Verify all links work

❌ **Don't:**
- Assume reader knowledge
- Use jargon without explanation
- Provide pseudo-code
- Leave broken links
- Copy-paste without attribution

### Code

✅ **Do:**
- Follow existing code style
- Add comments for complex logic
- Test thoroughly
- Update related documentation
- Keep dependencies minimal

❌ **Don't:**
- Add large external dependencies
- Break backward compatibility
- Leave console.log() in code
- Modify plugin.json without reason
- Hardcode paths or constants

## Submission Checklist

Before submitting PR:

- [ ] Code follows project style
- [ ] All tests pass (if applicable)
- [ ] Documentation is updated
- [ ] Agent files are valid (valid markdown + YAML)
- [ ] Links are not broken
- [ ] No personal/sensitive information
- [ ] Commit messages are clear
- [ ] Changes are atomic (one feature per PR)

## Code of Conduct

- Be respectful and inclusive
- Give credit where due
- Help others learn
- Report abuse to maintainers
- Focus on ideas, not individuals

## Questions?

- Open an issue for discussion
- Check existing issues first
- Ask in PR comments

## Recognition

Contributors will be:
- Listed in README.md
- Credited in commit history
- Recognized in release notes

Thanks for making agent-pool better! 🎉

[↑ Back to README](README.md)
