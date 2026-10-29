'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Inbox, Send, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { CompanySettings } from '@/lib/types';
import { plural } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useSession } from '@/providers/session';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Field, Input, NumberInput, Switch } from '@/components/ui/input';
import { SaveBar, SettingsCard, Toggle, ToggleList, useSection } from './section';

type EmailSettings = CompanySettings['email'];

const PRESETS: { name: string; smtp: [string, number, boolean]; imap: [string, number]; note?: string }[] = [
  { name: 'Gmail', smtp: ['smtp.gmail.com', 465, true], imap: ['imap.gmail.com', 993], note: 'Turn on 2-step verification and use an App password (Google Account ▸ Security ▸ App passwords).' },
  { name: 'Outlook / Microsoft 365', smtp: ['smtp.office365.com', 587, false], imap: ['outlook.office365.com', 993] },
  { name: 'Zoho Mail', smtp: ['smtp.zoho.com', 465, true], imap: ['imap.zoho.com', 993], note: 'Accounts on Zoho’s India data centre use smtp.zoho.in and imap.zoho.in.' },
  { name: 'Yahoo', smtp: ['smtp.mail.yahoo.com', 465, true], imap: ['imap.mail.yahoo.com', 993], note: 'Use an app password from Yahoo account security.' },
  { name: 'Hostinger', smtp: ['smtp.hostinger.com', 465, true], imap: ['imap.hostinger.com', 993] },
  { name: 'GoDaddy', smtp: ['smtpout.secureserver.net', 465, true], imap: ['imap.secureserver.net', 993] },
];

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const masked = value === '********';
  return (
    <div className="relative">
      <Input
        type={show && !masked ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => masked && e.target.select()}
        placeholder={placeholder}
        autoComplete="new-password"
        className="pr-10"
      />
      {!masked && value && (
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

export function EmailTab({ onDirtyChange }: { onDirtyChange: (d: boolean) => void }) {
  const s = useSection('email', onDirtyChange);
  const { cid, company } = useCompany();
  const { session } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [testTo, setTestTo] = useState(session?.user.email ?? company?.email ?? '');
  const [note, setNote] = useState<string | null>(null);
  const d = s.draft;

  const smtpReady = !!(d?.smtpHost && d.smtpUser && d.smtpPass);
  const imapReady = !!(d?.imapHost && d.imapUser && d.imapPass);
  const ensureSaved = async () => {
    if (s.dirty) await s.save.mutateAsync(undefined);
  };
  const testSmtp = useMutation({
    mutationFn: async () => {
      await ensureSaved();
      return api.post('/settings/email/test', { to: testTo.trim() });
    },
    onSuccess: () => toast.success('Test email sent', { description: `Check the inbox of ${testTo}. It is also in Email ▸ Sent.` }),
    onError: (e) => toast.error('Sending failed', { description: errorMessage(e), duration: 10000 }),
  });
  const testImap = useMutation({
    mutationFn: async () => {
      await ensureSaved();
      return (await api.post<{ messages: number; unseen: number }>('/settings/email/test-imap')).data;
    },
    onSuccess: (r) => toast.success('Inbox connected', { description: `${plural(r.messages, 'message')}, ${r.unseen} unread. New mail is fetched every 15 minutes, and every 2 minutes while Email is open.` }),
    onError: (e) => toast.error('Could not read the inbox', { description: errorMessage(e), duration: 10000 }),
  });
  const clearInbox = useMutation({
    mutationFn: async () => (await api.del<{ removed: number }>('/email/messages')).data,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [cid, 'email'] });
      qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
      toast.success(r.removed ? `${plural(r.removed, 'fetched email')} removed` : 'There were no fetched emails to remove');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!d) return null;
  const set = <K extends keyof EmailSettings>(k: K, v: EmailSettings[K]) => s.set(k, v);
  const applyPreset = (p: (typeof PRESETS)[number]) => {
    const user = d.smtpUser || d.imapUser || d.fromEmail;
    s.setDraft({ ...d, smtpHost: p.smtp[0], smtpPort: p.smtp[1], smtpSecure: p.smtp[2], imapHost: p.imap[0], imapPort: p.imap[1], imapSecure: true, smtpUser: user, imapUser: d.imapUser || user });
    setNote(p.note ?? null);
  };

  return (
    <div className="space-y-4">
      <SettingsCard title="Quick setup" description="Pick your email provider to fill in the server details, then enter your email address and password.">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.name} variant={d.smtpHost === p.smtp[0] ? 'primary' : 'outline'} size="sm" onClick={() => applyPreset(p)}>
              {p.name}
            </Button>
          ))}
        </div>
        {note && <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{note}</p>}
      </SettingsCard>

      <SettingsCard
        title="Sending (SMTP)"
        description="Used to email invoices, reminders, the daily summary and messages from Email."
        actions={smtpReady ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Set up</span> : <span className="flex items-center gap-1 text-xs font-medium text-amber-600"><AlertTriangle className="h-4 w-4" /> Not set up</span>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="SMTP server">
            <Input value={d.smtpHost} onChange={(e) => set('smtpHost', e.target.value.trim())} placeholder="smtp.example.com" />
          </Field>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field label="Port" hint="465 with SSL, 587 with STARTTLS">
              <NumberInput value={d.smtpPort} onValueChange={(v) => set('smtpPort', Math.round(v))} />
            </Field>
            <div className="pb-6">
              <Switch checked={d.smtpSecure} onCheckedChange={(v) => set('smtpSecure', v)} label="SSL" />
            </div>
          </div>
          <Field label="Username" hint="Usually your full email address">
            <Input value={d.smtpUser} onChange={(e) => set('smtpUser', e.target.value.trim())} autoComplete="off" />
          </Field>
          <Field label="Password" hint={d.smtpPass === '********' ? 'Saved. Type to replace it.' : undefined}>
            <SecretInput value={d.smtpPass} onChange={(v) => set('smtpPass', v)} />
          </Field>
          <Field label="Sender name" hint={`Defaults to ${company?.name ?? 'the business name'}`}>
            <Input value={d.fromName} onChange={(e) => set('fromName', e.target.value)} placeholder={company?.name} />
          </Field>
          <Field label="Sender email" hint="Defaults to the username">
            <Input type="email" value={d.fromEmail} onChange={(e) => set('fromEmail', e.target.value.trim())} placeholder={d.smtpUser} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <Field label="Send a test email to" className="min-w-[220px] flex-1">
            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={() => testSmtp.mutate()} loading={testSmtp.isPending} disabled={!smtpReady || !/^\S+@\S+\.\S+$/.test(testTo)}>
            {!testSmtp.isPending && <Send className="h-4 w-4" />} {s.dirty ? 'Save and send test' : 'Send test'}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Receiving (IMAP)"
        description="Lets you read and answer customer and supplier emails in Email."
        actions={imapReady ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Set up</span> : <span className="text-xs font-medium text-slate-400">Optional</span>}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="IMAP server">
            <Input value={d.imapHost} onChange={(e) => set('imapHost', e.target.value.trim())} placeholder="imap.example.com" />
          </Field>
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field label="Port" hint="993 with SSL">
              <NumberInput value={d.imapPort} onValueChange={(v) => set('imapPort', Math.round(v))} />
            </Field>
            <div className="pb-6">
              <Switch checked={d.imapSecure} onCheckedChange={(v) => set('imapSecure', v)} label="SSL" />
            </div>
          </div>
          <Field label="Username">
            <Input value={d.imapUser} onChange={(e) => set('imapUser', e.target.value.trim())} autoComplete="off" />
          </Field>
          <Field label="Password" hint={d.imapPass === '********' ? 'Saved. Type to replace it.' : undefined}>
            <SecretInput value={d.imapPass} onChange={(v) => set('imapPass', v)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            className="mr-auto text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            loading={clearInbox.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'Remove all fetched emails?',
                message: 'Every received email and its attachments are removed from this app. Your mailbox on the email server is not changed, and emails already removed are not fetched again. Changing or clearing the inbox account above removes them as well.',
                confirmText: 'Remove',
                danger: true,
              });
              if (ok) clearInbox.mutate();
            }}
          >
            {!clearInbox.isPending && <Trash2 className="h-4 w-4" />} Remove fetched emails
          </Button>
          <Button variant="outline" onClick={() => testImap.mutate()} loading={testImap.isPending} disabled={!imapReady}>
            {!testImap.isPending && <Inbox className="h-4 w-4" />} {s.dirty ? 'Save and test inbox' : 'Test inbox connection'}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Automations" description={smtpReady ? 'Emails the app sends for you. Each one is kept in Email ▸ Sent.' : 'Set up sending (SMTP) first; automations stay paused until then.'}>
        <ToggleList>
          <Toggle label="Email every new sale invoice" description="Sent to the customer's email address, with the items and amount due" checked={d.autoSendInvoice} onChange={(v) => set('autoSendInvoice', v)} />
          <Toggle label="Payment reminders" description="Emails customers about overdue invoices at 9 AM, at most once a week per invoice" checked={d.paymentReminders} onChange={(v) => set('paymentReminders', v)} />
          {d.paymentReminders && (
            <div className="py-3">
              <Field label="Start reminding this many days after the due date" className="max-w-xs">
                <NumberInput value={d.reminderDaysAfterDue} min={0} onValueChange={(v) => set('reminderDaysAfterDue', Math.max(0, Math.round(v)))} />
              </Field>
            </div>
          )}
          <Toggle label="Daily summary" description="Count and value of every document made today, sent at 9 PM" checked={d.dailySummary} onChange={(v) => set('dailySummary', v)} />
          {d.dailySummary && (
            <div className="py-3">
              <Field label="Send the summary to" hint="Separate several addresses with commas">
                <Input value={d.dailySummaryTo} onChange={(e) => set('dailySummaryTo', e.target.value)} placeholder="owner@example.com" />
              </Field>
            </div>
          )}
        </ToggleList>
      </SettingsCard>

      <SaveBar dirty={s.dirty} saving={s.save.isPending} onSave={() => s.save.mutate(undefined)} onDiscard={s.reset} />
    </div>
  );
}
