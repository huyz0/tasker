#!/usr/bin/env bun
/**
 * Fails when a document designated as ground truth says a **closed** milestone
 * still owns unbuilt work.
 *
 * `AGENTS.md` tells every session to read `README.md` first and treat `.specs/`
 * as authoritative. M02 exists to make that true; by M26 it had lapsed badly
 * enough that the two most-read documents described a product eight milestones
 * behind the code — "the GUI is not real-time", "teams have no table in the
 * schema yet", "there is no subscriber anywhere in the repository". Every one
 * was false, and nothing noticed, because `tech-stack.md` was the only one of
 * those documents with a gate.
 *
 * Prose staleness is not decidable in general: nothing here can know whether
 * "the CLI has no TUI" is still true. What it *can* know is that a document
 * promises work which has since shipped — and that described nearly all of the
 * drift M27 found, because these documents cite the milestone owning each gap.
 * ADR-0024 records the options weighed and, importantly, what this deliberately
 * does not catch.
 *
 *   moon run :doc-drift
 *
 * Exit 0 in agreement · 1 drift found · 2 the check itself could not run.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkMilestoneTruth, type TruthFinding } from './milestone-truth';

/**
 * The documents an agent session is told to trust. A hand-written list, not a
 * glob: "designated ground truth" is a judgement about which files mislead a
 * reader, and `.specs/` holds plenty of files that legitimately describe the
 * past (ADRs, milestone journals) and must never be checked this way.
 */
export const CHECKED_DOCS = [
  'README.md',
  '.specs/product/architecture.md',
  '.specs/product/mission.md',
  '.specs/design/NAVIGATION.md',
];

/**
 * The constructions that read as *pending ownership* — "this milestone will
 * build this". Each capture group 1 is the milestone id.
 *
 * Everything not listed here is left alone, and deliberately: historical
 * attribution is legitimate and frequent in these files — `(M09-T02/T03)`
 * citing what built a thing, `M08's streaming endpoint`, `Delivered by M04`,
 * `ADR-0004, whose "until M11" this discharges`. A checker that flagged those
 * would be switched off within a week, and then it would be protecting
 * nothing.
 */
