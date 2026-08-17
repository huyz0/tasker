import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { transport } from '../../lib/connectTransport';
import { ArtifactService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';

const artifactClient = createClient(ArtifactService, transport);

/**
 * The backend accepts 15,000,000 characters of `content`. Base64 inflates by
 * 4/3, so that is the real ceiling on raw bytes for a binary upload — a file
 * just under it would be rejected server-side after the whole upload, which
 * is a slow way to learn. The limit is checked here so the answer is
 * immediate.
 */
export const MAX_UPLOAD_BYTES = Math.floor(15_000_000 * 0.75);

/**
 * A text upload isn't base64-inflated (see isBinaryContentType), so its real
 * ceiling is the char cap directly - decoded UTF-8 text never has more
 * UTF-16 code units than it has bytes on disk, so bounding by file.size here
 * is always at least as strict as the backend's actual check.
 */
export const MAX_TEXT_UPLOAD_BYTES = 15_000_000;

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

/**
 * Whether a content type can only be represented as bytes, not as text.
 *
 * Every upload used to go through base64 regardless of type, but the viewer
 * only ever decoded `image/*` — every other upload (`.md`, `.txt`, `.json`,
 * `.csv`) rendered and edited as a wall of base64, and saving an edit wrote
 * that same undecoded text back as the artifact's new, permanent content.
 * `content`'s own docstring in the contract names this exact hazard: "the
 * content type does not reliably say which" encoding a given artifact uses.
 * Rather than guess at read time, this stops the ambiguity at the source -
 * only content that cannot survive being read as text is ever base64-encoded.
 */
function isBinaryContentType(contentType: string): boolean {
  return contentType.startsWith('image/') || contentType === 'application/pdf' || contentType === 'application/octet-stream';
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

function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read that file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
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
  // M18-T06: description is a real field on Artifact (main.tsp) that the
  // upload path always sent as '' - the only creation path that produces a
  // file with actual content, and it had no way to describe what the file
  // is for.
  const [description, setDescription] = useState('');

  // The preview is a blob: URL (an object URL holds memory until revoked
  // explicitly - the browser does not garbage-collect it on its own), and
  // was never revoked anywhere: not when replaced by the next pick, not on
  // upload success, not on unmount. Revoked here, once, wherever `preview`
  // stops pointing at a given URL.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const contentType = contentTypeOf(file);
      const content = isBinaryContentType(contentType) ? await readAsBase64(file) : await readAsText(file);
      await artifactClient.createArtifact({
        folderId,
        name: file.name,
        description: description.trim(),
        content,
        contentType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      setPreview(null);
      setDescription('');
      if (inputRef.current) inputRef.current.value = '';
    },
  });

  const onPick = (file: File | undefined) => {
    if (!file) return;
    setTooLarge(null);
    const limit = isBinaryContentType(contentTypeOf(file)) ? MAX_UPLOAD_BYTES : MAX_TEXT_UPLOAD_BYTES;
    if (file.size > limit) {
      setTooLarge(`${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(limit)}.`);
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
      <label className="sr-only" htmlFor={`upload-description-${folderId}`}>Description (optional)</label>
      <input
        id={`upload-description-${folderId}`}
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        disabled={upload.isPending}
        className="border p-1 rounded text-xs bg-background disabled:opacity-50"
      />
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
