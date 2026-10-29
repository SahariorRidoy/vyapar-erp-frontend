'use client';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage, fileUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

const shapes = {
  circle: 'h-20 w-20 rounded-full',
  square: 'h-20 w-20 rounded-xl',
  wide: 'h-20 w-48 rounded-xl',
};

/** Single image upload with preview (employee photo, company logo, signature). Stores the file id. */
export function ImagePicker({
  value, onChange, context, shape = 'square', label = 'Upload image', hint, disabled, className, placeholder,
}: {
  value?: string | null;
  onChange: (id: string | null) => void;
  context?: string;
  shape?: keyof typeof shapes;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file (PNG, JPG or WebP)');
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be smaller than 5 MB');
    setBusy(true);
    try {
      const [uploaded] = await api.upload([file], context);
      onChange(uploaded?._id ?? null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className={cn(
          'group relative flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-slate-300 bg-slate-50 text-slate-400 transition hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed',
          shapes[shape],
          value && 'border-solid border-slate-200 bg-white',
        )}
        aria-label={label}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated file served by the API
          <img src={fileUrl(value)} alt="" className={cn('h-full w-full', shape === 'circle' ? 'object-cover' : 'object-contain p-1')} />
        ) : (
          (placeholder ?? <ImagePlus className="h-6 w-6" />)
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </span>
        )}
      </button>
      {!disabled && (
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className="text-sm font-medium text-blue-600 hover:text-blue-700">
              {value ? 'Change' : label}
            </button>
            {value && (
              <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-rose-600">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
      )}
      <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
