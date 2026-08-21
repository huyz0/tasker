import { spawn } from 'node:child_process';
import { logger } from './logger';

/**
 * Opens a URL in the machine's default browser (M09-T05, `--open`).
 *
 * Three commands because there is no portable one, and a table of them beats a
 * dependency for something this small.
 */
export function browserCommandFor(platform: NodeJS.Platform): { command: string; args: string[] } | null {
  if (platform === 'darwin') return { command: 'open', args: [] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', ''] };
  if (platform === 'linux') return { command: 'xdg-open', args: [] };
  return null;
}

/**
 * Best-effort by design.
 *
 * A headless server, a container, a machine with no `xdg-open` — none of those
 * are reasons to fail a start that has already succeeded. The URL is in the
 * log either way, so the worst case is that the person clicks it themselves.
 */
export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnFn: typeof spawn = spawn,
): boolean {
  const cmd = browserCommandFor(platform);
  if (!cmd) {
    logger.info({ url, platform }, 'browser.open_unsupported');
    return false;
  }

  try {
    // Detached and with its streams released: the browser must outlive this
    // call and must not hold the server's stdout open.
    const child = spawnFn(cmd.command, [...cmd.args, url], { detached: true, stdio: 'ignore' });
    child.on?.('error', (err: Error) => logger.warn({ err, url }, 'browser.open_failed'));
    child.unref?.();
    return true;
  } catch (err) {
    logger.warn({ err, url }, 'browser.open_failed');
    return false;
  }
}
