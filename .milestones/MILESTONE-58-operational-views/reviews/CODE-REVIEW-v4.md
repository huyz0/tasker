---
timestamp: 2026-11-10T19:35:29Z
decision: approved
---

# M58-T01 canonical unchanged-view correction

Independent follow-up preserves rejected CODE-v3 and reviews the current hook
and task/report history regressions. Only versioned review files were written;
no production source, services or competing test suites were changed or run.

The hook now canonicalizes both the parsed current supported state and requested
next state, then compares sorted copies. For valid input, explicit defaults and
key ordering no longer produce navigation. Scope, unrelated parameters and hash
are preserved by the existing narrow writer. Invalid current fields bypass the
no-op return, so Reset can still remove malformed/duplicate settings. The
correction does not change authorization, query fields or routing boundaries.

Regressions assert Back leaves the view after an unchanged control on bare URLs,
noncanonical key order, view=board, combined ready=0/priority=/sort= defaults and
Reports days=30 with/without org. These are actual navigation assertions rather
than writer-string snapshots. Parent reports four failures before correction,
then eight writer plus14 Reports cases passing, including malformed recovery.
No remaining source blocker identified.

Earlier bounded source/tenancy and repaired table assessments remain valid.
Reported final build5 affected37-story148 accessibility/74 overflow checks pass;
the native fast-type/Tab/Space browser case passed before this narrow equality
change and its rerun remains pending. The held-delete browser proof is not
accepted as a successful mutation scenario: the earlier harness captured OPTIONS
and the stronger POST run currently observes403 despite direct authorized RPC200.
The implementation owner is investigating transport identity before claiming
that case. Existing navigation results do not establish held-mutation success.

This approves the corrected source only. Remaining mutation/browser proof,
final repeats, full/closure and actual final-head publication gates are separate
and still require their real outcomes. Prior rejected records remain intact.

```yaml
findings: []
```
