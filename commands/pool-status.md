---
description: Show the current status of the agent pool including active agents and their state.
---

# Agent Pool Status

List all agents in the pool and their current status.

Use the `mcp__agent-pool__list_agents` tool to retrieve the current pool state, then format the output as:

```
## Agent Pool Status

| Agent | Status | Last Active |
|-------|--------|-------------|
| ... | ... | ... |

Total: X agents | Active: Y | Idle: Z
```

If no agents are spawned, show: "No agents in pool. Use agent templates in /agents to spawn."
