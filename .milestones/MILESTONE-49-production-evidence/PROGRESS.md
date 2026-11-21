# M49 progress

## M49-T06 — Restore the security-patched Go runtime

- **Status**: done
- **Date**: 2026-11-21
- **Changed**: Synchronize the CLI module minimum and proto runtime pin with the fixed Go1.26 security patch; update current toolchain documentation.
- **Verified**: Main9be092b post-publication CI44885312900 fails its actual Go audit on GO-2026-6859 (job136789215298, exit3), found in1.26.10 and fixed in1.26.11. All other nine post-main jobs pass. The official golang/vulndb advisory confirms that fix; it appeared after the earlier PR verification. No advisory suppression is proposed.
- **Notes**: Dependency/security standards and TDD apply. Pure version configuration and static documentation have no product behavior to drive with new tests; the unchanged real vulnerability audit provides the observed failure. Workspace startup is still pending, so prepare this isolated draft through the connected Git provider, preserving all local M58-T04 edits. This journal is written before the source pin change. Do not call the task complete until the audit, CLI checks, repository checks and final publication gates actually pass.
- **Next**: Update both pins and current docs, run hosted candidate CI while startup continues, then reconcile the local isolated checkout, run required checks and complete/publish the task. Resume M58-T04 afterwards; original M49-T01–T05 remain pending.

### Candidate verification while Cloud startup remains pending

- The connected provider preserves the in-progress checkpoint and draft PR #15,
  initially at94dea617. The Go module minimum and proto pin both use1.26.11;
  the current toolchain rows and security-patch paragraph agree. No production
  module dependency, advisory exception or product behavior is added.
- Extend the existing CLI job to execute the exact `moon check --all` gate for
  runtime or CI configuration changes. The base SHA is read from an environment
  value, validated and checked before diffing; an unavailable/invalid base runs
  the full gate rather than skipping it. Unchanged application-only PRs retain
  their existing independent checks. This makes the actual required repository
  command verifiable on the hosted runner while the local Cloud executor is
  unavailable; it is not an inferred local pass. Keep the task unchecked until
  the actual new candidate checks and source review complete.

### T06 verified checkpoint

- Candidate debb00ba passes the unchanged Go vulnerability audit and all seven
  CLI checks. The new conditional hosted gate executes `moon check --all`
  and passes all 36 checks (7 cached) in 4m42.071s: 1,764 GUI cases, 2,421
  backend cases with zero failures, 1,158 contract cases and production/
  standalone builds. Job 136796806687 retains the actual command/results.
  This is a hosted execution; the Cloud workspace is still starting and no
  local execution is claimed.
- Independent CODE-REVIEW-v1 approves the reviewed source. Persist its limits
  alongside this closure. The patch adds no production module, exception or
  data migration; the existing audit now passes on the fixed standard library.
- Check T06 only. M49 is 1/6 and its original production recovery/load tasks
  remain pending. The program is 399 tasks, 389 done, one dropped, nine pending.
  Final-head hosted CI and publication still gate the merge of PR #15.
  Resume preserved M58-T04 after publication; its dependent provider branch
  retains its own in-progress journal.
