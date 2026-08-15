---
task: M05-T06
version: v1
timestamp: 2026-08-15
decision: approved
---

# Review — M05-T06 Task ↔ artifact links

## Correctness

The verify line — "a linked artifact appears on the task" — passes, and so does
the half the task's scope adds beyond it. In the browser, `Seed spec.md` was
linked from `SEED-145`'s detail view; a separate HTTP client returned the link
with both names resolved; the same relation read from the artifact's end
returned the same row; the artifact viewer showed `Seed task #145` under Tasks;
unlinking there left the task's own list empty.

```yaml
- file: apps/backend/src/modules/artifacts/artifacts.handler.ts
  line: 0
  severity: medium
  comment: >
    linkTaskArtifact inserted unconditionally, so linking the same pair twice
    produced two rows - the artifact would appear twice on the task and the
    second ✕ would look like it did nothing. It now returns the existing row,
    matching assignTask. Proved by injection: disabling the new guard fails the
    duplicate test, so the test is testing the guard rather than the schema.

- file: apps/backend/src/lib/scopes.ts
  line: 0
  severity: medium
  comment: >
    unlinkTaskArtifact was first written with requirePrincipal +
    artifacts:write, which the agent sweep immediately rejected: reachable by a
    token despite being unmapped. That was the right call and the sweep made it
    for me - an agent that can detach its own output from the task it was given
    can hide the work, the same argument that keeps unassignTask closed. Now
    requireUser + assertOrgWriter. listTaskArtifactLinks is a genuine read and
    is mapped to artifacts:read and listed in the viewer sweep's READS.
```

## Test coverage

Backend: nine. Both directions of the read, the invalid-argument cases (both
ids, neither, and — because proto3 sends `""` rather than omitting — two empty
strings), duplicate linking, unlinking the named pair only, unlinking something
that was never linked, the id-as-name fallback when the artifact row is gone,
the query count staying fixed for eight links, and the cross-organization
refusal.

Component: fourteen, covering both anchors. The two that matter most are the
pair asserting the ids go the right way round from each end — swapping them
links a real but wrong pair and both ids look alike on screen — and the one
asserting the picker calls nothing until a query is typed.

## Architectural drift

The task named only GUI files. It could not be done from the GUI alone: the
write path (`linkTaskArtifact`) has existed since M01 and nothing could read or
undo it, so the links were invisible and therefore untested by use. Added
`listTaskArtifactLinks` and `unlinkTaskArtifact`, plus `artifactName` and
`taskTitle` on `TaskArtifactLink`. That is the third task in this milestone
where the read path was the missing half — recorded in the design note.

One RPC serves both directions, with exactly one of the two ids required. Two
RPCs would mean two authorization paths and two entries in each deny-by-default
sweep for one query against one table.

```yaml
- file: apps/gui/src/features/Tasks/TaskArtifactLinks.tsx
  line: 0
  severity: low
  comment: >
    Candidates come from universalSearch rather than a new listing RPC. That
    avoids the enumeration trap M05-T04 fell into (there is no bounded
    "everything" to open onto, so the picker asks for a query), and the search
    handler already splits its page evenly between the two types, so tasks
    cannot crowd artifacts out - verified against the seeded fixture: a
    ten-result page returned exactly five tasks, the per-type cap. The cost is
    that the picker cannot show a total, because universalSearch's totalCount
    sums both types; it shows no count rather than a misleading one.
```

## Security

`unlinkTaskArtifact` resolves the organization from the task rather than the
request and requires a writer. Deletion matches the exact `(taskId, artifactId)`
pair — matching on the task alone would unlink every artifact on it, and on the
artifact alone every task. `listTaskArtifactLinks` authorizes against whichever
end was named, and the link rows it returns are all within that organization by
construction, since a cross-organization link is refused at creation.

The name lookup selects only `id` and `name`/`title`. Artifact rows can hold
~15MB of base64 image in `content`; `select *` here would have pulled every
linked artifact's body into memory to render a list of file names.

## Verdict

**Approved.** Two mediums, both caught by existing gates rather than by reading
(the duplicate by a test written against the design note, the authorization by
the agent sweep), one low recorded.
