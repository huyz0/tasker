import { describe, it, expect } from 'bun:test';
import { browserCommandFor, openBrowser } from './openBrowser';

describe('browserCommandFor', () => {
  it('knows the command for each platform the binary is released for', () => {
    expect(browserCommandFor('darwin')).toEqual({ command: 'open', args: [] });
    expect(browserCommandFor('linux')).toEqual({ command: 'xdg-open', args: [] });
    // The empty string is the title argument `start` otherwise takes from the
    // URL, which turns a quoted URL into a window title and opens nothing.
    expect(browserCommandFor('win32')).toEqual({ command: 'cmd', args: ['/c', 'start', ''] });
  });

  it('has no answer for a platform it does not know, rather than guessing', () => {
    expect(browserCommandFor('aix')).toBeNull();
  });
});

describe('openBrowser', () => {
  const fakeChild = () => ({ on: () => {}, unref: () => {} });

  it('passes the URL to the platform command', () => {
    const calls: any[] = [];
    openBrowser('http://localhost:8080', 'linux', ((cmd: string, args: string[], opts: any) => {
      calls.push({ cmd, args, opts });
      return fakeChild();
    }) as any);

    expect(calls[0].cmd).toBe('xdg-open');
    expect(calls[0].args).toEqual(['http://localhost:8080']);
  });

  it('detaches the browser so it outlives the call and releases stdout', () => {
    const calls: any[] = [];
    openBrowser('http://localhost:8080', 'darwin', ((cmd: string, args: string[], opts: any) => {
      calls.push(opts);
      return fakeChild();
    }) as any);

    expect(calls[0]).toEqual({ detached: true, stdio: 'ignore' });
  });

  it('does nothing on a platform it has no command for', () => {
    let spawned = false;
    const opened = openBrowser('http://localhost:8080', 'aix', (() => {
      spawned = true;
      return fakeChild();
    }) as any);

    expect(opened).toBe(false);
    expect(spawned).toBe(false);
  });

  it('survives a machine with no browser at all', () => {
    // A headless server or a container is not a reason to fail a start that
    // has already succeeded — the URL is in the log either way.
    const opened = openBrowser('http://localhost:8080', 'linux', (() => {
      throw new Error('spawn xdg-open ENOENT');
    }) as any);

    expect(opened).toBe(false);
  });
});
