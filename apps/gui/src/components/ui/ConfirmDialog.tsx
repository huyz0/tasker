import { useCallback, useRef, useState } from 'react';
import { Dialog } from './Dialog';

/**
 * A confirmation that says what will happen and whether it can be taken back.
 *
 * `window.confirm` was used at thirteen call sites. It is unstyled, ignores the
 * theme, blocks the whole thread, cannot be driven by a test without stubbing a
 * global, and — the reason this exists rather than a nicer-looking clone — it
 * gives the reader one line of text and two identical buttons. "Move to the
 * bin? You can restore it later" and "Delete this comment? This cannot be
 * undone" arrived looking exactly alike.
 *
 * So the shape is deliberate: the **consequence** and the **undo path** are
 * separate fields, and the undo path is required. Passing `undo: null` is how
 * you say "this is permanent", and it renders as such.
 */
export interface ConfirmOptions {
  /** What is about to happen, naming the thing. "Move "Fix the login bug" to the bin?" */
  title: string;
  /** What it does. One sentence, present tense. */
  consequence: string;
  /** How to reverse it, or `null` when nothing can. */
  undo: string | null;
  /** The verb on the confirming button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** `true` when the action destroys something irreversibly. Defaults to `undo === null`. */
  destructive?: boolean;
}

/**
 * Returns an `await`-able `confirm` and the dialog to render.
 *
 * The promise is what keeps the thirteen call sites one line each: an
 * `if (window.confirm(...))` becomes `if (await confirm({...}))` rather than a
 * state machine per button.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOptions(null);
    // Every close path settles the promise. Leaving it pending on Escape or the
    // backdrop would hang the caller's `await` forever, and the button it came
    // from would stay disabled with no error.
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  const destructive = options ? (options.destructive ?? options.undo === null) : false;

  const confirmDialog = options ? (
    <Dialog
      open
      onClose={() => settle(false)}
      title={options.title}
      className="w-full max-w-md"
      data-testid="confirm-dialog"
    >
      <div className="p-4 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{options.consequence}</p>
        <p className={`text-sm ${options.undo === null ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {options.undo ?? 'This cannot be undone.'}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => settle(false)}
            className="px-3 py-1.5 rounded-md text-sm font-medium border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => settle(true)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </Dialog>
  ) : null;

  return { confirm, confirmDialog };
}
