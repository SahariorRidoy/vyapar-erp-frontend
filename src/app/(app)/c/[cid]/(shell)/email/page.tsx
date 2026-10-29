'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, Forward, History, ImageOff, Inbox, Mail, MailOpen, Paperclip, PenSquare, RefreshCw, Reply, RotateCcw, Send, Settings2, Trash2, Zap, FileText,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn, fmtDateTime } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useDebounce } from '@/hooks/use-debounce';
import { useQueryState } from '@/hooks/use-query-state';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { Avatar, EmptyState, NoAccess, PageHeader, Pagination, SearchInput, Skeleton, Tabs } from '@/components/ui/misc';
import { ComposeModal, type ComposeDraft } from '@/components/email/compose-modal';
import { parseAddress } from '@/components/email/recipients-input';
import { AUTOMATION_LABEL, AttachmentList, EmailBody, hasRemoteContent, listDate, useEmailStatus, type EmailFull, type EmailRow } from '@/components/email/shared';

type Folder = 'inbox' | 'sent';

const prefixed = (prefix: string, subject?: string) => {
  const s = (subject ?? '').trim();
  return new RegExp(`^${prefix}:`, 'i').test(s) ? s : `${prefix}: ${s}`;
};
const quote = (text?: string) =>
  (text ?? '')
    .split('\n')
    .slice(0, 300)
    .map((l) => `> ${l}`)
    .join('\n');

function replyDraft(m: EmailFull): ComposeDraft {
  const from = parseAddress(m.from);
  return {
    title: `Reply to ${from.name}`,
    to: [from.email],
    subject: prefixed('Re', m.subject),
    body: `\n\nOn ${fmtDateTime(m.date)}, ${m.from} wrote:\n${quote(m.text)}`,
    inReplyTo: m._id,
  };
}

function forwardDraft(m: EmailFull): ComposeDraft {
  return {
    title: 'Forward email',
    subject: prefixed('Fwd', m.subject),
    body: `\n\n---------- Forwarded message ----------\nFrom: ${m.from ?? ''}\nDate: ${fmtDateTime(m.date)}\nSubject: ${m.subject ?? ''}\nTo: ${m.to.join(', ')}\n\n${m.text ?? ''}`,
    attachments: m.attachments.filter((a) => a.file).map((a) => ({ _id: a.file!, originalName: a.name, size: a.size })),
  };
}

function retryDraft(m: EmailFull): ComposeDraft {
  return {
    title: 'Send again',
    to: m.to,
    cc: m.cc,
    subject: m.subject,
    body: m.text,
    attachments: m.attachments.filter((a) => a.file).map((a) => ({ _id: a.file!, originalName: a.name, size: a.size })),
  };
}