const PENDING_PATTERNS: { name: string; re: RegExp }[] = [
  // "live updates are **M08**", "That is M04", "A real search path is **M07**"
  { name: 'is/are <milestone>', re: /\b(?:is|are)\s+\*{0,2}(M\d{2})\*{0,2}(?![\w-])/g },
  // "**M05** owns the call", "M08 adds subscribers", "M07 decides between"
  { name: '<milestone> owns/adds/builds/decides', re: /\*{0,2}(M\d{2})\*{0,2}\s+(?:owns|adds|builds|decides|will)\b/g },
  // "Measured numbers are owed by **M07**"
  { name: 'owed by <milestone>', re: /owed by\s+\*{0,2}(M\d{2})\*{0,2}/g },
  // "### CQRS with a separate read store — **M07**" (heading, trailing owner)
  { name: 'heading — <milestone>', re: /^#{1,6}\s.*[—-]\s*\*{0,2}(M\d{2})\*{0,2}\s*(?:,\s*\*{0,2}M\d{2}\*{0,2}\s*)*$/gm },
];

type Finding = {
  doc: string;
  line: number;
  milestone: string;
  pattern: string;
  text: string;
};

export type Result = {
  findings: Finding[];
  checkedDocs: number;
  closedMilestones: number;
};

/**
 * Milestone id → whether the ledger records it as done.
 *
 * Read from `STATE.md`'s ledger table, which is the same source
 * `/milestone-status` reports from. A milestone absent from the ledger is
 * treated as *not* closed, so a reference to work that has not been planned
 * yet never trips this.
 */
export function readClosedMilestones(root: string): Set<string> {
  const statePath = join(root, '.milestones/STATE.md');
  if (!existsSync(statePath)) throw new Error(`missing ${statePath}`);
  const closed = new Set<string>();
  for (const line of readFileSync(statePath, 'utf8').split('\n')) {
    // | M08 | Events, Audit & Real-Time | done | ... |
    const m = /^\|\s*(M\d{2})\s*\|[^|]*\|\s*([a-z-]+)\s*\|/i.exec(line);
    if (m && m[2]!.trim().toLowerCase() === 'done') closed.add(m[1]!);
  }
  if (closed.size === 0) throw new Error('no closed milestones found in STATE.md — is the ledger table intact?');
  return closed;
}

export function checkDocDrift(root: string, docs: string[] = CHECKED_DOCS): Result {
  const closed = readClosedMilestones(root);
  const findings: Finding[] = [];
  let checkedDocs = 0;

  for (const doc of docs) {
    const path = join(root, doc);
    if (!existsSync(path)) continue; // a document that does not exist cannot mislead anyone
    checkedDocs++;
    const lines = readFileSync(path, 'utf8').split('\n');

    for (const { name, re } of PENDING_PATTERNS) {
      // The heading pattern is multiline-anchored, so it is matched against the
      // whole file; the rest are matched per line to report a line number.
      if (re.flags.includes('m')) {
        const text = lines.join('\n');
        for (const m of text.matchAll(re)) {
          const milestone = m[1]!;
          if (!closed.has(milestone)) continue;
          const line = text.slice(0, m.index).split('\n').length;
          findings.push({ doc, line, milestone, pattern: name, text: m[0]!.trim() });
        }
        continue;
      }
      lines.forEach((content, i) => {
        for (const m of content.matchAll(re)) {
          const milestone = m[1]!;
          if (!closed.has(milestone)) continue;
          findings.push({ doc, line: i + 1, milestone, pattern: name, text: content.trim() });
        }
      });
    }
  }

  findings.sort((a, b) => a.doc.localeCompare(b.doc) || a.line - b.line);
  return { findings, checkedDocs, closedMilestones: closed.size };
}

if (import.meta.main) {
  const root = process.env.DOC_DRIFT_ROOT ?? join(import.meta.dir, '..');
  let result: Result;
  let truth: { findings: TruthFinding[]; milestones: number };
  try {
    result = checkDocDrift(root);
    // M34-T03: the milestone files themselves, against their boxes and the ledger.
    truth = checkMilestoneTruth(root);
  } catch (e) {
    console.error(`doc-drift could not run: ${(e as Error).message}`);
    process.exit(2);
  }

  if (truth.findings.length > 0) {
    console.error(`\n✗ milestone drift — ${truth.findings.length} finding(s)\n`);
    for (const f of truth.findings) console.error(`    ${f.where}  ${f.problem}`);
    console.error(
      '\n  → Make the frontmatter and the ledger say what the boxes say' +
      '\n    (.specs/standards/milestone-standard.md), or check the boxes the work earned.\n',
    );
  }

  const { findings, checkedDocs, closedMilestones } = result;
  if (findings.length === 0) {
    if (truth.findings.length > 0) process.exit(1);
    console.log(`✓ PASS — ${checkedDocs} documents checked against ${closedMilestones} closed milestones, 0 drift`);
    console.log(`✓ PASS — ${truth.milestones} milestone files agree with their boxes and the ledger`);
    process.exit(0);
  }

  console.error(`\n✗ documentation drift — ${findings.length} finding(s)\n`);
  console.error('  These documents say a closed milestone still owes work:\n');
  for (const f of findings) {
    console.error(`    ${f.doc}:${f.line}  ${f.milestone} is closed  [${f.pattern}]`);
    console.error(`      ${f.text.length > 100 ? `${f.text.slice(0, 100)}…` : f.text}`);
  }
  console.error(
    '\n  → Either describe what shipped (citing the code, per architecture.md\'s' +
    '\n    own rule), or re-attribute the sentence historically — "Delivered by' +
    '\n    M0N", "(M0N-T0N)" — which reads as a citation and is not flagged.\n',
  );
  process.exit(1);
}
