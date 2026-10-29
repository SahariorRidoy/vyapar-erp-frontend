'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDownLeft, ArrowLeft, ArrowUpRight, Download, FileBarChart2, FolderInput, FolderPlus, Mail, MapPin, MoreVertical, Pencil, Phone, Plus, Receipt, ShoppingCart, Trash2, Upload, Users,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Party, Txn, TxnType } from '@/lib/types';
import { TXN, balanceText, newTxnHref } from '@/lib/txn';
import { invalidateCompany, reportWrite } from '@/lib/query';
import { cn, fmtDate, money, plural } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { usePartyGroups, type PartyGroupRow } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox, Select } from '@/components/ui/input';
import { EmptyState, PageHeader, SearchInput, Skeleton, Spinner, Tabs } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { PartyModal } from '@/components/party/party-modal';
import { GroupModal, MoveGroupModal } from '@/components/party/group-modals';
import { TxnTable } from '@/components/txn/txn-table';
import { useTxnActions } from '@/components/txn/actions';
import { useQueryState } from '@/hooks/use-query-state';
import { useResetOn } from '@/hooks/use-reset-on';
import { useUrlFlag } from '@/hooks/use-url-flag';

type PartyDetail = Party & { group?: { _id: string; name: string } | null; stats: { _id: TxnType; total: number; balance: number; count: number }[] };


function BalanceAmount({ balance, className }: { balance: number; className?: string }) {
  const b = balanceText(balance);
  return <span className={cn('tabular-nums', b.tone === 'green' ? 'text-emerald-600' : b.tone === 'red' ? 'text-rose-600' : 'text-slate-500', className)}>{money(Math.abs(balance))}</span>;
}

/* ---------------------------------------------------------------- */

function PartyTransactions({ partyId }: { partyId: string }) {
  const { cid } = useCompany();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const debounced = useDebounce(search);
  const q = useQuery({
    queryKey: [cid, 'transactions', 'party', partyId, debounced, type],
    queryFn: async () => (await api.get<Txn[]>('/transactions', { party: partyId, search: debounced, type: type || undefined, limit: 500, sort: '-date' })),
  });
  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
        <p className="text-sm font-semibold text-slate-900">Transactions</p>
        <div className="flex-1" />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-48">
          <option value="">All types</option>
          {Object.values(TXN)
            .filter((m) => m.type !== 'EXPENSE')
            .map((m) => (
              <option key={m.type} value={m.type}>
                {m.label}
              </option>
            ))}
        </Select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search number or note" className="w-full sm:w-60" />
      </div>
      {q.isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : (
        <TxnTable
          rows={q.data?.data ?? []}
          columns={['type', 'number', 'date', 'total', 'balance', 'status']}
          empty={<EmptyState title="No transactions" description={debounced || type ? 'Nothing matches the filters.' : 'Sales, purchases and payments with this party will appear here.'} />}
        />
      )}
    </Card>
  );
}

