#!/usr/bin/env bun
/**
 * Packs the built GUI into the file the binary embeds (M09-T02).
 *
 * A static `import` has to resolve at build *and* typecheck time, so the
 * manifest lives at a fixed committed path. Vite fingerprints every asset
 * name, which means a checked-in manifest would be stale the moment anyone
 * rebuilds the GUI — so the committed copy is an empty one, this script fills
 * it in immediately before `bun build --compile`, and `--reset` empties it
 * again afterwards.
 *
 * That leaves exactly one honest state in git (empty) and one at build time
 * (full). `staticServer.test.ts` asserts the committed copy is still the empty
 * one, so a two-megabyte accident cannot be committed quietly.
 *
 * Base64 rather than a tar or zip: it costs a third more bytes inside a binary
 * that is already tens of megabytes, and it needs no archive format, no
 * decompression step, and nothing to go wrong on a platform we have not tried.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUI_DIST = join(backendRoot, '../gui/dist');
const MANIFEST = join(backendRoot, 'src/assets/guiBundle.json');

/** Every file under `dir`, as web paths relative to it. */
export function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    // Web paths, not filesystem paths: the manifest is keyed by URL, and on
    // Windows `relative` hands back backslashes.
    else out.push('/' + relative(base, full).split(sep).join('/'));
  }
  return out.sort();
}

export function buildManifest(distDir: string): Record<string, string> {
  const manifest: Record<string, string> = {};
  for (const path of walk(distDir)) {
    manifest[path] = readFileSync(join(distDir, path.slice(1))).toString('base64');
  }
  return manifest;
}

if (import.meta.main) {
  if (process.argv.includes('--reset')) {
    writeFileSync(MANIFEST, '{}\n');
    console.log('gui bundle reset to empty');
  } else {
    if (!statSync(GUI_DIST, { throwIfNoEntry: false })?.isDirectory()) {
      // Failing loudly beats compiling a binary that serves nothing: the
      // symptom of the quiet version is a blank page, days later.
      console.error(`no GUI build at ${GUI_DIST} — run \`moon run gui:build\` first`);
      process.exit(1);
    }
    const manifest = buildManifest(GUI_DIST);
    writeFileSync(MANIFEST, JSON.stringify(manifest));
    const bytes = Object.values(manifest).reduce((n, b64) => n + Math.floor((b64.length * 3) / 4), 0);
    console.log(`bundled ${Object.keys(manifest).length} files (${(bytes / 1024 / 1024).toFixed(1)} MB) -> ${MANIFEST}`);
  }
}
