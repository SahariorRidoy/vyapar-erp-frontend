'use client';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './modal';
import { Button } from './button';
import { Textarea } from './input';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** Ask for a reason (e.g. cancel invoice). Resolves with the text. */
  withReason?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
}

type Resolver = (v: false | { reason: string }) => void;
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<false | { reason: string }>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setReason('');
    return new Promise<false | { reason: string }>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: false | { reason: string }) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onOpenChange={(o) => !o && close(false)}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            {opts?.danger ? <AlertTriangle className="h-5 w-5 text-rose-500" /> : <Info className="h-5 w-5 text-blue-500" />}
            {opts?.title}
          </span>
        }
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              {opts?.cancelText ?? 'Cancel'}
            </Button>
            <Button
              data-autofocus
              variant={opts?.danger ? 'danger' : 'primary'}
              disabled={opts?.reasonRequired && !reason.trim()}
              onClick={() => close({ reason: reason.trim() })}
            >
              {opts?.confirmText ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {opts?.message && <div className="text-sm text-slate-600">{opts.message}</div>}
        {opts?.withReason && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">{opts.reasonLabel ?? 'Reason'}</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Optional note" />
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);
