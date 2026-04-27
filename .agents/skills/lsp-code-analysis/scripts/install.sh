#!/bin/bash
# Installs the lsp-code-analysis skill to .agents/skills/lsp-code-analysis/
# in the current working directory.

set -e

SKILL_DIR=".agents/skills/lsp-code-analysis"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$(cd "$SCRIPT_DIR/.." && pwd)/SKILL.md"

echo "Installing lsp-code-analysis skill..."

mkdir -p "$SKILL_DIR"
cp "$SKILL_SRC" "$SKILL_DIR/SKILL.md"

echo "✓ Installed to $SKILL_DIR/SKILL.md"

# Check if lsp binary is available
if ! command -v lsp &>/dev/null; then
  echo ""
  echo "⚠  'lsp' binary not found. Install it with:"
  echo "   npm install -g @huyz0/lsp-cli"
fi

echo ""
echo "Next steps:"
echo "  lsp install list          # see available language servers"
echo "  lsp install typescript    # install TypeScript/JS server"
echo "  lsp outline <file>        # start exploring"
