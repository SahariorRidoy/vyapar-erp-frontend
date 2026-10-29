'use client';
import { createContext, forwardRef, useContext, useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-500';

/**
 * Connects a <Field> label, hint and error to the first control inside it, so the label is announced by
 * screen readers and clicking it focuses the control. Further controls in the same field keep their own ids.
 */
const FieldCtx = createContext<{ id: string; describedBy?: string; owner: { current: string | null } } | null>(null);

/** For custom controls (pickers, chip inputs) that should also be labelled by their <Field>. */
export function useFieldControl(props: { id?: string; 'aria-describedby'?: string }) {
  const field = useContext(FieldCtx);
  const own = useId();
  if (!field || props.id) return { id: props.id, 'aria-describedby': props['aria-describedby'] };
  field.owner.current ??= own;
  return field.owner.current === own ? { id: field.id, 'aria-describedby': props['aria-describedby'] ?? field.describedBy } : { id: undefined, 'aria-describedby': props['aria-describedby'] };
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  const a11y = useFieldControl(props);
  return <input ref={ref} className={cn(base, 'h-9', className)} {...props} {...a11y} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...props }, ref) {
  const a11y = useFieldControl(props);
  return <textarea ref={ref} rows={rows} className={cn(base, 'py-2', className)} {...props} {...a11y} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  const a11y = useFieldControl(props);
  return (
    <select ref={ref} className={cn(base, 'h-9 cursor-pointer pr-8', className)} {...props} {...a11y}>
      {children}
    </select>
  );
});

export function Label({ children, required, className, htmlFor }: { children: ReactNode; required?: boolean; className?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1 block text-xs font-medium text-slate-600', className)}>
      {children}
      {required && <span className="ml-0.5 text-rose-500">*</span>}
    </label>
  );
}

export function Field({ label, required, error, hint, children, className }: { label?: ReactNode; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  const owner = useRef<string | null>(null);
  const msgId = error || hint ? `${id}-msg` : undefined;
  return (
    <div className={className}>
      {label && (
        <Label required={required} htmlFor={id}>
          {label}
        </Label>
      )}
      <FieldCtx.Provider value={{ id, describedBy: msgId, owner }}>{children}</FieldCtx.Provider>
      {error ? (
        <p id={msgId} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, disabled, label, description }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label?: ReactNode; description?: ReactNode }) {
  const control = (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-slate-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 data-[state=checked]:bg-blue-600"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
  if (!label) return control;
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      {control}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700', disabled && 'cursor-not-allowed opacity-60', className)}>
      <input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-blue-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Number input that keeps a string while typing and reports numbers. */
export function NumberInput({ value, onValueChange, className, min, step = 'any', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | '' | undefined; onValueChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value === undefined || Number.isNaN(value) ? '' : value}
      onChange={(e) => onValueChange(e.target.value === '' ? 0 : Number(e.target.value))}
      onFocus={(e) => e.target.select()}
      className={cn('text-right tabular-nums', className)}
      {...props}
    />
  );
}
