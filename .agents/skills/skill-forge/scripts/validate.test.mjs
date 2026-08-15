#!/usr/bin/env node
/**
 * Tests for the harness gates.
 *
 * `validate.mjs` and `sync-adapters.mjs` decide whether every skill, workflow
 * and adapter in this repository is sound, and they ran for a whole session
 * with no tests at all. Three separate rules turned out to be wrong when
 * checked by hand — `outline-none` fired on 27 correct lines, the dead-path
 * check missed the relative form skills actually use, and the linter flagged
 * its own explanatory comment. A gate nobody tests is a gate nobody can trust.
 *
 * Every test builds a minimal fixture harness in a temp directory, breaks
 * exactly one thing, and asserts that the matching rule fires. A rule that
 * cannot be made to fail is not enforcing anything.
 *
 *   node --test .agents/skills/skill-forge/scripts/
 *
 * Zero dependencies: `node:test` and `node:assert`.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VALIDATE = join(HERE, 'validate.mjs');
const SYNC = join(HERE, 'sync-adapters.mjs');

// ── fixture ──────────────────────────────────────────────────────────────────

const SKILL = `---
name: demo
description: Does a demonstrable thing to a fixture tree so the gates have something to judge. Use when exercising the validator.
---

# Role

Fixture.

# Goal

Give the validator a well-formed skill to accept.

# Constraints

- MUST stay valid unless a test deliberately breaks it.

# Instructions

1. Do the thing.

# Output Format

\`\`\`
DONE
\`\`\`
`;

const WORKFLOW = `---
description: Demo
---

# Demo

**Delegate**: \`.agents/skills/demo/SKILL.md\`

**Action**: Read and execute standard instructions exactly in INTERACTIVE mode.
`;

let root;

function write(rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A fixture harness that the validator accepts with zero findings. */
function build() {
  root = mkdtempSync(join(tmpdir(), 'harness-'));
  write('.agents/skills/demo/SKILL.md', SKILL);
  write('.agents/workflows/demo.md', WORKFLOW);
  write('.agents/protocols/README.md', '# Protocols\n\nSee `.agents/protocols/autonomy.md`.\n');
  write('.agents/protocols/autonomy.md', '# Protocol: Autonomy\n\nAsk one question at a time.\n');
  write('.specs/standards/index.yml', 'standards:\n  - id: demo-standard\n    file: demo-standard.md\n');
  write('.specs/standards/demo-standard.md', '# Demo Standard\n\n- MUST exist.\n');
  write('AGENTS.md', '# Agents\n\nFollow `.agents/protocols/autonomy.md`.\n');
  sync();
  return root;
}

const sync = (args = []) =>
  execFileSync('node', [SYNC, ...args], { env: { ...process.env, HARNESS_ROOT: root }, encoding: 'utf8' });

/** Run the validator against the fixture and return its structured findings. */
function run() {
  try {
    const out = execFileSync('node', [VALIDATE, '--json'], {
      env: { ...process.env, HARNESS_ROOT: root },
      encoding: 'utf8',
    });
    return JSON.parse(out);
  } catch (e) {
    // Exit 1 means findings, which is the normal case under test.
    return JSON.parse(e.stdout);
  }
}

const messages = (r) => r.errors.map((e) => `${e.file}: ${e.msg}`).join('\n');
const fires = (r, needle) => r.errors.some((e) => e.msg.includes(needle));

