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
 * Dependencies are installed on first run into the skill's own node_modules
 * so they never pollute the host project. No manual setup required.
 */

import { execSync }        from 'child_process';
import { createRequire }   from 'module';
import { readFileSync, existsSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { fileURLToPath }   from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const SKILL_DIR  = resolve(__dirname, '..'); // .agents/skills/markdown-lint/

// ─── ANSI colour helpers ──────────────────────────────────────────────────────
const C = {
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

// ─── Ensure dependencies are installed ───────────────────────────────────────
const SENTINEL = resolve(SKILL_DIR, 'node_modules', '.install-done');
if (!existsSync(SENTINEL)) {
  process.stderr.write(C.yellow('First run: installing dependencies into skill directory…\n'));
  execSync(
    `bun install --cwd "${SKILL_DIR}"`,
    { stdio: 'inherit', cwd: SKILL_DIR }
  );
  execSync(`touch "${SENTINEL}"`);
  process.stderr.write(C.green('Dependencies installed.\n\n'));
}

// ─── Resolve package paths from skill-local node_modules ─────────────────────
const skillRequire = createRequire(resolve(SKILL_DIR, 'package.json'));

function resolveLocal(pkg) {
  return `file://${skillRequire.resolve(pkg)}`;
}

// markdownlint-cli2 exports `lint` under the /markdownlint/promise sub-path
const mlPromisePath = resolve(
  SKILL_DIR,
  'node_modules',
  'markdownlint-cli2',
  'export-markdownlint-promise.mjs'
);
const { lint: markdownlintPromise } = await import(`file://${mlPromisePath}`);

const { validate: validateMermaid } = await import(resolveLocal('@a24z/mermaid-parser'));
const { globSync }                  = await import(resolveLocal('glob'));

// ─── Collect target files ─────────────────────────────────────────────────────
const args        = process.argv.slice(2).filter(a => !a.startsWith('--'));
const patterns    = args.length ? args : ['**/*.md'];
const cwd         = process.cwd();
const IGNORE      = ['**/node_modules/**', '**/.git/**'];

const files = patterns.flatMap(p =>
  globSync(p, { cwd, ignore: IGNORE, absolute: true })
);

if (files.length === 0) {
  process.stderr.write(C.yellow(`No markdown files found for: ${patterns.join(', ')}\n`));
  process.exit(0);
}

console.log(`\n${C.bold(C.cyan('Markdown Lint + Mermaid Validator'))}`);
console.log(C.cyan(`Checking ${files.length} file(s)…\n`));

// ─── 1. Markdown linting (markdownlint-cli2 lint API) ────────────────────────
let lintErrorCount = 0;

try {
  // `lint` accepts an options object identical to the markdownlint-cli2 config
  const lintResult = await markdownlintPromise({
    files,
    config: {
      // Sensible defaults; override with a .markdownlint.json in the project root
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
