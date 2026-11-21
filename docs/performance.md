# Reproduce concurrency evidence

## Current measured boundary — 21 November 2026

The repaired controller completes two separate 1000-caller experiments with
correct reconciliation and cleanup. **Service saturation remains severe**:
only 269/3000 and 213/3000 logical create/replay/read workflows complete.
A valid measurement is not evidence of a healthy 1000-caller service level.

[Repeated native-fetch stages and recovery](https://github.com/huyz0/tasker/actions/runs/44913418605/job/136873835775)
use source e94372e and actual checkout 220a9ba46c34d107c6ee524642c07fd3f482b2d9.
Exact records:

- [Four-caller baseline](performance/2026-11-21-native-fetch-4-callers.json)
- [100 callers](performance/2026-11-21-native-fetch-100-callers.json)
- [1000 callers, first run](performance/2026-11-21-native-fetch-1000-callers-1.json)
- [1000 callers, second run](performance/2026-11-21-native-fetch-1000-callers-2.json)

The generator uses the already-installed Connect Web transport over Bun native
fetch. Whole-unary-call deadline/controller signals are combined, including
response reading. The staged generator explicitly configures 1024 concurrent
fetch requests; owned API/consumer children omit that setting and retain
their defaults. [Bun documents this runtime budget](https://bun.sh/docs/runtime/environment-variables).
Logical caller concurrency is observed; open-socket concurrency is not
instrumented.

Both larger runs use 1000 distinct principals/peak active logical operations,
two API PIDs,1000 existing tasks, one shared project, seed42 and unchanged
API database pools 20/queue 200 and production limiters. They admit up to 15s
or 3000 operations; rapid failures exhaust the cap after about one second.
The measured request phase includes all request settlement.

| Observation | First 1000-caller run | Repeated 1000-caller run |
|---|---|---|
| Attempted / complete workflows | 3000 /269 | 3000 /213 |
| Request errors | 2731 | 2787 |
| Acknowledged first writes | 393 | 384 |
| Unacknowledged intent later committed | 47 | 56 |
| Unacknowledged intent absent | 2560 | 2560 |
| Final task/source/audit rows | 440 each | 440 each |
| Successful workflow p50 | 7225.231ms | 6910.023ms |
| Successful p95 /p99 | 7480.396 /7483.689ms | 7635.889 /7651.801ms |
| Request phase | 7.518529s | 7.674886s |
| Complete workflows/s | 35.778277 | 27.752856 |
| Acknowledged first writes/s | 52.270865 | 50.033318 |
| Separate recovery tail | 7.882415s | 6.857256s |
| Total with setup/cleanup | 24.178468s | 22.351016s |
| Peak sampled API RSS, both PIDs | 539705344 bytes | 526725120 bytes |
| Peak generator RSS | 185913344 bytes | 184745984 bytes |
| Peak producer pending | 416 | 402 |
| Pending after API drain /final | 399 /0 | 339 /0 |
| Lost, duplicate or changed committed identity | 0 | 0 |
| Cleanup, queue-read and memory-read failures | 0 | 0 |

The first run has 2560 create/Internal,24 replay/Internal,47
create/DeadlineExceeded and 100 read/Internal errors. The second has 2560
create/Internal,24 replay/Internal,56 create/DeadlineExceeded and 147
read/Internal errors. Error codes alone do not prove a pool/server root
cause. Fast failures bias the all-attempt latency distribution; exact JSON
also retains successful and acknowledged-first-write distributions.

On the same host,100 callers complete987/987 workflows without errors:
15.866240s request phase,62.207556 workflows/s, p95 2814.729ms,10.767483s
separate recovery and 34.423965s total. This is a short observation, not a
steady-state capacity guarantee.

Hardware is Intel Xeon Platinum 8370C at 2.80GHz, four logical CPUs and
16758394880 bytes host RAM; cgroup CPU/memory limits are unknown. Observed
runtimes are Bun 1.3.11, MySQL 8.4.13 and NATS 2.10.29. Sampled memory excludes
MySQL, NATS and OS caches. Changing host and generator profile prevents a
controlled comparison with older figures.

### Real controller and recovery verification

A real loopback endpoint accepts an RPC and never replies. Before correction,
the deadline case passes but controller cancellation does not settle the
request (job 136872346255). The repaired transport settles both cases.
Temporarily disabling deadline/cancellation handling makes each intended
assertion fail; source bytes are restored (job 136873914578).

The repeated staged job then executes all ten required real MySQL/NATS
recovery cases and acknowledged audit-loss/duplicate fault proofs. They pass
after the load stages, not while 1000 callers remain active. Controlled
fixture clocks exercise lease logic; operators must not change live clocks.

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
BUN_CONFIG_MAX_HTTP_REQUESTS=1024 bun run measure:concurrency --concurrency 4 --duration 3 --fixture 20 --instances 2 --seed 42 --max-operations 20 > smoke.json
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

## Capacity and runtime boundaries

One Linux host, one project and short closed-loop bursts do not establish
sustained queue stability, all endpoints, streaming, multiple hosts or
20000 concurrent clients. The two repeated1000-caller runs retain many
request failures even though eventual committed identities reconcile.

Each RPC has a five-second whole-call bound and controller cancellation.
The staged command also has a 240-second external watchdog and 45-second
graceful termination allowance covering setup/drain/recovery. Forced kill
cannot guarantee cleanup and never establishes valid measurement. Fixed
stderr phase markers contain only labels, time and aggregate counts.

The ordinary package command and staged direct-script command execute the
same controller. To reproduce a larger profile from apps/backend, with
the prerequisites above:

```sh
BUN_CONFIG_MAX_HTTP_REQUESTS=1024 timeout --signal=TERM --kill-after=45s 240s bun run scripts/measure-concurrency.ts --concurrency 1000 --duration 15 --fixture 1000 --instances 2 --seed 42 --max-operations 3000 > callers-1000.json
```

Run it twice into distinct files. Record git revision and machine limits
alongside manual JSON; hosted reports name their actual checkout. Native
fetch defaults to 256 requests when the budget is unset; that is a different
generator profile. API/consumer children retain default fetch configuration.

## Earlier profiles and failures retained

These observations use the original Node-compatible HTTP transport, with
different hosted hardware. They remain evidence for those exact profiles:

| Report | Host | Complete 100-caller workflows | Workflows/s | Successful p95 |
|---|---|---|---|---|
| [Initial 100](performance/2026-11-21-initial-100-callers.json) | Xeon 8573C | 1174 | 75.042356 | 1979.019ms |
| [Pinned 100](performance/2026-11-21-pinned-100-callers.json) | EPYC 9V74 | 1508 | 97.783247 | 1445.677ms |
| [Original verified 100](performance/2026-11-21-verified-100-callers.json) | Xeon 6973P-C | 1701 | 110.717737 | 1293.429ms |
| [Failed-publication cohort 100](performance/2026-11-21-publication-failure-100-callers.json) | See exact JSON | 1261 | See exact JSON | See exact JSON |

The [original four-caller baseline](performance/2026-11-21-verified-4-callers.json)
and [original completed 1000-caller saturation](performance/2026-11-21-verified-1000-callers.json)
are retained. That larger observation completes only 57/3000 workflows with
2943 errors and 194 additional unacknowledged commits. The newer client
repair does not retrospectively change it.

Three relevant incomplete 1000-caller runs remain explicitly recorded:
the [initial run](https://github.com/huyz0/tasker/actions/runs/44906822995/job/136854082350),
a [superseded run](https://github.com/huyz0/tasker/actions/runs/44907118491/job/136854961314),
and the [final-head reproduction](https://github.com/huyz0/tasker/actions/runs/44911102729/job/136866898054).
The latter stalls in request generation/settlement and requires exit 137
after the external 240s/45s bound. It has no completed 1000-caller oracle,
so no zero-loss or cleanup claim is made for it. Rejected CODE-v13 is
preserved. The exact underlying runtime/server cause is not inferred.

The repair establishes observed deadline/cancellation behavior and repeated
completed measurements. Capacity remains limited in the recorded bursts.
Representative sustained mixed-project/read/write/streaming work, explicit
overload/admission behavior and shared rate coordination need separate
requirements and measurement.
