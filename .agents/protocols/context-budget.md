# Protocol: Context Budget

Context is the scarcest resource in the harness. These rules apply to any skill
that reads many files or dispatches sub-agents.

## Progressive disclosure

The harness is layered so that a token is spent only when it is about to be used.

| Tier | What | Loaded |
|---|---|---|
| 0 | Skill `name` + `description` frontmatter | Always, for every skill |
| 1 | `SKILL.md` body | When that skill is invoked |
| 2 | `references/*.md`, `.agents/protocols/*.md`, `scripts/*` | Only when the body says to read it |

Consequences, which the skill validator enforces:

- Tier 0 must let the agent decide *whether* the skill applies without reading tier 1.
- Tier 1 must be the complete common path. Overflow goes to tier 2, never into a
  longer body.
- Tier 2 content is **referenced, never inlined**. Copying a reference into a body
  defeats the tiering and creates a second copy that drifts.

## Delegation

- NEVER read a sub-agent definition file — the runtime loads it from `subagent_type`.
- NEVER inline a large file into a sub-agent prompt. Give it the path; it reads from disk.
- The orchestrator routes. It does not execute the work it delegated.
- Prefer frontmatter and status fields over full document bodies when checking state.

## Degradation tiers

| Usage | Behaviour |
|---|---|
| 0–30% | Full operations. |
| 30–50% | Prefer frontmatter reads; delegate aggressively. |
| 50–70% | Economise. Warn the user that the budget is getting heavy. |
| 70%+ | Checkpoint and commit immediately. No new reads unless critical. |

## Early warning signs

Quality degrades before any threshold fires. Treat these as context pressure:

- **Silent partial completion** — output claims done, implementation is incomplete.
- **Increasing vagueness** — "appropriate handling", "standard patterns" replacing specifics.
- **Skipped steps** — a protocol with eight steps reported against five.

## The lever you do not own

Every enabled MCP server injects its tool schema into **every turn**, whether or
not it is called. Five unused servers can cost more per turn than anything this
harness saves. Audit `enabledMcpjsonServers` / `disabledMcpjsonServers` in
`.claude/settings.json` before a long autonomous run.
