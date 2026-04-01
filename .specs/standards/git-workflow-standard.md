# Git & Workflow Standards

## 1. Branching Strategy

- **Trunk-Based Development**: Merge feature branches rapidly via PRs.
- **Branch Naming**:
  - `feature/{issue-ID}-{desc}`
  - `fix/{issue-ID}-{desc}`
  - `chore/{desc}`
- **No Direct Pushes**: Direct pushes to `main` are universally blocked.

## 2. Conventional Commits

- **Protocol**: Commits MUST follow `type[optional scope]: description`.
- **Valid Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`.
- **Breaking Changes**: Add `BREAKING CHANGE:` to trigger MAJOR SemVer bumps.

## 3. Pull Request Requirements

- **Atomic PRs**: One issue per PR. Sprawling changes must be rejected.
- **Templates**: Ensure `.github/pull_request_template.md` is populated.
  Includes context, testing methodology, and quality sign-off.
- **CI Blocking**: Merging is strictly blocked until unit/integration/E2E
  pipelines and linters pass. Bypassing CI is forbidden.

## 4. Merging

- **Squash and Merge**: Prefer "Squash and Merge" for PRs into `main` for a
  linear commit history.
- **Syncing Branches**: Authors must cleanly rebase against `main` before
  requesting peer review.

## 5. Pre-Commit Verification

- **Local Validation**: Execute `moon check --all` to run cached linting,
  testing, formatting, and building pipelines concurrently across the monorepo.
- **Action**: Never commit logic that fails local CI. Resolve errors before
  staging.
