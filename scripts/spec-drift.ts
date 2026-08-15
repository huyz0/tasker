#!/usr/bin/env bun
/**
 * Fails when `.specs/product/tech-stack.md` and the committed manifests
 * disagree.
 *
 * The premise of M02 is that `.specs/` is the declarative source of truth. A
 * document is only a source of truth if something breaks when it stops being
 * true — otherwise it is a comment that ages. This is that something.
 *
 * It checks both directions, because they are the same defect seen from either
 * side:
 *
 *   undocumented — a manifest declares a package the document never mentions.
 *                  An agent reading the document underestimates what is here.
 *   stale        — the document names something no manifest declares. An agent
 *                  reading the document imports a package that does not exist.
 *
 *   moon run :spec-drift
 *
 * Exit 0 in agreement · 1 drift found · 2 the check itself could not run.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

type Finding = {
  kind: 'undocumented' | 'stale';
  name: string;
  where: string;
  hint: string;
};

export type Result = {
  findings: Finding[];
  declaredCount: number;
  documentedCount: number;
};

/** A package.json whose version is `workspace:*` is this repo, not a third party. */
const isInternal = (version: string) => version.startsWith('workspace:') || version.startsWith('link:');

/**
 * `@types/foo` is the type-only companion of `foo`. Requiring a row for each
 * would double the table's length and halve the chance anyone maintains it.
 */
const isTypesPackage = (name: string) => name.startsWith('@types/');

/**
 * `bun:sqlite`, `node:http` — a runtime built-in, documented because it matters
 * architecturally, declared nowhere because there is nothing to install.
 */
const isBuiltin = (name: string) => name.includes(':');

const isWildcard = (name: string) => name.endsWith('/*');
const scopeOf = (name: string) => name.slice(0, name.indexOf('/') + 1);

function manifestPaths(root: string): string[] {
  const found: string[] = [];
  const rootManifest = join(root, 'package.json');
  if (existsSync(rootManifest)) found.push(rootManifest);

  for (const group of ['apps', 'packages']) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(dir, entry.name, 'package.json');
      if (existsSync(manifest)) found.push(manifest);
    }
  }
  return found;
}

/** Every third-party identifier this repository commits itself to. */
function declared(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const record = (name: string, file: string) => {
    if (!out.has(name)) out.set(name, relative(root, file) || file);
  };

  for (const file of manifestPaths(root)) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    for (const field of ['dependencies', 'devDependencies'] as const) {
      for (const [name, version] of Object.entries(pkg[field] ?? {})) {
        if (isInternal(String(version)) || isTypesPackage(name)) continue;
        record(name, file);
      }
    }
  }

  const goMod = join(root, 'apps/cli/go.mod');
  if (existsSync(goMod)) {
    // Only direct requires. An `// indirect` line is the module graph's
    // business, not a choice this repository made.
    for (const line of readFileSync(goMod, 'utf8').split('\n')) {
      if (line.includes('// indirect')) continue;
      const m = line.match(/^\s*(?:require\s+)?([a-z0-9][\w.\-/]*\.[\w.\-/]+)\s+v\d[\w.+\-]*\s*$/);
      if (m) record(m[1]!, goMod);
    }
  }

  const prototools = join(root, '.prototools');
  if (existsSync(prototools)) {
    let inTable = false;
    for (const raw of readFileSync(prototools, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line.startsWith('#') || line === '') continue;
      // `[settings]` and anything after it configures proto itself.
      if (line.startsWith('[')) inTable = true;
      if (inTable) continue;
      const m = line.match(/^([\w-]+)\s*=\s*"/);
      if (m) record(m[1]!, prototools);
    }
  }

  return out;
}

/**
 * The first column of every table row under `## In Use`, up to the next `##`.
 *
 * First column only: a Role cell explaining that oxlint "replaces ESLint and
 * Prettier" must not read as a claim that ESLint is installed. Reading the whole
 * row would make the document's own prose defeat the check.
 */
function documented(root: string): Set<string> {
  const path = join(root, '.specs/product/tech-stack.md');
  if (!existsSync(path)) throw new Error(`cannot read ${relative(root, path)}`);
  const text = readFileSync(path, 'utf8');

  const start = text.indexOf('\n## In Use');
  if (start === -1) throw new Error('tech-stack.md has no "## In Use" section — nothing to check against');
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\n## ', 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  const names = new Set<string>();
  for (const line of section.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    const cell = line.split('|')[1] ?? '';
    if (/^[\s:-]*$/.test(cell)) continue; // separator row
    for (const m of cell.matchAll(/`([^`]+)`/g)) names.add(m[1]!.trim());
  }
  return names;
}

export function checkSpecDrift(root: string): Result {
  const decl = declared(root);
  const docs = documented(root);
  const findings: Finding[] = [];

  const wildcards = [...docs].filter(isWildcard);

  for (const [name, where] of decl) {
    const covered = docs.has(name) || wildcards.some((w) => name.startsWith(scopeOf(w)));
    if (!covered) {
      findings.push({
        kind: 'undocumented',
        name,
        where,
        hint: 'add a row to an "In Use" table in .specs/product/tech-stack.md, or remove the dependency',
      });
    }
  }

  for (const name of docs) {
    if (isBuiltin(name)) continue;
    const live = isWildcard(name)
      ? [...decl.keys()].some((d) => d.startsWith(scopeOf(name)))
      : decl.has(name);
    if (!live) {
      findings.push({
        kind: 'stale',
        name,
        where: '.specs/product/tech-stack.md',
        hint: 'no manifest declares this — move it to Planned or Dropped, or install it',
      });
    }
  }

  return { findings, declaredCount: decl.size, documentedCount: docs.size };
}

if (import.meta.main) {
  const root = process.env.SPEC_DRIFT_ROOT ?? join(import.meta.dir, '..');
  let result: Result;
  try {
    result = checkSpecDrift(root);
  } catch (e) {
    console.error(`spec-drift could not run: ${(e as Error).message}`);
    process.exit(2);
  }

  const { findings, declaredCount, documentedCount } = result;
  if (findings.length === 0) {
    console.log(`✓ PASS — ${declaredCount} declared identifiers, ${documentedCount} documented, 0 drift`);
    process.exit(0);
  }

  console.error(`\n✗ spec drift — ${findings.length} finding(s)\n`);
  for (const kind of ['undocumented', 'stale'] as const) {
    const group = findings.filter((f) => f.kind === kind);
    if (group.length === 0) continue;
    console.error(
      kind === 'undocumented'
        ? `  Declared but not documented (${group.length}):`
        : `  Documented but not declared (${group.length}):`,
    );
    for (const f of group) console.error(`    ${f.name.padEnd(38)} ${f.where}`);
    console.error(`    → ${group[0]!.hint}\n`);
  }
  process.exit(1);
}
