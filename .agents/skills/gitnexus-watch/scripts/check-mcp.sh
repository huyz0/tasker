#!/usr/bin/env bash

MCP_CONFIG="$HOME/.gemini/antigravity/mcp_config.json"

if [ ! -f "$MCP_CONFIG" ]; then
    echo "Global Antigravity MCP config not found at $MCP_CONFIG"
    exit 1
fi

if grep -q '"gitnexus"' "$MCP_CONFIG"; then
    echo "GitNexus MCP server is correctly pre-configured in Antigravity global config."
    exit 0
else
    echo "GitNexus MCP server not found in global Antigravity config ($MCP_CONFIG). Please configure it globally."
    exit 1
fi
