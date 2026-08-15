import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSpecDrift } from './spec-drift';

/**
 * The lesson from the harness gates: a rule that cannot be made to fail
 * enforces nothing, and three of those rules turned out to be wrong the first
 * time they were checked by hand. So every rule here gets a fixture that breaks
 * exactly one thing.
 *
 * `checkSpecDrift(root)` takes the root as an argument precisely so a fixture
 * tree can stand in for the repository. Nothing in normal use passes anything
 * but the real root.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spec-drift-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes a minimal but well-formed fixture: one manifest, one documented row. */
function fixture(opts: {
  deps?: Record<string, string>;
  devDeps?: Record<string, string>;
  gui?: Record<string, string>;
  goMod?: string;
  prototools?: string;
  documented?: string;
  planned?: string;
}) {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies: opts.deps ?? {}, devDependencies: opts.devDeps ?? {} }),
  );

  if (opts.gui) {
    mkdirSync(join(root, 'apps/gui'), { recursive: true });
    writeFileSync(join(root, 'apps/gui/package.json'), JSON.stringify({ name: 'gui', devDependencies: opts.gui }));
  }

  if (opts.goMod !== undefined) {
    mkdirSync(join(root, 'apps/cli'), { recursive: true });
    writeFileSync(join(root, 'apps/cli/go.mod'), opts.goMod);
  }

  if (opts.prototools !== undefined) writeFileSync(join(root, '.prototools'), opts.prototools);

  mkdirSync(join(root, '.specs/product'), { recursive: true });
  writeFileSync(
    join(root, '.specs/product/tech-stack.md'),
    [
      '# Tech Stack',
      '',
      '## In Use',
      '',
      '| Technology | Version | Role |',
      '|---|---|---|',
      opts.documented ?? '',
      '',
      '## Planned',
      '',
      '| Technology | Purpose | Owner |',
      '|---|---|---|',
      opts.planned ?? '',
      '',
      '## Dropped',
      '',
    ].join('\n'),
  );
}

