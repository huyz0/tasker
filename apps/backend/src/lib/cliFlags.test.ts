import { describe, it, expect } from 'bun:test';
import {
  parseCliFlags,
  resolveRuntimeOptions,
  CliError,
  DEFAULT_PORT,
  DEFAULT_DB_PATH,
  HELP_TEXT,
} from './cliFlags';

describe('parseCliFlags', () => {
  it('accepts a value as a separate argument', () => {
    expect(parseCliFlags(['--port', '9000'])).toEqual({ port: '9000' });
  });

  it('accepts a value joined with an equals sign', () => {
    // Both spellings are common enough that picking one would be a papercut.
    expect(parseCliFlags(['--port=9000'])).toEqual({ port: '9000' });
    expect(parseCliFlags(['--db=/tmp/t.sqlite'])).toEqual({ dbPath: '/tmp/t.sqlite' });
  });

  it('reads the boolean flags', () => {
    expect(parseCliFlags(['--open', '--seed'])).toEqual({ open: true, seed: true });
  });

  it('reads help and version in both spellings', () => {
    expect(parseCliFlags(['-h'])).toEqual({ help: true });
    expect(parseCliFlags(['--help'])).toEqual({ help: true });
    expect(parseCliFlags(['-v'])).toEqual({ version: true });
    expect(parseCliFlags(['--version'])).toEqual({ version: true });
  });

  it('refuses an option it does not recognise', () => {
    // A typo'd `--prot 9000` that silently starts on 8080 is worse than an
    // error: the person has evidence they set the port and the server has
    // evidence they did not.
    expect(() => parseCliFlags(['--prot', '9000'])).toThrow('unknown option: --prot');
  });

  it('refuses a value flag with nothing after it', () => {
    expect(() => parseCliFlags(['--port'])).toThrow('--port needs a value');
  });

  it('refuses a value flag followed by another flag', () => {
    // `--port --open` would otherwise take "--open" as the port and then fail
    // somewhere much less obvious.
    expect(() => parseCliFlags(['--port', '--open'])).toThrow('--port needs a value');
  });

  it('refuses a value on a boolean flag', () => {
    expect(() => parseCliFlags(['--open=yes'])).toThrow('--open does not take a value');
  });

  it('reads nothing from an empty argv', () => {
    expect(parseCliFlags([])).toEqual({});
  });
});

describe('resolveRuntimeOptions', () => {
  it('falls back to the defaults with no flags and no environment', () => {
    expect(resolveRuntimeOptions([], {})).toEqual({
      port: DEFAULT_PORT,
      dbPath: DEFAULT_DB_PATH,
      open: false,
      seed: false,
    });
  });

  it('takes the environment when there is no flag', () => {
    const opts = resolveRuntimeOptions([], { PORT: '3000', DB_PATH: '/data/t.sqlite' });
    expect(opts.port).toBe(3000);
    expect(opts.dbPath).toBe('/data/t.sqlite');
  });

  it('lets a flag beat the environment', () => {
    // The one the person typed on the spot wins, because it is the one they
    // can see.
    const opts = resolveRuntimeOptions(['--port', '9000'], { PORT: '3000' });
    expect(opts.port).toBe(9000);
  });

  it('coerces the port to a number rather than passing a string to listen()', () => {
    expect(resolveRuntimeOptions(['--port', '9000'], {}).port).toBe(9000);
  });

  it('names the port as the problem when it is not a number', () => {
    // Rather than a stack trace out of listen() several steps later.
    expect(() => resolveRuntimeOptions(['--port', 'abc'], {})).toThrow(/invalid port/);
  });

  it('rejects a port outside the range a socket can bind', () => {
    expect(() => resolveRuntimeOptions(['--port', '0'], {})).toThrow(/between 1 and 65535/);
    expect(() => resolveRuntimeOptions(['--port', '70000'], {})).toThrow(/between 1 and 65535/);
  });

  it('rejects an empty database path instead of opening something surprising', () => {
    expect(() => resolveRuntimeOptions(['--db', ''], {})).toThrow(/db path cannot be empty/);
  });

  it('rejects a bad port from the environment too', () => {
    // The env path is not a trusted shortcut around validation.
    expect(() => resolveRuntimeOptions([], { PORT: 'abc' })).toThrow(/invalid port/);
  });

  it('throws CliError, so the caller can print a message rather than a stack', () => {
    expect(() => resolveRuntimeOptions(['--nope'], {})).toThrow(CliError);
  });
});

describe('HELP_TEXT', () => {
  it('documents every flag the parser accepts', () => {
    // A flag that exists but is not in --help is a flag nobody finds.
    for (const flag of ['--port', '--db', '--open', '--seed', '--help', '--version']) {
      expect(HELP_TEXT).toContain(flag);
    }
  });

  it('names the defaults, so the reader does not have to run it to find out', () => {
    expect(HELP_TEXT).toContain(String(DEFAULT_PORT));
    expect(HELP_TEXT).toContain(DEFAULT_DB_PATH);
  });
});
