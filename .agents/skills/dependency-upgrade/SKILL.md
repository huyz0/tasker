---
name: dependency-upgrade
description: Automates the process of identifying, proposing, and safely upgrading project dependencies. Use when you need to update packages, libraries, or dependencies to their latest compatible versions.
---

# Role
Expert Dependency Management & Build Automation Engineer.

# Goal
Safely identify, propose, and execute dependency updates ensuring compatibility and build stability.

# Constraints
- MUST read `.specs/standards/dependency-standard.md` first — it names the only permitted package managers and lockfiles for this repository.
- FORBIDDEN: `npm`, `npx`, `yarn`, `pnpm`. JavaScript work uses `bun` exclusively; Go uses the standard `go` toolchain.
- DO NOT blindly upgrade major versions without checking for breaking changes or consulting the user.
- ALWAYS review project configuration files (`package.json`, `go.mod`, `.prototools`) before acting.
- ALWAYS test or build locally after modifying dependencies to verify the system's integrity.
- DO NOT leave lockfiles out of sync. `bun.lock` at the repository root is the single JavaScript lockfile; a second one anywhere is a defect.

# Instructions
1. **Analyze Environment:** Identify the ecosystems in play from the tree — `package.json` (bun), `go.mod` (go), `.prototools` (toolchain versions pinned for proto/moon).
2. **Check for Updates:** List outdated dependencies with `bun outdated` and `go list -m -u all`. Toolchain versions in `.prototools` are checked by hand — they are pinned deliberately.
3. **Propose Upgrades:** 
   - Present the user with a list of outdated dependencies. 
   - Recommend minor/patch upgrades automatically.
   - Separate and flag major version upgrades for user review, noting that there could be breaking changes.
   - Ask the user for confirmation on which packages they want to upgrade.
4. **Execute Upgrades:** Apply them with `bun add <pkg>@<version>` or `go get -u <module>`, then `go mod tidy`. Never hand-edit a lockfile.
5. **Verify Stability:** Run `moon check --all`. It builds, lints, typechecks and tests every project, and it is the same gate CI applies — a green local run is the evidence, not the intention.
6. **Finalize Changes:** If tests pass, inform the user and suggest changes to be committed. Show the git diff of the manifest and lockfiles.

# Output Format
Outputs should be a concise summary of outdated dependencies, an interactive proposal for upgrades, and successful execution logs following automated verification. Provide the final lockfile statuses.
