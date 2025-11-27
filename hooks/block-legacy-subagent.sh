#!/usr/bin/env bash
# Hook: Block legacy subagent-runner MCP calls
# Intercepts tool calls and redirects to agent-pool

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

if [[ "$tool_name" == *"subagent-runner"* ]]; then
  echo '{"decision": "block", "reason": "Use mcp__agent-pool__invoke instead of mcp__subagent-runner__spawn for token-efficient agent orchestration"}'
else
  echo '{"decision": "allow"}'
fi
