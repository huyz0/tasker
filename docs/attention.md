# Find work that needs attention

Open **Work → Attention**, choose an organization, then keep **All projects** or
select one project. Choose Questions, Approvals, Your reviews or Stalled claims.
Each group shows current source records rather than a separate inbox.

| Group | What it means | What to do |
| --- | --- | --- |
| Questions | An open request for input on a task | Open the task, read the full question/options, and answer. An authorized other client can also cancel it. |
| Approvals | A pending request to move a task between states | Open the task, inspect its current state, then approve or reject the requested move. A request can close as stale when the task has already moved. |
| Your reviews | You are a reviewer on a task whose configured state is not terminal | Inspect the task and review responsibility. Removing responsibility is separate from approving a move or completing the task. |
| Stalled claims | An agent-held task has had no qualifying task activity for more than 24 hours | Inspect the current task and assignment before managing the assignment. Silence does not establish whether the external worker is running. |

Rows show the actual project, task, reason, recorded date basis and available
requester/holder. Review assignment dates are not recorded, so review rows label
the task creation date. Stalled rows label the last task activity, falling back
to task creation when no later activity exists. Token activity alone does not
clear task silence.

**Load more** reaches remaining rows beyond the first 20. The loaded count and total
belong to that group and scope. An initial failed read leaves the count unknown, rather
than claiming zero. A failed refresh retains the last-read rows/count and marks
the list as potentially out of date. Counts describe the last authorized read; use **Refresh**
to reconcile the loaded pages with current source records.

**Open task** takes you to the task in its own project. Use its existing controls;
Attention does not attach a release action to a potentially old assignment row.
Questions and approvals can remain pending after task completion, because they
have their own source status. Archived tasks, projects and organizations are
excluded; restoring them can make still-eligible unresolved sources reappear.
Restoring a task records activity, so an existing hold may no longer meet the
silence threshold.

Browser **Back** restores the source, scope and loaded extent after current data
settles. Focus returns to the opened row, or to the group heading if the row has
disappeared. Existing summary draft protection still applies while using task
controls and navigating back.

The visible active group refreshes every 15 seconds and on focus/network recovery.
With a configured live feed, relevant changes from other clients refresh current
reads; reconnect reconciles changes missed while disconnected. Without that feed,
polling and explicit Refresh remain available. Background groups do not load all
their pages automatically.

Attention is available to signed-in people with current task-read authority in
the selected organization. Agent tokens do not expose this human supervision
reader. A refused write does not by itself remove readable task data. If a source
read establishes lost organization authority, all affected group/project data is
hidden; **Try again** must complete a fresh authorized read before that group's
data returns. A missing or archived selected project is local to that project.
