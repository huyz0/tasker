# Progress — M52

## M52-T01 — Release configuration

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Full-history integration checkouts, a root-workspace executable entry for the manual audit and milestone-script cache inputs.
- **Verified**: Both GitHub integration jobs failed on missing main revision before the configuration change; local uncached knip reproduced the unused audit file, then passes with its declared entry. All 35 local gates pass (33 cached).
- **Notes**: Local cached knip missed the new milestone script because its path was absent from task inputs. Keep the gate enabled and declare the executable entry.
- **Next**: M52-T02: patch vulnerable dependencies and verify remote release checks.

## M52-T02 — Patched dependency graph and release checks

- **Status**: in-progress
- **Date**: 2026-11-09
- **Changed**: Targeted refresh of Storybook, Vite, Zod, markdown-it and undici within existing ranges.
- **Verified**: The original GitHub audit reports twelve high/critical findings. The patched graph passes the unchanged high/critical gate with zero exceptions; frozen install passes. All 35 local gates pass with --force (no cached tasks), including 1338 GUI tests. Remote validation is pending on the pushed candidate.
- **Notes**: Bun 1.3.11 update with dry-run plus lockfile-only unexpectedly wrote a trial lockfile; it was saved outside the repository and restored before T01. Install and verify the reviewed patch resolution here. No new dependency, advisory exception or disabled gate is intended.
- **Next**: Observe both GitHub workflows for the patched candidate, then record release closure and merge after final checks.
