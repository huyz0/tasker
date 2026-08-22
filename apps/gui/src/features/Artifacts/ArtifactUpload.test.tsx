import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { ArtifactUpload, contentTypeOf, formatBytes, MAX_UPLOAD_BYTES, MAX_TEXT_UPLOAD_BYTES } from './ArtifactUpload';

/** Registers CreateArtifact and records every request it receives. */
function withCreateArtifact(response: object = { artifact: { id: 'art-1' } }) {
  const requests: any[] = [];
  mockRpc(ArtifactService, 'CreateArtifact', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

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
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown', 'hello'));

    // An empty `description` is proto3's default for a string field, so the
    // real JSON codec omits it from the wire entirely rather than sending ''.
    await waitFor(() => expect(requests).toContainEqual({
      folderId: 'fld-1',
      name: 'notes.md',
      contentType: 'text/markdown',
      content: 'hello',
    }));
  });

  // M18-T06: description is a real field on Artifact that the upload path
  // always sent as '' - the only creation path that produces a file with
  // actual content had no way to describe what it was for.
  it('sends the typed description alongside the upload, then clears it on success', async () => {
    const requests = withCreateArtifact();
    renderUpload();

    fireEvent.change(screen.getByPlaceholderText('Description (optional)'), { target: { value: '  Q3 roadmap  ' } });
    pick(fileOf('notes.md', 'text/markdown', 'hello'));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ description: 'Q3 roadmap' })));
    await waitFor(() => expect(screen.getByPlaceholderText('Description (optional)')).toHaveValue(''));
  });

  it('keeps the typed description when the upload fails', async () => {
    mockRpcError(ArtifactService, 'CreateArtifact', 'permission_denied', 'permission denied');
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
    const pending = mockRpcPending(ArtifactService, 'CreateArtifact');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <ArtifactUpload folderId="fld-1" />
      </QueryClientProvider>,
    );
    pick(fileOf('notes.md', 'text/markdown', 'hello'));

    await waitFor(() => expect(screen.getByText('Uploading…')).toBeInTheDocument());
    unmount();
    pending.resolve({ artifact: { id: 'art-1' } });

    // There's nothing left in the DOM to assert on post-unmount, and this
    // still has to prove onSuccess actually ran the line it exists to cover
    // rather than just not-throwing - a test that returns the instant
    // `resolve()` is called can exit before that microtask runs at all,
    // which is exactly what made this branch's coverage flip between
    // otherwise-identical runs. `invalidateQueries` is the one onSuccess
    // side effect visible without a mounted component, so waiting on it
    // pins the test to onSuccess having actually completed - including the
    // `if (inputRef.current)` line right after it - before the test ends.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['artifacts'] }));
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
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('photo.png', 'image/png', 'hello'));

    await waitFor(() => expect(requests).toContainEqual({
      folderId: 'fld-1',
      name: 'photo.png',
      contentType: 'image/png',
      // btoa('hello'). The viewer decodes exactly this for image/*.
      content: 'aGVsbG8=',
    }));
  });

  it('sends a PDF and an unrecognized file base64-encoded too, not just images', async () => {
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('report.pdf', 'application/pdf', 'hello'));
    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ content: 'aGVsbG8=' })));

    pick(fileOf('blob.xyz', '', 'hello'));
    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({
      contentType: 'application/octet-stream',
      content: 'aGVsbG8=',
    })));
  });

  it('refuses a file over the limit without uploading it', async () => {
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('huge.png', 'image/png', 'x', MAX_UPLOAD_BYTES + 1));

    // The server would reject it too, but only after the whole body was sent.
    expect(await screen.findByText(/huge\.png is .* the limit is/)).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('accepts a file exactly at the limit', async () => {
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('edge.png', 'image/png', 'x', MAX_UPLOAD_BYTES));
    // An off-by-one here rejects a file the server would have taken.
    await waitFor(() => expect(requests).toHaveLength(1));
  });

  // M18-T04: a text upload is no longer base64-inflated (see
  // isBinaryContentType), so it gets the full char cap as its byte limit
  // instead of the base64-adjusted one - a plain-text file between the two
  // limits used to be refused even though the server would accept it.
  it('holds a text upload to the full char cap, not the base64-adjusted one', async () => {
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('big.md', 'text/markdown', 'x', MAX_UPLOAD_BYTES + 1));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.queryByText(/the limit is/)).toBeNull();
  });

  it('refuses a text upload over its own (larger) limit', async () => {
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('huge.md', 'text/markdown', 'x', MAX_TEXT_UPLOAD_BYTES + 1));
    expect(await screen.findByText(/huge\.md is .* the limit is/)).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('previews an image while it uploads', async () => {
    renderUpload();
    pick(fileOf('shot.png', 'image/png'));
    const img = await screen.findByAltText('Preview of shot.png');
    expect(img).toHaveAttribute('src', 'blob:preview');
  });

  it('does not try to preview a non-image', async () => {
    const requests = withCreateArtifact();
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.queryByAltText(/Preview of/)).toBeNull();
  });

  it('reports a failed upload', async () => {
    mockRpcError(ArtifactService, 'CreateArtifact', 'permission_denied', 'permission denied');
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown'));
    expect(await screen.findByText(/Upload failed:.*permission denied/)).toBeInTheDocument();
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
    const pending = mockRpcPending(ArtifactService, 'CreateArtifact');
    renderUpload();
    pick(fileOf('notes.md', 'text/markdown'));

    expect(await screen.findByText('Uploading…')).toBeInTheDocument();
    pending.resolve({ artifact: { id: 'art-1' } });
    await waitFor(() => expect(screen.getByText('↑ Upload a file')).toBeInTheDocument());
  });

  it('ignores a cancelled file dialog', () => {
    const requests = withCreateArtifact();
    renderUpload();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(requests).toHaveLength(0);
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
