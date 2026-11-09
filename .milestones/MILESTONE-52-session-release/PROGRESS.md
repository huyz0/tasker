# Progress — M52

## M52-T01 — Release configuration

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Full-history integration checkouts, a root-workspace executable entry for the manual audit and milestone-script cache inputs.
- **Verified**: Both GitHub integration jobs failed on missing main revision before the configuration change; local uncached knip reproduced the unused audit file, then passes with its declared entry. All 35 local gates pass (33 cached).
- **Notes**: Local cached knip missed the new milestone script because its path was absent from task inputs. Keep the gate enabled and declare the executable entry.
- **Next**: M52-T02: patch vulnerable dependencies and verify remote release checks.

## M52-T02 — Patched dependency graph and release checks

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Targeted refresh of Storybook, Vite, Zod, markdown-it and undici within existing ranges.
- **Verified**: The original GitHub audit reports twelve high/critical findings. The patched graph passes the unchanged high/critical gate with zero exceptions; frozen install passes. All 35 local gates pass with --force (no cached tasks), including 1338 GUI tests. Remote validation is pending on the pushed candidate.
- **Notes**: Bun 1.3.11 update with dry-run plus lockfile-only unexpectedly wrote a trial lockfile; it was saved outside the repository and restored before T01. Install and verify the reviewed patch resolution here. No new dependency, advisory exception or disabled gate is intended.
- **Next**: Observe both GitHub workflows for the patched candidate, then record release closure and merge after final checks.

### M52-T02 — Go audit follow-up

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Planned Go module/toolchain patch to 1.26.10 after the JavaScript audit unblocked the Go scanner.
- **Verified**: GitHub govulncheck found ten reachable standard-library vulnerabilities on Go 1.26.6; Go 1.26.10 now reports No vulnerabilities found. All seven forced CLI tasks pass, coverage is 94.7%, and all 35 local gates pass. Both real integration jobs and workspace checks pass remotely.
- **Notes**: Keep the scanner enabled; update the standard library through the toolchain, without adding a production dependency.
- **Next**: Run the CLI checks and govulncheck on the patched toolchain, then refresh GitHub validation.

### Release candidate handoff

- **Date**: 2026-11-09
- **Verified**: JavaScript high/critical audit passes with no exceptions; Go 1.26.10 govulncheck reports No vulnerabilities found; 35 forced workspace gates and seven forced CLI tasks pass (CLI coverage 94.7%, GUI 1338 tests). Both real integration jobs and workspace checks passed remotely after the configuration repair. Full remote publication validation remains in PR #1.
- **Scope clarification**: M52 records reproducible local candidate readiness and remote workflow setup. Remote execution/merge is an external release action, tracked at [PR #1](https://github.com/huyz0/tasker/pull/1); the latest PR workflows must pass before main publication. This avoids making a commit claim success for its own future CI run and does not relax the merge gate.
- **Next**: Observe final GitHub checks and merge PR #1 to main after success.
