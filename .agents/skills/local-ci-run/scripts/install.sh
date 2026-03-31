#!/bin/bash
# Description: Installs gh cli and act plugin if missing
set -e

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "This install script currently only supports Linux."
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo "Installing gh cli..."
    if command -v apt-get &> /dev/null; then
        (type -p wget >/dev/null || (sudo apt-get update && sudo apt-get install wget -y)) \
        && sudo mkdir -p -m 755 /etc/apt/keyrings \
        && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
        && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
        && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
        && sudo apt-get update \
        && sudo apt-get install gh -y
    else
        echo "Unsupported package manager. Please install gh manually."
        exit 1
    fi
else
    echo "gh cli is already installed."
fi

if ! gh act --help &> /dev/null; then
    echo "Installing act plugin..."
    gh extension install nektos/gh-act
else
    echo "act plugin is already installed."
fi

echo "Installation complete."
