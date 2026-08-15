import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readContractRpcs, findUncalled, report, EXCEPTIONS } from './rpc-coverage.mjs';

/** A contract and a source tree, written to disk, so the check runs for real. */
function fixture({ contract, sources }) {
  const dir = mkdtempSync(join(tmpdir(), 'rpc-coverage-'));
  const contractPath = join(dir, 'main.tsp');
  writeFileSync(contractPath, contract);
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir);
  for (const [name, body] of Object.entries(sources)) writeFileSync(join(srcDir, name), body);
  return { contractPath, srcDir };
}

const CONTRACT = `
model Thing {
  @field(1) id: string;
}

interface ThingService {
  listThings(request: ListThingsRequest): ListThingsResponse;
  createThing(request: CreateThingRequest): CreateThingResponse;
}
`;

test('reads every RPC out of every interface', () => {
  const { contractPath } = fixture({ contract: CONTRACT, sources: {} });
  assert.deepEqual(readContractRpcs(contractPath), ['ThingService.listThings', 'ThingService.createThing']);
});

test('passes when the GUI calls everything', () => {
  const f = fixture({
    contract: CONTRACT,
    sources: { 'a.tsx': 'client.listThings({}); client.createThing({});' },
  });
  assert.deepEqual(findUncalled({ contractPath: f.contractPath, srcDir: f.srcDir, exceptions: {} }).uncalled, []);
});

test('fails on an RPC nothing calls', () => {
  const f = fixture({ contract: CONTRACT, sources: { 'a.tsx': 'client.listThings({});' } });
  const result = findUncalled({ contractPath: f.contractPath, srcDir: f.srcDir, exceptions: {} });
  assert.deepEqual(result.uncalled, ['ThingService.createThing']);
  assert.match(report(result)[0], /nothing in the GUI calls it/);
});

test('an exception excuses it', () => {
  const f = fixture({ contract: CONTRACT, sources: { 'a.tsx': 'client.listThings({});' } });
  const result = findUncalled({
    contractPath: f.contractPath,
    srcDir: f.srcDir,
    exceptions: { 'ThingService.createThing': 'agent-only' },
  });
  assert.deepEqual(result.uncalled, []);
});

test('an exception for something the GUI does call is reported as stale', () => {
  const f = fixture({
    contract: CONTRACT,
    sources: { 'a.tsx': 'client.listThings({}); client.createThing({});' },
  });
  const result = findUncalled({
    contractPath: f.contractPath,
    srcDir: f.srcDir,
    exceptions: { 'ThingService.createThing': 'no longer true' },
  });
  // A note that outlives its reason is worse than none: it says the GUI cannot
  // do something it does.
  assert.deepEqual(result.staleExceptions, ['ThingService.createThing']);
  assert.match(report(result)[0], /Remove the exception/);
});

test('a call in a test file does not count as reaching the RPC', () => {
  const f = fixture({
    contract: CONTRACT,
    sources: {
      'a.tsx': 'client.listThings({});',
      'a.test.tsx': 'client.createThing({});',
    },
  });
  // A mocked call proves nothing about what the application reaches.
  assert.deepEqual(
    findUncalled({ contractPath: f.contractPath, srcDir: f.srcDir, exceptions: {} }).uncalled,
    ['ThingService.createThing'],
  );
});

test('every exception carries a reason, not an empty string', () => {
  for (const [rpc, reason] of Object.entries(EXCEPTIONS)) {
    assert.ok(reason.trim().length > 40, `${rpc} needs a real reason, not "${reason}"`);
  }
});
