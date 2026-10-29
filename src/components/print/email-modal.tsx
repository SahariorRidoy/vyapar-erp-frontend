'use client';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Paperclip, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Txn } from '@/lib/types';
import { fmtDate, money } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useResetOn } from '@/hooks/use-reset-on';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/input';

const splitEmails = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails the document with its PDF attached, through the company's SMTP settings. */
export function EmailDocumentModal({ open, onOpenChange, txn, title, fileName, makePdf }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  txn: Txn;
  title: string;
  fileName: string;
  makePdf: () => Promise<Blob>;
}) {
  const { cid, company, href, can } = useCompany();
  const draft = () => {
    const party = txn.party && typeof txn.party === 'object' ? txn.party : null;
    const name = party?.name ?? txn.partyName ?? 'Sir/Madam';
    const balanceLine = txn.type === 'SALE' && txn.balance > 0 ? `\nAmount due: ${money(txn.balance)}${txn.dueDate ? ` by ${fmtDate(txn.dueDate)}` : ''}.` : '';
    return {
      to: party?.email ?? '',
      subject: `${title} ${txn.number} from ${company?.name ?? ''}`.trim(),
      message: `Dear ${name},\n\nPlease find attached ${title.toLowerCase()} ${txn.number} dated ${fmtDate(txn.date)} for ${money(txn.total)}.${balanceLine}\n\nFor any questions, reply to this email or call us on ${company?.phone ?? ''}.\n\nRegards,\n${company?.name ?? ''}`,
    };
  };
  const [to, setTo] = useState(() => draft().to);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(() => draft().subject);
  const [message, setMessage] = useState(() => draft().message);
  const [attach, setAttach] = useState(true);
  useResetOn(open ? txn._id : null, () => {
    if (!open) return;
    const d = draft();
    setTo(d.to);
    setCc('');
    setSubject(d.subject);
    setMessage(d.message);
    setAttach(true);
  });

  const status = useQuery({
    queryKey: [cid, 'email', 'status'],
    queryFn: async () => (await api.get<{ smtp: boolean; imap: boolean }>('/email/status')).data,
    enabled: open,
  });


  const send = useMutation({
    mutationFn: async () => {
      const toList = splitEmails(to);
      const ccList = splitEmails(cc);
      const bad = [...toList, ...ccList].find((e) => !EMAIL_RE.test(e));
      if (!toList.length) throw new Error('Add at least one recipient');
      if (bad) throw new Error(`"${bad}" is not a valid email address`);
      let fileId: string | undefined;
      if (attach) {
        const blob = await makePdf();
        const [uploaded] = await api.upload([new File([blob], fileName, { type: 'application/pdf' })], 'email');
        fileId = uploaded?._id;
      }
      await api.post(`/transactions/${txn._id}/email`, { to: toList, cc: ccList, subject, message, fileId });
    },
    onSuccess: () => {
      toast.success('Email sent');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const notConfigured = status.data && !status.data.smtp;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Email ${title.toLowerCase()} ${txn.number}`}
      description="The PDF is generated from the preview you see and attached to the email."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} loading={send.isPending} disabled={!!notConfigured}>
            {!send.isPending && <Send className="h-4 w-4" />} Send email
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {notConfigured && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Email sending is not set up for this company yet.{' '}
              {can('settings.manage') ? (
                <Link href={href('/settings?tab=email')} className="font-medium underline">
                  Add SMTP details in Settings
                </Link>
              ) : (
                'Ask your admin to add SMTP details in Settings ▸ Email.'
              )}
            </span>
          </p>
        )}
        <Field label="To" required hint="Separate several addresses with commas">
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" type="text" inputMode="email" />
        </Field>
        <Field label="Cc">
          <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" type="text" inputMode="email" />
        </Field>
        <Field label="Subject" required>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} />
        </Field>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <Checkbox checked={attach} onChange={setAttach} label={<span className="text-sm">Attach PDF</span>} />
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
            <Paperclip className="h-3.5 w-3.5" /> {fileName}
          </span>
        </div>
      </div>
    </Modal>
  );
}
