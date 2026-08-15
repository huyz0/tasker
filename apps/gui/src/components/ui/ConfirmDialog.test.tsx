import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useConfirm, type ConfirmOptions } from './ConfirmDialog';

/** A button that asks, and reports what the user decided. */
function Host({ options, onResult }: { options: ConfirmOptions; onResult: (ok: boolean) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  return (
    <div>
      <button onClick={async () => onResult(await confirm(options))}>Do the thing</button>
      {confirmDialog}
    </div>
  );
}

const PERMANENT: ConfirmOptions = {
  title: 'Revoke "CI token"?',
  consequence: 'Anything using this token stops working immediately.',
  undo: null,
  confirmLabel: 'Revoke token',
};

const REVERSIBLE: ConfirmOptions = {
  title: 'Move "Fix the login bug" to the bin?',
  consequence: 'The task stops appearing on the board and in lists.',
  undo: 'You can restore it from the Bin.',
  confirmLabel: 'Move to bin',
};

const ask = () => fireEvent.click(screen.getByRole('button', { name: 'Do the thing' }));

describe('useConfirm', () => {
  it('names the consequence and the undo path, not just the question', async () => {
    render(<Host options={REVERSIBLE} onResult={vi.fn()} />);
    ask();

    // window.confirm gave one line of text, so "you can restore it" and "this is
    // permanent" arrived looking identical (M06-T04).
    expect(await screen.findByText('The task stops appearing on the board and in lists.')).toBeInTheDocument();
    expect(screen.getByText('You can restore it from the Bin.')).toBeInTheDocument();
  });

  it('says so plainly when nothing can be undone', async () => {
    render(<Host options={PERMANENT} onResult={vi.fn()} />);
    ask();
    expect(await screen.findByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('labels the confirming button with the verb, not "OK"', async () => {
    render(<Host options={PERMANENT} onResult={vi.fn()} />);
    ask();
    expect(await screen.findByRole('button', { name: 'Revoke token' })).toBeInTheDocument();
  });

  it('resolves true when confirmed', async () => {
    const onResult = vi.fn();
    render(<Host options={REVERSIBLE} onResult={onResult} />);
    ask();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to bin' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('resolves false when cancelled', async () => {
    const onResult = vi.fn();
    render(<Host options={REVERSIBLE} onResult={onResult} />);
    ask();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('resolves false on Escape rather than leaving the caller waiting', async () => {
    const onResult = vi.fn();
    render(<Host options={REVERSIBLE} onResult={onResult} />);
    ask();
    await screen.findByTestId('confirm-dialog');

    fireEvent.keyDown(document, { key: 'Escape' });

    // A promise left pending on Escape hangs the caller's `await` forever, and
    // the button it came from stays disabled with no error to explain it.
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('closes after a decision, so the next ask starts clean', async () => {
    render(<Host options={REVERSIBLE} onResult={vi.fn()} />);
    ask();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());

    ask();
    expect(await screen.findByTestId('confirm-dialog')).toBeInTheDocument();
  });

  it('treats an irreversible action as destructive without being told twice', async () => {
    render(<Host options={PERMANENT} onResult={vi.fn()} />);
    ask();
    const confirmButton = await screen.findByRole('button', { name: 'Revoke token' });
    // `undo: null` already says this is permanent; requiring `destructive: true`
    // as well is a second chance to get it wrong.
    expect(confirmButton.className).toContain('bg-destructive');
  });

  it('lets a reversible action override and still look destructive', async () => {
    render(<Host options={{ ...REVERSIBLE, destructive: true }} onResult={vi.fn()} />);
    ask();
    expect((await screen.findByRole('button', { name: 'Move to bin' })).className).toContain('bg-destructive');
  });

  it('falls back to "Confirm" when no verb is given', async () => {
    render(<Host options={{ title: 'Sure?', consequence: 'Something happens.', undo: 'Reversible.' }} onResult={vi.fn()} />);
    ask();
    const button = await screen.findByRole('button', { name: 'Confirm' });
    // Not destructive: reversible and not marked otherwise.
    expect(button.className).toContain('bg-primary');
  });

  it('offers Cancel first, so it takes focus on open', async () => {
    render(<Host options={PERMANENT} onResult={vi.fn()} />);
    ask();
    // `Dialog` focuses the first control. For a destructive action the safe
    // default is the one that does nothing.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('is the only confirmation the app has — window.confirm appears nowhere', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(join(__dirname, '../..'));

    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      return /\bwindow\.confirm\s*\(/.test(src);
    });

    // M06's fourth exit criterion, kept true rather than swept once: the next
    // delete button is the one that would reach for the browser dialog again,
    // and nothing else would notice.
    expect(offenders).toEqual([]);
  });
});