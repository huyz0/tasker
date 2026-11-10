---
timestamp: 2026-11-10T08:13:08Z
decision: rejected
---

# M56-T02 registration source review

Independent review covers Agents/index.tsx, registration race tests and serialized
preview fixtures against ADR0049 and TC001–002/009. Exact-token configuration,
verification and secret-cache cleanup remain T03, not approved as implemented.

The confirmed-account/org workspace boundary, frozen registration variables,
registration/selection/connection generations and role-form retirement correctly
partition scope and late UI intent. One connection section is outside virtualized
rows, so returned registration identity does not depend on its loaded row. Existing
scope invalidation prefixes remain compatible with account-specific reads.
Registration copy distinguishes identity creation from external execution and
roles from token scopes. No new authority or backend scope is introduced.

One source blocker remains: role fields stay editable during an in-flight create,
but its successful response unconditionally closes the same form and clears its
current values. The role-form generation only changes on close/reopen, so it
does not protect newer writing made inside the still-open pending form. This was
identified from source; this reviewer did not run an additional reproduction.

```yaml
findings:
  - severity: P2
    confidence: high
    path: apps/gui/src/features/Agents/index.tsx
    lines: "230-233,519-546"
    problem: A delayed role-create success discards newer editable values in the same open role form.
    scenario: Submit role A, edit name/prompt/capabilities before its response, then resolve A successfully; all newer writing is cleared and the form closes.
    required: Freeze role fields during pending creation consistently with registration, or protect current values with a field revision before clearing/closing.
    acceptance: A real deferred-response regression proves newer same-form writing cannot be lost; retain the separate reopened-form and later registration-role-choice cases.
```

Type/build, real browser, rendered, controlled-fault and full gates remain pending.
Reported74 focused/legacy/token cases were not independently rerun here. No
implementation file or service was changed by this review. ARCH/UX-v1 records
remain preserved.
