'use client';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage, fileUrl, type UploadedFile } from '@/lib/api';
import { cn } from '@/lib/utils';

export type FileRef = { _id: string; originalName?: string; mime?: string; size?: number };

/** Uploads to hosting storage through the API and returns file ids. */
export function FileUpload({ value, onChange, multiple = true, accept = 'image/*,application/pdf', label = 'Attach files', context, className, max = 10, disabled = false, stacked = false }: {
  value: FileRef[];
  onChange: (files: FileRef[]) => void;
  multiple?: boolean;
  accept?: string;
  label?: string;
  context?: string;
  className?: string;
  max?: number;
  /** Read-only: files stay downloadable but cannot be added or removed. */
  disabled?: boolean;
  /** One file per line with the add button below, which reads "Add more" once something is attached. */
  stacked?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const uploaded: UploadedFile[] = await api.upload(list, context);
      onChange(multiple ? [...value, ...uploaded].slice(0, max) : uploaded.slice(0, 1));
      toast.success(`${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className={className}>
      <div className={stacked ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-2'}>
        {value.map((f) => (
          <span key={f._id} className={cn('inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1 pr-1 pl-2 text-xs', stacked ? 'w-full bg-white' : 'max-w-[220px]')}>
            {f.mime?.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5 text-blue-500" /> : <FileText className="h-3.5 w-3.5 text-rose-500" />}
            <a href={fileUrl(f._id)} target="_blank" rel="noreferrer" className={cn('truncate text-slate-700 hover:underline', stacked && 'flex-1')}>
              {f.originalName ?? 'File'}
            </a>
            {!disabled && (
              <button type="button" onClick={() => onChange(value.filter((x) => x._id !== f._id))} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Remove file">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {disabled && value.length === 0 && <span className="text-xs text-slate-400">No attachments</span>}
        {!disabled && (multiple || value.length === 0) && value.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={cn('inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600', stacked && 'w-full justify-center bg-white', busy && 'opacity-60')}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : stacked && value.length ? <Plus className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}{' '}
            {busy ? 'Uploading…' : stacked && value.length ? 'Add more' : label}
          </button>
        )}
      </div>
      <input ref={input} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
