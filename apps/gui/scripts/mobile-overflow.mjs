#!/usr/bin/env node
/**
 * Fails when a story renders wider than a phone, in a real browser.
 *
 * `ui-ux-standard.md` has always said mobile-first; nothing checked it. Two
 * controls were unreachable at 375px before this existed — a filter input
 * fixed at 200px, and a row's Edit/Delete `shrink-0` beside a `min-w-[200px]`
 * name — and both were invisible rather than merely ugly: `AppShell`'s
 * `<main>` is `overflow-x-hidden`, so the overrun was not a horizontal
 * scrollbar a user could reach, it was a control that silently did not exist
 * below `md:`. A design review found both by accident; this makes finding
 * them not depend on a review happening to look.
 *
 * A deliberate horizontal scroller is not a violation of this — the Tasks
 * board's `overflow-x-auto` columns are meant to scroll sideways on a phone.
 * Only an element that overflows *without* a scrolling ancestor to reach it
 * through is a finding.
 *
 * Shares `storybook-static` with `storybook-a11y.mjs` rather than building it
 * twice — `moon.yml`'s `storybook-test` task runs both against one build.
 *
 *   bunx storybook build -o storybook-static --quiet
 *   node scripts/mobile-overflow.mjs
 *
 * Exit 0 clean · 1 an element overflows without a scroller · 2 script failure.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const STATIC = join(ROOT, 'storybook-static');
// The width `ui-ux-standard.md` §3 and `design-review`'s SKILL.md both name
// as the one that must be right, not the afterthought.
const WIDTH = 375;

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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, reducedMotion: 'reduce' });

/** Runs inside the page — no access to anything in this file's closure. */
function findOverflow(width) {
  const offenders = [];
  const root = document.getElementById('storybook-root') ?? document.body;
  for (const el of root.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.right <= width + 1) continue;
    let scrollable = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const overflowX = getComputedStyle(p).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') { scrollable = true; break; }
    }
    if (scrollable) continue;
    offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 80),
      text: (el.textContent || '').trim().slice(0, 40),
      right: Math.round(rect.right),
    });
  }
  return offenders;
}

const failures = [];
for (const story of stories) {
  await page.goto(`${base}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForSelector('#storybook-root > *', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(250);

  const offenders = await page.evaluate(findOverflow, WIDTH);
  // One offender per element is noise once the ancestor is already reported —
  // report only the widest handful, which is enough to find the source.
  if (offenders.length) {
    failures.push({
      story: story.title ? `${story.title} › ${story.name}` : story.id,
      offenders: offenders.sort((a, b) => b.right - a.right).slice(0, 3),
    });
  }
}

await browser.close();
server.close();

if (failures.length === 0) {
  console.log(`✓ mobile overflow — ${stories.length} stories, nothing wider than ${WIDTH}px`);
  process.exit(0);
}

console.error(`✗ mobile overflow — ${failures.length}/${stories.length} stor(y/ies) render wider than ${WIDTH}px\n`);
for (const f of failures) {
  console.error(`  ${f.story}`);
  for (const o of f.offenders) {
    console.error(`    <${o.tag} class="${o.cls}"> right=${o.right}px  "${o.text}"`);
  }
}
process.exit(1);
