# Protocol: Verification Gates

Every checkpoint that can fail is one of four gates. Naming the gate decides the
failure behaviour, which is what stops an agent from inventing one.

| Gate | Runs | On failure | Recovery |
|---|---|---|---|
| **Pre-flight** | Before work starts | Block entry. Produce nothing. | Fix the precondition, retry. |
| **Revision** | After a producer step | Loop back with specific feedback, capped. | Producer fixes; checker re-runs. |
| **Escalation** | When revision is exhausted or the call is not the agent's to make | Pause, present options, wait. | Human decides; work resumes. |
| **Abort** | When continuing would damage or waste | Stop, preserve state, report why. | Fix root cause, resume from the last commit. |

## Choosing

Start at pre-flight. If the check happens *after* output exists, it is a revision
gate. If the revision loop cannot resolve it, escalate. If continuing is
dangerous, abort.

## Rules

- Pre-flight gates MUST be deterministic — a file-existence check, a frontmatter
  read, an exit code. Never an LLM judgement.
- Revision gates MUST carry an iteration cap. Expensive steps get fewer retries.
  Two consecutive failures on the same unit is the default cap.
- Revision gates MUST also break on **stall**: if the count of outstanding issues
  does not fall between iterations, escalate immediately rather than burn the cap.
- Escalation and abort MUST report the failing output **verbatim**, not a
  paraphrase, plus what was tried and what decision is needed.
- Abort MUST leave the repository committed and clean. Uncommitted work is
  invisible to the next session — commit it as `WIP` with a blocked journal entry.

## Anti-pattern

Structural completeness is not semantic correctness. A file existing, a box being
checked, and a command exiting `0` prove only that something ran. State what was
actually observed, and treat "the agent said it passed" as unverified.
