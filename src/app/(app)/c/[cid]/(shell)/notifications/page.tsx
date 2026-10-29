'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { AlertTriangle, Bell, Check, CheckCheck, CheckCircle2, ChevronRight, Info, ShieldCheck, Trash2, XCircle, type LucideIcon } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn, fmtDateTime, timeAgo } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useQueryState } from '@/hooks/use-query-state';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, PageHeader, Pagination, Skeleton, Tabs } from '@/components/ui/misc';

interface NotificationRow {
  _id: string;
  title: string;
  message?: string;
  link?: string;
  read: boolean;
  type: string;
  createdAt: string;
}

interface NotificationMeta {
  unread: number;
  pendingApprovals: number;
}

const TYPES: Record<string, { icon: LucideIcon; className: string; label: string }> = {
  approval: { icon: ShieldCheck, className: 'bg-amber-50 text-amber-600', label: 'Approval' },
  success: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600', label: 'Done' },
  warning: { icon: AlertTriangle, className: 'bg-orange-50 text-orange-600', label: 'Attention' },
  error: { icon: XCircle, className: 'bg-rose-50 text-rose-600', label: 'Failed' },
  info: { icon: Info, className: 'bg-blue-50 text-blue-600', label: 'Info' },
};

function dayHeading(d: string) {
  const day = dayjs(d).startOf('day');
  const today = dayjs().startOf('day');
  if (day.isSame(today)) return 'Today';
  if (day.isSame(today.subtract(1, 'day'))) return 'Yesterday';
  return day.format('dddd, D MMMM YYYY');
}

export default function NotificationsPage() {
  const { cid, can, href } = useCompany();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { params, set } = useQueryState();
  const tab = params.get('tab') === 'unread' ? 'unread' : 'all';
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: [cid, 'notifications', 'page', tab, page],
    queryFn: async () => api.get<NotificationRow[], NotificationMeta>('/system/notifications', { unread: tab === 'unread' ? 'true' : undefined, page, limit: 30 }),
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);
  const meta = q.data?.meta;
  const groups = useMemo(() => {
    const m = new Map<string, NotificationRow[]>();
    for (const n of rows) {
      const k = dayjs(n.createdAt).format('YYYY-MM-DD');
      m.set(k, [...(m.get(k) ?? []), n]);
    }
    return [...m.entries()];
  }, [rows]);

  const refresh = () => qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.post<{ updated: number }>('/system/notifications/read', ids ? { ids } : {}),
    onSuccess: (r, ids) => {
      refresh();
      if (!ids) toast.success(r.data.updated ? `${r.data.updated} marked as read` : 'Nothing unread');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/system/notifications/${id}`),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const clearRead = useMutation({
    mutationFn: () => api.del<{ deleted: number }>('/system/notifications'),
    onSuccess: (r) => {
      setPage(1);
      refresh();
      toast.success(r.data.deleted ? `${r.data.deleted} read notifications cleared` : 'There were no read notifications to clear');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const open = (n: NotificationRow) => {
    if (!n.read) markRead.mutate([n._id]);
    if (n.link) router.push(href(n.link));
  };
  const switchTab = (t: 'all' | 'unread') => {
    setPage(1);
    set({ tab: t === 'all' ? null : t });
  };
  const unread = meta?.unread ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Notifications"
        description="Approvals, decisions on your requests, low stock alerts and other updates for this company."
        actions={
          <>
            <Button
              variant="outline"
              onClick={async () => {
                if (await confirm({ title: 'Clear read notifications?', message: 'Every notification you have already read is removed. Unread ones stay.', confirmText: 'Clear read', danger: true })) clearRead.mutate();
              }}
              loading={clearRead.isPending}
            >
              <Trash2 className="h-4 w-4" /> Clear read
            </Button>
            <Button onClick={() => markRead.mutate(undefined)} loading={markRead.isPending && !markRead.variables} disabled={!unread}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          </>
        }
      />

      {can('approvals.manage') && (meta?.pendingApprovals ?? 0) > 0 && (
        <Link href={href('/approvals')} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100/70">
          <ShieldCheck className="h-5 w-5 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{meta!.pendingApprovals === 1 ? '1 request is' : `${meta!.pendingApprovals} requests are`} waiting for your approval.</span> Review edits, deletions, stock adjustments and leave requests.
          </span>
          <span className={buttonClass({ variant: 'outline', size: 'sm', className: 'hidden border-amber-300 bg-white sm:inline-flex' })}>
            Review <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <Card className="min-w-0 overflow-hidden">
        <Tabs
          className="px-2"
          value={tab}
          onChange={switchTab}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread', count: unread },
          ]}
        />
        {q.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title={tab === 'unread' ? 'You are all caught up' : 'No notifications yet'}
            description={tab === 'unread' ? 'Nothing new since you last looked.' : 'You will be told here when a change needs approval, a request is decided or stock runs low.'}
            action={
              tab === 'unread' && (meta?.total ?? 0) === 0 ? (
                <Button variant="outline" size="sm" onClick={() => switchTab('all')}>
                  Show all notifications
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={cn(q.isPlaceholderData && 'opacity-60')}>
            {groups.map(([day, list]) => (
              <section key={day}>
                <p className="border-y border-slate-100 bg-slate-50/80 px-4 py-1.5 text-xs font-semibold text-slate-500">{dayHeading(day)}</p>
                <ul className="divide-y divide-slate-100">
                  {list.map((n) => {
                    const t = TYPES[n.type] ?? TYPES.info!;
                    const Icon = t.icon;
                    return (
                      <li key={n._id} className={cn('flex items-start gap-3 px-4 py-3 transition-colors', n.read ? 'hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50/70')}>
                        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', t.className)} title={t.label}>
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                          <span className="flex items-center gap-2">
                            <span className={cn('truncate text-sm text-slate-800', !n.read && 'font-semibold')}>{n.title}</span>
                            {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />}
                          </span>
                          {n.message && <span className="mt-0.5 block text-sm break-words text-slate-600">{n.message}</span>}
                          <span className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                            <time dateTime={n.createdAt} title={fmtDateTime(n.createdAt)}>
                              {timeAgo(n.createdAt)}
                            </time>
                            {n.link && (
                              <span className="inline-flex items-center font-medium text-blue-600">
                                · Open <ChevronRight className="h-3 w-3" />
                              </span>
                            )}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => markRead.mutate([n._id])}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-emerald-600"
                              title="Mark as read"
                              aria-label={`Mark "${n.title}" as read`}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => remove.mutate(n._id)}
                            disabled={remove.isPending && remove.variables === n._id}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-40"
                            title="Delete"
                            aria-label={`Delete "${n.title}"`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        {meta && meta.pages > 1 && <Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
