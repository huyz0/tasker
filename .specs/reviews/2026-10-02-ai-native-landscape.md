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
   First left unscheduled, then planned at the user's request.

Also: `ListTasks` has no label filter, so label-based routing is impossible
— folded into M35.