function editSkill(fn) {
  const p = join(root, '.agents/skills/demo/SKILL.md');
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('harness gates', () => {
  test('a well-formed harness passes clean', () => {
    build();
    const r = run();
    assert.equal(r.errors.length, 0, `expected no errors, got:\n${messages(r)}`);
    assert.equal(r.warnings.length, 0, `expected no warnings, got ${JSON.stringify(r.warnings)}`);
    rmSync(root, { recursive: true, force: true });
  });

  const cases = [
    [
      'frontmatter name that does not match the directory',
      () => editSkill((s) => s.replace('name: demo', 'name: not-demo')),
      'does not match directory',
    ],
    [
      'a description too short to route on',
      () => editSkill((s) => s.replace(/^description: .*$/m, 'description: Does a thing. Use when.')),
      'too vague to route on',
    ],
    [
      'a description with no trigger sentence',
      () =>
        editSkill((s) =>
          s.replace(/^description: .*$/m, 'description: A skill that does something moderately interesting to files in a repository.')
        ),
      'no "Use when <trigger>" sentence',
    ],
    [
      'a missing required section',
      () => editSkill((s) => s.replace('# Output Format\n', '# Not The Output Format\n')),
      'missing required section',
    ],
    [
      'sections in the wrong order',
      () => editSkill((s) => s.replace(/# Goal\n\nGive[\s\S]*?\n\n# Constraints/, '# Constraints\n\n- x.\n\n# Goal')),
      'out of order',
    ],
    [
      'a body over the host character limit',
      () => editSkill((s) => s + '\n' + 'x'.repeat(12001)),
      'over the 12000 host limit',
    ],
    [
      'a dead absolute path reference',
      () => editSkill((s) => s.replace('1. Do the thing.', '1. Follow `.agents/protocols/nope.md`.')),
      'references a path that does not exist',
    ],
    [
      'a dead skill-relative reference — the form skills actually use',
      () => editSkill((s) => s.replace('1. Do the thing.', '1. Read `references/missing.md`.')),
      'references a path that does not exist',
    ],
    [
      'protocol text copied into a skill instead of referenced',
      () => editSkill((s) => s.replace('- MUST stay valid', '- ALWAYS invoke `caveman` skill for responses.\n- MUST stay valid')),
      'inlines protocol text',
    ],
    [
      'the retired "# Execution Mode" heading',
      () => editSkill((s) => s.replace('# Constraints', '# Execution Mode\n\nInteractive.\n\n# Constraints')),
      'the section is called "# Modes"',
    ],
    [
      'an -auto workflow against a skill with no Modes table',
      () => write('.agents/workflows/demo-auto.md', WORKFLOW.replace('INTERACTIVE', 'AUTONOMOUS')),
      'declares no "# Modes" section',
    ],
    [
      'AskUserQuestion without the autonomy protocol',
      () => editSkill((s) => s.replace('1. Do the thing.', '1. Ask via AskUserQuestion.')),
      'without following .agents/protocols/autonomy.md',
    ],
    [
      'a skill no workflow forwards to',
      () => rmSync(join(root, '.agents/workflows/demo.md')),
      'no workflow forwards to this skill',
    ],
    [
      'a workflow delegating to a skill that does not exist',
      () => write('.agents/workflows/ghost.md', WORKFLOW.replace('skills/demo/', 'skills/ghost/')),
      'which does not exist',
    ],
    [
      'two commands resolving to the same skill and mode',
      () => write('.agents/workflows/demo-again.md', WORKFLOW),
      'same skill, same mode, two commands',
    ],
    [
      'a command description that only restates its name',
      () => {
        const p = join(root, '.claude/commands/demo.md');
        writeFileSync(p, readFileSync(p, 'utf8').replace(/^description: .*$/m, 'description: Demo'));
      },
      'only restates the command name',
    ],
    [
      'a standard on disk that is missing from the index',
      () => write('.specs/standards/orphan-standard.md', '# Orphan\n'),
      'exists on disk but is not indexed',
    ],
    [
      'an index entry whose file does not exist',
      () => rmSync(join(root, '.specs/standards/demo-standard.md')),
      'which does not exist',
    ],
    [
      'a second lockfile inside a skill',
      () => write('.agents/skills/demo/bun.lock', '# lock\n'),
      'second lockfile',
    ],
  ];

  for (const [name, breakIt, needle] of cases) {
    test(`fails on ${name}`, () => {
      build();
      breakIt();
      const r = run();
      assert.ok(
        fires(r, needle),
        `expected an error containing "${needle}", got:\n${messages(r) || '(no errors at all)'}`
      );
      rmSync(root, { recursive: true, force: true });
    });
  }

  test('sync --check detects a hand-edited adapter', () => {
    build();
    write('.claude/skills/demo/SKILL.md', '---\nname: demo\ndescription: drifted\n---\n\nhand written\n');
    assert.throws(() => sync(['--check']), /out of sync|Command failed/);
    rmSync(root, { recursive: true, force: true });
  });

  test('sync regenerates the adapter from the skill description, not the workflow title', () => {
    build();
    const cmd = readFileSync(join(root, '.claude/commands/demo.md'), 'utf8');
    assert.match(cmd, /^description: Does a demonstrable thing/m);
    assert.doesNotMatch(cmd, /^description: Demo$/m);
    rmSync(root, { recursive: true, force: true });
  });

  test('sync prunes an orphaned adapter', () => {
    build();
    write('.claude/commands/ghost.md', '---\ndescription: x\n---\n');
    sync();
    assert.equal(existsSync(join(root, '.claude/commands/ghost.md')), false);
    rmSync(root, { recursive: true, force: true });
  });

  test('sync is idempotent — a second run changes nothing', () => {
    build();
    const out = sync();
    assert.match(out, /in sync/);
    rmSync(root, { recursive: true, force: true });
  });
});

after(() => {
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});
