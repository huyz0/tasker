#!/usr/bin/env node
/**
 * M05's first exit criterion: every RPC in the contract is either called by the
 * GUI, or listed here as an exception with a reason.
 *
 * A one-off audit answers that once. This answers it on every build, because
 * the interesting case is the *next* RPC — one added in M07 and reachable only
 * from the CLI is the same defect this milestone spent itself removing, and
 * nobody would notice until someone repeated the audit by hand.
 *
 * An exception has to say why. "Agent-only" and "the GUI has no use for it" are
 * both legitimate answers; silence is not.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONTRACT = process.env.RPC_COVERAGE_CONTRACT ?? join(HERE, '../../../packages/shared-contract/main.tsp');
export const GUI_SRC = process.env.RPC_COVERAGE_SRC ?? join(HERE, '../src');

/**
 * RPCs the GUI deliberately does not call. Each entry is a reason, and the
 * reason is the point: an entry added to silence this check without one is
 * visible in review.
 */
export const EXCEPTIONS = {
  'TaskNoteService.createTaskNote':
    'Agent-only by design. task_notes.agent_id is NOT NULL, so a note has no ' +
    'human author; M04 made the handler refuse a user principal outright, ' +
    'rather than let a human file a note under a worker that never wrote it. ' +
    'The GUI reads, edits and deletes notes.',
  'TaskService.claimTask':
    'Agent self-service (M14-T06). A human already has assignTask through ' +
    'the assignee picker, which can name anyone; claimTask is the narrower ' +
    "atomic \"assign me, only if unassigned\" primitive an autonomous agent " +
    'needs and a person driving the GUI does not - a human choosing to take ' +
    'a task themselves already has a picker for that. If a self-assign ' +
    'button is ever added to the task detail view, wire it to this RPC ' +
    'rather than assignTask(self) and remove this exception.',
  'ProjectTemplateService.getTemplate':
    'Redundant here: the templates list is already loaded wherever a template ' +
    'is shown, so a single-template read would be a second request for data ' +
    'the client already holds. Agents and the CLI, which hold no list, use it. ' +
    '(getProject was excepted for this reason too until M06-T08 gave the task ' +
    'breadcrumb a project name to resolve from an id alone.)',
  'AuthService.adminResetPassword':
    'M13-T10 added the RPC for an admin to reset a member with no working ' +
    'credential; M13-T12 (features/Settings/AccountSettings.tsx) only ' +
    'covers a user managing their own password/linked identities, and no ' +
    "other M13 task names an admin-facing caller for this one - it's a " +
    'real gap, not yet scheduled. Wire it into the Organizations member ' +
    'list (an admin action per row, alongside role/remove) and remove this ' +
    'exception when that lands.',
  'TaskNoteService.listHandoffNotes':
    'M22-T02 added the RPC ahead of its GUI caller, same sequencing as ' +
    'every other milestone here (contract lands before the screen that ' +
    'calls it). M22-T05 wires this into the new features/Handoffs/ screen ' +
    'and removes this exception then.',
};

/** RPC names per service, read from the TypeSpec interfaces. */
export function readContractRpcs(contractPath = CONTRACT) {
  const tsp = readFileSync(contractPath, 'utf8');
  const rpcs = [];
  for (const [, service, body] of tsp.matchAll(/interface (\w+) \{([\s\S]*?)\n\}/g)) {
    for (const [, method] of body.matchAll(/\n  (\w+)\(/g)) rpcs.push(`${service}.${method}`);
  }
  return rpcs;
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    // Tests and stories do not count: a mocked call proves nothing about what
    // the application reaches.
    else if (/\.tsx?$/.test(entry) && !/\.(test|stories)\./.test(entry)) out.push(full);
  }
  return out;
}

export function findUncalled({ contractPath = CONTRACT, srcDir = GUI_SRC, exceptions = EXCEPTIONS } = {}) {
  const blob = sourceFiles(srcDir).map((f) => readFileSync(f, 'utf8')).join('\n');
  const called = new Set();
  for (const [, method] of blob.matchAll(/\.(\w+)\s*\(/g)) called.add(method);

  const uncalled = [];
  const staleExceptions = [];
  for (const rpc of readContractRpcs(contractPath)) {
    const method = rpc.split('.')[1];
    const excused = Object.prototype.hasOwnProperty.call(exceptions, rpc);
    if (called.has(method)) {
      // An exception for something the GUI now calls is a stale note that will
      // outlive its reason.
      if (excused) staleExceptions.push(rpc);
    } else if (!excused) {
      uncalled.push(rpc);
    }
  }
  return { uncalled, staleExceptions };
}

export function report({ uncalled, staleExceptions }) {
  const lines = [];
  for (const rpc of uncalled) {
    lines.push(`${rpc} is in the contract but nothing in the GUI calls it. Wire it up, or add it to EXCEPTIONS with a reason.`);
  }
  for (const rpc of staleExceptions) {
    lines.push(`${rpc} is listed in EXCEPTIONS but the GUI calls it. Remove the exception.`);
  }
  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = findUncalled();
  const lines = report(result);
  if (lines.length > 0) {
    console.error('✗ RPC coverage\n');
    for (const line of lines) console.error(`  ${line}`);
    process.exit(1);
  }
  const total = readContractRpcs().length;
  console.log(`✓ RPC coverage — ${total - Object.keys(EXCEPTIONS).length} of ${total} RPCs reached from the GUI, ${Object.keys(EXCEPTIONS).length} excepted with reasons`);
}
