# M27 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M27-T01 — Save the design record (spec, ADR-0024)

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `.specs/specs/2026-08-23-2100-documentation-truth/` (shape.md,
  plan.md, standards.md), `.specs/adr/ADR-0024-*.md`, this MILESTONE.md,
  STATE.md ledger + roadmap.
- **Verified**: files exist; `moon run tasker:docs-lint` clean. Every false
  statement enumerated in `shape.md` was re-checked against the code in this
  session before being written down, not carried over from the review that
  found them.
- **Notes**: the design turns on one observation — of the five product/design
  documents, `tech-stack.md` is the only clean one and the only gated one.
  ADR-0024 records why the gate detects *milestone ownership* rather than
  attempting prose truth: a checker cannot know whether "the CLI has no TUI"
  is still true, but it can know that a document says a closed milestone owns
  unbuilt work, and that described nearly every stale claim found. The ADR is
  equally explicit about what stays uncaught (a false claim citing no
  milestone — `NAVIGATION.md`'s "no breadcrumb component" is exactly that
  shape and only a human reading found it), so a green gate is not mistaken
  for a true document.
  Documents are corrected before the gate lands, so no commit leaves
  `moon check --all` red; T05's demonstration against the pre-M27 text from
  git history is what supplies the red-phase evidence instead.
- **Next**: M27-T02 (correct README.md).
