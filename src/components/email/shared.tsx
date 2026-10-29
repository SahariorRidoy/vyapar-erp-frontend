'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { Download, FileSpreadsheet, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useParties } from '@/hooks/data';
import type { Contact } from './recipients-input';

export interface EmailAttachment {
  name?: string;
  file?: string;
  size?: number;
}

export interface EmailRow {
  _id: string;
  folder: 'inbox' | 'sent';
  from?: string;
  to: string[];
  cc: string[];
  subject?: string;
  snippet?: string;
  date: string;
  read: boolean;
  status: 'sent' | 'failed' | 'received' | 'queued';
  error?: string;
  attachments: EmailAttachment[];
  related?: string;
  automation?: string;
}

export interface EmailFull extends EmailRow {
  html?: string;
  text?: string;
  messageId?: string;
}

export interface EmailStatus {
  smtp: boolean;
  imap: boolean;
  automations: { autoSendInvoice: boolean; paymentReminders: boolean; dailySummary: boolean };
}

export const AUTOMATION_LABEL: Record<string, string> = {
  auto_send_invoice: 'Auto invoice',
  payment_reminder: 'Payment reminder',
  daily_summary: 'Daily summary',
};

export function useEmailStatus(enabled = true) {
  const { cid, can } = useCompany();
  return useQuery({
    queryKey: [cid, 'email', 'status'],
    queryFn: async () => (await api.get<EmailStatus>('/email/status')).data,
    enabled: enabled && can('email.use'),
    staleTime: 60_000,
  });
}

/** Parties with an email address, offered as recipients while typing. */
export function useContacts(enabled = true): Contact[] {
  const parties = useParties(enabled);
  return useMemo(() => (parties.data ?? []).filter((p) => p.email).map((p) => ({ name: p.name, email: p.email! })), [parties.data]);
}

/** Time for today's mail, day and month for this year, full date before that. */
export function listDate(d: string) {
  const t = dayjs(d);
  if (t.isSame(dayjs(), 'day')) return t.format('hh:mm A');
  if (t.isSame(dayjs(), 'year')) return t.format('D MMM');
  return fmtDate(d);
}

export function fileSize(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const REMOTE_RE = /(<img\b[^>]*\bsrc\s*=\s*["']?\s*(https?:)?\/\/)|(url\(\s*["']?\s*(https?:)?\/\/)/i;
export const hasRemoteContent = (html?: string) => !!html && REMOTE_RE.test(html);

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"')]+)/g).map((part, i) =>
    i % 2 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/**
 * Shows a received or sent email safely: HTML runs in a sandboxed frame with no scripts, forms or remote
 * loads (images only after the user allows them), and every link opens in a new tab without an opener.
 */
export function EmailBody({ html, text, showImages }: { html?: string; text?: string; showImages: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const doc = useMemo(() => {
    if (!html) return '';
    const img = showImages ? 'data: cid: https: http:' : 'data: cid:';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src data:${showImages ? ' https:' : ''}">
<base target="_blank">
<style>html,body{margin:0;padding:0}body{font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#2563eb}</style>
</head><body>${html}</body></html>`;
  }, [html, showImages]);

  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  const onLoad = () => {
    const d = frame.current?.contentDocument;
    if (!d?.body) return;
    d.querySelectorAll('a').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    const fit = () => setHeight(Math.max(120, d.documentElement.scrollHeight + 4));
    fit();
    observer.current?.disconnect();
    observer.current = new ResizeObserver(fit);
    observer.current.observe(d.body);
  };

  if (!html) return <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-800">{text ? linkify(text) : <span className="text-slate-400">(This email has no text)</span>}</div>;
  return (
    <iframe
      ref={frame}
      title="Email content"
      srcDoc={doc}
      onLoad={onLoad}
      // No allow-scripts: same-origin is only used to size the frame and fix up links.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="w-full border-0"
      style={{ height }}
    />
  );
}

export function AttachmentList({ items }: { items: EmailAttachment[] }) {
  const files = items.filter((a) => a.file);
  if (!files.length) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Paperclip className="h-3.5 w-3.5" /> {files.length} attachment{files.length > 1 ? 's' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {files.map((a) => {
          const name = a.name ?? 'Attachment';
          const ext = name.split('.').pop()?.toLowerCase() ?? '';
          const icon = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? (
            <ImageIcon className="h-4 w-4 text-blue-500" />
          ) : ['xls', 'xlsx', 'csv'].includes(ext) ? (
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          ) : (
            <FileText className="h-4 w-4 text-rose-500" />
          );
          return (
            <span key={a.file} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pr-1.5 pl-2.5 text-sm shadow-sm">
              {icon}
              <a href={fileUrl(a.file)} target="_blank" rel="noreferrer" className="max-w-[220px] truncate text-slate-700 hover:text-blue-600 hover:underline">
                {name}
              </a>
              {a.size ? <span className="text-xs text-slate-400">{fileSize(a.size)}</span> : null}
              <a href={fileUrl(a.file, true)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Download ${name}`} title="Download">
                <Download className="h-4 w-4" />
              </a>
            </span>
          );
        })}
      </div>
    </div>
  );
}
