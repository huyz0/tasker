#!/usr/bin/env node
/**
 * Deterministic quality gate for the agent harness.
 *
 * Checks the contract in `.agents/protocols/skill-authoring.md`: skill
 * structure, tier-0/tier-1 token budgets, dead path references, workflow and
 * host-adapter parity, and standards-index consistency.
 *
 * Zero dependencies so it runs under `node` or `bun` with nothing installed.
 *
 *   node .agents/skills/skill-forge/scripts/validate.mjs
 *   node .agents/skills/skill-forge/scripts/validate.mjs --json
 *
 * Exit codes: 0 clean (warnings allowed) · 1 errors found · 2 script failure.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const SKILLS_DIR = '.agents/skills';
const WORKFLOWS_DIR = '.agents/workflows';
const PROTOCOLS_DIR = '.agents/protocols';
const CLAUDE_COMMANDS = '.claude/commands';
const CLAUDE_SKILLS = '.claude/skills';
const STANDARDS_DIR = '.specs/standards';

// Antigravity truncates rule and workflow files at 12k characters, so a longer
// body is silently broken on one of the three target hosts.
const BODY_HARD_LIMIT = 12000;
// Half the hard limit: a body past this is close enough to breaking on one host
// that it should push detail into `references/` rather than keep growing.
const BODY_SOFT_LIMIT = 6000;
const DESC_MIN = 40;
const DESC_MAX = 400;

const REQUIRED_SECTIONS = ['# Role', '# Goal', '# Constraints', '# Instructions', '# Output Format'];

// Text that means a shared protocol was copied into a skill instead of
// referenced. Each maps to the protocol that now owns it.
const INLINED_PROTOCOLS = [
  [/ALWAYS invoke `?caveman`? skill/i, 'response-style.md'],
  [/Please define workflow: Run \/work-ledger-define/i, 'work-ledger.md'],
  [/ALWAYS read `?\.specs\/product\/work-ledger\.yml`? to determine/i, 'work-ledger.md'],
];

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push({ file, msg });
const warn = (file, msg) => warnings.push({ file, msg });

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const has = (rel) => existsSync(join(ROOT, rel));
const dirs = (rel) =>
  has(rel) ? readdirSync(join(ROOT, rel)).filter((n) => statSync(join(ROOT, rel, n)).isDirectory()) : [];
const mds = (rel) => (has(rel) ? readdirSync(join(ROOT, rel)).filter((n) => n.endsWith('.md')) : []);

/** Split `---\n…\n---\n` frontmatter from the body. */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: null, body: text };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return { fm, body: m[2] };
}

/**
 * Repo-relative paths a document points at, from `@path` and `` `path` ``
 * tokens. Placeholders and globs are skipped — they are not literal targets.
 *
 * `base` resolves the skill-relative form (`references/foo.md`, `scripts/x.mjs`)
 * that skills use to reach their own tier-2 files. Checking only the
 * repo-absolute form would leave exactly those references unverified.
 */
