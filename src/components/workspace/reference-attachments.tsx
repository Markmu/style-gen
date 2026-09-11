"use client";

import { X } from 'lucide-react';
import { AppIcon } from '@/components/ui/app-icon';
import type { ReferenceAttachment } from '@/lib/workspace/draft-store';

export function ReferenceAttachments({ references, busy, onRemove, onRetry }: {
  references: ReferenceAttachment[];
  busy: boolean;
  onRemove: (file: Blob) => void;
  onRetry: () => void;
}) {
  if (!references.length) return null;
  return <div className="mb-3" aria-label="Reference images">
    <ul className="flex items-start gap-3">
      {references.map((reference, index) => <li key={index} className="w-20 shrink-0">
        <div className="relative h-20 overflow-hidden rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]">
          {reference.uploaded ? (
            // Uploaded references use their original URL; Next optimization is unnecessary for these small previews.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reference.uploaded.fileUrl} alt={`Reference ${index + 1}: ${reference.name}`} className="h-full w-full object-cover" />
          ) : <span className="flex h-full items-center justify-center px-2 text-center text-xs text-[var(--text-secondary)]">{busy ? 'Uploading…' : 'Not uploaded'}</span>}
          <button type="button" disabled={busy} onClick={()=>onRemove(reference.file)} aria-label={`Remove reference ${index + 1}`} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-static)] bg-[var(--surface-floating)] text-sm text-[var(--text-primary)] hover:bg-[var(--surface-bright)] focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] disabled:opacity-40"><AppIcon icon={X} size={16} /></button>
        </div>
        <p title={reference.name} className="mt-1 truncate text-xs text-[var(--text-secondary)]">{reference.name}</p>
      </li>)}
    </ul>
    <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
      <span role="status">{references.filter(reference=>reference.uploaded).length}/{references.length} uploaded - Analyze together</span>
      {!busy && references.some(reference=>!reference.uploaded) && <button type="button" onClick={onRetry} className="underline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]">Retry upload</button>}
    </div>
  </div>;
}
