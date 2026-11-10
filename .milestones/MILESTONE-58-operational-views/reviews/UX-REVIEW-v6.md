---
timestamp: 2026-11-10T20:06:16Z
decision: rejected
---

# M58-T02 named saved-view interaction static review

Independent review covers the proposed named-view section and TC005a–d against
actual current Tasks/Reports navigation and permissions. Earlier T01 reviews
are preserved. No production/design/journal files, browser or services were
changed. No new rendered saved-view screen exists yet.

Using existing toolbar/header space and a shared dialog avoids a separate
navigation destination for configuration. Personal default and deliberate
Organization choice communicate audience without silently making a private
entry public. Save-as-new, Rename name-only and confirmed Delete have clear
effects. Fresh explicit Open in one navigation, with account/org/URL intent
guards, protects current writing; late catalog arrival cannot apply a view.
Obsolete references retain useful current context and allow authorized cleanup
instead of guessing a replacement project. Existing typography, tokens,
wrapping rows and native controls remain appropriate.

One concrete completeness gap blocks static approval. The ADR caps catalog
pages at100, default50, but the Personal/Organization dialog design does not
specify how a person reaches the rest of a large catalog. TC005c proves backend
paging only; TC006 does not require UI access beyond that first page. Define
bounded catalog paging/filtering and truthful extent/loading/error/Retry for
the visible audience sections without fetch-all or a misleading capped list.
Choose independent section pages or one clearly paged mixed result; either
must keep every permitted definition reachable and distinguish an empty page
from an empty audience. Preserve useful naming/rename input and focus through
recoverable reads. Include an executable more-than100-entry dialog scenario.

The companion architecture review asks for explicit project-context permission
and generic fallback when the current project name is not readable. The UI
must not imply that an unavailable name grants Open access; fresh Get remains
authoritative. This is a static acceptance gap, not a claimed rendered leak.

No other static flow, font or palette blocker identified. Actual pending,
duplicate, read-only, obsolete and denial states still need implementation,
rendered keyboard/mobile proof and final gates. T01 publication remains a
separate workstream.

```yaml
findings:
  - file: .milestones/MILESTONE-58-operational-views/design/UX-DESIGN.md
    line: 85
    severity: Medium
    comment: >-
      Define how the Personal/Organization catalog exposes entries beyond the
      bounded first page. The ADR defaults to50/caps100, while current UX and
      TC006 omit visible paging/filter/count and per-page recovery. Add a
      bounded reachable-all design and executable more-than100-entry UI
      scenario, preserving useful input/focus and avoiding fetch-all.
```
