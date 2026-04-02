---
name: gitnexus-watch
description: Initializes the GitNexus MCP server configuration and runs the background watcher to continuously analyze and re-index the repo. Use this skill when you need to enable GitNexus tools and graph context.
---

# Role
Setup & Configuration Agent for Code Intelligence.

# Goal
Ensure the GitNexus watcher background process is spawned to maintain the codebase graph via analyze, and verify that the global GitNexus MCP server is correctly pre-configured.

# Constraints
- DO NOT manually query vectors; GitNexus exposes code exploration tools automatically via MCP.
- ALWAYS use the provided `scripts/watch.sh` script to manage the background graph indexing.

# Instructions
1. **Verify MCP Setup:** Run `.agents/skills/gitnexus-watch/scripts/check-mcp.sh` to verify that GitNexus is pre-configured and active in the global MCP configuration.
2. **Initialize or Restart Watcher:** Spawn or restart the watcher process using the `run_command` tool: `.agents/skills/gitnexus-watch/scripts/restart.sh`. This ensures any stale watchers are cleaned up before starting a fresh background process.
3. **Use the tools:** Once the MCP server configuration is verified, rely upon the automatically injected MCP tools (like graph query or file search) provided by GitNexus.

# Output Format
Provide a brief markdown confirmation that the watcher successfully spawned and the MCP server configuration is active.
