---
timestamp: 2026-11-09T10:34:02Z
decision: approved
---

# M47-T03 corrected occurrence context and scope fixtures

Independent reliability review approves the corrected context wrappers and scope
fixture. No new blockers across correctness, coverage, architecture or security.
Final restored full checks pass all 35 tasks (24 cached); backend2165
pass / zero failures, functions95.80% / lines96.69%. The final mixed manual/scheduled
race also passes.

Each admission uses its actual organization, project and initiating principal.
Lease/recovery actions derive context from their persisted occurrence identity;
work still revalidates authority before entering its fresh execution context.
Malformed persisted actors cannot inherit a foreign parent actor or gain rights.
The stronger M46 capture regression verifies routing and attribution for all new
event stages. Its isolated red remains recorded; all 73 focused cases pass.

The scope-sweep fixture now persists its authenticated credential and synchronizes
scopes with its principal. Its original PermissionDenied expectations remain.
There is no production revalidation bypass. Both database process proofs pass
54 assertions after the context correction; typecheck passes. Four representative
faults and the actual orphan-after-SIGKILL fault are retained in the evidence.

Populated MySQL upgrades, SIGSTOP/full-workflow process coverage and observability
remain explicitly T04 work.

```yaml
findings: []
```
