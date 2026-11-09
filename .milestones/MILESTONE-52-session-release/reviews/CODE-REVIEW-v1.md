---
timestamp: 2026-11-09T01:34:00Z
decision: approved
---

# Release configuration and patch review — M52

## Correctness

Both integration jobs now fetch full history, matching the existing main CI setup rather than failing before tests on an absent main revision. The manual UI audit is an executable entry in the root workspace; its directory participates in the knip cache key. An uncached run demonstrated the original unused-file failure and now passes. These are static configuration changes, supported by actual CI failure evidence rather than tests that repeat configuration constants.

## Coverage

The dependency audit drops from twelve high/critical findings to zero under the unchanged gate with no accepted exceptions. Frozen installation succeeds. All 35 local gates pass in a forced run with no cached tasks, including 1338 GUI tests and their coverage thresholds. PR #1 records the remote workflows; M52 records local readiness; final remote execution and main publication remain gated and tracked in that PR. The previous remote candidate already passed backend, CLI, standalone and the complete Playwright suite.

## Architecture

The lockfile refresh targets Storybook, Vite and Zod plus their patch resolution. Exact root constraints for markdown-it 15.0.3, undici 7.30.1, Vite 8.3.6 and Zod 4.6.7 remove vulnerable nested duplicates without adding product dependencies or changing existing version ranges. Other broad trial upgrades were discarded before the final forced validation. The installed graph uses Storybook 10.6.6, Vite 8.3.6, Zod 4.6.7, the existing React 19.3.0 and Vitest 4.1.11. No API or runtime activation changes.

## Security

Neither the scanner threshold nor the empty accepted-advisory list changes. Integrity-locked versions and existing package dependencies remain the supply boundary. Constraints should be reviewed during future dependency refreshes, rather than preserving obsolete patches indefinitely. No credentials, production data or unfinished relay activation is included. The newly unblocked Go scanner also found ten reachable standard-library vulnerabilities; raising the matching module/proto pins to 1.26.10 eliminates those findings. Seven forced CLI tasks and the 94.7% coverage gate pass on that toolchain; no Go module dependency changes.

```yaml
findings: []
```
