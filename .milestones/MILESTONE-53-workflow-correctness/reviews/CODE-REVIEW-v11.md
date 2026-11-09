---
timestamp: 2026-11-09T19:04:01Z
decision: rejected
---

# M53-T07 readiness and resource lifetime review

Independent reliability inspection rejects the intermediate visible-body guard.
Pinned Storybook10.6.6 sets sb-show-main before async mount/play; completed also
precedes afterEach. The intermediate217×4 zero-violation result is not final
readiness evidence. Matching retained storyFinished status and terminal phase,
plus retained error events, must gate measurement. Suppressed play exceptions can
otherwise coexist with a success payload. Fresh full iframe navigation prevents
cross-story retained error ambiguity; intentional successful null renders remain
valid. Recheck after settle/fonts and before/after measurement.

```yaml
findings:
  - file: apps/gui/scripts/storybook-a11y.mjs
    line: 130
    severity: high
    comment: sb-show-main precedes async mount/play. Wait for matching successful storyFinished and finished current/prepared story; reject retained render/play/unhandled/missing events, including empty argument arrays. Prove delayed and suppressed play faults cannot pass.
  - file: apps/gui/scripts/mobile-overflow.mjs
    line: 127
    severity: high
    comment: Share the same completion/error contract rather than measuring a visible shell. Accept intentional absence only after actual successful completion.
  - file: apps/gui/scripts/storybook-a11y.mjs
    line: 90
    severity: medium
    comment: Cleanup must enclose browser/page acquisition too, and server close must run even if browser close fails.
```
