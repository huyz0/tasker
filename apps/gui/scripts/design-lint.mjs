#!/usr/bin/env node
/**
 * Deterministic design gate for the GUI.
 *
 * `.specs/standards/ui-ux-standard.md` has always said "never hardcode a colour,
 * use semantic tokens" and "honour reduced motion". Nothing enforced either, so
 * the codebase drifted to 44 raw palette utilities and 17 raw hex values. Prose
 * standards do not hold; a gate does.
 *
 * Three checks, all static and dependency-free:
 *   tokens   — raw hex, raw Tailwind palette utilities, hardcoded font-family
 *   contrast — every token foreground/background pair against WCAG 2.1 AA, both themes
 *   wig      — the statically checkable subset of the Web Interface Guidelines
 *
 * Escape hatch, which must carry a reason:
 *   {/* design-lint-disable-next-line tokens — third-party brand colour *\/}
 *
 *   node scripts/design-lint.mjs              # all checks
 *   node scripts/design-lint.mjs --only wig   # one check
 *   node scripts/design-lint.mjs --json
 *
 * Exit 0 clean · 1 violations · 2 script failure.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Overridable for the test suite; unset in normal use.
const GUI = process.env.DESIGN_LINT_ROOT
  ? resolve(process.env.DESIGN_LINT_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(GUI, 'src');
const CSS = join(SRC, 'index.css');

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const json = argv.includes('--json');

const findings = [];
const add = (rule, file, line, msg) =>
  findings.push({ rule, file: relative(GUI, file), line, msg });

// ── file walking ─────────────────────────────────────────────────────────────
const SOURCE_EXT = new Set(['.tsx', '.ts', '.css']);
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SOURCE_EXT.has(extname(name))) yield full;
  }
}
// Tests and stories describe states rather than shipping them, and a story that
// demonstrates a colour is not drift. They are still checked for the a11y and
// anti-pattern rules, only exempted from token rules.
const isFixture = (f) => /\.(test|stories)\.tsx?$/.test(f);

const DISABLE = /design-lint-disable-next-line\s+(\S+)\s*(?:—|--)\s*\S/;
function disabledAt(lines, i) {
  const prev = lines[i - 1] ?? '';
  const m = prev.match(DISABLE);
  return m ? m[1] : null;
}

/**
 * A comment describing a rule is not a violation of it. Skipping these is not a
 * nicety — the first thing this linter flagged after the rules were written was
 * a code comment explaining why the rule exists.
 */
const isComment = (line) => /^\s*(?:\/\/|\/\*|\*|#|<!--)/.test(line);

// ── check: tokens ────────────────────────────────────────────────────────────
const TW_PREFIX =
  '(?:bg|text|border|ring|ring-offset|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|placeholder|shadow)';
const TW_COLOR =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const RE_TAILWIND = new RegExp(`(?<![\\w-])${TW_PREFIX}-${TW_COLOR}-(?:50|[1-9]00|950)\\b`, 'g');
const RE_HEX = /(?<![\w&#])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g;
const RE_FONT = /font-family\s*:\s*(?!.*var\()/;

function checkTokens(file, lines) {
  if (isFixture(file)) return;
  // index.css is where tokens are *defined*, so raw values are the point there.
  if (file === CSS) return;
  lines.forEach((line, i) => {
    if (disabledAt(lines, i) === 'tokens' || isComment(line)) return;
    for (const m of line.matchAll(RE_TAILWIND))
      add('tokens', file, i + 1, `raw palette utility \`${m[0]}\` — use a semantic token`);
    for (const m of line.matchAll(RE_HEX))
      add('tokens', file, i + 1, `raw hex \`${m[0]}\` — use a semantic token`);
    if (RE_FONT.test(line)) add('tokens', file, i + 1, 'hardcoded font-family — use a token');
  });
}

// ── check: contrast ──────────────────────────────────────────────────────────
/** `H S% L%` (optionally `/ A`) → {r,g,b,a} in 0-255 / 0-1. */
function hslToRgb(value) {
  const m = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+))?$/);
  if (!m) return null;
  const [h, s, l] = [parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100];
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const seg = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][Math.floor((h % 360) / 60)];
  return { r: (seg[0] + mm) * 255, g: (seg[1] + mm) * 255, b: (seg[2] + mm) * 255, a };
}

const luminance = ({ r, g, b }) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});

function contrast(fg, bg) {
  const f = luminance(fg.a < 1 ? over(fg, bg) : fg);
  const b = luminance(bg);
  return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
}

/** Token declarations inside a `:root { … }` block, in source order. */
function themes(css) {
  const out = [];
  const re = /:root\s*\{([\s\S]*?)\n\s*\}/g;
  let m;
  while ((m = re.exec(css))) {
    const vars = new Map();
    for (const d of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) vars.set(d[1], d[2].trim());
    // A dark block redeclares only what changes, so it inherits the light base.
    out.push(vars);
  }
  return out.map((vars, i) => (i === 0 ? vars : new Map([...out[0], ...vars])));
}

