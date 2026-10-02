#!/usr/bin/env bun
/**
 * Fails when a `MILESTONE.md` claims a state its own checkboxes contradict, or
 * when the STATE ledger disagrees with the files it summarises.
 *
 * `.milestones/` is the handoff every session trusts first (`AGENTS.md` §2).
 * By M34 it had drifted in exactly the ways a reader cannot spot: M08 said
 * `todo` over 11/11 checked tasks, M10 said its criteria were met over 0/8
 * checked boxes, M21–M23 used a status the standard does not allow, and M12's
 * ledger row counted one task fewer than its file. `doc-drift` read the ledger
 * and never opened a milestone file, so none of it could fail a build.
 *
 * What this checks is only what a claim makes contradictory — never prose:
 *
 *   - `status` is one the standard allows (todo · in-progress · blocked · done)
 *     and `id` matches the folder.
 *   - `done` → no unchecked task or criterion, `exit_criteria_met: true`,
 *     `completed_at` set.
 *   - `exit_criteria_met: true` → no unchecked criterion.
 *   - `todo` → no checked task. `completed_at` set → `done`.
 *   - The ledger row exists and agrees: status, Tasks = every task box,
 *     Done = checked task boxes. `[~]` (dropped) counts as resolved.
 *   - The ledger's total line agrees with the rows and the files.
 *
 * Run through `scripts/doc-drift.ts` (`moon run :doc-drift`).
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED_STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const;

type Boxes = { checked: number; open: number; dropped: number };

export type MilestoneFile = {
  folder: string;
  id: string | undefined;
  status: string | undefined;
  exitCriteriaMet: boolean;
  completedAt: string | undefined;
  criteria: Boxes;
  tasks: Boxes;
};

type LedgerRow = { id: string; status: string; tasks: number; done: number };

export type TruthFinding = { where: string; problem: string };

function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1]!.split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]!] = kv[2]!.trim();
  }
  return out;
}

/** Top-level checkboxes in the `## N. <title>` section. Nested ones are sub-steps. */
function countBoxes(text: string, title: string): Boxes {
  const boxes: Boxes = { checked: 0, open: 0, dropped: 0 };
  let inSection = false;
  for (const line of text.split('\n')) {
    if (/^## /.test(line)) {
      inSection = new RegExp(`^##\\s+(?:\\d+\\.\\s+)?${title}\\s*$`, 'i').test(line);
      continue;
    }
    if (!inSection) continue;
    const m = /^- \[([ xX~])\]/.exec(line);
    if (!m) continue;
    if (m[1] === ' ') boxes.open++;
    else if (m[1] === '~') boxes.dropped++;
    else boxes.checked++;
  }
  return boxes;
}

export function parseMilestone(folder: string, text: string): MilestoneFile {
  const fm = frontmatter(text);
  const completed = fm.completed_at;
  return {
    folder,
    id: fm.id,
    status: fm.status,
    exitCriteriaMet: fm.exit_criteria_met === 'true',
    completedAt: completed && completed !== 'null' ? completed : undefined,
    criteria: countBoxes(text, 'Exit Criteria'),
    tasks: countBoxes(text, 'Task Breakdown'),
  };
}

