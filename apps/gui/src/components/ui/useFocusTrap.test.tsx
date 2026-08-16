import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useRef, useState } from 'react';
import { useFocusTrap } from './useFocusTrap';

/**
 * `Dialog` was this hook's only exhaustive test bed before it moved onto
 * Radix (ADR-0011) — `useFocusTrap` still traps the mobile sidebar directly,
 * but AppShell.test.tsx never exercised two of its branches: a container
 * with nothing focusable inside it, and Shift+Tab pressed while the
 * container itself (not one of its children) holds focus. Both are real
 * states the sidebar can reach, just not ones its own tests happened to
 * construct — this file tests the hook at its own layer instead of relying
 * on a consumer to do it by accident.
 */
function Host({ active, empty = false }: { active: boolean; empty?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [closed, setClosed] = useState(false);
  useFocusTrap(containerRef, active && !closed, () => setClosed(true));
  return (
    <div>
      <button>Outside</button>
      <div ref={containerRef} data-testid="container" data-focus-trap={active ? 'on' : undefined} tabIndex={-1}>
        {!empty && (
          <>
            <button>First</button>
            <button>Last</button>
          </>
        )}
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('keeps focus on the container when there is nothing focusable inside it', () => {
    render(<Host active empty />);
    const container = screen.getByTestId('container');
    container.focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // Without this branch Tab would try to find a first/last item that does
    // not exist and throw, rather than simply leaving focus where it is.
    expect(container).toHaveFocus();
  });

  it('wraps Shift+Tab from the container itself to the last focusable item', () => {
    render(<Host active />);
    const container = screen.getByTestId('container');
    container.focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    // The container itself can hold focus (behaviour 3b's equivalent here —
    // nothing inside has been tabbed to yet); Shift+Tab from there has to
    // wrap to the last item, the same as it does from the first item.
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('wraps a plain Tab from the last item back to the first', () => {
    render(<Host active />);
    screen.getByRole('button', { name: 'Last' }).focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // The forward half of the same trap — AppShell's own sidebar test covers
    // this in an integration test too, but that test's assertion is "focus
    // stayed inside the drawer somewhere", not "wrapped to first specifically",
    // so this is the one place the exact wrap target is pinned.
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('finds the opener from the shared tracker when the container already holds focus at activation', () => {
    function AutoFocusHost() {
      const containerRef = useRef<HTMLDivElement>(null);
      const [open, setOpen] = useState(false);
      useFocusTrap(containerRef, open, () => setOpen(false));
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <div ref={containerRef} data-focus-trap="on" tabIndex={-1}>
              {/* Lands during the same commit the effect below reads
                  `document.activeElement` in — the trap activates to find
                  focus already inside, which is the branch this test pins. */}
              <input autoFocus />
            </div>
          )}
        </div>
      );
    }
    render(<AutoFocusHost />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.keyDown(document, { key: 'Escape' });

    // Restoration has to come from the module-level "last focus outside any
    // trap" tracker, since `document.activeElement` at activation was
    // already the autoFocus input, not the opener.
    expect(opener).toHaveFocus();
  });
});
