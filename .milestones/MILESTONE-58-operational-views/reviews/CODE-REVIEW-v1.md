---
timestamp: 2026-11-10T19:14:35Z
decision: approved
---

# M58-T01 URL-owned operational controls four-lens review

Independent review covers current parser/writer hooks, shared live-location
extraction, Tasks/Reports wiring, native tests, previews and permanent fast-type
browser regression against ADR0025 and M58 UX/TC001–004. Ledger paths and prior
UX-v1 were checked. Only new review records were written; no production source,
service or competing tests/browser suites were changed or run.

## Correctness

The parser allows only supported scalar controls, bounds text at500 characters,
rejects control characters and duplicate owned keys, and defaults invalid fields
independently without discarding valid fields. Priority0 remains distinct from
Any priority. UI ID sorting retains createdAt; unknown sort text never becomes
a server sort. Writers delete only owned keys, preserve unrelated parameters/
scope/hash and omit defaults. Repeated identical writes are suppressed.

The hook reads current live location, guards its screen and mounted lifetime,
and applies functional changes against current parsed state. Same-screen task
open/close carries view settings; Tasks breadcrumb explicitly carries them too.
Scope-only cross-screen links remain unchanged, preserving Reports window via
Back rather than leaking screen controls. Shared currentLocation extraction
retains the existing BrowserRouter/MemoryRouter behavior used by scope writers.

Immediate local search editing prevents router transitions dropping keystrokes;
only the actual live URL acknowledgement can resync the input. Applied requests
read URL search with the existing debounce and there is no delayed URL writer.
Bulk selection resets on raw search, facets, mode, sort and org/project changes.
No matches has truthful copy and Clear filters retains table/sort; malformed
recovery has its own neutral message and Reset. All three report source families
receive the same validated window.

## Coverage

Parser tests cover supported round trips, Unicode, priority0, all supported
sorts, duplicate keys, text bounds/control characters and malformed windows.
Writer tests cover no-op history, live navigation gap and post-unmount callback.
Screen tests cover requests, history/replace behavior, close/breadcrumb/Escape,
filter recovery and selection cleanup. Existing canonical navigation tests
exercise preservation during authorized ownership normalization; ordinary
scope selection still leaves incompatible detail in one navigation.

The permanent browser regression uses actual fast keyboard typing, URL, reload
and Back/Forward rather than fill alone. The retained real-browser4 log records
six passing actual task-exit/report/recovery journeys at375/768/1280 in both
themes. Focused final output confirms168 tests in six files pass. Preview caches
are local per mount, match current query keys and seed relevant initial/default
states; separate Reports previews distinguish loading, error and denial. These
are synthetic visual fixtures, not a substitute for source/request assertions.

## Architecture and tenancy

The URL authority matches ADR0025; no new routing hierarchy, resource resolver,
server permission, query language, result snapshot or persistence layer is
introduced. Scope normalization retains unrelated scalar state and still earns
resource ownership from an authorized read. URL controls do not confer access.
Task/report queries retain current ordinary authorization. The whole-query
writer provides a narrow seam for later explicit named-view application without
implementing or advertising T02/T03 prematurely.

No blocking source finding identified. Types/build, rendered matrices,
controlled-fault and full/closure/final-head gates remain subject to their actual
final results; this source approval is not T01 or milestone completion.

```yaml
findings: []
```
