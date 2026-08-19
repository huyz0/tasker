import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactUpload, contentTypeOf, formatBytes, MAX_UPLOAD_BYTES, MAX_TEXT_UPLOAD_BYTES } from './ArtifactUpload';

const mockCreate = vi.fn();

vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ ArtifactService: 'ArtifactService' }));
vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: () => ({ createArtifact: (...a: unknown[]) => mockCreate(...a) }),
}));

const renderUpload = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ArtifactUpload folderId="fld-1" />
    </QueryClientProvider>,
  );
};

/** jsdom's File is real enough to read; `size` is what the limit check uses. */
const fileOf = (name: string, type: string, body = 'hello', size?: number) => {
  const f = new File([body], name, { type });
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
};

const pick = (file: File) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return input;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ artifact: { id: 'art-1' } });
  // jsdom has no object URLs.
  (URL as any).createObjectURL = vi.fn(() => 'blob:preview');
});

describe('contentTypeOf', () => {
  it('trusts the browser when it has an opinion', () => {
    expect(contentTypeOf({ name: 'a.png', type: 'image/png' })).toBe('image/png');
  });

  it('falls back to the extension, because browsers often say nothing', () => {
    expect(contentTypeOf({ name: 'notes.md', type: '' })).toBe('text/markdown');
    expect(contentTypeOf({ name: 'photo.JPG', type: '' })).toBe('image/jpeg');
  });

  it('calls an unknown file binary rather than guessing text', () => {
    // Rendering a mislabelled binary as markdown produces a wall of mojibake;
    // an unknown type is merely undisplayable.
    expect(contentTypeOf({ name: 'blob.xyz', type: '' })).toBe('application/octet-stream');
    expect(contentTypeOf({ name: 'noextension', type: '' })).toBe('application/octet-stream');
  });
});