describe('spec-drift', () => {
  it('passes when every dependency is documented and every entry is declared', () => {
    fixture({ deps: { elysia: '^1.4.28' }, documented: '| `elysia` | ^1.4.28 | HTTP routing |' });
    const r = checkSpecDrift(root);
    expect(r.findings).toEqual([]);
    expect(r.declaredCount).toBe(1);
  });

  // The task's own verify line.
  it('fails when a dependency is added without documenting it', () => {
    fixture({
      deps: { elysia: '^1.4.28', 'left-pad': '^1.3.0' },
      documented: '| `elysia` | ^1.4.28 | HTTP routing |',
    });
    const r = checkSpecDrift(root);
    expect(r.findings.map((f) => f.name)).toEqual(['left-pad']);
    expect(r.findings[0]!.kind).toBe('undocumented');
  });

  it('fails in the other direction too — documented but declared nowhere', () => {
    fixture({ deps: { elysia: '^1.4.28' }, documented: '| `elysia`, `express` | — | HTTP routing |' });
    const r = checkSpecDrift(root);
    expect(r.findings.map((f) => f.name)).toEqual(['express']);
    expect(r.findings[0]!.kind).toBe('stale');
  });

  it('reads devDependencies, not only dependencies', () => {
    fixture({ devDeps: { oxlint: '^1.61.0' }, documented: '' });
    expect(checkSpecDrift(root).findings.map((f) => f.name)).toEqual(['oxlint']);
  });

  it('reads nested workspace manifests', () => {
    fixture({ gui: { 'jest-axe': '^11.0.0' }, documented: '' });
    const r = checkSpecDrift(root);
    expect(r.findings.map((f) => f.name)).toEqual(['jest-axe']);
    expect(r.findings[0]!.where).toContain('apps/gui/package.json');
  });

  it('exempts @types/* — a type-only companion needs no entry of its own', () => {
    fixture({ devDeps: { '@types/node': '^25.6.0' }, documented: '' });
    expect(checkSpecDrift(root).findings).toEqual([]);
  });

  it('lets a documented @scope/* wildcard cover that scope', () => {
    fixture({
      devDeps: { '@storybook/react': '^10.3.5', '@storybook/addon-docs': '^10.3.5' },
      documented: '| `@storybook/*` | ^10.3.5 | Component docs |',
    });
    expect(checkSpecDrift(root).findings).toEqual([]);
  });

  it('does not let a wildcard cover a different scope', () => {
    fixture({
      devDeps: { '@storybook/react': '^10.3.5', '@vitest/coverage-v8': '^4.1.4' },
      documented: '| `@storybook/*` | ^10.3.5 | Component docs |',
    });
    expect(checkSpecDrift(root).findings.map((f) => f.name)).toEqual(['@vitest/coverage-v8']);
  });

  it('reports a wildcard covering nothing as stale', () => {
    fixture({ deps: {}, documented: '| `@storybook/*` | ^10.3.5 | Component docs |' });
    const r = checkSpecDrift(root);
    expect(r.findings.map((f) => f.name)).toEqual(['@storybook/*']);
    expect(r.findings[0]!.kind).toBe('stale');
  });

  it('skips workspace-internal packages', () => {
    fixture({ deps: { 'shared-contract': 'workspace:*' }, documented: '' });
    expect(checkSpecDrift(root).findings).toEqual([]);
  });

  it('exempts runtime built-ins written with a colon', () => {
    fixture({ deps: {}, documented: '| `bun:sqlite` | built into Bun | Standalone driver |' });
    expect(checkSpecDrift(root).findings).toEqual([]);
  });

  it('reads direct requires from go.mod', () => {
    fixture({
      goMod: 'module x\n\ngo 1.26.1\n\nrequire (\n\tgithub.com/spf13/cobra v1.10.2\n)\n',
      documented: '',
    });
    const r = checkSpecDrift(root).findings;
    expect(r.map((f) => f.name)).toEqual(['github.com/spf13/cobra']);
    expect(r[0]!.where).toContain('go.mod');
  });

  it('ignores indirect go requires — they are not our declarations', () => {
    fixture({
      goMod: 'module x\n\ngo 1.26.1\n\nrequire (\n\tgithub.com/spf13/pflag v1.0.10 // indirect\n)\n',
      documented: '',
    });
    expect(checkSpecDrift(root).findings).toEqual([]);
  });

  it('reads a single-line go require', () => {
    fixture({ goMod: 'module x\n\ngo 1.26.1\n\nrequire connectrpc.com/connect v1.19.1\n', documented: '' });
    expect(checkSpecDrift(root).findings.map((f) => f.name)).toEqual(['connectrpc.com/connect']);
  });

  it('reads toolchain pins from .prototools', () => {
    fixture({ prototools: 'node = "24.12.0"\nbun = "1.3.11"\n\n[settings]\nauto-install = true\n', documented: '' });
    expect(checkSpecDrift(root).findings.map((f) => f.name).sort()).toEqual(['bun', 'node']);
  });

  it('ignores keys under a .prototools settings table', () => {
    fixture({ prototools: '[settings]\nauto-install = true\n', documented: '' });
    expect(checkSpecDrift(root).findings).toEqual([]);
  });

  // Planned entries name technology that is deliberately absent. Reading them as
  // documentation would make the check pass for a dependency nobody installed.
  it('does not treat Planned entries as documentation', () => {
    fixture({ deps: { opensearch: '^1.0.0' }, documented: '', planned: '| `opensearch` | Search | M07 |' });
    expect(checkSpecDrift(root).findings.map((f) => f.name)).toEqual(['opensearch']);
  });

  it('ignores table separator and header rows', () => {
    fixture({ deps: {}, documented: '' });
    expect(checkSpecDrift(root).findings).toEqual([]);
  });

  it('reads only the first column, so a role mentioning a package is not an entry', () => {
    fixture({ deps: {}, documented: '| `elysia` | ^1 | replaces `express` |' });
    const r = checkSpecDrift(root);
    expect(r.findings.map((f) => f.name)).toEqual(['elysia']);
  });

  it('reports several findings at once rather than stopping at the first', () => {
    fixture({ deps: { a: '1', b: '2' }, documented: '| `c` | — | — |' });
    expect(checkSpecDrift(root).findings.length).toBe(3);
  });

  it('fails loudly when tech-stack.md has no In Use section', () => {
    fixture({ deps: {}, documented: '' });
    writeFileSync(join(root, '.specs/product/tech-stack.md'), '# Tech Stack\n\nnothing here\n');
    expect(() => checkSpecDrift(root)).toThrow(/In Use/);
  });
});
