# AI-Native Work Tracking — Landscape Review (2026-10-02)

Desk research over primary sources (official docs, changelogs, repositories)
for what tools where agents are first-class participants ship today, compared
against Tasker after M34. It is the evidence behind M35–M38.

## What the field ships

| Product | Agent-native capabilities |
|---|---|
| Linear | Agent sessions with states incl. `awaitingInput`; typed activities (thought, action, elicitation, response, error); an **Agent Plan** checklist per session, replaced whole on update; delegation keeps the human assignee; official remote MCP server. |
| GitHub | Assign issues to an agent; session logs; human approval before agent PR workflows run; **issue dependencies** (`is:blocked`, `blocked-by:`), sub-issues, issue types — also in the CLI. |
| Jira + Rovo | Agents as assignees, on workflow transitions; Rovo **MCP server** GA. |
| Asana AI Teammates | "Checkpoints": agents surface steps and take human feedback; MCP V2. |
| Plane | Official **MCP server** (stdio or HTTP); hands work to coding agents. |
| Taskmaster AI | Tasks with **dependencies, priority**, subtasks; `next_task` = highest-priority task whose dependencies are done. MCP. |
| Backlog.md | Markdown tasks in git: acceptance criteria, dependencies, MCP. |
| Beads (`bd`) | Dependency graph (blocks, parent-child, discovered-from); `bd ready` lists unblocked work; atomic claim; **priority P0–P3**; MCP. |
| Factory | Auto-starts agents from tracker **labels and priority**. |
| A2A protocol | Task state `input-required`; **push notifications by webhook** on state change. |

## Gaps in Tasker, ranked for the mission

1. **MCP server** — the default way agents reach a tracker now (Linear,
   Atlassian, Asana, Plane, Taskmaster, Backlog.md, Beads). → **M36**
2. **Dependencies and a "ready work" query** — Beads, Taskmaster, GitHub.
   Claim-next hands out tasks whose prerequisites are unfinished. → **M35**
3. **Priority, honoured by claim-next** — Linear, Beads, Taskmaster, Factory.
   Claim-next is oldest-first only. → **M35**
4. **Outbound webhooks** — A2A push, Linear, GitHub. An outside agent must
   hold an SSE stream open or poll to learn of work. → **M37**
5. **Structured progress and "needs input"** — Linear's plan and elicitation,
   A2A `input-required`, Asana checkpoints. The one place humans are pulled
   back *in*. → **M38**
6. **Subtasks and discovered-from links** — GitHub, Linear, Beads,
   Taskmaster. → **M35**
7. Approval gates on agent transitions → **M39**; cost/token accounting →
   **M40**; compaction of old tasks → **M41** (as summaries and digests - Tasker
   has no model to summarize with, and deleting history is not on offer).
   First left unscheduled, then planned at the user's request; all three
   delivered (ADR-0032, ADR-0033, ADR-0034).

Also: `ListTasks` has no label filter, so label-based routing is impossible
— folded into M35.

## Second pass (after M41)

Re-checked after M35–M41 shipped, against what agent-first trackers added
during 2026:

| Product | What it added | Tasker after M41 |
|---|---|---|
| Linear | **Loops** (Jul–Sep 2026): recurring agent workflows on a schedule or trigger - "review stalled issues weekly", "prepare a planning brief". Agent Plans; coding sessions; model routing. | Plans: M38. Nothing recurring. |
| Beads | **Formulas → molecules**: a reusable template of steps with dependencies, poured into a live set of issues an agent works through; dashboard shows each molecule's current step. | Dependencies and subtasks (M35), but no way to stamp out a graph of work from a template. |
| GitHub Copilot | Session visibility, subagent activity, custom agents. | Plans, notes, activity feed (M22, M38). |
| Taskfolk, clu | Agents as team members, MCP, atomic claims, dependency graphs, per-agent audit. | All present (M14, M33, M35, M36, audit). |
| A2A | v1.0 task lifecycle incl. `input_required`, `auth_required`, `rejected`. | `input_required` ≈ input requests (M38); Tasker is a tracker, not an A2A agent. |

New gaps, ranked:

1. **Workflow templates** - a named graph of steps (title, priority, type,
   blocked-by other steps) instantiated as a parent task plus subtasks wired
   with blockers, so claim-next hands the steps out in order. → **M42**
2. **Recurring work** - a schedule that instantiates a template (or a single
   task) every day / chosen weekdays / month, skipping a run while the last
   one is unfinished; agents pick it up through claim-next or webhooks.
   Tasker does not run agents, so the tracker's part of a Loop is putting the
   work on the queue on time. → **M43**

Not taken: trigger-on-event loops (webhooks M37 already let a runner react to
any task event), running models server-side (Tasker has none, ADR-0033/0034).
