---
timestamp: 2026-11-09T14:25:20Z
decision: approved
---

# M53-T02 authorized navigation implementation

Independent human-workflow, product, agent-contract and reliability lenses
approve the corrected implementation. The source retains ADR-0047 boundaries:
existing resource authorization yields optional owner metadata; no project/folder
scan or extra project-read permission is required. A single bounded artifact
join and narrowed shared authorization lookup exclude artifact content.

Explicit selection closes incompatible detail in its original navigation;
normalization replaces the entity entry, preserving Back/Forward and existing
origin parameters. URL/store convergence gates resource content and actions.
Labels are bound to owner IDs and use honest fallbacks outside the loaded page.
Project/organization/team Memory resolves before list guards; organization/team
is projectless, and team detail has no unsupported browser or Record action.

Known access failures invalidate earlier acceptance until a fresh success.
Transient failures retain the editor with a visible retry. Composite retries
recover bounded legacy dependencies; unsupported metadata fails honestly. Late
responses cannot move a newer route. CODE-REVIEW-v1 findings are resolved.

Verification observed on the restored candidate:

- All35 local checks pass (14 cached); GUI1402/95.24% branches, backend2180/
  zero failures/47 gated skips, backend95.80% functions/96.69% lines and CLI93.8%.
- All64 focused canonical/switcher cases and the36 affected routing/crumb/history
  tests pass. Removed normalization, silent background failures and missing
  fallback retries fail their observable regressions.
- Real SQLite/MySQL metadata authorization/body bounds pass; a deliberately
  restored SELECT * fails both dialects, and restored MySQL passes8 assertions.
- Preserved pre-M53 CLI/generated Go clients read actual HTTP JSON/protobuf
  responses; binary responses contain the expected unknown owner fields.
- Five real RPC/SQL browser journeys pass search/direct links, Back/Forward and
  reload, with20 desktop/mobile light/dark captures and no document overflow.
- Twenty-five rendered stories pass100 settled theme/width axe checks with zero
  violations, including portal content, and all25 pass the375px overflow check.

The initial root-directory preview build is not evidence. The final build ran
from apps/gui with its Vite/Tailwind configuration. Theme transitions are disabled
for settled-state contrast measurement, matching screenshot semantics; actual
application captures exercise both palettes. Full remote CI is still required
before the completed M53 branch can merge. T03–T07 remain pending.

```yaml
findings: []
```
