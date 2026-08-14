# Protocol: Autonomy Modes

Every skill that can run unattended declares two modes. The caller picks one;
the skill never picks for itself.

## Interactive (default)

- ALWAYS use `AskUserQuestion` for every decision the skill is not entitled to make.
- Ask **one question at a time**, in sequence. Never present a wall of questions.
- MUST confirm before any irreversible step: a commit, a file move, a checked box.
- Offer concrete options (`approve` / `edit: <change>`), not open prose prompts.

## Autonomous (`-auto`)

- NEVER ask a question. If a decision is genuinely required, choose the option
  that is easiest to reverse, and record the choice and its rationale in the
  skill's journal or report.
- MUST NOT treat "no user objection" as approval for something the interactive
  mode would have blocked on — apply the same quality bar without the prompt.
- MUST stop rather than fake progress. Marking work complete that was not
  actually done and verified is a failure state, not a shortcut.

## Stopping rules (both modes)

- A checkbox is checked only after its verification step has actually run and passed.
- After **two consecutive verification failures on the same unit of work**, stop:
  record the failing output verbatim, mark the state blocked, and report what
  decision or access is needed. Do not move on to a different unit.
- Never end a session with uncommitted work. See `@.agents/protocols/verification-gates.md`.
