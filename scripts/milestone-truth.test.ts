import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMilestoneTruth, parseMilestone } from './milestone-truth';

/**
 * A gate that cannot be made to fail enforces nothing (`spec-drift.test.ts`).
 * Every rule below is shown failing on a fixture that makes the contradiction
 * M34 found in the real repository, and the consistent fixtures — including an
 * in-progress milestone and a dropped task — are shown passing, because a gate
 * that blocks legitimate states gets switched off.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'milestone-truth-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

type Spec = {
  id?: string;
  status?: string;
  met?: boolean;
  completed?: string | null;
  criteria?: string[];
  tasks?: string[];
};

function milestone(folder: string, s: Spec = {}) {
  const dir = join(root, '.milestones', folder);
  mkdirSync(dir, { recursive: true });
  const criteria = s.criteria ?? ['x'];
  const tasks = s.tasks ?? ['x', 'x'];
  writeFileSync(join(dir, 'MILESTONE.md'), [
    '---',
    `id: ${s.id ?? `M${folder.slice(10, 12)}`}`,
    'title: Fixture',
    `status: ${s.status ?? 'done'}`,
    `exit_criteria_met: ${s.met ?? true}`,
    `completed_at: ${s.completed === undefined ? '2026-10-02' : s.completed}`,
    '---',
    '',
    '## 3. Exit Criteria',
    '',
    ...criteria.map((c, i) => `- [${c}] criterion ${i}`),
    '',
    '## 5. Task Breakdown',
    '',
    ...tasks.flatMap((t, i) => [`- [${t}] **T0${i}** — task`, '  - [ ] a nested sub-step is not a task']),
    '',
    '## 6. Verification',
    '',
    '- [ ] a box outside the two sections is not counted',
  ].join('\n'));
}

function ledger(rows: string[], total: string) {
  mkdirSync(join(root, '.milestones'), { recursive: true });
  writeFileSync(join(root, '.milestones/STATE.md'), [
    '## Now',
    '',
    '| M01 | not the ledger | todo | — | 9 | 9 |',
    '',
    '## Milestone ledger',
    '',
    '| ID  | Milestone | Status | Depends on | Tasks | Done |',
    '|-----|-----------|--------|------------|-------|------|',
    ...rows,
    '',
    total,
  ].join('\n'));
}

const problems = () => checkMilestoneTruth(root).findings.map((f) => f.problem);

describe('parseMilestone', () => {
  it('counts top-level boxes in the two sections only, with [~] as dropped', () => {
    const f = parseMilestone('MILESTONE-01-x', [
      '---', 'id: M01', 'status: done', 'exit_criteria_met: true', 'completed_at: null', '---',
      '## 3. Exit Criteria', '- [x] a', '- [ ] b', '  - [x] nested',
      '## 5. Task Breakdown', '- [x] t1', '- [~] t2', '- [X] t3',
      '## 6. Verification', '- [ ] v',
    ].join('\n'));
    expect(f.criteria).toEqual({ checked: 1, open: 1, dropped: 0 });
    expect(f.tasks).toEqual({ checked: 2, open: 0, dropped: 1 });
    expect(f.completedAt).toBeUndefined();
  });
});

describe('checkMilestoneTruth', () => {
  it('passes consistent done, in-progress and dropped-task milestones', () => {
    milestone('MILESTONE-01-a');
    milestone('MILESTONE-02-b', { status: 'in-progress', met: false, completed: null, criteria: ['x', ' '], tasks: ['x', ' '] });
    milestone('MILESTONE-03-c', { tasks: ['x', '~'] });
    ledger([
      '| M01 | A | done        | — | 2 | 2 |',
      '| M02 | B | in-progress | — | 2 | 1 |',
      '| M03 | C | done        | — | 2 | 1 |',
    ], '**Total: 6 tasks across 3 milestones — 4 done, 1 dropped.**');
    expect(problems()).toEqual([]);
  });

  it('fails a todo over checked tasks with criteria claimed met (the M08 case)', () => {
    milestone('MILESTONE-01-a', { status: 'todo', met: true, completed: null, criteria: [' '] });
    ledger(['| M01 | A | todo | — | 2 | 2 |'], '**Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**');
    const p = problems();
    expect(p).toContain('status todo with 2 checked task(s)');
    expect(p).toContain('exit_criteria_met: true over 1 unchecked criterion/criteria');
  });

  it('fails done over unchecked criteria (the M10 case)', () => {
    milestone('MILESTONE-01-a', { criteria: [' ', ' '] });
    ledger(['| M01 | A | done | — | 2 | 2 |'], '**Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**');
    expect(problems()).toContain('status done with 2 unchecked exit criterion/criteria');
  });

  it('fails done with an open task, criteria not met or no completion date', () => {
    milestone('MILESTONE-01-a', { met: false, completed: null, tasks: ['x', ' '] });
    ledger(['| M01 | A | done | — | 2 | 1 |'], '**Total: 2 tasks across 1 milestones — 1 done, 0 dropped.**');
    const p = problems();
    expect(p).toContain('status done with 1 unchecked task(s)');
    expect(p).toContain('status done but exit_criteria_met is not true');
    expect(p).toContain('status done but completed_at is not set');
  });

  it('fails a status the standard does not allow (the M21–M23 case)', () => {
    milestone('MILESTONE-01-a', { status: 'complete' });
    ledger(['| M01 | A | complete | — | 2 | 2 |'], '**Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**');
    expect(problems()[0]).toMatch(/^status "complete" is not one of/);
  });

  it('fails a completion date on a milestone that is not done', () => {
    milestone('MILESTONE-01-a', { status: 'in-progress', met: false });
    ledger(['| M01 | A | in-progress | — | 2 | 2 |'], '**Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**');
    expect(problems()).toEqual(['completed_at set but status is in-progress']);
  });

  it('fails an id that does not match its folder', () => {
    milestone('MILESTONE-01-a', { id: 'M02' });
    ledger(['| M02 | A | done | — | 2 | 2 |'], '**Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**');
    expect(problems()).toEqual(['id M02 does not match folder M01']);
  });

  it('fails a ledger row that miscounts or misstates the file (the M12 case)', () => {
    milestone('MILESTONE-01-a', { tasks: ['x', 'x', 'x'] });
    ledger(['| M01 | A | in-progress | — | 2 | 1 |'], '**Total: 2 tasks across 1 milestones — 1 done, 0 dropped.**');
    expect(problems()).toEqual([
      'ledger says in-progress, file says done',
      'ledger Tasks 2, file has 3 task boxes',
      'ledger Done 1, file has 3 checked',
    ]);
  });

  it('fails a milestone with no ledger row, and a row with no milestone', () => {
    milestone('MILESTONE-01-a');
    ledger(['| M02 | B | done | — | 2 | 2 |'], '**Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**');
    expect(problems()).toEqual(['no ledger row for M01 in STATE.md', 'ledger row M02 has no MILESTONE.md']);
  });

  it('fails a total line that disagrees with the rows or the dropped count', () => {
    milestone('MILESTONE-01-a', { tasks: ['x', '~'] });
    ledger(['| M01 | A | done | — | 2 | 1 |'], '**Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**');
    expect(problems()).toEqual([
      'total line should read **Total: 2 tasks across 1 milestones — 1 done, 1 dropped.** ' +
        '(found **Total: 2 tasks across 1 milestones — 2 done, 0 dropped.**)',
    ]);
  });

  it('refuses to run rather than passing vacuously', () => {
    expect(() => checkMilestoneTruth(root)).toThrow(/missing/);
    ledger([], '');
    expect(() => checkMilestoneTruth(root)).toThrow(/no MILESTONE/);
    milestone('MILESTONE-01-a');
    expect(() => checkMilestoneTruth(root)).toThrow(/no rows/);
  });

  it('passes on this repository', () => {
    const r = checkMilestoneTruth(join(import.meta.dir, '..'));
    expect(r.findings).toEqual([]);
    expect(r.milestones).toBeGreaterThan(20);
  });
});
