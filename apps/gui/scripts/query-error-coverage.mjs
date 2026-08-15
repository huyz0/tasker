#!/usr/bin/env node
/**
 * Every view that reads must be able to say that the read failed.
 *
 * M06-T11's audit found that *every* `isError` in `features/*` belonged to a
 * mutation. Query errors were surfaced nowhere, so a failed list fell through to
 * its empty branch and told the user "No projects found" — not a blank region
 * but something worse, a confident claim that the data is gone. A one-time sweep
 * fixes that once; this gate keeps the next view from omitting it, which is what
 * the milestone's other criteria do too.
 *
 * The rule: a file under `src/features/` that calls `useQuery`/`useInfiniteQuery`
 * must also mention `ListState` — the one component that renders a query error
 * with a way to retry — or be named in `EXCEPTIONS` with a reason.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Views whose query error is deliberately not rendered. Each needs a reason,
 * because "we forgot" is what this gate exists to catch.
 */
export const EXCEPTIONS = {
  // listInvitations denies non-admins. The error IS the permission answer, and
  // the section is hidden on `isSuccess` rather than shown with a failure — see
  // the comment at `canManageInvites`.
  'Organizations/index.tsx': 'invitationsQuery — a denial, gated on isSuccess by design',
  // Same shape: listAgentTokens denies anyone who may not hold credentials, and
  // M03-T13 chose to hide the section rather than flash it and take it away.
  'Agents/AgentTokens.tsx': 'tokensQuery — a denial, gated on isSuccess by design',
};

const QUERY = /use(?:Infinite)?Query\(\{/g;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function findUnhandled({ srcDir, exceptions = EXCEPTIONS }) {
  const files = walk(srcDir).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'));
  const offenders = [];
  const usedExceptions = new Set();
  let checked = 0;

  for (const file of files) {
    const rel = file.slice(srcDir.length + 1);
    const source = readFileSync(file, 'utf8');
    const queryCount = (source.match(QUERY) ?? []).length;
    if (queryCount === 0) continue;
    checked++;

    if (exceptions[rel]) {
      usedExceptions.add(rel);
      // An exception excuses one query, not a whole file: a view with a
      // permission-gated read *and* an ordinary list still owes the list an
      // error branch.
      if (queryCount === 1) continue;
    }

    if (!source.includes('ListState')) offenders.push(rel);
  }

  const stale = Object.keys(exceptions).filter((rel) => !usedExceptions.has(rel));
  return { offenders, stale, checked };
}

export function report({ offenders, stale }) {
  return [
    ...offenders.map(
      (rel) => `✗ ${rel} reads with useQuery but never renders a query error — use ListState, or add an exception with a reason.`,
    ),
    ...stale.map((rel) => `✗ EXCEPTIONS holds "${rel}", which no longer reads — remove it.`),
  ];
}

// Only when run directly, so the test can import the functions above.
if (import.meta.url === `file://${process.argv[1]}`) {
  const srcDir = new URL('../src/features', import.meta.url).pathname;
  const result = findUnhandled({ srcDir });
  const lines = report(result);
  if (lines.length === 0) {
    console.log(`query-error-coverage: ${result.checked} reading views, every one renders its query error.`);
    process.exit(0);
  }
  for (const line of lines) console.error(line);
  process.exit(1);
}
