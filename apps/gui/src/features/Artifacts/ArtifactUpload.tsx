import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { ArtifactService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const artifactClient = createClient(ArtifactService, transport);

/**
 * The backend accepts 15,000,000 characters of `content`. Base64 inflates by
 * 4/3, so that is the real ceiling on raw bytes — a file just under it would be
 * rejected server-side after the whole upload, which is a slow way to learn.
 * The limit is checked here so the answer is immediate.
 */
export const MAX_UPLOAD_BYTES = Math.floor(15_000_000 * 0.75);

/** Browsers leave `file.type` empty for plenty of ordinary files. */
const BY_EXTENSION: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

export function contentTypeOf(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  // Never guessed as text: a mislabelled binary rendered as markdown is a wall
  // of mojibake, while an unknown type is merely undisplayable.
  return BY_EXTENSION[ext] ?? 'application/octet-stream';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The base64 body of a data: URL, without the `data:...;base64,` prefix. */
function readAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read that file'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a file into a folder as an artifact.
 *
 * `createArtifact` has always taken `content` and `contentType`, and the viewer
 * has always rendered `image/*` from base64 — but nothing in the GUI ever sent
 * either, so every artifact created here was an empty text file. This is the
 * missing half.
 */
export function ArtifactUpload({ folderId }: { folderId: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tooLarge, setTooLarge] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const content = await readAsBase64(file);
      await artifactClient.createArtifact({
        folderId,
        name: file.name,
        description: '',
        content,
        contentType: contentTypeOf(file),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      setPreview(null);
      if (inputRef.current) inputRef.current.value = '';
    },
  });

  const onPick = (file: File | undefined) => {
    if (!file) return;
    setTooLarge(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setTooLarge(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    // Shown before the upload finishes, so a mis-picked file is obvious while
    // it still costs nothing to change.
    setPreview(file.type.startsWith('image/') ? { name: file.name, url: URL.createObjectURL(file) } : null);
    upload.mutate(file);
  };

  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      <label className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          disabled={upload.isPending}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        {upload.isPending ? 'Uploading…' : '↑ Upload a file'}
      </label>

      {preview && (
        <img src={preview.url} alt={`Preview of ${preview.name}`} className="max-h-24 rounded-sm border self-start" />
      )}
      {tooLarge && <span className="text-xs text-destructive">{tooLarge}</span>}
      {upload.isError && (
        <span className="text-xs text-destructive">Upload failed: {(upload.error as Error).message}</span>
      )}
    </div>
  );
}
