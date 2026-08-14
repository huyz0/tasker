#!/usr/bin/env node
/**
 * Capture a route across breakpoints and themes so an agent can actually look
 * at what it built.
 *
 * The single highest-leverage addition to agentic frontend work is a visual
 * verification loop — a model editing CSS it never sees is guessing. This turns
 * "it should look right" into an artefact that can be judged.
 *
 *   bun run scripts/screenshot.mjs /tasks
 *   bun run scripts/screenshot.mjs /tasks --widths 375,1280 --theme dark
 *   bun run scripts/screenshot.mjs /tasks --out .design/before
 *
 * Requires the dev server (`moon run :dev`) and `bunx playwright install
 * chromium`. Writes PNGs and prints their paths; read them with the Read tool.
 *
 * Exit 0 captured · 1 no server or no browser · 2 script failure.
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const route = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true) ?? '/';
const base = flag('base', 'http://localhost:5173');
const outDir = resolve(flag('out', '.design/shots'));
// Mobile, the tablet breakpoint, and desktop. `ui-ux-standard.md` §3 is
// mobile-first, so 375 is the one that must be right, not the afterthought.
const widths = flag('widths', '375,768,1280').split(',').map(Number);
const themes = flag('theme', 'light,dark').split(',');
const waitFor = flag('wait', null);

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch {
  console.error('playwright is not available — run `bunx playwright install chromium`');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true }).catch((e) => {
  console.error(`could not launch chromium: ${e.message}`);
  process.exit(1);
});

const slug = route.replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '') || 'root';
const captured = [];
let failed = 0;

for (const theme of themes) {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: theme,
      // Prove the reduced-motion path renders, and stop animations from making
      // two runs of the same page differ.
      reducedMotion: 'reduce',
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    try {
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
      if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 });
      // Freeze anything still in flight so the capture is deterministic.
      await page.addStyleTag({
        content: '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}',
      });
      const file = join(outDir, `${slug}-${theme}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true });
      captured.push({ file, theme, width, errors });
    } catch (e) {
      failed++;
      console.error(`✗ ${theme} ${width}px — ${e.message.split('\n')[0]}`);
    }
    await context.close();
  }
}

await browser.close();

if (!captured.length) {
  console.error(`\nnothing captured. Is the dev server running at ${base}? (moon run :dev)\n`);
  process.exit(1);
}

console.log(`\nCaptured ${captured.length} view(s) of ${route}\n`);
for (const c of captured) {
  console.log(`  ${c.theme.padEnd(5)} ${String(c.width).padStart(4)}px  ${c.file}`);
  for (const e of c.errors.slice(0, 3)) console.log(`         console error: ${e.slice(0, 120)}`);
}
const withErrors = captured.filter((c) => c.errors.length).length;
if (withErrors) console.log(`\n! ${withErrors} view(s) logged console errors — a visual pass does not excuse them.`);
console.log('\nRead the PNGs before judging the design. A description is not a look.\n');

process.exit(failed && !captured.length ? 1 : 0);
