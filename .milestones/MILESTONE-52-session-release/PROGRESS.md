# Progress — M52

## M52-T01 — Release configuration

- **Status**: done
- **Date**: 2026-11-09
- **Changed**: Full-history integration checkouts, a root-workspace executable entry for the manual audit and milestone-script cache inputs.
- **Verified**: Both GitHub integration jobs failed on missing main revision before the configuration change; local uncached knip reproduced the unused audit file, then passes with its declared entry. All 35 local gates pass (33 cached).
- **Notes**: Local cached knip missed the new milestone script because its path was absent from task inputs. Keep the gate enabled and declare the executable entry.
- **Next**: M52-T02: patch vulnerable dependencies and verify remote release checks.