function Reader({ id, folder, onBack, onCompose, onGone }: { id: string; folder: Folder; onBack: () => void; onCompose: (d: ComposeDraft) => void; onGone: () => void }) {
  const { cid, href } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [showImages, setShowImages] = useState<string | null>(null);
  // Set once the message is marked unread or deleted. The URL still selects it until the router catches
  // up, and a refetch in between would mark it read again (or ask for a deleted message).
  const [closing, setClosing] = useState(false);
  const q = useQuery({
    queryKey: [cid, 'email', 'message', id],
    queryFn: async () => {
      const m = (await api.get<EmailFull>(`/email/messages/${id}`)).data;
      // Opening marks it read on the server; refresh the list and sidebar counts.
      qc.invalidateQueries({ queryKey: [cid, 'email', 'list'] });
      qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
      return m;
    },
    enabled: !closing,
    staleTime: Infinity,
    retry: false,
  });
  const close = () => {
    setClosing(true);
    qc.removeQueries({ queryKey: [cid, 'email', 'message', id] });
    qc.invalidateQueries({ queryKey: [cid, 'email', 'list'] });
    qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
    onGone();
  };
  const markUnread = useMutation({
    mutationFn: () => api.post(`/email/messages/${id}/read`, { read: false }),
    onSuccess: close,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/email/messages/${id}`),
    onSuccess: () => {
      toast.success('Email deleted');
      close();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (closing) return null;
  if (q.isLoading)
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    );
  const m = q.data;
  if (!m)
    return (
      <EmptyState
        icon={<Mail className="h-6 w-6" />}
        title="This email is no longer here"
        description={errorMessage(q.error)}
        action={
          <Button variant="outline" size="sm" onClick={onBack}>
            Back to the list
          </Button>
        }
      />
    );

  const from = parseAddress(m.from);
  const remote = hasRemoteContent(m.html);
  const imagesOn = showImages === m._id;
  const icon = 'rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800';

  return (
    <article className="flex min-w-0 flex-col">
      <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
        <button type="button" onClick={onBack} className={cn(icon, 'lg:hidden')} aria-label="Back to the list">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          {folder === 'inbox' && (
            <Button variant="outline" size="sm" onClick={() => onCompose(replyDraft(m))}>
              <Reply className="h-4 w-4" /> Reply
            </Button>
          )}
          {m.status === 'failed' && (
            <Button variant="outline" size="sm" onClick={() => onCompose(retryDraft(m))}>
              <RotateCcw className="h-4 w-4" /> Send again
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onCompose(forwardDraft(m))}>
            <Forward className="h-4 w-4" /> Forward
          </Button>
          {folder === 'inbox' && (
            <button type="button" onClick={() => markUnread.mutate()} className={icon} title="Mark as unread" aria-label="Mark as unread">
              <Mail className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (await confirm({ title: 'Delete this email?', message: 'It is removed from this app. Your mailbox on the email server is not changed.', confirmText: 'Delete', danger: true })) remove.mutate();
            }}
            className={cn(icon, 'hover:text-rose-600')}
            title="Delete"
            aria-label="Delete email"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold break-words text-slate-900">{m.subject || '(no subject)'}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {m.automation && (
              <Badge tone="violet">
                <Zap className="mr-1 h-3 w-3" /> {AUTOMATION_LABEL[m.automation] ?? 'Automatic'}
              </Badge>
            )}
            {m.status === 'failed' && <Badge tone="red">Not delivered</Badge>}
            {m.related && (
              <Link href={href(`/txn/${m.related}`)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                <FileText className="h-3.5 w-3.5" /> Open related document
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Avatar name={folder === 'inbox' ? from.name : parseAddress(m.to[0]).name} className="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-slate-800">{from.name}</span>
              {from.email !== from.name && <span className="truncate text-xs text-slate-500">&lt;{from.email}&gt;</span>}
            </p>
            <p className="text-xs break-words text-slate-500">To: {m.to.join(', ') || '—'}</p>
            {m.cc.length > 0 && <p className="text-xs break-words text-slate-500">Cc: {m.cc.join(', ')}</p>}
          </div>
          <time dateTime={m.date} className="shrink-0 text-xs text-slate-400">
            {fmtDateTime(m.date)}
          </time>
        </div>

        {m.status === 'failed' && (
          <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This email could not be sent{m.error ? `: ${m.error}` : '.'} Check the SMTP details in Settings, then use Send again.
            </span>
          </p>
        )}
        {remote && !imagesOn && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <ImageOff className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1">Images from the sender are hidden to protect your privacy.</span>
            <Button variant="outline" size="xs" onClick={() => setShowImages(m._id)}>
              Show images
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-slate-100 p-4">
          <EmailBody html={m.html} text={m.text} showImages={imagesOn} />
        </div>
        <AttachmentList items={m.attachments} />
      </div>
    </article>
  );
}

export default function EmailPage() {
  const { cid, can, href } = useCompany();
  const qc = useQueryClient();
  const { params, set } = useQueryState();
  const folder: Folder = params.get('folder') === 'sent' ? 'sent' : 'inbox';
  const selected = params.get('m');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [compose, setCompose] = useState<{ open: boolean; draft?: ComposeDraft | null }>({ open: false });
  const debounced = useDebounce(search, 350);
  const status = useEmailStatus();

  const list = useQuery({
    queryKey: [cid, 'email', 'list', folder, debounced, page],
    queryFn: async () => api.get<EmailRow[], { unread: number }>('/email/messages', { folder, search: debounced, page, limit: 30 }),
    enabled: can('email.use'),
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => list.data?.data ?? [], [list.data]);
  const meta = list.data?.meta;

  const sync = useMutation({
    mutationFn: () => api.post<{ imported: number }>('/email/sync'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [cid, 'email', 'list'] });
      qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
      toast.success(r.data.imported ? `${r.data.imported} new email${r.data.imported > 1 ? 's' : ''}` : 'No new emails');
    },
    onError: (e) => toast.error('Could not check the inbox', { description: errorMessage(e) }),
  });
  // Cleared again by a reload; the mailbox may get older mail moved into it later.
  const [allLoaded, setAllLoaded] = useState(false);
  const older = useMutation({
    mutationFn: async () => (await api.post<{ imported: number; more: boolean }>('/email/sync/older')).data,
    onSuccess: (r) => {
      setAllLoaded(!r.more);
      qc.invalidateQueries({ queryKey: [cid, 'email', 'list'] });
      qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
      if (r.imported) toast.success(`${r.imported} older email${r.imported > 1 ? 's' : ''} added`, { description: 'They are at the end of the list.' });
      else toast.info('No older emails in the mailbox');
    },
    onError: (e) => toast.error('Could not load older emails', { description: errorMessage(e) }),
  });

  const s = status.data;
  // While the inbox is on screen, look for new mail every 2 minutes. React Query pauses this in a hidden tab.
  useQuery({
    queryKey: [cid, 'email', 'auto-sync'],
    queryFn: async () => {
      const r = (await api.post<{ imported: number }>('/email/sync')).data;
      if (r.imported) {
        qc.invalidateQueries({ queryKey: [cid, 'email', 'list'] });
        qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
        toast.info(`${r.imported} new email${r.imported > 1 ? 's' : ''}`);
      }
      return r;
    },
    enabled: can('email.use') && folder === 'inbox' && !!s?.imap,
    refetchInterval: 2 * 60_000,
    staleTime: 2 * 60_000,
    gcTime: 0,
    retry: false,
  });

  if (!can('email.use')) return <NoAccess what="email" />;
  const select = (id: string | null) => set({ m: id });
  const switchFolder = (f: Folder) => {
    setPage(1);
    set({ folder: f === 'inbox' ? null : f, m: null });
  };
  const autoCount = s ? Object.values(s.automations).filter(Boolean).length : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Email"
        description="Read and answer business email, and send documents straight from your company address."
        actions={
          <>
            <Button variant="outline" onClick={() => sync.mutate()} loading={sync.isPending} disabled={!s?.imap} title={s && !s.imap ? 'Add IMAP details in Settings to read your inbox' : 'Check for new emails'}>
              {!sync.isPending && <RefreshCw className="h-4 w-4" />} Check inbox
            </Button>
            <Button onClick={() => setCompose({ open: true, draft: null })}>
              <PenSquare className="h-4 w-4" /> Compose
            </Button>
          </>
        }
      />

      {s && (!s.smtp || !s.imap) && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{!s.smtp && !s.imap ? 'Email is not connected yet' : !s.smtp ? 'Sending is not set up' : 'Inbox is not connected'}</p>
            <p className="text-amber-800">
              {!s.smtp && 'Add your SMTP server to send invoices, reminders and emails. '}
              {!s.imap && 'Add your IMAP server to read incoming mail here. '}
              Gmail, Outlook, Zoho and any hosting mailbox work.
            </p>
          </div>
          {can('settings.manage') && (
            <Link href={href('/settings?tab=email')} className={buttonClass({ variant: 'outline', size: 'sm', className: 'border-amber-300 bg-white' })}>
              <Settings2 className="h-4 w-4" /> Connect email
            </Link>
          )}
        </div>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className={cn('min-w-0 space-y-4', selected && 'hidden lg:block')}>
          <Card className="min-w-0 overflow-hidden">
            <Tabs
              className="px-2"
              value={folder}
              onChange={switchFolder}
              tabs={[
                { value: 'inbox', label: <span className="flex items-center gap-1.5"><Inbox className="h-4 w-4" /> Inbox</span>, count: meta?.unread || undefined },
                { value: 'sent', label: <span className="flex items-center gap-1.5"><Send className="h-4 w-4" /> Sent</span> },
              ]}
            />
            <div className="border-b border-slate-100 p-3">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder={folder === 'inbox' ? 'Search sender or subject' : 'Search recipient or subject'}
              />
            </div>
            {list.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={folder === 'inbox' ? <Inbox className="h-6 w-6" /> : <Send className="h-6 w-6" />}
                title={debounced ? 'No email matches' : folder === 'inbox' ? 'Inbox is empty' : 'Nothing sent yet'}
                description={
                  debounced
                    ? 'Try another search.'
                    : folder === 'inbox'
                      ? s?.imap
                        ? 'New mail is checked every 2 minutes while this page is open, or use Check inbox.'
                        : 'Connect your mailbox in Settings to read incoming mail here.'
                      : 'Invoices, reminders and emails you send are kept here.'
                }
              />
            ) : (
              <ul className={cn('divide-y divide-slate-100', list.isPlaceholderData && 'opacity-60')}>
                {rows.map((m) => {
                  const who = folder === 'inbox' ? parseAddress(m.from).name : `To: ${m.to.map((t) => parseAddress(t).name).join(', ')}`;
                  const unread = folder === 'inbox' && !m.read;
                  return (
                    <li key={m._id}>
                      <button
                        type="button"
                        onClick={() => select(m._id)}
                        className={cn(
                          'flex w-full gap-3 border-l-2 px-3 py-2.5 text-left transition-colors',
                          selected === m._id ? 'border-blue-600 bg-blue-50/70' : unread ? 'border-transparent bg-white hover:bg-slate-50' : 'border-transparent hover:bg-slate-50',
                        )}
                      >
                        <Avatar name={folder === 'inbox' ? parseAddress(m.from).name : parseAddress(m.to[0]).name} className="mt-0.5" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'font-semibold text-slate-900' : 'text-slate-700')}>{who}</span>
                            <time dateTime={m.date} className={cn('shrink-0 text-[11px]', unread ? 'font-semibold text-blue-600' : 'text-slate-400')}>
                              {listDate(m.date)}
                            </time>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'font-medium text-slate-800' : 'text-slate-600')}>{m.subject || '(no subject)'}</span>
                            {m.attachments?.length > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Has attachments" />}
                            {m.status === 'failed' && <Badge tone="red">Failed</Badge>}
                            {m.automation && <Zap className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-label={AUTOMATION_LABEL[m.automation] ?? 'Automatic'} />}
                          </span>
                          {m.snippet && <span className="block truncate text-xs text-slate-400">{m.snippet.replace(/\s+/g, ' ')}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {meta && meta.pages > 1 && <Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} />}
            {folder === 'inbox' && s?.imap && !debounced && rows.length > 0 && page >= (meta?.pages ?? 1) && (
              <div className="border-t border-slate-100 p-3 text-center">
                {allLoaded ? (
                  <p className="text-xs text-slate-400">Every email in the mailbox is here.</p>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => older.mutate()} loading={older.isPending}>
                    {!older.isPending && <History className="h-4 w-4" />} Load older emails
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Zap className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">Automations</p>
                <p className="text-xs text-slate-500">{s ? `${autoCount} of 3 switched on` : 'Loading…'}</p>
              </div>
              {can('settings.manage') && (
                <Link href={href('/settings?tab=email')} className="text-xs font-medium text-blue-600 hover:underline">
                  Manage
                </Link>
              )}
            </div>
            {s && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {[
                  { on: s.automations.autoSendInvoice, label: 'Email each new sale invoice to the customer' },
                  { on: s.automations.paymentReminders, label: 'Remind customers about overdue invoices' },
                  { on: s.automations.dailySummary, label: 'Daily sales and payments summary' },
                ].map((a) => (
                  <li key={a.label} className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', a.on ? 'bg-emerald-500' : 'bg-slate-300')} />
                    <span className={cn('min-w-0 flex-1', a.on ? 'text-slate-700' : 'text-slate-400')}>{a.label}</span>
                    <span className={cn('text-xs font-medium', a.on ? 'text-emerald-600' : 'text-slate-400')}>{a.on ? 'On' : 'Off'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className={cn('min-w-0 self-start', !selected && 'hidden lg:block')}>
          {selected ? (
            <Reader key={selected} id={selected} folder={folder} onBack={() => select(null)} onGone={() => select(null)} onCompose={(draft) => setCompose({ open: true, draft })} />
          ) : (
            <EmptyState icon={<MailOpen className="h-6 w-6" />} title="Select an email to read" description="Pick a message from the list, or write a new one." />
          )}
        </Card>
      </div>

      <ComposeModal open={compose.open} draft={compose.draft} onOpenChange={(o) => setCompose((c) => ({ ...c, open: o }))} />
    </div>
  );
}
