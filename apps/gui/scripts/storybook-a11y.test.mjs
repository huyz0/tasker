import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The gate itself needs a browser and a built Storybook, so running it here
 * would cost four minutes inside a check that must stay fast. What these tests
 * pin is everything that would turn it into a gate that cannot fail — which is
 * exactly the state it replaced (`test: 'todo'` reporting to a panel nobody
 * opened).
 */
const DIR = dirname(fileURLToPath(import.meta.url));
const GUI = join(DIR, '..');
const source = readFileSync(join(DIR, 'storybook-a11y.mjs'), 'utf8');

test('the a11y addon is set to error, not todo or off', () => {
  const preview = readFileSync(join(GUI, '.storybook', 'preview.tsx'), 'utf8');
  const setting = /a11y:\s*\{[\s\S]*?test:\s*'([a-z]+)'/.exec(preview);
  assert.ok(setting, 'no a11y.test setting found in preview.tsx');
  assert.equal(setting[1], 'error');
});

test('the gate exits non-zero when there are violations', () => {
  // Without this it prints its findings and CI goes green anyway.
  assert.match(source, /failures\.length === 0[\s\S]*?process\.exit\(0\)/);
  assert.match(source, /process\.exit\(1\)/);
});

test('it runs in a real browser, because color-contrast needs layout', () => {
  // Under jsdom axe reports color-contrast as `incomplete` and the gate passes,
  // which is the one rule this exists to catch.
  assert.match(source, /from 'playwright'/);
  assert.match(source, /chromium\.launch/);
});

test('it waits for the story to render before measuring', () => {
  // A story measured before it paints gives axe an empty root, and an empty
  // root has no violations — a pass for the wrong reason.
  assert.match(source, /waitForSelector\('#storybook-root > \*'/);
});

test('it checks WCAG A and AA, not just best practices', () => {
  assert.match(source, /wcag2a['"][\s\S]*?wcag2aa/);
});

test('moon runs it in CI', () => {
  const moon = readFileSync(join(GUI, 'moon.yml'), 'utf8');
  const task = /storybook-test:[\s\S]*?(?=\n  \w+:)/.exec(moon);
  assert.ok(task, 'no storybook-test task in moon.yml');
  // `type: run` implies runInCI: false, which silently filters the target out.
  assert.match(task[0], /runInCI:\s*true/);
});

test('CI invokes the task and installs a browser for it', () => {
  const ci = join(GUI, '..', '..', '.github', 'workflows', 'ci.yml');
  assert.ok(existsSync(ci), 'ci.yml not found');
  const workflow = readFileSync(ci, 'utf8');
  assert.match(workflow, /moon run gui:storybook-test/);
  assert.match(workflow, /playwright install --with-deps chromium/);
});
