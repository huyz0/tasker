import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The gate itself needs a browser and a built Storybook, so running it here
 * would cost minutes inside a check that must stay fast — the same trade-off
 * `storybook-a11y.test.mjs` makes. What these tests pin is everything that
 * would turn it into a gate that cannot fail: two controls were unreachable at
 * 375px before any gate existed to catch that, silently, because `main` hides
 * horizontal overflow rather than scrolling it into view.
 */
const DIR = dirname(fileURLToPath(import.meta.url));
const GUI = join(DIR, '..');
const source = readFileSync(join(DIR, 'mobile-overflow.mjs'), 'utf8');

test('measures at 375px, the width the design-review skill and ui-ux-standard both name', () => {
  assert.match(source, /WIDTH\s*=\s*375/);
});

test('the gate exits non-zero when something overflows', () => {
  assert.match(source, /failures\.length === 0[\s\S]*?process\.exit\(0\)/);
  assert.match(source, /process\.exit\(1\)/);
});

test('it runs in a real browser, because overflow needs layout', () => {
  // jsdom has no layout — every element reports a zero-size bounding rect,
  // so a jsdom run would find nothing to overflow and pass for no reason.
  assert.match(source, /from 'playwright'/);
  assert.match(source, /chromium\.launch/);
});

test('it waits for the story to render before measuring', () => {
  assert.match(source, /waitForSelector\('#storybook-root > \*'/);
});

test('a deliberate horizontal scroller is exempt, not a violation', () => {
  // The Tasks board's `overflow-x-auto` columns are meant to run past the
  // viewport on a phone; only an element with no scrolling ancestor to reach
  // it through is unreachable, which is the actual defect.
  assert.match(source, /overflowX === 'auto'/);
});

test('moon runs it in CI, sharing the Storybook build storybook-a11y already needs', () => {
  const moon = readFileSync(join(GUI, 'moon.yml'), 'utf8');
  const task = /storybook-test:[\s\S]*?(?=\n  \w+:)/.exec(moon);
  assert.ok(task, 'no storybook-test task in moon.yml');
  assert.match(task[0], /mobile-overflow\.mjs/);
  assert.match(task[0], /runInCI:\s*true/);
});

test('CI invokes the task that runs this gate', () => {
  const ci = join(GUI, '..', '..', '.github', 'workflows', 'ci.yml');
  assert.ok(existsSync(ci), 'ci.yml not found');
  const workflow = readFileSync(ci, 'utf8');
  assert.match(workflow, /moon run gui:storybook-test/);
});
