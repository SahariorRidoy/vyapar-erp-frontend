'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useCompany } from '@/providers/company';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { FileUpload, type FileRef } from '@/components/ui/file-upload';
import { useConfirm } from '@/components/ui/confirm';
import { EMAIL_RE, RecipientsInput } from './recipients-input';
import { useContacts, useEmailStatus } from './shared';

export interface ComposeDraft {
  title?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  attachments?: FileRef[];
  /** Id of the received email being answered. */
  inReplyTo?: string;
}

const ACCEPT = 'image/*,application/pdf,.csv,.xls,.xlsx,.doc,.docx,.txt';

/** New email, reply or forward, sent from the company's own mailbox. */
export function ComposeModal({ open, onOpenChange, draft }: { open: boolean; onOpenChange: (o: boolean) => void; draft?: ComposeDraft | null }) {
  const { cid, can, href } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const status = useEmailStatus(open);
  const contacts = useContacts(open);
  const [to, setTo] = useState<string[]>(draft?.to ?? []);
  const [cc, setCc] = useState<string[]>(draft?.cc ?? []);
  const [showCc, setShowCc] = useState(!!draft?.cc?.length);
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [files, setFiles] = useState<FileRef[]>(draft?.attachments ?? []);
  const [touched, setTouched] = useState(false);
  useResetOn(open ? (draft ?? 'new') : null, () => {
    if (!open) return;
    setTo(draft?.to ?? []);
    setCc(draft?.cc ?? []);
    setShowCc(!!draft?.cc?.length);
    setSubject(draft?.subject ?? '');
    setBody(draft?.body ?? '');
    setFiles(draft?.attachments ?? []);
    setTouched(false);
  });

  const badAddress = [...to, ...cc].find((e) => !EMAIL_RE.test(e));
  const errors = {
    to: !to.length ? 'Add at least one recipient' : badAddress ? `"${badAddress}" is not a valid email address` : undefined,
    subject: !subject.trim() ? 'Add a subject' : undefined,
  };

  const send = useMutation({
    mutationFn: () => api.post('/email/send', { to, cc, subject: subject.trim(), body, attachments: files.map((f) => f._id), inReplyTo: draft?.inReplyTo }),
    onSuccess: () => {
      toast.success('Email sent', { description: `To ${to.join(', ')}` });
      qc.invalidateQueries({ queryKey: [cid, 'email', 'list'] });
      onOpenChange(false);
    },
    onError: (e) => {
      // A failed send is still kept in the Sent folder with the reason.
      qc.invalidateQueries({ queryKey: [cid, 'email', 'list'] });
      toast.error(errorMessage(e));
    },
  });

  const submit = () => {
    setTouched(true);
    if (!errors.to && !errors.subject) send.mutate();
  };
  const dirty = () => {
    const d = draft ?? {};
    return to.join() !== (d.to ?? []).join() || subject !== (d.subject ?? '') || body !== (d.body ?? '') || files.length !== (d.attachments ?? []).length;
  };
  const close = async (o: boolean) => {
    if (o) return onOpenChange(true);
    if (send.isPending) return;
    if (dirty() && !(await confirm({ title: 'Discard this email?', message: 'What you wrote will be lost.', confirmText: 'Discard', cancelText: 'Keep writing', danger: true }))) return;
    onOpenChange(false);
  };

  const notConfigured = status.data && !status.data.smtp;
  return (
    <Modal
      open={open}
      onOpenChange={close}
      size="lg"
      title={draft?.title ?? 'New email'}
      description="Sent from your company email account. A copy is kept in Sent."
      footer={
        <>
          <span className="mr-auto text-xs text-slate-400">Press Ctrl + Enter to send</span>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={send.isPending} disabled={!!notConfigured}>
            {!send.isPending && <Send className="h-4 w-4" />} Send
          </Button>
        </>
      }
    >
      <div
        className="space-y-3"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        {notConfigured && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Sending is not set up for this company yet.{' '}
              {can('settings.manage') ? (
                <Link href={href('/settings?tab=email')} className="font-medium underline" onClick={() => onOpenChange(false)}>
                  Add SMTP details in Settings
                </Link>
              ) : (
                'Ask your admin to add SMTP details in Settings ▸ Email.'
              )}
            </span>
          </p>
        )}
        <Field
          label={
            <span className="flex items-center justify-between">
              <span>To</span>
              {!showCc && (
                <button type="button" onClick={() => setShowCc(true)} className="text-xs font-medium text-blue-600 hover:underline">
                  Add Cc
                </button>
              )}
            </span>
          }
          required
          error={touched ? errors.to : undefined}
        >
          <RecipientsInput value={to} onChange={setTo} contacts={contacts} placeholder="Type a name or email address" invalid={touched && !!errors.to} autoFocus={!draft?.to?.length} />
        </Field>
        {showCc && (
          <Field label="Cc">
            <RecipientsInput value={cc} onChange={setCc} contacts={contacts} placeholder="Copy to" />
          </Field>
        )}
        <Field label="Subject" required error={touched ? errors.subject : undefined}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} aria-invalid={touched && !!errors.subject} />
        </Field>
        <Field label="Message">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} data-autofocus={draft?.to?.length ? true : undefined} />
        </Field>
        <FileUpload value={files} onChange={setFiles} context="email" accept={ACCEPT} label="Attach files" max={10} />
      </div>
    </Modal>
  );
}
