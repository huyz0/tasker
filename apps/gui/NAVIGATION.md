# Attention navigation

Open **Work → Attention** to inspect current questions, move approvals, your
review responsibilities and quiet agent-held tasks in the selected organization.

The project selector can deliberately remain **All projects** on Attention.
Choose a project to narrow the sources, or choose All projects to return to the
organization view. Other workbenches keep their existing project selection rules.

Choose a source using its named link. Each source has its own count, loaded
extent, loading/error state and Load more control. Counts reflect the last
authorized read; an unavailable source is not a count of zero. Refresh reloads
the loaded extent from current source records. An empty group only describes
that group.

Each row shows the actual project, task, reason and recorded date basis. Open
task navigates to that task in its own organization/project. It opens the task
context rather than selecting a specific question or approval. Use the existing
contextual actions there:

- Questions: inspect the full question/options and use Answer. Authorized
  cancellation from another client also removes the open question.
- Approvals: inspect the requested/current states and use the existing move
  decision controls. A stale request can close without performing its old move.
- Your reviews: inspect the open task and your responsibility. This list does
  not introduce an Approve review outcome. Its date is task creation because
  review assignment time is not recorded.
- Stalled claims: inspect the current task/assignment before managing it.
  More than 24 hours without task activity is a source signal, not proof that a
  worker process has stopped. No release action is attached to an old list row.

Browser Back returns to the source, scope and loaded extent. After fresh data
settles, focus returns to the activated row, or to the group heading if that
source disappeared. Background polling never repeats this restoration.

Known organization task-read denial hides source data across projects/groups.
An explicit Try again must verify a fresh response before that group's data
returns. A missing/archived project is local unavailability. The task screen,
Dashboard, Reports and personal notification bell remain separate entry points.
