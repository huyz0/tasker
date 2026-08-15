#!/usr/bin/env node
/**
 * Runs axe over every story, in a real browser.
 *
 * The a11y addon was set to `test: 'todo'`, which reports violations to a panel
 * in the Storybook UI. That is indistinguishable from `off` for anyone who does
 * not open it: no run ever failed, so nothing was ever fixed. `error` only means
 * something if something actually runs the stories — this is that something
 * (M06-T13).
 *
 * A real browser rather than jsdom, because the rule this gate exists to catch
 * is `color-contrast`, and axe cannot evaluate it without layout and computed
 * colour. jsdom has neither, so a jsdom run reports contrast as `incomplete`
 * and passes — a gate that cannot fail.
 *
 * Deliberately built from what is already installed: `storybook build`,
 * `playwright`, `axe-core`, and node's own http server. Storybook's Vitest addon
 * would want `@vitest/browser`, and adding a dependency is not this task's call.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, extname, resolve, dirname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const STATIC = join(ROOT, 'storybook-static');
// Resolved through the package, not a guessed path: bun links workspace
// dependencies into `apps/gui/node_modules` as symlinks into `.bun`, so a
// hand-written `../../node_modules/axe-core` is wrong here.
const require = createRequire(join(ROOT, 'package.json'));
const AXE = join(dirname(require.resolve('axe-core/package.json')), 'axe.min.js');

if (!existsSync(STATIC)) {
  console.error(`✗ ${STATIC} does not exist — run \`bunx storybook build -o storybook-static\` first.`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.map': 'application/json',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  let file = join(STATIC, path === '/' ? 'index.html' : path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const index = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'));
const stories = Object.values(index.entries).filter((e) => e.type === 'story');
const axeSource = readFileSync(AXE, 'utf8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const failures = [];
for (const story of stories) {
  await page.goto(`${base}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  // Storybook renders asynchronously; a story measured before it paints has
  // nothing for axe to look at and passes for the wrong reason.
  await page.waitForSelector('#storybook-root > *', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(250);

  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () =>
    // eslint-disable-next-line no-undef
    await window.axe.run('#storybook-root', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }),
  );

  for (const v of result.violations) {
    failures.push({
      story: story.title ? `${story.title} › ${story.name}` : story.id,
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    });
  }
}

await browser.close();
server.close();

if (failures.length === 0) {
  console.log(`✓ storybook a11y — ${stories.length} stories, 0 violations`);
  process.exit(0);
}

console.error(`✗ storybook a11y — ${failures.length} violation(s) across ${stories.length} stories\n`);
for (const f of failures) {
  console.error(`  ${f.story}`);
  console.error(`    [${f.id}] ${f.help} (${f.impact})`);
  for (const n of f.nodes) console.error(`      → ${n}`);
}
process.exit(1);
