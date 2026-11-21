---
timestamp: 2026-11-21
decision: approved
reviewed_head: 2e8b14b884fcaf62bc70c018883015cb4087b1e5
---

# M49-T05 exact runtime and release-gate review

Review by the implementation agent against source, official release evidence
and actual hosted checks; no independent-agent or local-execution claim.

## Correctness and coverage

The Node action reads an exact semver from .prototools, selects it and compares
the actual executable version. Official Node 24.22.3 is the maintained
2026-11-11 security release: <https://github.com/nodejs/node/releases/tag/v24.22.3>.
CI, integration, measurement and packaging use that action. Packaging reuses
the exact Bun/Moon actions; Go reads its exact module minimum. The full-gate
predicate includes every workflow path.

All 18 non-skipped source checks pass. Exact moon check --all reports 37
completed (7 cached), 7m23.324s; the toolchain/log artifact is retained.
Backend 2430/GUI 1764/contract 1158, both native MySQL versions with real
recovery/faults, actual browser (103 pass/three existing skips), 388-story
rendered accessibility/mobile checks and standalone smoke pass.
All three packaging targets compile; Linux executes its real binary smoke.
Windows/macOS native execution is not claimed.

The two observed MD034 findings are fixed by valid autolinks, with the
unchanged Markdown gate green. This configuration/static-content task uses
the TDD exception; real setup/version/build/artifact checks supply evidence.

## Architecture and security

No runtime family or package dependency is added. The existing 24 line moves
to its researched security release without suppressing audits. PR packaging
has read-only content permission; write permission is scoped to tag-guarded
publication jobs, which are skipped in these runs. No release/deployment
is performed.

Reports, browser output, tested standalone binaries and aggregate measurements
are retained with bounded artifact lifetimes. Credentials/bodies/private SQL
are excluded. Main CI/integration/capacity concurrency groups are unique by
SHA, while superseded PR work can cancel. The final combined-head gate covers
the atomic task assembly, retained evidence and narrow workflow-scope cleanup.

```yaml
findings: []
```
