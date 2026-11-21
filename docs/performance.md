# Reproduce concurrency evidence

## Current evidence

M49 verification remains in progress. A completed **100-caller correctness
stage** is available below. The later 1000-caller command did not complete
before its workflow was superseded; it has no valid result. No maximum fleet,
sustained capacity or 20000-client validation is claimed. Existing
single-handler data-volume measurements are a different workload.

### Completed 100-caller observation — 21 November 2026

[Exact aggregate JSON](performance/2026-11-21-pinned-100-callers.json) comes from
[job 136854961314](https://github.com/huyz0/tasker/actions/runs/44907118491/job/136854961314).
That job was later cancelled when its source was superseded. Its four- and
100-caller commands had already completed and printed checked reports; the
following 1000-caller command had not. The successful stage does not imply the
whole job passed.

| Dimension | Actual observation |
|---|---|
| Workload | 100 distinct principals, peak 100 active operations, two API PIDs, one shared project |
| Existing dataset | 1000 tasks; direct fixture insertion is outside measurement |
| Admission / request settlement | 15 seconds configured / 15.421865 seconds observed |
| Logical create/replay/read workflows | 1508 attempted, 1508 complete; 4524 RPCs |
| Outcomes | 1508 acknowledged tasks, source events and audit rows; no request, identity, lost, duplicate or cleanup failures |
| Successful workflow latency | p50 993.221ms; p95 1445.677ms; p99 1934.209ms, 1508 samples |
| Throughput | 97.783247 completed logical workflows/s during the measured request phase |
| Recovery / total | 19.604031s separate recovery tail / 41.277869s including setup and cleanup |
| Sampled RSS | APIs together 577028096 bytes; generator 175022080 bytes; excludes MySQL/NATS |
| Queue | producer pending peak 963; consumer unacked peak two; final pending zero |
| Hardware | AMD EPYC 9V74, four logical CPUs; host RAM 16759431168 bytes; cgroup CPU/memory limits unknown |
| Runtimes | Bun 1.3.11; MySQL 8.4.13; NATS 2.10.29 |
| Source | controller 35b8d33; actual pull-request checkout b9cb15c13b20f6f2f9983fd6d685e5aba8ddef72 |
| Defaults | database pool 20 and queue limit 200 per API; production limiters retained |

The producer queue had 962 rows pending after the measured APIs stopped. A
separate recovery API drained it to zero; its work is excluded from request
throughput. This backlog and the measured workflow latency matter when choosing
a service level. A short successful run does not establish steady-state queue
stability, acceptable latency for another workload or a maximum supported fleet.

This is one hosted Linux machine and one project, with synthetic actors/task
fixtures. It excludes streaming, other endpoints, multi-host behavior and
long-duration soak. The 1000-caller investigation and separate failure
experiments remain open.

## Prerequisites and command

Use Linux, the repository-pinned toolchains, a disposable local MySQL 8.0 or 8.4
service on port 3306, and the local Docker daemon. Set DB_PASSWORD in the
environment; DB_HOST defaults to 127.0.0.1 and DB_USER to root. The account must
create/drop generated fixture schemas. The command accepts no deployment URL or
schema name and ignores an inherited DB_NAME.

From the repository root:

```sh
bun install --frozen-lockfile
moon run shared-contract:compile
docker pull nats:2.10-alpine
cd apps/backend
bun run typecheck:measurement
bun run measure:concurrency --concurrency 4 --duration 3 --fixture 20 --instances 2 --seed 42 --max-operations 20 > smoke.json
```

The command generates its own schema, broker ownership label, temporary directory,
HTTP ports and credentials. Cleanup attempts every owned resource on normal completion,
errors and graceful SIGINT/SIGTERM interruption; a cleanup failure fails the run.
Force-killing the controller cannot run its cleanup. Credentials remain in memory. JSON stdout contains only
aggregate evidence; failure diagnostics on stderr contain fixed phases/codes.

## Workload dimensions

| Option | Default | Accepted range |
|---|---|---|
| --concurrency | 4 | 1–1000 distinct scoped agent principals |
| --duration | 3 | 1–120 seconds admitting logical operations |
| --fixture | 20 | 0–10000 pre-existing tasks in one shared project |
| --instances | 2 | 1–4 independent API processes |
| --seed | 1 | 0–4294967295, fixture labels and endpoint routing |
| --max-operations | 20 | 1–50000 total logical operations |

Unknown, repeated, missing, fractional and out-of-range arguments fail before
resource creation. The seed controls fixture content and request routing;
identities, timing and concurrent interleavings are not deterministic.

Setup uses actual password authentication and org/project/template/role RPCs.
Fixture tasks, agents and hashed credentials are inserted directly using the
production token generator; actor registration throughput is not measured.

Each closed-loop caller creates a task with a unique stable key, repeats the
same request through the next API instance, then reads its canonical identity.
With one instance, replay uses that same instance. Production rate limits and
pool/queue defaults are retained. Configured callers and actual peak active
operations are both recorded.

## Read the JSON

- timing.phaseMs includes request settlement after the admission deadline;
  throughput divides confirmed completions or acknowledged first writes by
  that actual elapsed time. A logical completion includes create, replay and
  read. Error-code counts retain failures at each stage.
- timing also separates setup, post-measurement observation, API drain,
  recovery, SQL-session drain, source reconciliation and cleanup; totalMs
  includes them all.
- latencyMs reports nearest-rank p50/p95/p99 for all logical completions,
  successful logical completions and acknowledged first writes separately.
  Empty sample sets report null. Short samples do not establish stable tails.
- workload records actual principal/fixture counts, measured API PIDs, caller
  peak and pool settings. hardware records CPU, host RAM and readable cgroup
  limits. versions names the actual Bun, MySQL and NATS runtimes.
- memory reports sampled direct API/generator RSS; it excludes MySQL, NATS
  and operating-system caches. queue reports sampled pending source work,
  pending/unacknowledged consumer messages and observation failures.
- correctness independently reconciles attempted keys and first-write IDs
  against SQL tasks, durable producer events and audit rows after real broker
  acknowledgement. Lost, duplicate, unexpected or changed identities fail.
  Unknown writes are classified as committed or absent, preserving uncertainty.
- Requests settle and measured APIs drain before final reconciliation. If
  pending events remain, a separate owned recovery API drains them. Recovery
  duration and whether takeover was needed are reported outside throughput.
  The projector then stops and all other SQL sessions in the owned schema
  must close before final source/audit reads. Remaining pending producer
  work is a correctness failure. A deliberately late committed task must be
  rejected by this final oracle; its actual negative proof restores source.
- cleanupFailures and evidenceValid make incomplete cleanup and a run with no
  acknowledged write explicit. A correctness/cleanup failure exits1; a complete
  run with no acknowledged write exits2.

The hosted smoke requires two real API PIDs, positive measured work, real
runtime/queue/memory observations, no request errors and successful cleanup.
It retains JSON as a GitHub Actions artifact and shows aggregate results in its
log. The pure core tests run separately without services; an unchecked-input
fault must fail its actual assertion and restore source before ordinary checks.

## Capacity boundaries

This is one Linux host and one shared project, including serialization of that
project's display-number allocation. It does not measure all endpoints, multiple
hosts, sustained long-duration load or streaming connections. Generator and
observer overhead are included. Errors at saturation remain part of the result;
configured caller count does not imply an acceptable service level.

M49-T04 records the separate 100 and 1000 caller experiments, their hardware,
dataset, saturation, recovery behavior and limitations. Until those artifacts
exist and are reviewed, those caller counts remain planned experiments.

## Bounded staged-run diagnostics

The staged workflow gives each controller command a 240-second external
watchdog, followed by up to 45 seconds for graceful termination. This bounds
setup, request settlement and recovery as well as admission. A forced kill
cannot guarantee controller cleanup and never establishes valid measurement.
The job still stops escalation on a failed stage and retains completed reports.

Fixed JSON phase markers on stderr identify bootstrap, API/identity/fixture
setup, request settlement, API/event/projector/SQL drain, final oracle and
cleanup. They contain elapsed time and aggregate attempt/completion counts,
without credentials, task bodies or generated resource names.

## Second completed 100-caller observation

The [initial-run JSON](performance/2026-11-21-initial-100-callers.json) is also
retained so the faster result above is not presented as the only observation.
[Initial job 136854082350](https://github.com/huyz0/tasker/actions/runs/44906822995/job/136854082350)
completed its four- and 100-caller stages, then reached its external job
deadline while the following 1000-caller command had no completed report.

| Dimension | Initial completed 100-caller stage |
|---|---|
| Hardware | Intel Xeon Platinum 8573C; four logical CPUs; host RAM 16758394880 bytes; cgroup limits unknown |
| Workload | 100 actual/peak callers, two API PIDs, 1000 fixture tasks; same production defaults |
| Outcomes | 1174/1174 complete workflows, 3522 RPCs, matching task/source/audit rows; zero request/correctness/cleanup failures |
| Request phase / throughput | 15.644498s / 75.042356 workflows/s |
| Workflow latency | p50 1236.234ms; p95 1979.019ms; p99 2619.681ms |
| Recovery / total | 13.689327s separate tail / 37.893618s overall |
| Sampled RSS | APIs 532037632 bytes; generator 173121536 bytes; service memory excluded |
| Queue | producer pending peak 741; consumer unacked peak four; final pending zero |
| Source | checkout 6665750eced3e84be1d15df2b61e6d895b7a5fa9 |

Bun/MySQL/NATS versions match the first observation. Different hosted hardware
and uncontrolled timing mean these two runs are not a controlled performance
comparison. Both short stages demonstrate correct outcomes for their recorded
workload; neither establishes a maximum fleet, stable long-duration tails or
successful 1000-caller operation.
