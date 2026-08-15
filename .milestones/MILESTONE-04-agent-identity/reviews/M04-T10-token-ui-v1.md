---
task: M04-T10
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M04-T10 Token management in the GUI

## Correctness

The verify line — an administrator issues and revokes a token from the UI — was
performed in a real browser, not inferred from unit tests:

```
panel opened: true          empty state: true
secret shown: tskr_mpc1f9U0F… (length 48)   only-once notice: true
secret dismissed: true
listed:       tskr_mpc1f9… GUI issued active   expires in 90 days  ✕
after revoke: tskr_mpc1f9… GUI issued revoked  —
revoke button gone: true    console errors: none
```

Nineteen unit tests cover the states the design note enumerates, including the
three that only exist because this screen is unusual.

```yaml
- file: apps/gui/src/features/Agents/AgentTokens.tsx
  line: 0
  severity: medium
  comment: >
    This is the only screen in the product showing something the server cannot
    show again, and every choice around the created state follows from that.
    The secret block has no auto-dismiss and no timeout — it is cleared by an
    explicit "I've saved it" — because a timer expiring while someone switches
    to their password manager destroys the only copy in existence. A test holds
    that property directly rather than trusting the absence of a setTimeout to
    stay absent.

- file: apps/gui/src/features/Agents/AgentTokens.tsx
  line: 0
  severity: medium
  comment: >
    Copy failure is handled and surfaced. navigator.clipboard is unavailable
    over plain HTTP in some browsers, and a Copy button that silently does
    nothing on the one screen where the value is unrecoverable is worse than no
    button — the user believes they have it. On failure the block says so and
    the text stays selectable (select-all). Both the success and failure paths
    are tested.
```

## Test coverage

The 95% branch gate failed at 94.67% when the panel landed with fifteen tests,
and the four branches it named were all real behaviour rather than noise: the
loading line, unchecking a scope, the in-flight submit state, and the
singular/plural in "expires in 1 day". All four are now covered and the gate
passes at 95.03%.

The in-flight one is worth keeping for its own sake: double-submitting issues
two credentials, and the second one's plaintext replaces the first on screen
before anyone has copied it.

```yaml
- file: apps/gui/src/features/Agents/AgentTokens.test.tsx
  line: 0
  severity: low
  comment: >
    Written first against @testing-library/user-event, which is not installed —
    and installing it needs authorization under AGENTS.md, for a test-ergonomics
    preference. Rewritten on fireEvent, which every other suite in this
    repository already uses. Worth noting only because the reflex to reach for a
    familiar library is how a dependency arrives without a decision.
```

## Architectural drift

The task says "the agent detail view". No such view exists — Agents is a flat
list — so the panel expands under the selected row instead. Building a detail
route to hold one panel would invent navigation this milestone does not
otherwise need, and **M05 owns GUI/API parity and route structure**; whether
agents deserve a detail route is its decision, not a side effect of M04. The
divergence and its reasoning are in the design note.

Scope strings are shown verbatim (`tasks:read`), not prettified. The string
appears in the CLI, in ADR-0008, and in the error an agent receives when it
lacks one — a friendlier label here would make the UI and the error message
disagree about what the thing is called.

Nothing is pre-checked in the scope list. A default set is the set most tokens
would get, which is how a credential ends up with more authority than the person
issuing it thought about.

## Security

The panel is hidden entirely for a non-admin, gated on `isSuccess` rather than
`!isError` — the latter is true while the query is in flight, so the section
would render and then vanish, which M03-T13 established is worse than never
showing it. This is the same deliberate exception to M03-T08's "leave the
control and let the server refuse", for the same reason: an entire section that
would otherwise be a permanent error.

Hiding is presentation, not enforcement. `listAgentTokens` is admin-gated
server-side (M04-T05), and a member calling it directly is still refused.

No secret is rendered anywhere except the created-once block: the list shows
`tokenPrefix` only, and the wire message has no plaintext or hash field at all
(M04-T05), so there is nothing for this component to leak by accident.

## Verdict

**Approved.** Two mediums, both being the copy-once handling that this screen
exists to get right, and one low (the dependency reflex, caught before it landed).
