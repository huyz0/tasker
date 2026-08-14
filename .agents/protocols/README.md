# Protocols

Shared instruction fragments. A protocol is a rule set that more than one skill
needs verbatim; putting it here means it is written once and cannot drift.

Protocols are **tier 2**: no host loads them automatically. A skill pulls one in
by naming it — `Follow @.agents/protocols/work-ledger.md` — and the agent reads
it only when that skill actually runs.

| File | Read it when |
|---|---|
| `autonomy.md` | The skill has interactive and autonomous modes. |
| `context-budget.md` | The skill reads many files or spawns sub-agents. |
| `response-style.md` | Always — it governs how any agent writes to the user. |
| `skill-authoring.md` | Creating, auditing or editing a skill. |
| `verification-gates.md` | The skill has a checkpoint that can fail. |
| `work-ledger.md` | The skill reads or writes an SDD artifact (epic, plan, review, milestone). |

Do not copy a protocol's text into a skill. Reference it.