describe('formatBytes', () => {
  it('scales the unit so the number stays readable', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('ArtifactUpload', () => {
  // M18-T04: every upload used to go through base64 regardless of type, but
  // the viewer only ever decoded image/* - a markdown/text/json/csv upload
  // rendered and edited as a wall of base64, and saving an edit permanently
  // overwrote the artifact with that undecoded text.
  it('sends a text upload as plain text, not base64', async () => {
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown', 'hello'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({
      folderId: 'fld-1',
      name: 'notes.md',
      description: '',
      contentType: 'text/markdown',
      content: 'hello',
    }));
  });

  // M18-T06: description is a real field on Artifact that the upload path
  // always sent as '' - the only creation path that produces a file with
  // actual content had no way to describe what it was for.
  it('sends the typed description alongside the upload, then clears it on success', async () => {
    mockCreate.mockResolvedValue({ artifact: { id: 'art-1' } });
    renderUpload();

    fireEvent.change(screen.getByPlaceholderText('Description (optional)'), { target: { value: '  Q3 roadmap  ' } });
    pick(fileOf('notes.md', 'text/markdown', 'hello'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ description: 'Q3 roadmap' })));
    await waitFor(() => expect(screen.getByPlaceholderText('Description (optional)')).toHaveValue(''));
  });

  it('keeps the typed description when the upload fails', async () => {
    mockCreate.mockRejectedValue(new Error('permission denied'));
    renderUpload();

    fireEvent.change(screen.getByPlaceholderText('Description (optional)'), { target: { value: 'Q3 roadmap' } });
    pick(fileOf('notes.md', 'text/markdown', 'hello'));

    await screen.findByText(/Upload failed/);
    expect(screen.getByPlaceholderText('Description (optional)')).toHaveValue('Q3 roadmap');
  });

  // Flaky-coverage fix, found incidentally while verifying an unrelated
  // milestone: onSuccess resets the file input via inputRef.current, which is
  // null once the component has unmounted - a real case (the upload finishes
  // after the user has navigated away), and previously the only uncovered
  // branch in this file, intermittently flipping v8's coverage report across
  // otherwise-identical runs.
  it('does not touch the file input if the component unmounted before the upload resolved', async () => {
    let resolveCreate!: (value: unknown) => void;
    // Bound synchronously, unlike mockImplementation - the mutationFn awaits
    // jsdom's (async) FileReader before calling this, so a promise created
    // lazily inside the mock wouldn't exist yet when the test tries to
    // resolve it.
    mockCreate.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const { unmount } = renderUpload();
    pick(fileOf('notes.md', 'text/markdown', 'hello'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    unmount();
    resolveCreate({ artifact: { id: 'art-1' } });

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  });

  it('revokes the previous preview URL when a new image is picked, and on unmount', async () => {
    const revoke = vi.fn();
    (URL as any).revokeObjectURL = revoke;
    let createCount = 0;
    (URL as any).createObjectURL = vi.fn(() => `blob:preview-${++createCount}`);

    const { unmount } = renderUpload();
    pick(fileOf('first.png', 'image/png'));
    await screen.findByAltText('Preview of first.png');

    pick(fileOf('second.png', 'image/png'));
    await screen.findByAltText('Preview of second.png');
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:preview-1'));

    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:preview-2');
  });

  it('sends a binary upload (image) base64-encoded, with its name and type', async () => {
    renderUpload();
    pick(fileOf('photo.png', 'image/png', 'hello'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({
      folderId: 'fld-1',
      name: 'photo.png',
      description: '',
      contentType: 'image/png',
      // btoa('hello'). The viewer decodes exactly this for image/*.
      content: 'aGVsbG8=',
    }));
  });

  it('sends a PDF and an unrecognized file base64-encoded too, not just images', async () => {
    renderUpload();
    pick(fileOf('report.pdf', 'application/pdf', 'hello'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ content: 'aGVsbG8=' })));

    mockCreate.mockClear();
    pick(fileOf('blob.xyz', '', 'hello'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'application/octet-stream',
      content: 'aGVsbG8=',
    })));
  });

  it('refuses a file over the limit without uploading it', async () => {
    renderUpload();
    pick(fileOf('huge.png', 'image/png', 'x', MAX_UPLOAD_BYTES + 1));

    // The server would reject it too, but only after the whole body was sent.
    expect(await screen.findByText(/huge\.png is .* the limit is/)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the limit', async () => {
    renderUpload();
    pick(fileOf('edge.png', 'image/png', 'x', MAX_UPLOAD_BYTES));
    // An off-by-one here rejects a file the server would have taken.
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  });

  // M18-T04: a text upload is no longer base64-inflated (see
  // isBinaryContentType), so it gets the full char cap as its byte limit
  // instead of the base64-adjusted one - a plain-text file between the two
  // limits used to be refused even though the server would accept it.
  it('holds a text upload to the full char cap, not the base64-adjusted one', async () => {
    renderUpload();
    pick(fileOf('big.md', 'text/markdown', 'x', MAX_UPLOAD_BYTES + 1));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(screen.queryByText(/the limit is/)).toBeNull();
  });

  it('refuses a text upload over its own (larger) limit', async () => {
    renderUpload();
    pick(fileOf('huge.md', 'text/markdown', 'x', MAX_TEXT_UPLOAD_BYTES + 1));
    expect(await screen.findByText(/huge\.md is .* the limit is/)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('previews an image while it uploads', async () => {
    renderUpload();
    pick(fileOf('shot.png', 'image/png'));
    const img = await screen.findByAltText('Preview of shot.png');
    expect(img).toHaveAttribute('src', 'blob:preview');
  });

  it('does not try to preview a non-image', async () => {
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(screen.queryByAltText(/Preview of/)).toBeNull();
  });

  it('reports a failed upload', async () => {
    mockCreate.mockRejectedValue(new Error('permission denied'));
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown'));
    expect(await screen.findByText(/Upload failed: permission denied/)).toBeInTheDocument();
  });

  it('reports a binary file it could not read', async () => {
    const realFileReader = globalThis.FileReader;
    class FailingReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsDataURL() { queueMicrotask(() => this.onerror?.()); }
    }
    (globalThis as any).FileReader = FailingReader;
    try {
      renderUpload();
      pick(fileOf('locked.png', 'image/png'));
      // A file can genuinely fail to read — removed from the disk mid-pick, or
      // a permission error. Silence would leave the picker looking idle.
      expect(await screen.findByText(/Upload failed: could not read that file/)).toBeInTheDocument();
    } finally {
      globalThis.FileReader = realFileReader;
    }
  });

  it('reports a text file it could not read', async () => {
    const realFileReader = globalThis.FileReader;
    class FailingReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsText() { queueMicrotask(() => this.onerror?.()); }
    }
    (globalThis as any).FileReader = FailingReader;
    try {
      renderUpload();
      pick(fileOf('locked.md', 'text/markdown'));
      expect(await screen.findByText(/Upload failed: could not read that file/)).toBeInTheDocument();
    } finally {
      globalThis.FileReader = realFileReader;
    }
  });

  it('says it is uploading while the request is in flight', async () => {
    let release: (v: unknown) => void = () => {};
    mockCreate.mockReturnValue(new Promise((r) => { release = r; }));
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown'));

    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
    release({ artifact: { id: 'art-1' } });
    await waitFor(() => expect(screen.getByText('↑ Upload a file')).toBeInTheDocument());
  });

  it('ignores a cancelled file dialog', () => {
    renderUpload();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('clears the oversize warning when a smaller file is picked', async () => {
    renderUpload();
    pick(fileOf('huge.png', 'image/png', 'x', MAX_UPLOAD_BYTES + 1));
    await screen.findByText(/the limit is/);

    pick(fileOf('small.png', 'image/png'));
    // A stale warning next to a successful upload reads as a failure.
    await waitFor(() => expect(screen.queryByText(/the limit is/)).toBeNull());
  });
});
