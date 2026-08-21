import { z } from 'zod';

/**
 * Command-line options for the standalone binary (M09-T05).
 *
 * Layered under the existing environment configuration rather than beside it:
 * a flag beats an environment variable beats a default. Someone running a
 * downloaded binary reaches for `--port 9000`; a deployment sets `PORT`. Both
 * work, and when both are present the one typed on the spot wins, because that
 * is the one the person can see.
 *
 * Kept apart from `config.ts` because that module reads `process.env` at
 * import time and exits the process when it dislikes what it finds — useful
 * behaviour for a server, impossible to test a parser through.
 */

export class CliError extends Error {}

export const HELP_TEXT = `tasker — a single-binary task tracker

Usage: tasker [options]

Options:
  --port <n>     Port to listen on (default 8080, or $PORT)
  --db <path>    SQLite database file (default ./.data/local.sqlite, or $DB_PATH)
  --open         Open a browser once the server is listening
  --seed         On first run only, create a starter organization and project
  -h, --help     Show this message
  -v, --version  Show the version
`;

const optionsSchema = z.object({
  port: z.coerce.number().int().min(1, 'port must be between 1 and 65535').max(65535, 'port must be between 1 and 65535'),
  dbPath: z.string().min(1, 'db path cannot be empty'),
  open: z.boolean(),
  seed: z.boolean(),
});

export type RuntimeOptions = z.infer<typeof optionsSchema>;

export const DEFAULT_PORT = 8080;
export const DEFAULT_DB_PATH = '.data/local.sqlite';

/** Flags that take a value, as `--flag value` or `--flag=value`. */
const VALUED = new Set(['--port', '--db']);
/** Flags that are on/off. */
const BOOLEAN = new Set(['--open', '--seed']);

export interface ParsedFlags {
  port?: string;
  dbPath?: string;
  open?: boolean;
  seed?: boolean;
  help?: boolean;
  version?: boolean;
}

/**
 * Splits argv into named flags, refusing anything it does not recognise.
 *
 * Refusing rather than ignoring: a typo'd `--prot 9000` that silently starts on
 * 8080 is worse than an error, because the person has evidence they set the
 * port and the server has evidence they did not.
 */
export function parseCliFlags(argv: string[]): ParsedFlags {
  const flags: ParsedFlags = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);

    if (name === '-h' || name === '--help') {
      flags.help = true;
    } else if (name === '-v' || name === '--version') {
      flags.version = true;
    } else if (VALUED.has(name)) {
      const value = inlineValue ?? argv[++i];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`${name} needs a value`);
      }
      if (name === '--port') flags.port = value;
      else flags.dbPath = value;
    } else if (BOOLEAN.has(name)) {
      if (inlineValue !== undefined) throw new CliError(`${name} does not take a value`);
      flags[name.slice(2) as 'open' | 'seed'] = true;
    } else {
      throw new CliError(`unknown option: ${name}`);
    }
  }

  return flags;
}

/**
 * The settings the server should actually run with.
 *
 * Validation is Zod's, and its message is what the person sees — so `--port
 * abc` says what is wrong with the port rather than printing a stack trace
 * from `listen()` several steps later.
 */
export function resolveRuntimeOptions(argv: string[], env: Record<string, string | undefined> = {}): RuntimeOptions {
  const flags = parseCliFlags(argv);

  const parsed = optionsSchema.safeParse({
    port: flags.port ?? env.PORT ?? DEFAULT_PORT,
    dbPath: flags.dbPath ?? env.DB_PATH ?? DEFAULT_DB_PATH,
    open: flags.open ?? false,
    seed: flags.seed ?? false,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new CliError(`invalid ${issue.path.join('.') || 'option'}: ${issue.message}`);
  }

  return parsed.data;
}