function readLedger(stateText: string): { rows: LedgerRow[]; total: string | undefined } {
  const at = stateText.indexOf('## Milestone ledger');
  if (at < 0) throw new Error('no "## Milestone ledger" section in STATE.md');
  const section = stateText.slice(at);
  const rows: LedgerRow[] = [];
  for (const line of section.split('\n')) {
    const m = /^\|\s*(M\d{2})\s*\|[^|]*\|\s*([a-z-]+)\s*\|[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/i.exec(line);
    if (m) rows.push({ id: m[1]!, status: m[2]!.toLowerCase(), tasks: Number(m[3]), done: Number(m[4]) });
  }
  const total = /\*\*Total:[^*]*\*\*/.exec(section)?.[0];
  return { rows, total };
}

function checkMilestones(files: MilestoneFile[], stateText: string): TruthFinding[] {
  const findings: TruthFinding[] = [];
  const { rows, total } = readLedger(stateText);
  if (rows.length === 0) throw new Error('the ledger table has no rows — is it intact?');
  const ledger = new Map(rows.map((r) => [r.id, r]));
  let dropped = 0;

  for (const f of files) {
    const where = `${f.folder}/MILESTONE.md`;
    const say = (problem: string) => findings.push({ where, problem });
    dropped += f.tasks.dropped;

    const folderId = /^MILESTONE-(\d{2})/.exec(f.folder)?.[1];
    if (!f.id) say('no `id` in frontmatter');
    else if (folderId && f.id !== `M${folderId}`) say(`id ${f.id} does not match folder M${folderId}`);

    if (!f.status || !(ALLOWED_STATUSES as readonly string[]).includes(f.status)) {
      say(`status "${f.status ?? ''}" is not one of ${ALLOWED_STATUSES.join(', ')}`);
    }
    if (f.status === 'done') {
      if (f.tasks.open > 0) say(`status done with ${f.tasks.open} unchecked task(s)`);
      if (f.criteria.open > 0) say(`status done with ${f.criteria.open} unchecked exit criterion/criteria`);
      if (!f.exitCriteriaMet) say('status done but exit_criteria_met is not true');
      if (!f.completedAt) say('status done but completed_at is not set');
    }
    if (f.exitCriteriaMet && f.criteria.open > 0) {
      say(`exit_criteria_met: true over ${f.criteria.open} unchecked criterion/criteria`);
    }
    if (f.status === 'todo' && f.tasks.checked > 0) say(`status todo with ${f.tasks.checked} checked task(s)`);
    if (f.completedAt && f.status !== 'done') say(`completed_at set but status is ${f.status}`);

    if (!f.id) continue;
    const row = ledger.get(f.id);
    if (!row) {
      say(`no ledger row for ${f.id} in STATE.md`);
      continue;
    }
    ledger.delete(f.id);
    const boxes = f.tasks.checked + f.tasks.open + f.tasks.dropped;
    if (row.status !== f.status) say(`ledger says ${row.status}, file says ${f.status}`);
    if (row.tasks !== boxes) say(`ledger Tasks ${row.tasks}, file has ${boxes} task boxes`);
    if (row.done !== f.tasks.checked) say(`ledger Done ${row.done}, file has ${f.tasks.checked} checked`);
  }

  for (const id of ledger.keys()) findings.push({ where: '.milestones/STATE.md', problem: `ledger row ${id} has no MILESTONE.md` });

  const sumTasks = rows.reduce((n, r) => n + r.tasks, 0);
  const sumDone = rows.reduce((n, r) => n + r.done, 0);
  const expected = `**Total: ${sumTasks} tasks across ${rows.length} milestones — ${sumDone} done, ${dropped} dropped.**`;
  if (total !== expected) {
    findings.push({ where: '.milestones/STATE.md', problem: `total line should read ${expected} (found ${total ?? 'none'})` });
  }
  return findings;
}

export function checkMilestoneTruth(root: string): { findings: TruthFinding[]; milestones: number } {
  const dir = join(root, '.milestones');
  const statePath = join(dir, 'STATE.md');
  if (!existsSync(statePath)) throw new Error(`missing ${statePath}`);
  const files = readdirSync(dir)
    .filter((d) => /^MILESTONE-\d{2}/.test(d) && existsSync(join(dir, d, 'MILESTONE.md')))
    .sort()
    .map((d) => parseMilestone(d, readFileSync(join(dir, d, 'MILESTONE.md'), 'utf8')));
  if (files.length === 0) throw new Error('no MILESTONE-*/MILESTONE.md files found');
  return { findings: checkMilestones(files, readFileSync(statePath, 'utf8')), milestones: files.length };
}
