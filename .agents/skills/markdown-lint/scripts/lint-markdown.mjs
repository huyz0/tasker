#!/usr/bin/env node
/**
 * lint-markdown.mjs
 * Deterministic Markdown linting + embedded Mermaid block validation.
 *
 * Usage (run from project root):
 *   node .agents/skills/markdown-lint/scripts/lint-markdown.mjs [glob...]
 *   node .agents/skills/markdown-lint/scripts/lint-markdown.mjs        # defaults to **\/*.md
 *
 * Exit codes:
 *   0 – all checks passed
 *   1 – lint / mermaid errors found
 *   2 – script / runtime error
 *
 * Dependencies come from the workspace root. They used to be installed into a
 * private node_modules under this skill, which produced a second committed
 * bun.lock — a second, unverified resolution that no build reads and `knip`
 * cannot audit, and which `dependency-standard.md` forbids outright.
 */

import { createRequire }   from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { fileURLToPath }   from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '../../../..'); // repository root

// ─── ANSI colour helpers ──────────────────────────────────────────────────────
const C = {
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

// ─── Resolve packages from the workspace root ────────────────────────────────
const rootRequire = createRequire(resolve(REPO_ROOT, 'package.json'));

function resolveRoot(pkg) {
  try {
    return `file://${rootRequire.resolve(pkg)}`;
  } catch {
    console.error(
      `${C.red('SETUP')}  ${pkg} is not installed. Run \`bun install\` at the repository root.`
    );
    process.exit(2);
  }
}

// markdownlint-cli2 does not declare this file in `exports`, so resolve the
// package entry and walk to it rather than asking for the sub-path.
const mlDir = dirname(rootRequire.resolve('markdownlint-cli2'));
const { lint: markdownlintPromise } = await import(
  `file://${resolve(mlDir, 'export-markdownlint-promise.mjs')}`
);
const { validate: validateMermaid } = await import(resolveRoot('@a24z/mermaid-parser'));
const { globSync }                  = await import(resolveRoot('glob'));

// ─── Collect target files ─────────────────────────────────────────────────────
const args        = process.argv.slice(2).filter(a => !a.startsWith('--'));
const patterns    = args.length ? args : ['**/*.md'];
const cwd         = process.cwd();
// `.archive/` is history: its epics and reviews are a record of what was
// written at the time, not documents anyone will edit to satisfy a linter.
const IGNORE      = [
  '**/node_modules/**',
  '**/.git/**',
  '.archive/**',
  '**/dist/**',
  '**/coverage/**',
  '**/playwright-report/**',
  // Playwright writes an `error-context.md` beside the video for every failed
  // test. It is generated and gitignored, but this script globs the filesystem
  // rather than the git index, so without this a single failing e2e test blocks
  // every subsequent commit on a trailing newline in a file nobody wrote.
  '**/test-results/**',
];

// `dot: true` matters more than it looks: without it glob skips every
// dot-directory, so the default `**/*.md` silently checked 7 files and ignored
// `.agents/`, `.specs/` and `.milestones/` entirely — the whole point of the skill.
const files = patterns.flatMap(p =>
  globSync(p, { cwd, ignore: IGNORE, absolute: true, dot: true })
);

if (files.length === 0) {
  process.stderr.write(C.yellow(`No markdown files found for: ${patterns.join(', ')}\n`));
  process.exit(0);
}

console.log(`\n${C.bold(C.cyan('Markdown Lint + Mermaid Validator'))}`);
console.log(C.cyan(`Checking ${files.length} file(s)…\n`));

// ─── 1. Markdown linting (markdownlint-cli2 lint API) ────────────────────────
let lintErrorCount = 0;

// The repository states its own conventions in `.markdownlint-cli2.jsonc` —
// notably that skills use sibling `# ` sections, which MD025 would otherwise
// flag 85 times. This script previously claimed in a comment to honour a
// project config and did not, so every run reported the schema as an error.
function repoConfig() {
  for (const name of ['.markdownlint-cli2.jsonc', '.markdownlint-cli2.json', '.markdownlint.json']) {
    const file = resolve(REPO_ROOT, name);
    if (!existsSync(file)) continue;
    try {
      // Strip `//` comments; JSONC allows them, JSON.parse does not.
      const raw = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      const parsed = JSON.parse(raw);
      return parsed.config ?? parsed;
    } catch (err) {
      console.error(`${C.yellow('CONFIG')} ${name} is not parseable (${err.message}) — using defaults`);
    }
  }
  return null;
}

try {
  const lintResult = await markdownlintPromise({
    files,
    config: repoConfig() ?? {
      default: true,
      MD013: false,  // line-length     — too noisy for long prose
      MD033: false,  // inline HTML     — often intentional in project docs
      MD041: false,  // first-line h1   — not always enforced
    },
  });

  for (const [filePath, errors] of Object.entries(lintResult)) {
    if (!errors.length) continue;
    const rel = relative(cwd, filePath);
    for (const err of errors) {
      lintErrorCount++;
      const loc    = err.lineNumber ? `:${err.lineNumber}` : '';
      const detail = err.errorDetail ? `  [${err.errorDetail}]` : '';
      console.error(
        `${C.red('LINT')}  ${rel}${loc}  ${C.bold(err.ruleNames.join('/'))}  ${err.ruleDescription}${detail}`
      );
    }
  }
} catch (err) {
  process.stderr.write(C.red(`markdownlint error: ${err.message}\n`));
  process.exit(2);
}

// ─── 2. Mermaid block extraction + validation ─────────────────────────────────
// Matches ```mermaid ... ``` fenced blocks (handles optional trailing spaces)
const MERMAID_RE = /^```[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)^```/gm;

let mermaidBlockCount = 0;
let mermaidErrorCount = 0;

for (const filePath of files) {
  const rel     = relative(cwd, filePath);
  const content = readFileSync(filePath, 'utf8');
  let   match;
  MERMAID_RE.lastIndex = 0;

  while ((match = MERMAID_RE.exec(content)) !== null) {
    mermaidBlockCount++;

    // Determine the 1-based line number of the opening fence
    const beforeMatch = content.slice(0, match.index);
    const blockLine   = beforeMatch.split('\n').length;
    const diagram     = match[1];

    try {
      const isValid = await validateMermaid(diagram);
      if (!isValid) {
        mermaidErrorCount++;
        const preview = diagram.split('\n').slice(0, 5).map(l => `    ${l}`).join('\n');
        console.error(`${C.red('MERMAID')}  ${rel}:${blockLine}  Invalid Mermaid syntax`);
        console.error(C.yellow(preview));
      }
    } catch (err) {
      mermaidErrorCount++;
      console.error(`${C.red('MERMAID')}  ${rel}:${blockLine}  Parse error: ${err.message ?? err}`);
    }
  }
}

// ─── 3. Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
const totalErrors = lintErrorCount + mermaidErrorCount;

if (totalErrors === 0) {
  console.log(
    C.bold(C.green('✓ All checks passed')) +
    `  (${files.length} files, ${mermaidBlockCount} mermaid blocks)`
  );
  process.exit(0);
} else {
  if (lintErrorCount)    console.error(C.red(`✗ Markdown lint errors : ${lintErrorCount}`));
  if (mermaidErrorCount) console.error(C.red(`✗ Mermaid errors       : ${mermaidErrorCount}`));
  console.error(C.bold(C.red(`✗ Total errors: ${totalErrors}`)));
  process.exit(1);
}
