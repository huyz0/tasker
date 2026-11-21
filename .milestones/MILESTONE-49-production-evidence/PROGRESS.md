# M49 progress

## M49-T06 — Restore the security-patched Go runtime

- **Status**: in-progress
- **Date**: 2026-11-21
- **Changed**: Synchronize the CLI module minimum and proto runtime pin with the fixed Go1.26 security patch; update current toolchain documentation.
- **Verified**: Main9be092b post-publication CI44885312900 fails its actual Go audit on GO-2026-6859 (job136789215298, exit3), found in1.26.10 and fixed in1.26.11. All other nine post-main jobs pass. The official golang/vulndb advisory confirms that fix; it appeared after the earlier PR verification. No advisory suppression is proposed.
- **Notes**: Dependency/security standards and TDD apply. Pure version configuration and static documentation have no product behavior to drive with new tests; the unchanged real vulnerability audit provides the observed failure. Workspace startup is still pending, so prepare this isolated draft through the connected Git provider, preserving all local M58-T04 edits. This journal is written before the source pin change. Do not call the task complete until the audit, CLI checks, repository checks and final publication gates actually pass.
- **Next**: Update both pins and current docs, run hosted candidate CI while startup continues, then reconcile the local isolated checkout, run required checks and complete/publish the task. Resume M58-T04 afterwards; original M49-T01–T05 remain pending.
