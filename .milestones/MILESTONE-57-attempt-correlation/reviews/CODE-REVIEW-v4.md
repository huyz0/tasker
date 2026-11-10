---
timestamp: 2026-11-10T17:19:21Z
decision: approved
---

# M57-T04 human report permissions correction

Independent correction review follows rejected CODE-v3 and preserves that
record. Reviewed current TaskNotesPanel, corresponding workbench tests,
reachability exceptions and amended ADR0043/UX/TC009; the remaining bounded
readers and authority/retry/coherence assessment in CODE-v3 still applies.
Only review records were written; no production source or services were changed
and tests were not independently rerun.

## Correctness and coverage

TaskNotesPanel is now a human read-only report surface. It has no update/delete
client calls, editing state, form or mutation controls. It retains bounded note
reads, Markdown content, author-name/ID fallback, paging/retry and concise exact
author guidance. The equal human/agent-ID tests exercise both named and missing
agentName cases, assert no Edit/Delete/editor and no mutation submission. This
correctly follows principal kind instead of attempting to infer authorship from
ID equality. The impossible human edit-success fixtures have been removed.

Parent reports123 affected cases passing and all six actual readonly/keyboard/
draft journeys passing; the retained real-readonly log records each375/768/1280
light/dark run. Source inspection and refreshed captures resolve the original
finding. Additional current-page Older/Newer transient retry, lazy/collapse,
usage-recovery and metadata-fallback tests address real reader paths rather
than restoring impossible writes. The reported cursor-removal fault fails the
navigation assertions and was restored.

## Architecture and security

No server authorization was broadened. Exact agent-author API/CLI edits remain
available to their existing clients, with accurate GUI reachability exceptions.
The stale listUsageRecords exception was removed because the GUI now implements
that reader. The correction matches the recorded ADR/UX/test-plan amendment and
introduces no new scope, API, migration or dependency. The existing source
permissions, denial epochs, explicit retry fences and canonical task reread
after visible history success remain consistent with the prior review.

No blocking source finding remains. This approves the corrected T04 source and
reviewed behavior only. Full2 reportedly passed1646 tests but failed the95%
branch gate at94.5%; added meaningful cases do not by themselves prove that
gate recovered. Final Storybook build6/matrices, full3 and applicable final-head
checks remain pending. This is not task or milestone completion.

```yaml
findings: []
```
