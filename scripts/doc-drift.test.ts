import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkDocDrift, readClosedMilestones, CHECKED_DOCS } from './doc-drift';

/**
 * The rule this file exists to honour is the one `spec-drift.test.ts` states:
 * a check that cannot be made to fail enforces nothing.
 *
 * Both directions matter here, and the second is the one that decides whether
 * this gate survives contact with the repository. Historical attribution is
 * legitimate and frequent in these documents — a milestone id citing what built
 * a thing. A checker that flagged those would be switched off, and then it
 * would be protecting nothing. So every "must pass" case below is a real form
 * taken from the corrected documents.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'doc-drift-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A ledger with M08 closed and M99 open, which is all any case here needs. */
function writeLedger(extra = '') {
  const path = join(root, '.milestones/STATE.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, [
    '## Milestone ledger',
    '',
    '| ID  | Milestone | Status | Depends on | Tasks | Done |',
    '|-----|-----------|--------|------------|-------|------|',
    '| M08 | Events    | done   | —          | 11    | 11   |',
    '| M99 | Something | todo   | —          | 3     | 0    |',
    extra,
  ].join('\n'));
}

function writeDoc(body: string, name = 'README.md') {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  return name;
}

describe('readClosedMilestones', () => {
  it('reads only the milestones the ledger marks done', () => {
    writeLedger();
    const closed = readClosedMilestones(root);
    expect(closed.has('M08')).toBe(true);
    expect(closed.has('M99')).toBe(false);
  });

  it('refuses to run rather than passing vacuously when the ledger is unreadable', () => {
    // A silently-empty closed set would make every document pass forever,
    // which is the worst failure available to a gate.
    mkdirSync(join(root, '.milestones'), { recursive: true });
    writeFileSync(join(root, '.milestones/STATE.md'), '# no table here');
    expect(() => readClosedMilestones(root)).toThrow(/no closed milestones/);
  });

  it('refuses to run when STATE.md is missing', () => {
    expect(() => readClosedMilestones(root)).toThrow(/missing/);
  });
});

describe('pending-ownership constructions are caught', () => {
  const cases: [string, string][] = [
    ['is <milestone>', 'A genuinely portable single binary is **M08**.'],
    ['are <milestone>', 'Distributed tracing and OTLP export are **M08**.'],
    ['unbolded', 'That is M08.'],
    ['owns', '**M08** owns the call.'],
    ['adds', 'M08 adds subscribers that derive an audit trail.'],
    ['builds', 'M08 builds project-scoped routes.'],
    ['decides', 'M08 decides between populating the table and a dedicated index.'],
    ['will', 'M08 will replace the in-process counters.'],
    ['owed by', 'Measured numbers are owed by **M08** (read-path scale).'],
    ['heading owner', '### CQRS with a separate read store — **M08**'],
    ['heading owner, list', '### Agent identity and quotas — **M08**, **M99**'],
  ];

  for (const [name, body] of cases) {
    it(`catches: ${name}`, () => {
      writeLedger();
      const doc = writeDoc(body);
      const { findings } = checkDocDrift(root, [doc]);
      expect(findings.map((f) => f.milestone)).toContain('M08');
    });
  }
});

describe('legitimate historical attribution is left alone', () => {
  // Every one of these is a real form from the corrected documents. If any
  // starts failing, the gate has become the kind that gets switched off.
  const allowed: [string, string][] = [
    ['delivered-by', 'Delivered by M08, which also added the durable audit projector.'],
    ['parenthetical', '- **The SPA is embedded** (M08-T02/T03). `scripts/bundle-gui.ts` packs it.'],
    ['bare parenthetical', 'Six entity kinds are searchable, beliefs among them (M08).'],
    ['possessive', 'the proxy read-timeout that M08\'s streaming endpoint requires'],
    ['until, quoted', 'ADR-0004, whose "until M08" this discharges.'],
    ['supersedes', 'Delivered by M08, which supersedes ADR-0002.'],
    ['section heading, parenthetical', '### Observability and deployment (M08)'],
    ['deferred, past tense', 'M08 and M99 both deferred this for the same reason.'],
    ['answered', 'M08 answered that with a real FTS5 index rather than a separate store.'],
  ];

  for (const [name, body] of allowed) {
    it(`allows: ${name}`, () => {
      writeLedger();
      const doc = writeDoc(body);
      expect(checkDocDrift(root, [doc]).findings).toEqual([]);
    });
  }
});

describe('scope of the check', () => {
  it('says nothing about a milestone that is still open', () => {
    // Promising work to an unfinished milestone is exactly correct.
    writeLedger();
    const doc = writeDoc('Field masks and NDJSON pagination are **M99**.');
    expect(checkDocDrift(root, [doc]).findings).toEqual([]);
  });

  it('reports the document and line so the finding is actionable', () => {
    writeLedger();
    const doc = writeDoc(['# Title', '', 'Live updates are **M08**.'].join('\n'));
    const [finding] = checkDocDrift(root, [doc]).findings;
    expect(finding).toMatchObject({ doc, line: 3, milestone: 'M08' });
  });

  it('skips a document that does not exist rather than failing the run', () => {
    writeLedger();
    const { findings, checkedDocs } = checkDocDrift(root, ['does/not/exist.md']);
    expect(findings).toEqual([]);
    expect(checkedDocs).toBe(0);
  });

  it('checks the four documents AGENTS.md designates as ground truth', () => {
    // A list, not a glob — `.specs/` holds ADRs and journals that legitimately
    // describe the past and must never be checked this way.
    expect(CHECKED_DOCS).toEqual([
      'README.md',
      '.specs/product/architecture.md',
      '.specs/product/mission.md',
      '.specs/design/NAVIGATION.md',
    ]);
  });
});
