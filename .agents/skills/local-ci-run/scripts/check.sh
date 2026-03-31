#!/bin/bash
# Description: Checks if gh and act plugin are installed
# Exits 0 if both are installed, 1 otherwise.

GH_INSTALLED=true
ACT_INSTALLED=true

if ! command -v gh &> /dev/null; then
    echo "gh cli is not installed."
    GH_INSTALLED=false
fi

if ! gh act --help &> /dev/null; then
    echo "gh act plugin is not installed."
    ACT_INSTALLED=false
fi

if [ "$GH_INSTALLED" = false ] || [ "$ACT_INSTALLED" = false ]; then
    exit 1
fi

echo "Both gh cli and act plugin are installed."
exit 0