function PartyDetailPane({ partyId, onBack, onEdit, onMove, onDeleted }: { partyId: string; onBack: () => void; onEdit: (p: Party) => void; onMove: (p: PartyDetail) => void; onDeleted: () => void }) {
  const { cid, href, can, settings } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const router = useRouter();
  const { openPayment } = useTxnActions();
  const q = useQuery({ queryKey: [cid, 'parties', 'detail', partyId], queryFn: async () => (await api.get<PartyDetail>(`/parties/${partyId}`)).data });
  const del = useMutation({
    mutationFn: () => api.del(`/parties/${partyId}`),
    onSuccess: (res) => {
      if (!reportWrite(res, 'Party deleted')) return invalidateCompany(qc, cid);
      invalidateCompany(qc, cid, partyId);
      onDeleted();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = q.data;
  if (q.isError)
    return (
      <Card>
        <EmptyState title="Party not found" description="It may have been deleted, or the link is old." action={<Button variant="outline" onClick={onDeleted}>Open the first party</Button>} />
      </Card>
    );
  if (q.isLoading || !p)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  const stat = (t: TxnType) => p.stats.find((s) => s._id === t);
  const b = balanceText(p.balance);
  const tiles: { label: string; value: number; sub: string; show: boolean }[] = [
    { label: 'Sales', value: stat('SALE')?.total ?? 0, sub: `${plural(stat('SALE')?.count ?? 0, 'invoice')} · due ${money(stat('SALE')?.balance ?? 0)}`, show: !!stat('SALE') || p.partyType !== 'supplier' },
    { label: 'Payments received', value: stat('PAYMENT_IN')?.total ?? 0, sub: plural(stat('PAYMENT_IN')?.count ?? 0, 'receipt'), show: !!stat('PAYMENT_IN') || p.partyType !== 'supplier' },
    { label: 'Purchases', value: stat('PURCHASE')?.total ?? 0, sub: `${plural(stat('PURCHASE')?.count ?? 0, 'bill')} · due ${money(stat('PURCHASE')?.balance ?? 0)}`, show: !!stat('PURCHASE') || p.partyType !== 'customer' },
    { label: 'Payments made', value: stat('PAYMENT_OUT')?.total ?? 0, sub: plural(stat('PAYMENT_OUT')?.count ?? 0, 'voucher'), show: !!stat('PAYMENT_OUT') || p.partyType !== 'customer' },
  ].filter((t) => t.show);

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-4 p-5">
          <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back to list">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900">{p.name}</h2>
              {p.group && <Badge tone="violet">{p.group.name}</Badge>}
              <Badge>{p.partyType === 'customer' ? 'Customer' : p.partyType === 'supplier' ? 'Supplier' : 'Customer & supplier'}</Badge>
              {p.isActive === false && <Badge tone="amber">Inactive</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
              {p.phone && (
                <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 hover:text-blue-700">
                  <Phone className="h-3.5 w-3.5" /> {p.phone}
                </a>
              )}
              {p.email && (
                <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 hover:text-blue-700">
                  <Mail className="h-3.5 w-3.5" /> {p.email}
                </a>
              )}
              {p.gstin && <span>BIN: {p.gstin}</span>}
              {(p.billingAddress || p.state) && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {[p.billingAddress, p.state].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
            {p.creditLimit ? (
              <p className="mt-1 text-xs text-slate-500">
                Credit limit {money(p.creditLimit)}
                {p.balance > p.creditLimit && <span className="ml-1 font-medium text-rose-600">· limit exceeded</span>}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">{b.label}</p>
            <BalanceAmount balance={p.balance} className="text-2xl font-semibold" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
          {can('sale_invoice.create') && p.partyType !== 'supplier' && (
            <Button size="sm" onClick={() => router.push(href(newTxnHref('SALE', { party: p._id })))}>
              <Receipt className="h-4 w-4" /> Add sale
            </Button>
          )}
          {can('payment_in.create') && p.partyType !== 'supplier' && (
            <Button size="sm" variant="outline" onClick={() => openPayment('PAYMENT_IN', { party: p._id })}>
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" /> Payment in
            </Button>
          )}
          {can('purchase_bill.create') && p.partyType !== 'customer' && (
            <Button size="sm" variant="outline" onClick={() => router.push(href(newTxnHref('PURCHASE', { party: p._id })))}>
              <ShoppingCart className="h-4 w-4" /> Add purchase
            </Button>
          )}
          {can('payment_out.create') && p.partyType !== 'customer' && (
            <Button size="sm" variant="outline" onClick={() => openPayment('PAYMENT_OUT', { party: p._id })}>
              <ArrowUpRight className="h-4 w-4 text-rose-600" /> Payment out
            </Button>
          )}
          <div className="flex-1" />
          {can('parties.edit') && (
            <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <Dropdown>
            <DropdownTrigger asChild>
              <Button size="icon" variant="outline" aria-label="More party actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              {can('parties.edit') && settings?.parties.enableGroups !== false && (
                <DropdownItem icon={<FolderInput className="h-4 w-4" />} onSelect={() => onMove(p)}>
                  Move to group
                </DropdownItem>
              )}
              {can('reports.view') && (
                <DropdownItem icon={<FileBarChart2 className="h-4 w-4" />} onSelect={() => router.push(href(`/reports/party-statement?party=${p._id}`))}>
                  Party statement
                </DropdownItem>
              )}
              {can('estimate.create') && settings?.transaction.enableEstimate !== false && p.partyType !== 'supplier' && (
                <DropdownItem icon={<Receipt className="h-4 w-4" />} onSelect={() => router.push(href(newTxnHref('ESTIMATE', { party: p._id })))}>
                  New estimate
                </DropdownItem>
              )}
              {can('proforma_invoice.create') && settings?.transaction.enableProforma !== false && p.partyType !== 'supplier' && (
                <DropdownItem icon={<Receipt className="h-4 w-4" />} onSelect={() => router.push(href(newTxnHref('PROFORMA', { party: p._id })))}>
                  New proforma invoice
                </DropdownItem>
              )}
              {can('parties.delete') && (
                <>
                  <DropdownSeparator />
                  <DropdownItem
                    icon={<Trash2 className="h-4 w-4" />}
                    danger
                    onSelect={async () => {
                      if (await confirm({ title: `Delete ${p.name}?`, message: 'Only parties without transactions can be deleted. Mark it inactive instead to keep history.', danger: true, confirmText: 'Delete' })) del.mutate();
                    }}
                  >
                    Delete party
                  </DropdownItem>
                </>
              )}
            </DropdownContent>
          </Dropdown>
        </div>
      </Card>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs text-slate-500">{t.label}</p>
              <p className="mt-0.5 font-semibold text-slate-900">{money(t.value)}</p>
              <p className="text-[11px] text-slate-500">{t.sub}</p>
            </div>
          ))}
        </div>
      )}
      <PartyTransactions partyId={p._id} />
      <p className="text-center text-xs text-slate-400">
        Opening balance {money(Math.abs(p.openingBalance))} {p.openingBalance < 0 ? 'to pay' : 'to receive'} as of {fmtDate(p.openingBalanceDate)}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function PartiesTab() {
  const { cid, can, href, settings } = useCompany();
  const { params, set } = useQueryState();
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [balance, setBalance] = useState('');
  const [group, setGroup] = useState('');
  const debounced = useDebounce(search);
  const groups = usePartyGroups();
  const [modal, setModal] = useState<{ open: boolean; party?: Party | null }>({ open: false });
  const [groupModal, setGroupModal] = useState(false);
  const [move, setMove] = useState<{ open: boolean; ids: string[]; current?: string | null }>({ open: false, ids: [] });
  const [mobileDetail, setMobileDetail] = useState(false);

  const q = useQuery({
    queryKey: [cid, 'parties', 'list', debounced, balance, group],
    queryFn: async () => api.get<Party[]>('/parties', { search: debounced, balance: balance || undefined, group: group || undefined, limit: 2000, active: 'all' }),
  });
  const list = q.data?.data ?? [];
  const summary = q.data?.meta?.summary as { receivable: number; payable: number } | undefined;
  const selected = params.get('party');

  useUrlFlag('new', can('parties.create'), () => setModal({ open: true, party: null }));

  useEffect(() => {
    // First party is selected by default
    if (!selected && list.length) set({ party: list[0]._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, list.length]);

  const choose = (id: string) => {
    set({ party: id });
    setMobileDetail(true);
  };
  const exportXlsx = async () => {
    setExporting(true);
    try {
      await api.download('/parties/export', undefined, 'parties.xlsx');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Parties"
        description="Customers and suppliers with their balances and full transaction history"
        actions={
          <>
            {can('parties.import') && (
              <Link href={href('/parties/import')} className={buttonClass({ variant: 'outline' })}>
                <Upload className="h-4 w-4" /> Import parties
              </Link>
            )}
            <Button variant="outline" onClick={exportXlsx} loading={exporting}>
              {!exporting && <Download className="h-4 w-4" />} Export Excel
            </Button>
            {can('parties.create') && settings?.parties.enableGroups !== false && (
              <Button variant="outline" onClick={() => setGroupModal(true)}>
                <FolderPlus className="h-4 w-4" /> Add group
              </Button>
            )}
            {can('parties.create') && (
              <Button onClick={() => setModal({ open: true, party: null })}>
                <Plus className="h-4 w-4" /> Add party
              </Button>
            )}
          </>
        }
      >
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5">
            <p className="text-xs text-emerald-700">Total to receive</p>
            <p className="font-semibold text-emerald-700">{money(summary?.receivable)}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5">
            <p className="text-xs text-rose-700">Total to pay</p>
            <p className="font-semibold text-rose-700">{money(summary?.payable)}</p>
          </div>
        </div>
      </PageHeader>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className={cn('flex flex-col lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-96px)]', mobileDetail && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, phone, BIN" />
            <div className="flex gap-2">
              <Select value={balance} onChange={(e) => setBalance(e.target.value)} className="h-8 text-xs">
                <option value="">All balances</option>
                <option value="receivable">To receive</option>
                <option value="payable">To pay</option>
              </Select>
              {settings?.parties.enableGroups !== false && (
                <Select value={group} onChange={(e) => setGroup(e.target.value)} className="h-8 text-xs">
                  <option value="">All groups</option>
                  <option value="none">No group</option>
                  {(groups.data?.groups ?? []).map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            <span>Party</span>
            <span>Amount</span>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {q.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <EmptyState icon={<Users className="h-6 w-6" />} title="No parties" description={debounced ? 'No party matches your search.' : 'Add your first customer or supplier.'} />
            ) : (
              list.map((p) => (
                <button
                  key={p._id}
                  onClick={() => choose(p._id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 border-l-[3px] px-4 py-2.5 text-left text-sm transition',
                    selected === p._id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50',
                    p.isActive === false && 'opacity-60',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{p.name}</span>
                    {p.phone && <span className="block truncate text-xs text-slate-500">{p.phone}</span>}
                  </span>
                  <BalanceAmount balance={p.balance} className="shrink-0 text-sm font-medium" />
                </button>
              ))
            )}
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{plural(list.length, 'party')}</p>
        </Card>
        <div className={cn('min-w-0', !mobileDetail && 'hidden lg:block')}>
          {selected ? (
            <PartyDetailPane
              key={selected}
              partyId={selected}
              onBack={() => setMobileDetail(false)}
              onEdit={(p) => setModal({ open: true, party: p })}
              onMove={(p) => setMove({ open: true, ids: [p._id], current: p.group?._id ?? null })}
              onDeleted={() => set({ party: null })}
            />
          ) : (
            <Card>
              <EmptyState title="Select a party" description="Pick a party on the left to see its balance and transactions." />
            </Card>
          )}
        </div>
      </div>
      <PartyModal open={modal.open} party={modal.party} onOpenChange={(o) => setModal((m) => ({ ...m, open: o }))} onSaved={(p) => !modal.party && set({ party: p._id })} />
      <GroupModal open={groupModal} onOpenChange={setGroupModal} />
      <MoveGroupModal open={move.open} partyIds={move.ids} currentGroup={move.current} onOpenChange={(o) => setMove((m) => ({ ...m, open: o }))} />
    </>
  );
}

/* ---------------------------------------------------------------- */

function GroupsTab() {
  const { cid, can } = useCompany();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const groups = usePartyGroups();
  // Until a group is picked, the first group is shown ('none' is the "No group" bucket).
  const [picked, setSelected] = useState<string | null>(null);
  const selected = picked ?? groups.data?.groups[0]?._id ?? 'none';
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const [checked, setChecked] = useState<string[]>([]);
  const [groupModal, setGroupModal] = useState<{ open: boolean; group?: PartyGroupRow | null }>({ open: false });
  const [move, setMove] = useState(false);
  const { set } = useQueryState();

  useResetOn(selected, () => setChecked([]));

  const parties = useQuery({
    queryKey: [cid, 'parties', 'list', 'group', selected, debounced],
    queryFn: async () => (await api.get<Party[]>('/parties', { group: selected, search: debounced, limit: 2000, active: 'all' })).data,
    enabled: !!groups.data,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/parties/groups/${id}`),
    onSuccess: (res) => {
      if (reportWrite(res, 'Group deleted. Its parties are now ungrouped.')) setSelected(null);
      invalidateCompany(qc, cid);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const all = useMemo(() => {
    const u = groups.data?.ungrouped;
    return [...(groups.data?.groups ?? []), ...(u ? [{ _id: 'none', name: 'No group', parties: u.parties, receivable: u.receivable, payable: u.payable } as PartyGroupRow] : [])];
  }, [groups.data]);
  const current = all.find((g) => g._id === selected);
  const rows = parties.data ?? [];

  return (
    <>
      <PageHeader
        title="Party groups"
        description="See which parties belong to which group and move them around"
        actions={
          can('parties.create') && (
            <Button onClick={() => setGroupModal({ open: true, group: null })}>
              <FolderPlus className="h-4 w-4" /> Add group
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit">
          {groups.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {all.map((g) => (
                <button
                  key={g._id}
                  onClick={() => setSelected(g._id)}
                  className={cn('flex w-full items-center justify-between gap-2 border-l-[3px] px-4 py-3 text-left', selected === g._id ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-slate-50')}
                >
                  <span className="min-w-0">
                    <span className={cn('block truncate text-sm font-medium', g._id === 'none' ? 'text-slate-500 italic' : 'text-slate-800')}>{g.name}</span>
                    <span className="text-xs text-slate-500">{plural(g.parties, 'party')}</span>
                  </span>
                  <span className="text-right text-xs">
                    <span className="block text-emerald-600">{money(g.receivable)}</span>
                    <span className="block text-rose-600">{money(g.payable)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{current?.name ?? 'Group'}</p>
              <p className="text-xs text-slate-500">
                To receive {money(current?.receivable)} · To pay {money(current?.payable)}
              </p>
            </div>
            <div className="flex-1" />
            <SearchInput value={search} onChange={setSearch} placeholder="Search in group" className="w-full sm:w-56" />
            {can('parties.edit') && (
              <Button size="sm" variant="outline" disabled={!checked.length} onClick={() => setMove(true)}>
                <FolderInput className="h-4 w-4" /> Move {checked.length ? `(${checked.length})` : ''}
              </Button>
            )}
            {current && current._id !== 'none' && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button size="icon" variant="outline" aria-label="Group actions">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  {can('parties.edit') && (
                    <DropdownItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setGroupModal({ open: true, group: current })}>
                      Rename group
                    </DropdownItem>
                  )}
                  {can('parties.delete') && (
                    <DropdownItem
                      danger
                      icon={<Trash2 className="h-4 w-4" />}
                      onSelect={async () => {
                        if (await confirm({ title: `Delete group "${current.name}"?`, message: 'Parties in this group are kept and become ungrouped.', danger: true, confirmText: 'Delete group' })) del.mutate(current._id);
                      }}
                    >
                      Delete group
                    </DropdownItem>
                  )}
                </DropdownContent>
              </Dropdown>
            )}
          </div>
          {parties.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title="No parties in this group" description="Use “Move to group” on a party, or select parties in another group and move them here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-10 px-5 py-2.5">
                      <Checkbox checked={checked.length === rows.length} onChange={(v) => setChecked(v ? rows.map((r) => r._id) : [])} />
                    </th>
                    <th className="px-3 py-2.5 font-medium">Party</th>
                    <th className="px-3 py-2.5 font-medium">Phone</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5">
                        <Checkbox checked={checked.includes(p._id)} onChange={(v) => setChecked((c) => (v ? [...c, p._id] : c.filter((x) => x !== p._id)))} />
                      </td>
                      <td className="px-3 py-2.5 font-medium">{p.name}</td>
                      <td className="px-3 py-2.5 text-slate-600">{p.phone || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600 capitalize">{p.partyType === 'both' ? 'Customer & supplier' : p.partyType}</td>
                      <td className="px-3 py-2.5 text-right">
                        <BalanceAmount balance={p.balance} />
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button className="text-xs font-medium text-blue-600 hover:underline" onClick={() => set({ tab: null, party: p._id })}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <GroupModal open={groupModal.open} group={groupModal.group} onOpenChange={(o) => setGroupModal((m) => ({ ...m, open: o }))} onSaved={(g) => setSelected(g._id)} />
      <MoveGroupModal open={move} partyIds={checked} currentGroup={selected === 'none' ? null : selected} onOpenChange={setMove} onDone={() => setChecked([])} />
    </>
  );
}

export default function PartiesPage() {
  const { settings } = useCompany();
  const { params, set } = useQueryState();
  const tab = params.get('tab') === 'groups' && settings?.parties.enableGroups !== false ? 'groups' : 'parties';
  return (
    <div>
      {settings?.parties.enableGroups !== false && (
        <Tabs
          className="mb-5"
          value={tab}
          onChange={(v) => set({ tab: v === 'groups' ? 'groups' : null })}
          tabs={[
            { value: 'parties', label: 'Parties' },
            { value: 'groups', label: 'Groups' },
          ]}
        />
      )}
      {tab === 'groups' ? <GroupsTab /> : <PartiesTab />}
    </div>
  );
}
