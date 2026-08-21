import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StaticSite, contentTypeFor, cacheControlFor, isServerPath } from './staticServer';

const b64 = (s: string) => Buffer.from(s).toString('base64');

const site = (files: Record<string, string>) =>
  new StaticSite(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, b64(v)])));

const APP = {
  '/index.html': '<div id="root"></div>',
  '/assets/index-abc123.js': 'console.log(1)',
  '/assets/index-abc123.css': 'body{}',
  '/favicon.svg': '<svg/>',
};

describe('contentTypeFor', () => {
  it('names the types a Vite build actually emits', () => {
    expect(contentTypeFor('/assets/x.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('/assets/x.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('/index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('/icons.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('/fonts/x.woff2')).toBe('font/woff2');
  });

  it('is case-insensitive about the extension', () => {
    expect(contentTypeFor('/LOGO.PNG')).toBe('image/png');
  });

  it('falls back to a type browsers download rather than execute', () => {
    // The safe direction for something we did not expect to be serving.
    expect(contentTypeFor('/weird.xyz')).toBe('application/octet-stream');
    expect(contentTypeFor('/noextension')).toBe('application/octet-stream');
  });
});

describe('cacheControlFor', () => {
  it('lets fingerprinted assets be cached forever', () => {
    // Vite renames on change, so the URL is immutable by construction.
    expect(cacheControlFor('/assets/index-abc123.js')).toContain('immutable');
  });

  it('never lets index.html be cached', () => {
    // Its whole job is to name the current fingerprints; a stale copy points
    // at a previous deploy's chunks, which is a blank screen.
    expect(cacheControlFor('/index.html')).toBe('no-cache');
    expect(cacheControlFor('/')).toBe('no-cache');
  });
});

describe('isServerPath', () => {
  it('keeps the SPA away from everything the server owns', () => {
    expect(isServerPath('/tasker.health.v1.HealthService/Ping')).toBe(true);
    expect(isServerPath('/api/auth/password/login')).toBe(true);
    expect(isServerPath('/healthz')).toBe(true);
    expect(isServerPath('/metrics')).toBe(true);
  });

  it('leaves application routes alone', () => {
    expect(isServerPath('/tasks/abc')).toBe(false);
    expect(isServerPath('/')).toBe(false);
  });
});

describe('StaticSite', () => {
  it('serves index.html at the root', () => {
    const asset = site(APP).resolve('/')!;
    expect(Buffer.from(asset.body).toString()).toContain('id="root"');
    expect(asset.contentType).toBe('text/html; charset=utf-8');
  });

  it('serves a file by its own path', () => {
    const asset = site(APP).resolve('/assets/index-abc123.js')!;
    expect(Buffer.from(asset.body).toString()).toBe('console.log(1)');
    expect(asset.cacheControl).toContain('immutable');
  });

  it('falls back to index.html for a deep link', () => {
    // The rule the milestone names: `/tasks/abc` typed into the address bar
    // must load the app, not a 404 from a server that never heard of it.
    const asset = site(APP).resolve('/tasks/abc')!;
    expect(Buffer.from(asset.body).toString()).toContain('id="root"');
    expect(asset.cacheControl).toBe('no-cache');
  });

  it('404s a missing asset instead of handing back HTML', () => {
    // Asset names are fingerprints, so a miss is a stale index or a broken
    // build. Answering with HTML makes a script tag fail on a syntax error
    // rather than a status code, which is a much worse thing to debug.
    expect(site(APP).resolve('/assets/index-stale.js')).toBeNull();
  });

  it('never answers for a path the server owns', () => {
    for (const path of ['/tasker.health.v1.HealthService/Ping', '/api/auth/session', '/healthz']) {
      expect(site(APP).resolve(path)).toBeNull();
    }
  });

  it('answers nothing at all when no bundle was embedded', () => {
    // The dev case: Vite serves the GUI, and this must fall straight through
    // to the RPC handler exactly as it did before the bundle existed.
    const empty = new StaticSite({});
    expect(empty.isEmpty).toBe(true);
    expect(empty.resolve('/')).toBeNull();
    expect(empty.resolve('/tasks/abc')).toBeNull();
  });

  it('has no fallback to offer when the bundle lacks an index', () => {
    const partial = site({ '/assets/x.js': 'x' });
    expect(partial.resolve('/tasks/abc')).toBeNull();
  });

  it('round-trips bytes that are not text', () => {
    // Fonts and images go through the same base64 manifest as the JS.
    const bytes = new Uint8Array([0x00, 0xff, 0x10, 0x89, 0x50, 0x4e, 0x47]);
    const s = new StaticSite({ '/logo.png': Buffer.from(bytes).toString('base64') });
    expect(Array.from(s.resolve('/logo.png')!.body)).toEqual(Array.from(bytes));
  });

  it('reports how much it is carrying', () => {
    expect(site(APP).fileCount).toBe(4);
  });
});

describe('the committed bundle', () => {
  it('is empty, so a two-megabyte build artefact cannot be committed quietly', () => {
    // `scripts/bundle-gui.ts` fills this in immediately before `--compile` and
    // empties it again afterwards. Git should only ever see the empty one.
    const committed = readFileSync(join(import.meta.dir, '../assets/guiBundle.json'), 'utf8');
    expect(JSON.parse(committed)).toEqual({});
  });
});
