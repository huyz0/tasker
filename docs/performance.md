# Reproduce concurrency evidence

## Current evidence

M49-T03 is in progress. The command and hosted smoke below require actual green
results before they establish load evidence. No concurrent-caller capacity or
20000-client validation is claimed here. Existing single-handler data-volume
measurements are a different workload.

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
