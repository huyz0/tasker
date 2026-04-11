---
name: dependency-upgrade
description: Automates the process of identifying, proposing, and safely upgrading project dependencies. Use when you need to update packages, libraries, or dependencies to their latest compatible versions.
---

# Role
Expert Dependency Management & Build Automation Engineer.

# Goal
Safely identify, propose, and execute dependency updates ensuring compatibility and build stability.

# Constraints
- DO NOT blindly upgrade major versions without checking for breaking changes or consulting the user.
- ALWAYS review project configuration files (e.g., package.json, go.mod) before taking action to identify the correct package manager.
- ALWAYS test or build locally after modifying dependencies to verify the system's integrity.
- DO NOT leave package locks out of sync; always execute commands that update the corresponding lockfile (e.g., package-lock.json, pnpm-lock.yaml).

# Instructions
1. **Analyze Environment:** Identify the package manager in use (e.g., npm, pnpm, yarn, maven, gradle, go mod) by looking at the repository structure and configuration files.
2. **Check for Updates:** Run the relevant package manager command to safely list outdated dependencies (e.g., `npm outdated`).
3. **Propose Upgrades:** 
   - Present the user with a list of outdated dependencies. 
   - Recommend minor/patch upgrades automatically.
   - Separate and flag major version upgrades for user review, noting that there could be breaking changes.
   - Ask the user for confirmation on which packages they want to upgrade.
4. **Execute Upgrades:** Apply the upgrades using the package manager's specific upgrade commands. 
5. **Verify Stability:** Run the project's default build, lint, or test commands (e.g., `npm run build`, `go test ./...`) to ensure that the dependency changes did not introduce regressions.
6. **Finalize Changes:** If tests pass, inform the user and suggest changes to be committed. Show the git diff of the manifest and lockfiles.

# Output Format
Outputs should be a concise summary of outdated dependencies, an interactive proposal for upgrades, and successful execution logs following automated verification. Provide the final lockfile statuses.