function referencedPaths(text, base) {
  const out = new Set();
  const absolute = /[@`](\.(?:agents|specs|milestones|claude|epics|test-plans)\/[^\s`)\]},;]+)/g;
  const relative = /`((?:references|scripts)\/[^\s`)\]},;]+)`/g;
  const collect = (re, prefix) => {
    let m;
    while ((m = re.exec(text))) {
      const p = m[1].replace(/[.,;:]+$/, '');
      if (/[*{}<>[\]]/.test(p)) continue;
      out.add(prefix ? `${prefix}/${p}` : p);
    }
  };
  collect(absolute, '');
  if (base) collect(relative, base);
  return [...out];
}

// ── 1. Skills ────────────────────────────────────────────────────────────────
const skillNames = dirs(SKILLS_DIR).sort();
if (skillNames.length === 0) err(SKILLS_DIR, 'no skills found');

for (const name of skillNames) {
  const rel = `${SKILLS_DIR}/${name}/SKILL.md`;
  if (!has(rel)) {
    err(`${SKILLS_DIR}/${name}`, 'directory has no SKILL.md');
    continue;
  }
  const text = read(rel);
  const { fm, body } = parseFrontmatter(text);

  if (!fm) {
    err(rel, 'missing YAML frontmatter');
    continue;
  }

  if (!fm.name) err(rel, 'frontmatter is missing `name`');
  else if (fm.name !== name) err(rel, `frontmatter name "${fm.name}" does not match directory "${name}"`);
  else if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(fm.name)) err(rel, `name "${fm.name}" is not kebab-case (1-64 chars)`);

  const extra = Object.keys(fm).filter((k) => k !== 'name' && k !== 'description');
  if (extra.length) warn(rel, `frontmatter keys not parsed by every host: ${extra.join(', ')}`);

  if (!fm.description) {
    err(rel, 'frontmatter is missing `description`');
  } else {
    const d = fm.description;
    if (d.length < DESC_MIN) err(rel, `description is ${d.length} chars, minimum ${DESC_MIN} — too vague to route on`);
    if (d.length > DESC_MAX) err(rel, `description is ${d.length} chars, maximum ${DESC_MAX} — tier 0 is in every turn`);
    // The trigger clause must open its own sentence — "…. Use when X." — so the
    // model can route on it without reading the body.
    if (!/(^|[.!?]\s+)use\b/i.test(d)) err(rel, 'description has no "Use when <trigger>" sentence');
  }

  let cursor = -1;
  for (const section of REQUIRED_SECTIONS) {
    const at = body.indexOf(`\n${section}\n`) >= 0 ? body.indexOf(`\n${section}\n`) : body.startsWith(`${section}\n`) ? 0 : -1;
    if (at < 0) err(rel, `missing required section "${section}"`);
    else if (at < cursor) err(rel, `section "${section}" is out of order`);
    else cursor = at;
  }

  if (body.length > BODY_HARD_LIMIT) {
    err(rel, `body is ${body.length} chars, over the ${BODY_HARD_LIMIT} host limit — Antigravity truncates it`);
  } else if (body.length > BODY_SOFT_LIMIT) {
    warn(rel, `body is ${body.length} chars, over the ${BODY_SOFT_LIMIT} tier-1 budget — move detail to references/`);
  }

  for (const [pattern, owner] of INLINED_PROTOCOLS) {
    if (pattern.test(body)) err(rel, `inlines protocol text owned by ${PROTOCOLS_DIR}/${owner} — reference it instead`);
  }

  for (const p of referencedPaths(text, `${SKILLS_DIR}/${name}`)) {
    if (!has(p)) err(rel, `references a path that does not exist: ${p}`);
  }

  // Tier-2 files carry the detail an agent acts on, so a dead path in one is as
  // much a runtime failure as a dead path in the body.
  const refDir = `${SKILLS_DIR}/${name}/references`;
  for (const refFile of mds(refDir)) {
    const refRel = `${refDir}/${refFile}`;
    for (const p of referencedPaths(read(refRel), `${SKILLS_DIR}/${name}`)) {
      if (!has(p)) err(refRel, `references a path that does not exist: ${p}`);
    }
  }

  const wf = `${WORKFLOWS_DIR}/${name}.md`;
  const wfAuto = `${WORKFLOWS_DIR}/${name}-auto.md`;
  if (!has(wf) && !has(wfAuto)) err(rel, `no workflow forwards to this skill (expected ${wf})`);
}

// ── 2. Workflows ─────────────────────────────────────────────────────────────
for (const file of mds(WORKFLOWS_DIR).sort()) {
  const rel = `${WORKFLOWS_DIR}/${file}`;
  const text = read(rel);
  const { fm } = parseFrontmatter(text);

  if (!fm?.description) err(rel, 'workflow is missing a `description` in frontmatter');
  if (text.length > BODY_HARD_LIMIT) err(rel, `workflow is ${text.length} chars, over the ${BODY_HARD_LIMIT} host limit`);

  const target = text.match(/\.agents\/skills\/([a-z0-9-]+)\/SKILL\.md/);
  if (!target) err(rel, 'workflow does not delegate to a `.agents/skills/<name>/SKILL.md` playbook');
  else if (!skillNames.includes(target[1])) err(rel, `delegates to skill "${target[1]}", which does not exist`);

  const body = text.replace(/^---[\s\S]*?---/, '');
  if (body.length > 900) warn(rel, `workflow body is ${body.length} chars — a workflow forwards, it does not instruct`);
}

// ── 3. Host adapter parity ───────────────────────────────────────────────────
for (const file of mds(WORKFLOWS_DIR)) {
  const rel = `${CLAUDE_COMMANDS}/${file}`;
  if (!has(rel)) err(rel, `no Claude Code command for workflow ${file} — run skill-forge sync`);
}
for (const file of mds(CLAUDE_COMMANDS)) {
  if (!has(`${WORKFLOWS_DIR}/${file}`)) err(`${CLAUDE_COMMANDS}/${file}`, 'orphan adapter — no matching workflow');
}
for (const name of skillNames) {
  const rel = `${CLAUDE_SKILLS}/${name}/SKILL.md`;
  if (!has(rel)) err(rel, `no Claude Code skill adapter for ${name} — run skill-forge sync`);
}
for (const name of dirs(CLAUDE_SKILLS)) {
  if (!skillNames.includes(name)) err(`${CLAUDE_SKILLS}/${name}`, 'orphan adapter — no matching skill');
  const rel = `${CLAUDE_SKILLS}/${name}/SKILL.md`;
  if (has(rel) && read(rel).length > 1400) {
    warn(rel, 'adapter is long enough to be a copy — an adapter forwards, it does not restate');
  }
}

// ── 4. Protocols ─────────────────────────────────────────────────────────────
const protocolFiles = mds(PROTOCOLS_DIR).filter((f) => f !== 'README.md');
const allText = [...skillNames.map((n) => read(`${SKILLS_DIR}/${n}/SKILL.md`)), read(`${PROTOCOLS_DIR}/README.md`)].join('\n');
for (const file of protocolFiles) {
  if (!allText.includes(`${PROTOCOLS_DIR}/${file}`)) warn(`${PROTOCOLS_DIR}/${file}`, 'no skill references this protocol');
}

// ── 5. Standards index ───────────────────────────────────────────────────────
const indexRel = `${STANDARDS_DIR}/index.yml`;
if (!has(indexRel)) {
  err(indexRel, 'standards index is missing');
} else {
  const index = read(indexRel);
  const indexed = [...index.matchAll(/^\s*file:\s*(\S+)/gm)].map((m) => m[1]);
  for (const file of mds(STANDARDS_DIR)) {
    if (!indexed.includes(file)) err(indexRel, `${file} exists on disk but is not indexed`);
  }
  for (const file of indexed) {
    if (!has(`${STANDARDS_DIR}/${file}`)) err(indexRel, `indexes ${file}, which does not exist`);
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const json = process.argv.includes('--json');
if (json) {
  console.log(JSON.stringify({ errors, warnings, skills: skillNames.length }, null, 2));
} else {
  const group = (list) => {
    const by = new Map();
    for (const { file, msg } of list) by.set(file, [...(by.get(file) ?? []), msg]);
    return by;
  };
  if (errors.length) {
    console.log(`\nERRORS (${errors.length})`);
    for (const [file, msgs] of group(errors)) for (const m of msgs) console.log(`  ✗ ${file}: ${m}`);
  }
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length})`);
    for (const [file, msgs] of group(warnings)) for (const m of msgs) console.log(`  ! ${file}: ${m}`);
  }
  const verdict = errors.length ? '✗ FAIL' : '✓ PASS';
  console.log(
    `\n${verdict} — ${skillNames.length} skills, ${mds(WORKFLOWS_DIR).length} workflows, ` +
      `${protocolFiles.length} protocols · ${errors.length} errors, ${warnings.length} warnings\n`
  );
}

process.exit(errors.length ? 1 : 0);
