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
import { availableParallelism } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const STATIC = join(ROOT, 'storybook-static');
// Resolved through the package, not a guessed path: bun links workspace
// dependencies into `apps/gui/node_modules` as symlinks into `.bun`, so a
// hand-written `../../node_modules/axe-core` is wrong here. `axe-core` is a
// direct devDependency of `apps/gui/package.json` for exactly this
// `require.resolve` to work reliably - it was already installed
// transitively via `@storybook/addon-a11y`, but a transitive copy isn't
// guaranteed to land somewhere `require.resolve` can walk up to from this
// package's own directory in every install topology: it resolved locally
// but not in a clean CI install, which never surfaced until this script
// actually ran against a real story set there (M06-T13's own gate had
// been silently failing in CI - `Cannot find module 'axe-core/package.json'`
// - since at least this repo's M21).
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

/**
 * Stories are audited several at a time, each on its own page.
 *
 * Measured before changing it: ~7s per story, and only 1.1x of that was the
 * `networkidle` wait below — the rest is loading and executing Storybook's
 * runtime plus the story's own chunk, then running axe over the result. That
 * is CPU-bound work on an otherwise idle machine, so the loop was serial for
 * no reason other than how it was written, and 94 stories × 2 gates × 7s is
 * what made this a 20-minute CI step.
 *
 * Pages, not browsers or contexts: a page is the cheapest unit that still
 * gets its own navigation, and nothing here touches cookies or storage, so
 * there is nothing to isolate between stories. Capped at 4 because CI runs
 * this on a 4-vCPU runner and the work is CPU-bound — more pages than cores
 * would just add contention.
 */
const CONCURRENCY = Number(process.env.STORYBOOK_CHECK_CONCURRENCY)
  || Math.max(2, Math.min(4, availableParallelism() - 1));

const pages = await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // Several stories (any screen/component with a real, unconditional useQuery
    // on mount and no MSW to answer it - CurrentUser, OrgProjectSwitcher,
    // Dashboard, TaskTypesEditor, BinDashboard, SystemHealthPage, and others)
    // fire a real createClient(...) call against BACKEND_URL
    // (src/lib/backendUrl.ts). Nothing listens on that port here, and in this
    // environment a fetch to a closed local port does not fail fast - it hangs
    // indefinitely rather than rejecting, which never lets `networkidle`
    // resolve and times out the whole run on the first such story. Aborting it
    // at the network layer makes it fail immediately instead, matching what a
    // real "backend unreachable" state looks like without needing every story
    // to route around this environment's own quirk individually.
    await page.route('http://localhost:8080/**', (route) => route.abort());
    return page;
  }),
);

const failures = [];
// A shared cursor rather than fixed per-page slices: story cost varies by an
// order of magnitude (a Badge against a whole Dashboard), so a static split
// leaves one page still working while the rest sit idle.
let cursor = 0;

async function auditStories(page) {
  for (;;) {
    const story = stories[cursor++];
    if (!story) return;

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
}

await Promise.all(pages.map(auditStories));

// Pages finish out of order, so without this the report reshuffles between
// runs on an unchanged tree - noise when diffing two CI logs.
failures.sort((a, b) => a.story.localeCompare(b.story) || a.id.localeCompare(b.id));

await browser.close();
server.close();

if (failures.length === 0) {
  // Reports the page count too: it is derived from the machine, so this is
  // the only way to see what CI actually chose without guessing at the
  // runner's core count.
  console.log(`✓ storybook a11y — ${stories.length} stories, 0 violations (${CONCURRENCY} pages)`);
  process.exit(0);
}

console.error(`✗ storybook a11y — ${failures.length} violation(s) across ${stories.length} stories\n`);
for (const f of failures) {
  console.error(`  ${f.story}`);
  console.error(`    [${f.id}] ${f.help} (${f.impact})`);
  for (const n of f.nodes) console.error(`      → ${n}`);
}
process.exit(1);
