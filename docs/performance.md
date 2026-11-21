# Reproduce concurrency evidence

## Measured boundary — 21 November 2026

A hosted staged experiment exercised 4, 100 and 1000 actual callers. **The
1000-caller measurement is valid but its service outcome is poor:** only
57 of 3000 logical create/replay/read workflows completed, with 2943 errors.
Do not describe this as healthy 1000-caller capacity or as 20000-client
validation. Final repository/publication gates remain in progress.

[Staged and separate recovery job](https://github.com/huyz0/tasker/actions/runs/44908965538/job/136860547110)
passes its measurement-correctness checks. Exact reports:

- [Four-caller correctness baseline](performance/2026-11-21-verified-4-callers.json)
- [100 callers](performance/2026-11-21-verified-100-callers.json)
- [1000 callers and saturation](performance/2026-11-21-verified-1000-callers.json)

Both larger stages use one project with 1000 existing tasks, two API processes,
seed 42, a 15-second admission window and a 3000-operation cap. Defaults remain
pool 20/queue 200 per API and the production rate limiters. The same hosted
machine reports Intel Xeon 6973P-C, four logical CPUs and 16758390784 bytes
host RAM. Cgroup CPU/memory limits are unknown. Bun 1.3.11, MySQL 8.4.13 and
NATS 2.10.29 are observed; source is 2e8b14b, tested pull-request checkout
18ae2c6117bbd1c76dbfc3a606e33594537033c1.

| Observation | 100 callers | 1000 callers |
|---|---|---|
| Actual principals / peak active | 100 / 100 | 1000 / 1000 |
| Attempted logical workflows | 1701 | 3000 |
| Complete create/replay/read | 1701 | 57 (1.9%) |
| Acknowledged first writes | 1701 | 822 |
| Final task/source/audit rows | 1701 each | 1016 each |
| Request errors | 0 | 2943 |
| Successful workflow p50 | 855.052ms | 7071.840ms |
| Successful workflow p95 / p99 | 1293.429 / 1615.375ms | 7081.129 / 7082.326ms |
| All-attempt p95 / p99 | 1293.429 / 1615.375ms | 5983.095 / 7070.956ms |
| Acknowledged first-write p95 | 589.888ms | 4713.452ms |
| Request phase including settlement | 15.363392s | 7.260110s |
| Complete logical workflows/s | 110.717737 | 7.851121 |
| Acknowledged first writes/s | 110.717737 | 113.221425 |
| Separate recovery tail | 22.585613s | 19.457361s |
| Total including setup and cleanup | 46.033678s | 34.156371s |
| Peak sampled API RSS, both PIDs | 579469312 bytes | 527568896 bytes |
| Peak generator RSS | 175116288 bytes | 240422912 bytes |
| Peak pending producer rows | 1153 | 990 |
| Pending after API drain / final | 1144 / 0 | 966 / 0 |
| Unacknowledged intent later committed | 0 | 194 |
| Unacknowledged intent absent from SQL | 0 | 1984 |
| Lost, duplicate or changed committed identity | 0 | 0 |
| Cleanup, queue-read and memory-read failures | 0 | 0 |

The 1000-caller stage exhausts its operation cap before the admission window
ends. Its errors are 1984 create/Internal, 194 create/DeadlineExceeded,
551 replay/Internal and 214 replay/DeadlineExceeded. The error codes alone do
not establish a driver/pool root cause. Fast failures make the all-attempt
median look better than the successful-workflow distribution; use both.

The checker independently reconciles every attempted key and acknowledged
identity. In the saturated stage, 822 acknowledged writes plus 194 later
confirmed commits account for all 1016 task/source/audit records. A measurement
with correct reconciliation can still have unacceptable availability and
latency. A separate recovery API drains pending events outside request
throughput; sustained queue stability is not established.

### Separate failure experiments on the same host

After the three stages, the required MySQL/NATS recovery command executes
all ten cases without required skips: competing/retried writes, killed
transactions, acknowledged-before-bookkeeping relay recovery, broker restart,
stable audit identity, revoked reconnect access and interrupted/stale-owner
schedule recovery. Both actual acknowledged audit-loss and duplicate faults
fail their intended assertions and restore source bytes.

These experiments happen after the load phases. They do not demonstrate
failure recovery while 1000 callers remain active. Controlled fixture clocks
exercise lease recovery; they are not instructions to change production clocks.

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
observer overhead are included; sampled RSS excludes MySQL, NATS and caches.
Short samples do not establish stable tails, and no service-level target is
inferred. Configured caller count does not imply an acceptable service level.

At 100 callers, three short runs complete without request or correctness
failures, with different hosted hardware producing different throughput and
latency. At 1000 callers, the completed run preserves data correctness but
saturates severely; two earlier commands never produce a completed report.
No maximum supported fleet or 20000-caller validation is established.

## Bounded staged-run diagnostics

The staged workflow gives each controller command a 240-second external
watchdog, followed by up to 45 seconds for graceful termination. It invokes
the same script as the package command directly. This bounds setup, request
settlement and recovery as well as admission. A forced kill cannot guarantee
controller cleanup and never establishes valid measurement.

Fixed JSON phase markers on stderr identify setup, request settlement,
API/event/projector/SQL drain, final oracle and cleanup. They contain elapsed
time and aggregate counts, without credentials, bodies or generated resource
names. The verified stages finish within this bound. The earlier incomplete
runs are retained; no root cause or production fix is attributed to the
diagnostic/configuration change.

## Earlier observations retained

| Report | Host | Complete 100-caller workflows | Workflows/s | Successful p95 | Separate recovery |
|---|---|---|---|---|---|
| [Initial JSON](performance/2026-11-21-initial-100-callers.json) | Xeon Platinum 8573C, four CPUs, 16758394880 bytes RAM | 1174 | 75.042356 | 1979.019ms | 13.689327s |
| [Pinned-run JSON](performance/2026-11-21-pinned-100-callers.json) | AMD EPYC 9V74, four CPUs, 16759431168 bytes RAM | 1508 | 97.783247 | 1445.677ms | 19.604031s |

Each has 100 actual/peak callers, two API PIDs, 1000 fixture tasks and zero
request/correctness/cleanup failures. Their following 1000-caller commands
have no completed report. The [initial job](https://github.com/huyz0/tasker/actions/runs/44906822995/job/136854082350)
is cancelled at its configured external job deadline; the [pinned job](https://github.com/huyz0/tasker/actions/runs/44907118491/job/136854961314)
is cancelled when superseded. Different hardware and timing prevent a
controlled comparison. Retaining both avoids presenting only the faster host.