function checkContrast() {
  if (!existsSync(CSS)) return;
  const css = readFileSync(CSS, 'utf8');
  const blocks = themes(css);
  if (!blocks.length) return add('contrast', CSS, 1, 'no :root token block found');

  blocks.forEach((vars, i) => {
    const theme = i === 0 ? 'light' : 'dark';
    const page = hslToRgb(vars.get('background') ?? '');
    if (!page) return add('contrast', CSS, 1, `${theme}: --background is not parseable`);

    const pairs = [];
    for (const name of vars.keys()) {
      if (!name.endsWith('-foreground')) continue;
      const base = name.slice(0, -'-foreground'.length);
      if (vars.has(base)) pairs.push([name, base]);
    }
    // Body text and muted text sit on the page itself, not on a named surface.
    pairs.push(['foreground', 'background'], ['muted-foreground', 'background']);

    for (const [fgName, bgName] of pairs) {
      const fg = hslToRgb(vars.get(fgName) ?? '');
      const bg = hslToRgb(vars.get(bgName) ?? '');
      if (!fg || !bg) continue;
      const ratio = contrast(fg, bg.a < 1 ? over(bg, page) : bg);
      if (ratio < 4.5) {
        add(
          'contrast',
          CSS,
          1,
          `${theme}: --${fgName} on --${bgName} is ${ratio.toFixed(2)}:1, WCAG AA needs 4.5:1`
        );
      }
    }
  });
}

// ── check: web interface guidelines (static subset) ──────────────────────────
const WIG = [
  [/transition-all\b|transition:\s*all\b/, 'transition: all — list properties explicitly'],
  [/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/, 'zoom disabled — never block pinch zoom'],
  [/onPaste=\{[^}]*preventDefault/, 'paste blocked — never prevent paste'],
  [/<img(?![^>]*\salt=)[^>]*>/, '<img> without alt'],
  [/(?<![.\w])\.\.\.(?=["'`\s]|$)/, '"..." — use the ellipsis character …'],
];

/**
 * `outline-none` is only a defect when nothing replaces the indicator. The
 * codebase's actual idiom is `outline-none focus:ring-2 focus:ring-primary/50`,
 * which is a correct replacement — a rule that flagged the whole class would be
 * wrong 27 times out of 28, and a gate that cries wolf gets switched off. So
 * evaluate the class list as a unit, not the line.
 */
const RE_CLASSNAME = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
const FOCUS_REPLACEMENT = /focus(?:-visible)?:(?:ring|outline|border|shadow|bg|text)-|focus-visible:/;

function checkWig(file, lines) {
  lines.forEach((line, i) => {
    if (disabledAt(lines, i) === 'wig' || isComment(line)) return;
    for (const [re, msg] of WIG) if (re.test(line)) add('wig', file, i + 1, msg);

    for (const m of line.matchAll(RE_CLASSNAME)) {
      const classes = m[1] ?? m[2] ?? '';
      if (/\boutline-none\b/.test(classes) && !FOCUS_REPLACEMENT.test(classes)) {
        add('wig', file, i + 1, 'outline-none with no focus replacement — keyboard focus is invisible');
      }
    }

    // A click handler on a non-interactive element is unreachable by keyboard.
    // An overlay/backdrop is the documented exception, and must be paired with
    // an Escape handler rather than silently excused.
    const div = line.match(/<(?:div|span)[^>]*\sonClick=/);
    if (div && !/aria-hidden|role="presentation"/.test(line)) {
      const isBackdrop = /\b(?:fixed|absolute)\b/.test(line) && /\binset-0\b/.test(line);
      if (!isBackdrop) add('wig', file, i + 1, '<div>/<span> with onClick — use <button>');
      else if (!/\bEscape\b/.test(lines.join('\n')))
        add('wig', file, i + 1, 'backdrop closes on click but nothing handles Escape');
    }
  });
}

/** Motion without a reduced-motion escape is a WCAG 2.3.3 failure, not a nit. */
function checkReducedMotion(files) {
  const css = existsSync(CSS) ? readFileSync(CSS, 'utf8') : '';
  if (/prefers-reduced-motion/.test(css)) return;
  const animated = files.filter((f) => {
    if (isFixture(f)) return false;
    const t = readFileSync(f, 'utf8');
    return /\b(?:animate-(?!none)|transition-(?:colors|transform|opacity|all)|startViewTransition|@keyframes)/.test(t);
  });
  if (animated.length) {
    add(
      'wig',
      CSS,
      1,
      `${animated.length} file(s) animate but no prefers-reduced-motion rule exists — ` +
        'add a global reduced-motion block'
    );
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
const files = [...walk(SRC)];
const run = (name) => !only || only === name;

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  if (run('tokens')) checkTokens(file, lines);
  if (run('wig')) checkWig(file, lines);
}
if (run('contrast')) checkContrast();
if (run('wig')) checkReducedMotion(files);

if (json) {
  console.log(JSON.stringify({ findings }, null, 2));
} else if (findings.length) {
  let current = null;
  for (const f of findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    if (f.file !== current) {
      current = f.file;
      console.log(`\n## ${current}`);
    }
    console.log(`${f.file}:${f.line} - [${f.rule}] ${f.msg}`);
  }
  console.log(`\n✗ FAIL — ${findings.length} findings across ${files.length} files\n`);
} else {
  console.log(`✓ PASS — ${files.length} files, 0 design findings\n`);
}

process.exit(findings.length ? 1 : 0);
