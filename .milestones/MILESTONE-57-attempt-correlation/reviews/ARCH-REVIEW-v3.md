---
timestamp: 2026-11-10T12:16:27Z
decision: approved
---

# M57-T01 current-page freshness and source-write amendment

Independent re-review approves the amended ADR0043/UX/TC009–010 policies.
Current UnassignTask and retention closure are correctly treated as lacking a
task event. A30-second refresh of only the currently rendered bounded history
page supplies the missing reconciliation path while preserving bounded transfer.
Older/Newer navigation renders one page; collapse, hidden document, unmount,
scope change and known access loss stop timers/requests. Existing task events and
explicit refresh still follow the same authority lifetime. TC010 explicitly
tests remote no-event closure and lifecycle cleanup.

Human Add link preserves omitted association and cannot inherit write ownership
from a reader-selected agent receipt. Returned association, including a duplicate
pair's existing different receipt, determines success wording. The design does
not relabel historical provenance or grant a new permission. The owner-purge
atomic closure/snapshot correction approved in ARCH-v2 remains intact.

No remaining static architecture blocker was identified. Runtime implementation,
both-dialect/race/wire/bounded-read and browser/final gates remain future work.
Only review records were written; earlier versions remain preserved.

```yaml
findings: []
```
