# Git & Workflow Standards

This document enforces a strict standardized git workflow for both human developers and AI agents, enabling automated changelogs, robust CI/CD, and transparent code reviews.

## 1. Branching Strategy
- **Trunk-Based Development Paradigm**: All development must converge rapidly. Feature branches should exist primarily to stage logic for immediate Code Review and subsequent merge.
- **Branch Naming Conventions**: 
  - `feature/{issue-ID}-{short-desc}` for new functionality.
  - `fix/{issue-ID}-{short-desc}` for bug fixes.
  - `chore/{short-desc}` for routine tasks, refactoring, or dependency updates.
- **Never push directly to `main`**: Direct pushes to the default branch are globally blocked. All code must pass through a Pull Request.

## 2. Conventional Commits
- **The Protocol**: Every single commit message MUST follow the rigid structure introduced by Conventional Commits (`type[optional scope]: description`). This allows automated semantic incrementing.
- **Valid Types**:
  - `feat`: A new feature (Correlates with MINOR release if breaking, otherwise MINOR).
  - `fix`: A bug fix (Correlates with PATCH release).
  - `docs`: Documentation only changes.
  - `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc).
  - `refactor`: A code change that neither fixes a bug nor adds a feature.
  - `perf`: A code change that improves performance.
  - `test`: Adding missing tests or correcting existing ones.
  - `build` / `ci` / `chore`: CI config or automated task updates.
- **Breaking Changes**: Any commit that contains `BREAKING CHANGE:` in its body requires a MAJOR version bump.

## 3. Pull Request Requirements
- **Atomic PRs**: Keep Pull Requests focused on solving a single problem/issue to ease the cognitive load on reviewers and to simplify rollbacks. If a PR contains sprawling changes across the entire codebase, the reviewer should reject it immediately.
- **Templates**: Utilize the repository's `.github/pull_request_template.md` to provide context, list related issue links, and outline what reviewers should look for. Every PR description MUST include:
  - **Context**: Describe the initial problem, issue number, and what this PR proposes to fix.
  - **Changes**: A clear breakdown of the changes by component layers (Frontend, Backend, CLI, Contracts/Specs).
  - **Testing Details**: How changes were validated (e.g., instructions for reproducing logic flows and running tests).
  - **Quality Checklist**: Explicit acknowledgment of adhering to lint rules, running pre-commit moon tasks (`moon check --all`), and properly forming Conventional Commit histories.
- **CI Enforcement / Status Checks**: Merging is strictly blocked until all unit test suites, integration tests, E2E checks, and linters return successfully. "Bypassing" CI because "I just changed CSS" is absolutely forbidden.

## 4. Merging
- **Squash and Merge**: Prefer "Squash and Merge" for PRs into `main`. This maintains a linear, clean commit history on the default branch where each commit represents a single, complete logical change.
- **Syncing Branches**: Before asking for review, the author is responsible for rebasing their feature branch against the most recent `main` branch to resolve conflicts cleanly in isolation.

## 5. Pre-Commit Verification
- **Local Validation**: Before creating a commit, developers and AI agents MUST verify the changes locally by running the same checks executed by the CI pipeline, powered by Moonrepo.
- **Required Checks**: 
  - Run the complete cached pipeline via `moon check --all`. This natively maps to linting, formatting, testing, and building across all polyglot projects in the monorepo concurrently.
  - Because Moon caches successful task executions locally, this will optimally execute checks strictly on projects that have explicitly changed or have cache misses, saving significant CI iteration time.
- **Action**: Never commit code that fails these local checks. Iterate on the code until the moon pipeline succeeds before staging.
