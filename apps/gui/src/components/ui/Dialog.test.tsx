import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { expectNoA11yViolations } from '../../test/a11y';

/**
 * One test per behaviour in ADR-0009. The ADR's argument for hand-rolling
 * rather than adopting Radix is that these stop failing silently, so a
 * behaviour without a test here is not part of the contract.
 */

/** A realistic host: a trigger that opens the dialog, so focus has somewhere to return to. */
function Host({ children, hideTitle = false }: { children?: React.ReactNode; hideTitle?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open the dialog</button>
      <button>A button on the page behind</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Task Details" hideTitle={hideTitle}>
        {children ?? (
          <>
            <button>First</button>
            <button>Last</button>
          </>
        )}
      </Dialog>
    </div>
  );
}

const open = async () => {
  const trigger = screen.getByRole('button', { name: 'Open the dialog' });
  // A real click focuses the button it hits; jsdom's fireEvent.click does not.
  // Without this the opener is <body>, and "focus returns to the trigger" would
  // be testing nothing.
  trigger.focus();
  fireEvent.click(trigger);
  return screen.findByRole('dialog');
};

beforeEach(() => {
  document.body.style.overflow = '';
});

describe('Dialog — the ADR-0009 contract', () => {
  it('1. declares role="dialog" and aria-modal', async () => {
    render(<Host />);
    const dialog = await open();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('2. has an accessible name taken from its title', async () => {
    render(<Host />);
    await open();
    // Neither pre-M06 overlay had a name at all, so a screen reader announced
    // "dialog" and nothing else.
    expect(screen.getByRole('dialog', { name: 'Task Details' })).toBeInTheDocument();
  });

  it('2b. keeps the name even when the title is visually hidden', async () => {
    render(<Host hideTitle />);
    await open();
    // The search palette's own input is its visible heading; the name still has
    // to exist for anyone not looking at it.
    expect(screen.getByRole('dialog', { name: 'Task Details' })).toBeInTheDocument();
  });

  it('3. moves focus into the dialog on open', async () => {
    render(<Host />);
    await open();
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
  });

  it('3b. focuses the panel itself when it holds nothing focusable', async () => {
    render(<Host><p>Nothing to focus here.</p></Host>);
    const dialog = await open();
    // Otherwise focus stays on the page behind and the reader keeps reading it.
    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it('4. wraps Tab from the last control back to the first', async () => {
    render(<Host />);
    await open();
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // Without the trap the browser hands focus to the page behind, which is
    // what both pre-M06 overlays did.
    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());
  });

  it('4b. wraps Shift+Tab from the first control back to the last', async () => {
    render(<Host />);
    await open();
    screen.getByRole('button', { name: 'First' }).focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus());
  });

  it('4c. keeps focus on the panel when there is nothing to cycle', async () => {
    render(<Host><p>Nothing to focus here.</p></Host>);
    const dialog = await open();

    fireEvent.keyDown(document, { key: 'Tab' });

    await waitFor(() => expect(dialog).toHaveFocus());
  });

  it('4d. leaves a hidden control out of the cycle', async () => {
    render(
      <Host>
        <button>First</button>
        <button aria-hidden="true">Decorative</button>
        <button hidden>Collapsed</button>
        <button>Last</button>
      </Host>,
    );
    await open();
    screen.getByRole('button', { name: 'First' }).focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    // Wrapping onto something the user cannot see is a focus ring that
    // vanishes — the trap has to agree with what is on screen.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus());
  });

  it('4e. wraps backwards from the panel itself to the last control', async () => {
    render(<Host />);
    const dialog = await open();
    dialog.focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus());
  });

  it('ignores keys that are neither Tab nor Escape', async () => {
    render(<Host />);
    await open();
    const first = screen.getByRole('button', { name: 'First' });
    first.focus();

    fireEvent.keyDown(document, { key: 'a' });

    // Typing inside a dialog must not move focus; the trap only owns Tab.
    expect(first).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('5. closes on Escape', async () => {
    render(<Host />);
    await open();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('6. returns focus to the trigger when Escape closes it', async () => {
    render(<Host />);
    await open();
    fireEvent.keyDown(document, { key: 'Escape' });
    // A user who opened this from the keyboard is otherwise dropped at the top
    // of the document with no idea where they were.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open the dialog' })).toHaveFocus());
  });

  it('6b. returns focus when the backdrop closes it', async () => {
    render(<Host />);
    await open();
    // The dialog is portaled to document.body, so it is not inside `container`.
    fireEvent.click(screen.getByTestId('dialog-backdrop'));
    // Restoration lives in the effect's cleanup precisely so every close path
    // gets it, not just the one the author remembered.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open the dialog' })).toHaveFocus());
  });

  it('6c. ignores an autoFocus child when deciding what opened it', async () => {
    function AutoFocusHost() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setIsOpen(true)}>Open the dialog</button>
          <Dialog open={isOpen} onClose={() => setIsOpen(false)} title="Palette">
            <input autoFocus placeholder="Type here" />
          </Dialog>
        </div>
      );
    }
    render(<AutoFocusHost />);
    const trigger = screen.getByRole('button', { name: 'Open the dialog' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });

    // autoFocus lands during the commit, before this effect runs, so
    // document.activeElement is already inside the dialog. Restoring to that
    // focuses a detached node and the browser falls back to <body> — the
    // keyboard user ends up at the top of the document. The search palette hit
    // exactly this.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('7. stops the page behind from scrolling, and gives the scroll back', async () => {
    render(<Host />);
    await open();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });

  it('renders nothing at all while closed', () => {
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    // A hidden-but-mounted dialog is still in the tab ring.
    expect(screen.queryByRole('button', { name: 'First' })).toBeNull();
  });

  it('calls onClose once per close, not once per key', async () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="T"><button>x</button></Dialog>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes the a11y audit while open', async () => {
    const { container } = render(<Host />);
    await open();
    await expectNoA11yViolations(container);
  });
});
