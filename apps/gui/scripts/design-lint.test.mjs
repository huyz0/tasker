#!/usr/bin/env node
/**
 * Tests for the design gate.
 *
 * `design-lint.mjs` decides whether the GUI ships, and until now nothing
 * checked that its rules fire — `DESIGN_LINT_ROOT` existed as a testing seam
 * that no test used. That is the same shape as the untested harness validator
 * M02 found: a gate nobody has ever seen fail is a gate you are trusting on
 * faith.
 *
 * Each case builds a throwaway GUI tree, plants exactly one defect, and asserts
 * the matching rule fires. A rule that cannot be made to fail enforces nothing.
 * The negative cases matter equally: a lint that flags correct code gets
 * disabled rather than obeyed.
 *
 *   node scripts/design-lint.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'design-lint.mjs');

/** Runs the gate over a temporary tree containing one component. */
/**
 * A minimal but valid stylesheet: the contrast check needs a :root token block
 * to compare, and reports its absence as a finding — correctly, since a GUI
 * with no tokens is broken. These values are AA-passing so a fixture never
 * fails for a reason the test is not about.
 */
const BASE_CSS = `:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 10%;
  --muted-foreground: 0 0% 35%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 10%;
}
@media (prefers-reduced-motion: reduce) { * { animation: none } }`;

function lint(componentSource, { only = null, css = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'design-lint-'));
  try {
    mkdirSync(join(root, 'src', 'features'), { recursive: true });
    writeFileSync(join(root, 'src', 'index.css'), css || BASE_CSS);
    writeFileSync(join(root, 'src', 'features', 'Thing.tsx'), componentSource);

    const args = [SCRIPT, '--json', ...(only ? ['--only', only] : [])];
    try {
      const out = execFileSync('node', args, { env: { ...process.env, DESIGN_LINT_ROOT: root }, encoding: 'utf8' });
      return JSON.parse(out).findings;
    } catch (err) {
      // Exit code 1 means findings, which is the normal path for these tests.
      if (err.stdout) return JSON.parse(err.stdout).findings;
      throw err;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const rules = (findings) => findings.map((f) => f.rule);

test('fabrication: flags a hardcoded status badge', () => {
  const found = lint(`export const T = () => <span className="px-2">WORKING</span>;`, { only: 'fabrication' });
  assert.equal(found.length, 1);
  assert.match(found[0].msg, /schema stores no such state/);
});

test('fabrication: flags a hardcoded priority chip', () => {
  const found = lint(`export const T = () => <span>High Priority</span>;`, { only: 'fabrication' });
  assert.deepEqual(rules(found), ['fabrication']);
});

test('fabrication: does NOT flag a conditionally rendered Active label', () => {
  // The Organizations tree marks the selected org "Active", which is real
  // state. An early version of this rule flagged it. A rule that is wrong gets
  // disabled rather than obeyed, so this case is pinned.
  const found = lint(
    `export const T = ({ sel }: { sel: boolean }) => <>{sel && <span>Active</span>}</>;`,
    { only: 'fabrication' },
  );
  assert.deepEqual(found, []);
});

test('fabrication: does NOT flag a status that comes from data', () => {
  const found = lint(`export const T = ({ a }: { a: { status: string } }) => <span>{a.status}</span>;`, { only: 'fabrication' });
  assert.deepEqual(found, []);
});

test('fabrication: honours the escape hatch with a reason', () => {
  const found = lint(
    `export const T = () => (
  <>
    {/* design-lint-disable-next-line fabrication — legend for the key, not a value */}
    <span>WORKING</span>
  </>
);`,
    { only: 'fabrication' },
  );
  assert.deepEqual(found, []);
});

test('tokens: flags a raw hex colour', () => {
  const found = lint(`export const T = () => <div style={{ color: '#ff0000' }} />;`, { only: 'tokens' });
  assert.ok(found.length >= 1, 'expected a raw hex to be caught');
});

test('tokens: accepts a semantic token utility', () => {
  const found = lint(`export const T = () => <div className="bg-card text-foreground" />;`, { only: 'tokens' });
  assert.deepEqual(found, []);
});

test('wig: flags outline-none with no focus replacement', () => {
  const found = lint(`export const T = () => <input className="outline-none" />;`, { only: 'wig' });
  assert.ok(found.some((f) => /focus/.test(f.msg)), `expected a focus finding, got ${JSON.stringify(found)}`);
});

test('wig: accepts outline-none paired with a focus ring', () => {
  const found = lint(`export const T = () => <input className="outline-none focus:ring-2" />;`, { only: 'wig' });
  assert.deepEqual(found, []);
});

test('wig: flags a click handler on a div', () => {
  const found = lint(`export const T = () => <div onClick={() => {}}>x</div>;`, { only: 'wig' });
  assert.ok(found.some((f) => /use <button>/.test(f.msg)));
});

test('reduced motion: flags animation when the stylesheet has no escape', () => {
  const found = lint(`export const T = () => <div className="animate-pulse" />;`, { only: 'wig', css: ':root { --background: 0 0% 100%; --foreground: 0 0% 10%; }' });
  assert.ok(found.some((f) => /reduced/i.test(f.msg)), `expected a reduced-motion finding, got ${JSON.stringify(found)}`);
});

test('a clean component produces no findings at all', () => {
  const found = lint(`export const T = ({ n }: { n: string }) => <button className="bg-card text-foreground">{n}</button>;`);
  assert.deepEqual(found, []);
});
