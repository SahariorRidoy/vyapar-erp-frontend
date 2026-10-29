'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Ban, Info, Link2, Plus, ScanBarcode, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { DocFileKind, Item, Party, Txn, TxnLine, TxnType } from '@/lib/types';
import { TXN, newTxnHref, printHref, txnHref } from '@/lib/txn';
import { BD_DIVISIONS } from '@/lib/constants';
import { computeLine, computeTotals } from '@/lib/money';
import { invalidateCompany, reportWrite } from '@/lib/query';
import { cn, fmtDate, isoDate, money, num, qty as fmtQty, round2, today } from '@/lib/utils';
import { useAccountOptions, useExpenseCategories, useItems, useParties, useUnits } from '@/hooks/data';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Checkbox, Field, Input, NumberInput, Select, Textarea } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { FileUpload, type FileRef } from '@/components/ui/file-upload';
import { NoAccess, PageLoader } from '@/components/ui/misc';
import { LoadError } from '@/components/ui/fallback';
import { PartyModal } from '@/components/party/party-modal';
import { ItemModal } from '@/components/item/item-modal';
import { TxnMenu } from './actions';
import { ExpenseCategoryModal } from './expense-category-modal';

type Side = 'sale' | 'purchase' | 'expense';
const SIDE: Record<TxnType, Side> = {
  SALE: 'sale', ESTIMATE: 'sale', PROFORMA: 'sale', SALE_ORDER: 'sale', DELIVERY_CHALLAN: 'sale', SALE_RETURN: 'sale', PAYMENT_IN: 'sale',
  PURCHASE: 'purchase', PURCHASE_ORDER: 'purchase', PURCHASE_RETURN: 'purchase', PAYMENT_OUT: 'purchase', EXPENSE: 'expense',
};
/** Documents whose save reduces stock (used for the availability hint). */
const REDUCES_STOCK: TxnType[] = ['SALE', 'PURCHASE_RETURN'];

interface FormLine {
  key: string;
  item: string | null;
  name: string;
  hsn: string;
  description: string;
  showDescription: boolean;
  qty: number;
  unit: string | null;
  price: number;
  priceTouched: boolean;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxInclusive: boolean;
  lastPrice?: number;
}

interface FormState {
  cash: boolean;
  party: string | null;
  partyName: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
  number: string;
  numberTouched: boolean;
  date: string;
  dueDate: string;
  stateOfSupply: string;
  refNo: string;
  expenseCategory: string | null;
  lines: FormLine[];
  discountPercent: number;
  discountAmount: number;
  charges: { label: string; amount: number }[];
  roundOff: boolean;
  settled: number;
  fullSettle: boolean;
  paymentAccount: string;
  paymentRef: string;
  description: string;
  terms: string;
  attachments: FileRef[];
  docFiles: Record<DocFileKind, FileRef[]>;
  amountOnly: number;
}

const DOC_FILE_KINDS: { key: DocFileKind; label: string }[] = [
  { key: 'po', label: 'PO' },
  { key: 'challan', label: 'Challan' },
  { key: 'bill', label: 'Bill' },
];

const emptyDocFiles = (): Record<DocFileKind, FileRef[]> => ({ po: [], challan: [], bill: [] });

const docFilesOf = (t: Txn): Record<DocFileKind, FileRef[]> => {
  const out = emptyDocFiles();
  for (const { key } of DOC_FILE_KINDS) out[key] = (t.docFiles?.[key] ?? []).filter((a): a is { _id: string; originalName: string; mime: string; size: number } => typeof a === 'object');
  return out;
};

let keySeq = 0;
const newKey = () => `l${++keySeq}`;

function blankLine(taxRate = 0): FormLine {
  return { key: newKey(), item: null, name: '', hsn: '', description: '', showDescription: false, qty: 1, unit: null, price: 0, priceTouched: false, discountPercent: 0, discountAmount: 0, taxRate, taxInclusive: false };
}

const idOf = (v: unknown): string | null => (v && typeof v === 'object' ? (v as { _id: string })._id : ((v as string) || null));

/** Payment type value for "Cheque": the money reaches an account when the cheque is deposited or withdrawn. */
const CHEQUE = 'cheque';
/** Documents whose payment brings money in (a cheque received is deposited; any other is withdrawn). */
const MONEY_IN: TxnType[] = ['SALE', 'PAYMENT_IN', 'PURCHASE_RETURN'];

/** Where a cheque payment stands: still to deposit (or withdraw), or cleared through an account. */
function ChequeNote({ cheque, incoming }: { cheque?: Txn['cheque']; incoming: boolean }) {
  const { href } = useCompany();
  const link = (
    <Link href={href('/cash-bank/cheques')} className="font-medium underline">
      Cash &amp; Bank ▸ Cheques
    </Link>
  );
  if (cheque?.status === 'CLOSED') {
    const acc = cheque.account && typeof cheque.account === 'object' ? cheque.account.name : 'the bank';
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        Cheque {incoming ? 'deposited into' : 'withdrawn from'} {acc}
        {cheque.closedOn ? ` on ${fmtDate(cheque.closedOn)}` : ''}. To change the amount or payment type, reopen it in {link}.
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
      The party&apos;s balance changes now. The money reaches cash or bank when you {incoming ? 'deposit' : 'withdraw'} the cheque in {link}.
    </p>
  );
}

/** Sale value before tax and after the bill discount, minus the purchase price of the stock items sold. */
function estimateProfit(lines: (FormLine & { taxable: number })[], items: Item[], billDiscount: number, perBase: (it: Item, unit: string | null) => number) {
  const byId = new Map(items.map((i) => [i._id, i]));
  const cost = lines.reduce((sum, l) => {
    const it = l.item ? byId.get(l.item) : undefined;
    if (!it || it.type === 'service') return sum;
    return sum + (l.qty / perBase(it, l.unit)) * (it.purchasePrice || 0);
  }, 0);
  return round2(lines.reduce((sum, l) => sum + l.taxable, 0) - billDiscount - cost);
}

function linesFrom(items: TxnLine[]): FormLine[] {
  return items.map((l) => ({
    key: newKey(), item: idOf(l.item), name: l.name, hsn: l.hsn ?? '', description: l.description ?? '', showDescription: !!l.description, qty: l.qty, unit: idOf(l.unit),
    price: l.price, priceTouched: true, discountPercent: l.discountPercent ?? 0, discountAmount: l.discountPercent ? 0 : (l.discountAmount ?? 0), taxRate: l.taxRate ?? 0, taxInclusive: !!l.taxInclusive,
  }));
}

export function TxnForm({ type, id }: { type: TxnType; id?: string }) {
  const m = TXN[type];
  const side = SIDE[type];
  const { cid, href, can, settings } = useCompany();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const fromId = id ? null : params.get('from');
  const dupId = id ? null : params.get('duplicate');
  const presetParty = id ? null : params.get('party');
  const presetCategory = id ? null : params.get('category');
  const ts = settings?.transaction;
  const isExpense = type === 'EXPENSE';
  const canCash = type === 'SALE' || type === 'PURCHASE';

  const parties = useParties();
  const items = useItems(!isExpense);
  const unitsQ = useUnits(!isExpense);
  const allUnits = unitsQ.data?.units ?? [];
  const accounts = useAccountOptions();
  const expCats = useExpenseCategories();

  const existing = useQuery({ queryKey: [cid, 'transactions', 'detail', id], queryFn: async () => (await api.get<Txn>(`/transactions/${id}`)).data, enabled: !!id });
  const source = useQuery({ queryKey: [cid, 'transactions', 'detail', fromId ?? dupId], queryFn: async () => (await api.get<Txn>(`/transactions/${fromId ?? dupId}`)).data, enabled: !!(fromId ?? dupId) });
  const nextNo = useQuery({
    queryKey: [cid, 'transactions', 'next-number', type],
    queryFn: async () => (await api.get<{ number: string }>('/transactions/next-number', { type })).data.number,
    enabled: !id,
    staleTime: 0,
  });

  const defaultDue = useCallback((date: string) => (m.hasDueDate && ts?.dueDates !== false ? dayjs(date).add(ts?.defaultDueDays ?? 15, 'day').format('YYYY-MM-DD') : ''), [m.hasDueDate, ts]);
  const defaultTax = settings?.items.defaultTaxRate ?? 0;

  const initial = useCallback(
    (): FormState => ({
      cash: canCash && !!ts?.cashSaleByDefault,
      party: null, partyName: '', phone: '', billingAddress: '', shippingAddress: '', number: '', numberTouched: false,
      date: today(), dueDate: defaultDue(today()), stateOfSupply: '', refNo: '', expenseCategory: isExpense ? presetCategory : null, lines: [blankLine(isExpense ? 0 : defaultTax)],
      discountPercent: 0, discountAmount: 0, charges: [], roundOff: ts?.roundOff ?? true, settled: 0, fullSettle: false, paymentAccount: '', paymentRef: '',
      description: '', terms: '', attachments: [], docFiles: emptyDocFiles(), amountOnly: 0,
    }),
    [canCash, ts, defaultDue, isExpense, defaultTax, presetCategory],
  );

  const [f, setF] = useState<FormState>(initial);
  const [hydrated, setHydrated] = useState(!id && !fromId && !dupId);
  const [error, setError] = useState('');
  const [partyModal, setPartyModal] = useState<{ open: boolean; name?: string }>({ open: false });
  const [itemModal, setItemModal] = useState<{ open: boolean; name?: string; lineKey?: string }>({ open: false });
  const [catModal, setCatModal] = useState<{ open: boolean; name?: string }>({ open: false });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));

  // Hydrate once from the edited document, the source (conversion) or the duplicated document
  const loadedDoc = id ? existing.data : source.data;
  if (loadedDoc && !hydrated) {
    const t = loadedDoc;
    const p = t.party && typeof t.party === 'object' ? t.party : null;
    const base: Partial<FormState> = {
      party: p?._id ?? idOf(t.party),
      partyName: t.partyName ?? '',
      phone: t.phone ?? '',
      billingAddress: t.billingAddress ?? '',
      shippingAddress: t.shippingAddress ?? '',
      stateOfSupply: t.stateOfSupply ?? '',
      expenseCategory: idOf(t.expenseCategory),
      lines: t.items.length ? linesFrom(t.items) : [blankLine()],
      discountPercent: t.discountPercent ?? 0,
      discountAmount: t.discountPercent ? 0 : (t.discountAmount ?? 0),
      charges: t.additionalCharges ?? [],
      description: t.description ?? '',
      terms: t.terms ?? '',
      amountOnly: t.items.length ? 0 : t.total,
    };
    if (id) {
      setF((x) => ({
        ...x,
        ...base,
        cash: canCash && !t.party && t.settled >= t.total,
        number: t.number,
        numberTouched: false,
        date: isoDate(t.date),
        dueDate: isoDate(t.dueDate),
        refNo: t.refNo ?? '',
        roundOff: t.roundOff !== 0 || x.roundOff,
        settled: t.settled,
        // A cleared cheque keeps its amount, so the received amount no longer follows the total
        fullSettle: t.total > 0 && t.settled >= t.total && t.cheque?.status !== 'CLOSED',
        paymentAccount: t.cheque?.status ? CHEQUE : (idOf(t.paymentAccount) ?? ''),
        paymentRef: t.paymentRef ?? '',
        attachments: (t.attachments ?? []).filter((a): a is { _id: string; originalName: string; mime: string; size: number } => typeof a === 'object'),
        docFiles: docFilesOf(t),
      }));
    } else {
      // Conversion keeps the source's commercial terms and its PO / challan / bill files; a return references the original invoice.
      setF((x) => ({ ...x, ...base, cash: false, docFiles: fromId ? docFilesOf(t) : emptyDocFiles(), refNo: fromId && (type === 'SALE_RETURN' || type === 'PURCHASE_RETURN') ? t.number : '' }));
    }
    setHydrated(true);
  }

  // A new document shows the next number until the user types their own; the default account until one is picked.
  const number = id || f.numberTouched ? f.number : (nextNo.data ?? f.number);
  const paymentAccount = f.paymentAccount || ((accounts.data?.find((a) => a.isDefault) ?? accounts.data?.[0])?._id ?? '');
  const chequeCleared = !!id && existing.data?.cheque?.status === 'CLOSED';

  // ?party=<id> preselects a party (from the party page)
  const [presetDone, setPresetDone] = useState(false);
  const partyList = useMemo(() => parties.data ?? [], [parties.data]);
  const partyById = (pid: string | null) => partyList.find((p) => p._id === pid);
  const applyParty = (pid: string | null, p?: Party) => {
    const party = p ?? partyById(pid);
    setF((x) => ({
      ...x,
      party: pid,
      cash: pid ? false : x.cash,
      partyName: party?.name ?? '',
      phone: party?.phone ?? '',
      billingAddress: party?.billingAddress ?? '',
      shippingAddress: party?.shippingAddress || party?.billingAddress || '',
      stateOfSupply: ts?.stateOfSupply ? party?.state || x.stateOfSupply : x.stateOfSupply,
    }));
  };
  if (!presetDone && presetParty && partyList.length) {
    setPresetDone(true);
    applyParty(presetParty);
  }

  const doc = existing.data;
  const readOnly = !!doc && (doc.status === 'CANCELLED' || !can(`${m.perm}.edit`));
  const itemList = useMemo(() => (items.data ?? []).filter((i) => i.isActive !== false || f.lines.some((l) => l.item === i._id)), [items.data, f.lines]);
  const itemById = useCallback((iid: string | null) => itemList.find((i) => i._id === iid), [itemList]);

  /* -------- line editing -------- */
  const updateLine = (key: string, patch: Partial<FormLine>) => setF((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const removeLine = (key: string) => setF((x) => ({ ...x, lines: x.lines.length > 1 ? x.lines.filter((l) => l.key !== key) : [blankLine(isExpense ? 0 : defaultTax)] }));
  const addLine = () => setF((x) => ({ ...x, lines: [...x.lines, blankLine(isExpense ? 0 : defaultTax)] }));

  /** Only the item's own secondary unit converts; any other picked unit is just the label printed on the document. */
  const perBase = useCallback((it: Item, unit: string | null) => (unit && idOf(it.secondaryUnit) === unit ? it.conversionRate || 1 : 1), []);

  const unitPrice = (it: Item, q: number, unit: string | null) => {
    let price = side === 'purchase' ? it.purchasePrice : it.salePrice;
    const factor = perBase(it, unit);
    if (side === 'sale' && settings?.items.enableWholesalePrice !== false && it.wholesalePrice > 0 && it.minWholesaleQty > 0 && q / factor >= it.minWholesaleQty) price = it.wholesalePrice;
    return factor === 1 ? price : round2(price / factor);
  };

  const chooseItem = async (key: string, it: Item) => {
    const line = f.lines.find((l) => l.key === key);
    const q = line?.qty || 1;
    const unit = idOf(it.baseUnit);
    updateLine(key, {
      item: it._id,
      name: it.name,
      hsn: it.hsn ?? '',
      unit,
      price: unitPrice(it, q, unit),
      priceTouched: false,
      taxRate: settings?.taxes.enableGst === false ? 0 : it.taxRate,
      taxInclusive: side === 'purchase' ? !!it.purchaseTaxInclusive : !!it.saleTaxInclusive,
      lastPrice: undefined,
    });
    // Append an empty row when the last row gets an item, like a spreadsheet
    setF((x) => (x.lines[x.lines.length - 1]?.key === key ? { ...x, lines: [...x.lines, blankLine(defaultTax)] } : x));
    if (f.party) {
      try {
        const info = (await api.get<{ lastPrice?: number }>(`/items/${it._id}/price-info`, { party: f.party, type })).data;
        if (info.lastPrice !== undefined) updateLine(key, { lastPrice: info.lastPrice });
      } catch {
        /* the hint is optional */
      }
    }
  };

  const changeQty = (l: FormLine, q: number) => {
    const it = itemById(l.item);
    updateLine(l.key, { qty: q, ...(it && !l.priceTouched ? { price: unitPrice(it, q, l.unit) } : {}) });
  };

  /* -------- barcode scanning: a scanner types the item code and presses Enter -------- */
  const [scan, setScan] = useState('');
  const [lastScan, setLastScan] = useState<{ name: string; qty: number } | null>(null);
  const scanCode = (raw: string) => {
    const code = raw.trim().toLowerCase();
    if (!code) return;
    const it = itemList.find((i) => i.code?.toLowerCase() === code);
    if (!it) {
      setLastScan(null);
      return toast.error(`No item has the code "${raw.trim()}"`);
    }
    // Scanning the same item again adds one to its row instead of a new row
    const same = f.lines.find((l) => l.item === it._id && l.unit === idOf(it.baseUnit));
    if (same) {
      changeQty(same, same.qty + 1);
      setLastScan({ name: it.name, qty: same.qty + 1 });
      return;
    }
    const empty = f.lines.find((l) => !l.item && !l.name.trim());
    if (empty) {
      if (empty.qty !== 1) updateLine(empty.key, { qty: 1 });
      chooseItem(empty.key, it);
    } else {
      const line = blankLine(defaultTax);
      setF((x) => ({ ...x, lines: [...x.lines, line] }));
      chooseItem(line.key, it);
    }
    setLastScan({ name: it.name, qty: 1 });
  };

  const changeUnit = (l: FormLine, unit: string) => {
    const it = itemById(l.item);
    if (!it) return updateLine(l.key, { unit });
    const price = round2((l.price * perBase(it, l.unit)) / perBase(it, unit));
    updateLine(l.key, { unit, price: l.priceTouched ? price : unitPrice(it, l.qty, unit) });
  };

  /* -------- totals -------- */
  const computed = f.lines.map((l) => ({ ...l, ...computeLine(l) }));
  const valid = computed.filter((l) => l.name.trim());
  const totals = computeTotals(valid, { discountPercent: f.discountPercent, discountAmount: f.discountAmount, charges: f.charges, roundOff: f.roundOff });
  const amountOnlyMode = isExpense && valid.length === 0;
  const total = amountOnlyMode ? round2(f.amountOnly) : totals.total;
  // Settings ▸ Transactions ▸ "Show profit while making a sale": value before tax minus purchase cost, never printed.
  const showProfit = type === 'SALE' && !!ts?.showProfitOnInvoice && valid.some((l) => l.item);
  const profit = showProfit ? estimateProfit(valid, items.data ?? [], totals.discountAmount, perBase) : 0;
  const viaPayments = doc?.paidViaPayments ?? 0;
  const settled = m.settles ? (f.cash || f.fullSettle ? round2(Math.max(0, total - viaPayments)) : f.settled) : 0;
  const balance = round2(total - settled - viaPayments);
  const selectedParty = partyById(f.party);
  const creditWarn =
    selectedParty && settings?.parties.enableCreditLimit !== false && selectedParty.creditLimit && side === 'sale' && m.settles && type === 'SALE'
      ? selectedParty.balance - (doc?.balance ?? 0) + balance > selectedParty.creditLimit
      : false;

  /* -------- save -------- */
  const save = useMutation({
    mutationFn: async (mode: 'save' | 'new' | 'print') => {
      const body = {
        type,
        number: number.trim() || undefined,
        autoNumber: !f.numberTouched,
        date: f.date,
        dueDate: f.dueDate || null,
        party: f.party || null,
        partyName: f.party ? undefined : f.partyName.trim() || undefined,
        phone: f.phone || undefined,
        billingAddress: f.billingAddress || undefined,
        shippingAddress: f.shippingAddress || undefined,
        stateOfSupply: f.stateOfSupply || undefined,
        refNo: f.refNo || undefined,
        expenseCategory: isExpense ? f.expenseCategory : undefined,
        items: valid.map((l) => ({
          item: l.item, name: l.name.trim(), hsn: l.hsn || undefined, description: l.description || undefined, qty: l.qty, unit: l.unit,
          price: l.price, discountPercent: l.discountPercent, discountAmount: l.discountPercent ? 0 : l.discountAmount, taxRate: l.taxRate, taxInclusive: l.taxInclusive,
        })),
        discountPercent: f.discountPercent,
        discountAmount: f.discountPercent ? 0 : f.discountAmount,
        additionalCharges: f.charges.filter((c) => c.label.trim() && c.amount),
        roundOff: f.roundOff,
        amount: amountOnlyMode ? f.amountOnly : undefined,
        settled,
        paymentMode: settled > 0 && paymentAccount === CHEQUE ? 'cheque' : 'account',
        paymentAccount: settled > 0 && paymentAccount !== CHEQUE ? paymentAccount || undefined : undefined,
        paymentRef: f.paymentRef || undefined,
        description: f.description || undefined,
        terms: f.terms || undefined,
        attachments: f.attachments.map((a) => a._id),
        docFiles: { po: f.docFiles.po.map((a) => a._id), challan: f.docFiles.challan.map((a) => a._id), bill: f.docFiles.bill.map((a) => a._id) },
        sourceId: fromId || undefined,
      };
      const res = id ? await api.put<Txn>(`/transactions/${id}`, body) : await api.post<Txn>('/transactions', body);
      return { res, mode };
    },
    onSuccess: ({ res, mode }) => {
      invalidateCompany(qc, cid);
      const applied = reportWrite(res, id ? `${m.label} ${number} updated` : `${m.label} ${res.data.number} saved`);
      if (applied && mode === 'print') window.open(href(printHref(res.data._id, { autoprint: true })), '_blank');
      if (mode === 'new' && applied && !id) {
        // A conversion or copy must not be repeated: start from a clean URL (remounts the form).
        if (fromId || dupId || presetParty) return router.replace(href(newTxnHref(type, { category: presetCategory ?? undefined })));
        setF(initial());
        setError('');
        qc.invalidateQueries({ queryKey: [cid, 'transactions', 'next-number', type] });
        window.scrollTo({ top: 0 });
        return;
      }
      router.push(href(m.route));
    },
    onError: (e) => {
      setError(errorMessage(e));
      toast.error(errorMessage(e));
    },
  });

  const submit = (mode: 'save' | 'new' | 'print' = 'save') => {
    if (readOnly) return;
    const needsParty = !isExpense && !(canCash && f.cash);
    if (needsParty && !f.party) return setError(`Select a ${m.partyLabel.toLowerCase()}${canCash ? ' or switch to Cash' : ''}`);
    if (isExpense && !f.expenseCategory) return setError('Select an expense category');
    if (!isExpense && valid.length === 0) return setError('Add at least one item');
    for (const l of valid) if (!(l.qty > 0) && l.price > 0) return setError(`Enter a quantity for ${l.name}`);
    if (amountOnlyMode && !(f.amountOnly > 0)) return setError('Enter the expense amount or add expense items');
    if (m.settles && settled > total + 0.001) return setError(`${m.settledLabel} amount cannot be more than the total`);
    setError('');
    save.mutate(mode);
  };

  // Ctrl/Cmd + S saves
  const saveShortcut = useEffectEvent(() => submit('save'));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveShortcut();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* -------- render -------- */
  if (!can(`${m.perm}.${id ? 'view' : 'create'}`)) return <NoAccess what={id ? m.plural : `creating ${m.plural.toLowerCase()}`} />;
  if ((id && existing.isLoading) || ((fromId || dupId) && source.isLoading) || !settings) return <PageLoader />;
  if (id && existing.isError) return <LoadError error={existing.error} what="this document" home={href('/dashboard')} homeLabel="Go to dashboard" onRetry={() => existing.refetch()} />;

  const showItemDiscount = !isExpense && ts?.itemwiseDiscount !== false;
  const showItemTax = !isExpense && ts?.itemwiseTax !== false && settings.taxes.enableGst !== false;
  const taxRates = [...new Map((settings.taxes.rates ?? []).map((r) => [r.rate, r])).values()];
  const partyOptions = partyList
    .filter((p) => p.isActive !== false || p._id === f.party)
    .map((p) => ({
      value: p._id,
      label: p.name,
      hint: p.phone,
      keywords: `${p.phone ?? ''} ${p.gstin ?? ''}`,
      right: Math.abs(p.balance) > 0.005 ? <span className={p.balance > 0 ? 'text-emerald-600' : 'text-rose-600'}>{money(Math.abs(p.balance))}</span> : null,
    }));
  const itemOptions = itemList.map((i) => ({
    value: i._id,
    label: i.name,
    hint: [i.code, i.type === 'product' && settings.items.enableStock !== false ? `Stock ${fmtQty(i.stock)} ${i.baseUnit && typeof i.baseUnit === 'object' ? i.baseUnit.shortName : ''}` : 'Service'].filter(Boolean).join(' · '),
    keywords: `${i.code ?? ''} ${i.hsn ?? ''}`,
    right: (
      <span className="flex flex-col items-end gap-0.5 text-[11px] leading-tight tabular-nums">
        <span className="text-amber-700">Cost {money(i.purchasePrice || 0)}</span>
        {i.salePrice > 0 && <span className="font-medium text-emerald-700">Sale {money(i.salePrice)}</span>}
      </span>
    ),
  }));
  const catOptions = (expCats.data ?? []).map((c) => ({ value: c._id, label: c.name }));
  const title = id ? `${m.label} ${doc?.number ?? ''}` : fromId ? `New ${m.label}` : m.label;

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={href(m.route)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back to list">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {doc && <StatusBadge txn={doc} />}
        {canCash && !readOnly && (
          <div className="flex overflow-hidden rounded-full border border-slate-300 text-xs font-medium">
            {[
              { v: false, label: 'Credit' },
              { v: true, label: 'Cash' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setF((x) => ({ ...x, cash: o.v, ...(o.v ? { fullSettle: true } : { fullSettle: false, settled: 0 }) }))}
                className={cn('px-3 py-1', f.cash === o.v ? (o.v ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white') : 'bg-white text-slate-600 hover:bg-slate-50')}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {doc && <TxnMenu txn={doc} />}
      </div>

      {fromId && source.data && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
          <ArrowRightLeft className="h-4 w-4" /> Converting {TXN[source.data.type].label} <b>{source.data.number}</b> into a {m.label}. Review and save.
        </p>
      )}
      {dupId && source.data && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <Info className="h-4 w-4" /> Copy of {TXN[source.data.type].label} {source.data.number}. A new number and today&apos;s date are used.
        </p>
      )}
      {doc?.status === 'CANCELLED' && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          <Ban className="h-4 w-4" /> This document is cancelled{doc.cancelReason ? `: ${doc.cancelReason}` : ''}. It is kept for records and cannot be edited.
        </p>
      )}
      {!!doc?.pendingApprovals?.length && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Waiting for approval: {doc.pendingApprovals.map((p) => p.label).join(', ')}
        </p>
      )}
      {doc && (doc.source || doc.links.length > 0 || doc.allocations.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <Link2 className="h-3.5 w-3.5 text-slate-400" />
          {doc.source && (
            <Link href={href(txnHref(doc.source.type, doc.source.transaction))} className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 hover:underline">
              From {TXN[doc.source.type].label} {doc.source.number}
            </Link>
          )}
          {doc.links.map((l) => (
            <Link key={l.transaction} href={href(txnHref(l.type, l.transaction))} className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 hover:underline">
              {TXN[l.type].label} {l.number}
            </Link>
          ))}
        </div>
      )}

      {/* min-w-0: a fieldset is at least as wide as its content by default, which would stretch the form past a phone screen */}
      <fieldset disabled={readOnly} className="min-w-0 space-y-4">
        {/* Party & document details */}
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <div className="grid gap-4 sm:grid-cols-2">
              {isExpense ? (
                <>
                  <Field label="Expense category" required>
                    <Combobox
                      value={f.expenseCategory}
                      onChange={(v) => set('expenseCategory', v)}
                      options={catOptions}
                      placeholder="e.g. Rent, Salary, Transport"
                      onCreate={can('expense.create') ? (name) => setCatModal({ open: true, name }) : undefined}
                      createLabel="Add expense category"
                      disabled={readOnly}
                    />
                  </Field>
                  <Field label="Paid to (optional)">
                    <Combobox value={f.party} onChange={(v) => applyParty(v)} options={partyOptions} placeholder="Party (optional)" clearable disabled={readOnly} />
                  </Field>
                </>
              ) : f.cash && canCash ? (
                <>
                  <Field label={`${m.partyLabel} name`}>
                    <div className="flex gap-2">
                      <Input value={f.partyName} onChange={(e) => set('partyName', e.target.value)} placeholder="Cash customer" />
                    </div>
                    <button type="button" className="mt-1 text-xs font-medium text-blue-600 hover:underline" onClick={() => setF((x) => ({ ...x, cash: false, fullSettle: false, settled: 0 }))}>
                      Select a saved party instead
                    </button>
                  </Field>
                  <Field label="Phone">
                    <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label={m.partyLabel} required>
                    <Combobox
                      value={f.party}
                      onChange={(v) => applyParty(v)}
                      options={partyOptions}
                      placeholder={`Search ${m.partyLabel.toLowerCase()} by name or phone`}
                      onCreate={can('parties.create') ? (name) => setPartyModal({ open: true, name }) : undefined}
                      createLabel="Add new party"
                      invalid={!!error && !f.party}
                      disabled={readOnly}
                    />
                    {selectedParty && (
                      <p className="mt-1 text-xs text-slate-500">
                        Balance:{' '}
                        <b className={selectedParty.balance > 0 ? 'text-emerald-700' : selectedParty.balance < 0 ? 'text-rose-700' : ''}>
                          {money(Math.abs(selectedParty.balance))} {selectedParty.balance > 0 ? 'to receive' : selectedParty.balance < 0 ? 'to pay' : ''}
                        </b>
                        {selectedParty.creditLimit ? ` · limit ${money(selectedParty.creditLimit)}` : ''}
                      </p>
                    )}
                  </Field>
                  <Field label="Phone">
                    <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
                  </Field>
                </>
              )}
              {!isExpense && (
                <>
                  <Field label="Billing address">
                    <Textarea value={f.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} rows={2} />
                  </Field>
                  {settings.parties.enableShippingAddress !== false ? (
                    <Field label="Shipping address">
                      <Textarea value={f.shippingAddress} onChange={(e) => set('shippingAddress', e.target.value)} rows={2} />
                    </Field>
                  ) : (
                    <div />
                  )}
                </>
              )}
            </div>
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <Field label={`${m.label} no.`}>
                <Input
                  value={number}
                  onChange={(e) => setF((x) => ({ ...x, number: e.target.value, numberTouched: true }))}
                  placeholder={nextNo.isLoading ? 'Loading…' : 'Auto'}
                />
              </Field>
              <Field label="Date" required>
                <Input
                  type="date"
                  value={f.date}
                  onChange={(e) => setF((x) => ({ ...x, date: e.target.value, dueDate: !id && x.dueDate === defaultDue(x.date) ? defaultDue(e.target.value) : x.dueDate }))}
                />
              </Field>
              {m.hasDueDate && ts?.dueDates !== false && (
                <Field label={type === 'SALE_ORDER' || type === 'PURCHASE_ORDER' ? 'Due / delivery date' : 'Due date'}>
                  <Input type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} min={f.date} />
                </Field>
              )}
              {ts?.stateOfSupply !== false && !isExpense && (
                <Field label="Delivery division">
                  <Select value={f.stateOfSupply} onChange={(e) => set('stateOfSupply', e.target.value)}>
                    <option value="">Select</option>
                    {BD_DIVISIONS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={type === 'PURCHASE' ? 'Supplier bill no.' : type.endsWith('RETURN') ? 'Original invoice no.' : 'Reference no.'}>
                <Input value={f.refNo} onChange={(e) => set('refNo', e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

        {/* Items */}
        <Card className="min-w-0">
          {!isExpense && !readOnly && settings.items.enableItemCode !== false && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
                <ScanBarcode className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="sr-only">Scan barcode</span>
                <input
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    // A scanner's Enter must not submit the form
                    e.preventDefault();
                    scanCode(scan);
                    setScan('');
                  }}
                  placeholder="Scan barcode or type an item code, then Enter"
                  className="h-8 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  autoComplete="off"
                />
              </label>
              {lastScan && (
                <span className="text-xs text-slate-500" role="status">
                  Added <b className="font-medium text-slate-700">{lastScan.name}</b> · qty {fmtQty(lastScan.qty)}
                </span>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5">#</th>
                  <th className="px-2 py-2.5">{isExpense ? 'Expense item' : 'Item'}</th>
                  <th className="w-24 px-2 py-2.5 text-right">Qty</th>
                  {!isExpense && <th className="w-28 px-2 py-2.5">Unit</th>}
                  {!isExpense && <th className="w-32 px-2 py-2.5 text-right">Cost / unit</th>}
                  <th className="w-36 px-2 py-2.5 text-right">Price / unit</th>
                  {showItemDiscount && <th className="w-40 px-2 py-2.5 text-center">Discount (% / amt)</th>}
                  {showItemTax && <th className="w-36 px-2 py-2.5">Tax</th>}
                  <th className="w-32 px-2 py-2.5 text-right">Amount</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {computed.map((l, idx) => {
                  const it = itemById(l.item);
                  const ownUnits = it ? [it.baseUnit, it.secondaryUnit].filter((u): u is NonNullable<typeof u> => !!u && typeof u === 'object') : [];
                  const otherUnits = allUnits.filter((u) => !ownUnits.some((o) => o._id === u._id));
                  const factor = it ? perBase(it, l.unit) : 1;
                  const baseQty = it ? l.qty / factor : 0;
                  const unitCost = it ? (it.purchasePrice || 0) / factor : 0;
                  const short = it && REDUCES_STOCK.includes(type) && it.type === 'product' && settings.items.enableStock !== false && baseQty > it.stock + (doc?.items.find((x) => idOf(x.item) === it._id)?.baseQty ?? 0);
                  return (
                    <tr key={l.key} className="align-top">
                      <td className="px-3 py-2.5 text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        {isExpense ? (
                          <Input value={l.name} onChange={(e) => updateLine(l.key, { name: e.target.value })} placeholder="e.g. Shop rent for June" />
                        ) : (
                          <Combobox
                            value={l.item}
                            onChange={(v) => {
                              const chosen = itemList.find((i) => i._id === v);
                              if (chosen) chooseItem(l.key, chosen);
                              else updateLine(l.key, { item: null });
                            }}
                            options={itemOptions}
                            placeholder={l.name || 'Search or add item'}
                            onCreate={can('items.create') ? (name) => setItemModal({ open: true, name, lineKey: l.key }) : undefined}
                            createLabel="Add new item"
                            disabled={readOnly}
                          />
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          {l.hsn && <span>HS {l.hsn}</span>}
                          {it && it.type === 'product' && settings.items.enableStock !== false && (
                            <span className={short ? 'font-medium text-rose-600' : ''}>
                              {short ? 'Not enough stock: ' : 'Stock: '}
                              {fmtQty(it.stock)} {it.baseUnit && typeof it.baseUnit === 'object' ? it.baseUnit.shortName : ''}
                            </span>
                          )}
                          {l.lastPrice !== undefined && (
                            <button type="button" className="text-blue-600 hover:underline" onClick={() => updateLine(l.key, { price: l.lastPrice!, priceTouched: true })}>
                              Last price {money(l.lastPrice)}
                            </button>
                          )}
                          {!l.showDescription && !readOnly && (
                            <button type="button" className="text-blue-600 hover:underline" onClick={() => updateLine(l.key, { showDescription: true })}>
                              + Description
                            </button>
                          )}
                        </div>
                        {l.showDescription && <Input className="mt-1 h-8 text-xs" value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value })} placeholder="Description / serial no. / batch" />}
                      </td>
                      <td className="px-2 py-1.5">
                        <NumberInput value={l.qty} min={0} onValueChange={(v) => changeQty(l, v)} />
                      </td>
                      {!isExpense && (
                        <td className="px-2 py-1.5">
                          {ownUnits.length + otherUnits.length > 0 ? (
                            <Select value={l.unit ?? ''} onChange={(e) => changeUnit(l, e.target.value)} className="px-2" disabled={readOnly}>
                              {!l.unit && <option value="">—</option>}
                              {ownUnits.length > 0 ? (
                                <>
                                  <optgroup label="This item">
                                    {ownUnits.map((u) => (
                                      <option key={u._id} value={u._id}>{u.shortName}</option>
                                    ))}
                                  </optgroup>
                                  {otherUnits.length > 0 && (
                                    <optgroup label="Other units">
                                      {otherUnits.map((u) => (
                                        <option key={u._id} value={u._id}>{u.shortName}</option>
                                      ))}
                                    </optgroup>
                                  )}
                                </>
                              ) : (
                                otherUnits.map((u) => (
                                  <option key={u._id} value={u._id}>{u.shortName}</option>
                                ))
                              )}
                            </Select>
                          ) : (
                            <span className="block py-2 text-xs text-slate-500">—</span>
                          )}
                          {it && factor !== 1 && it.baseUnit && typeof it.baseUnit === 'object' && (
                            <p className="mt-1 text-[11px] text-slate-400">= {fmtQty(round2(baseQty * 1000) / 1000)} {it.baseUnit.shortName}</p>
                          )}
                        </td>
                      )}
                      {!isExpense && (
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          {it ? (
                            <span className="block py-0.5 text-xs font-medium text-slate-600">{num(round2(unitCost))}</span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-2 py-1.5">
                        <NumberInput value={l.price} min={0} onValueChange={(v) => updateLine(l.key, { price: v, priceTouched: true })} />
                        {showItemTax && l.taxRate > 0 && (
                          <select
                            value={l.taxInclusive ? 'with' : 'without'}
                            onChange={(e) => updateLine(l.key, { taxInclusive: e.target.value === 'with' })}
                            className="mt-1 w-full cursor-pointer bg-transparent text-right text-[11px] text-slate-500 outline-none"
                          >
                            <option value="without">Without tax</option>
                            <option value="with">With tax</option>
                          </select>
                        )}
                      </td>
                      {showItemDiscount && (
                        <td className="px-2 py-1.5">
                          <div className="flex gap-1">
                            <NumberInput value={l.discountPercent} min={0} max={100} onValueChange={(v) => updateLine(l.key, { discountPercent: Math.min(100, v), discountAmount: 0 })} placeholder="%" className="w-16 px-2" />
                            <NumberInput
                              value={l.discountAmount}
                              min={0}
                              onValueChange={(v) => updateLine(l.key, { discountAmount: v, discountPercent: 0 })}
                              className="px-2"
                            />
                          </div>
                        </td>
                      )}
                      {showItemTax && (
                        <td className="px-2 py-1.5">
                          <Select value={String(l.taxRate)} onChange={(e) => updateLine(l.key, { taxRate: Number(e.target.value) })} className="px-2">
                            {taxRates.map((r) => (
                              <option key={r.rate} value={r.rate}>
                                {r.rate ? `${r.rate}%` : 'None'}
                              </option>
                            ))}
                            {!taxRates.some((r) => r.rate === l.taxRate) && <option value={l.taxRate}>{l.taxRate}%</option>}
                          </Select>
                          {l.taxAmount > 0 && <p className="mt-1 text-right text-[11px] text-slate-500">{num(l.taxAmount)}</p>}
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-right font-medium tabular-nums">{num(l.amount)}</td>
                      <td className="px-2 py-1.5">
                        {!readOnly && (
                          <button type="button" onClick={() => removeLine(l.key)} className="mt-1 rounded p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove row">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/60 text-sm">
                  <td colSpan={2} className="px-3 py-2">
                    {!readOnly && (
                      <Button type="button" variant="outline" size="sm" onClick={addLine}>
                        <Plus className="h-4 w-4" /> Add row
                      </Button>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-semibold text-slate-700 tabular-nums">
                    <span className="block text-[10px] font-normal text-slate-400">Total qty</span>
                    {fmtQty(valid.reduce((s, l) => s + l.qty, 0))}
                  </td>
                  {!isExpense && <td />}
                  {!isExpense && (
                    <td className="px-2 py-2 text-right text-sm font-semibold text-slate-700 tabular-nums">
                      <span className="block text-[10px] font-normal text-slate-400">Total cost</span>
                      {num(
                        round2(
                          valid.reduce((s, l) => {
                            const it = itemById(l.item);
                            return it ? s + ((it.purchasePrice || 0) / perBase(it, l.unit)) * l.qty : s;
                          }, 0),
                        ),
                      )}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right text-sm font-semibold text-slate-700 tabular-nums">
                    <span className="block text-[10px] font-normal text-slate-400">Total price</span>
                    {num(round2(valid.reduce((s, l) => s + l.price * l.qty, 0)))}
                  </td>
                  {showItemDiscount && (
                    <td className="px-2 py-2 text-right text-sm font-semibold text-slate-700 tabular-nums">
                      <span className="block text-[10px] font-normal text-slate-400">Total discount</span>
                      {num(totals.itemDiscount)}
                    </td>
                  )}
                  {showItemTax && (
                    <td className="px-2 py-2 text-right text-sm font-semibold text-slate-700 tabular-nums">
                      <span className="block text-[10px] font-normal text-slate-400">Total tax</span>
                      {num(totals.taxTotal)}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    <span className="block text-[10px] font-normal text-slate-400">Total amount</span>
                    {num(totals.subtotal)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Notes and totals */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="space-y-4 p-5">
            <Field label="Description / notes">
              <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Shown on the printed document" />
            </Field>
            {!isExpense && (
              <Field label="Terms & conditions" hint={!f.terms && settings.print.termsAndConditions ? 'Empty uses the default terms from Settings.' : undefined}>
                <Textarea value={f.terms} onChange={(e) => set('terms', e.target.value)} rows={2} placeholder={settings.print.termsAndConditions || 'Terms printed on this document'} />
              </Field>
            )}
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Attachments (images / PDF)</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {DOC_FILE_KINDS.map(({ key, label }) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <p className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600 uppercase">
                      {label}
                      {f.docFiles[key].length > 0 && <span className="rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-700">{f.docFiles[key].length}</span>}
                    </p>
                    <FileUpload
                      stacked
                      value={f.docFiles[key]}
                      onChange={(v) => set('docFiles', { ...f.docFiles, [key]: v })}
                      context="transaction"
                      label={`Attach ${label}`}
                      max={20}
                      disabled={readOnly}
                    />
                  </div>
                ))}
              </div>
              {f.attachments.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-semibold text-slate-500 uppercase">Other files</p>
                  <FileUpload value={f.attachments} onChange={(v) => set('attachments', v)} context="transaction" disabled={readOnly} />
                </div>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <div className="space-y-2.5 text-sm">
              {amountOnlyMode ? (
                <Field label="Total amount" required hint="Or itemise the expense in the table above">
                  <NumberInput value={f.amountOnly} min={0} onValueChange={(v) => set('amountOnly', v)} className="h-11 text-lg font-semibold" />
                </Field>
              ) : (
                <>
                  {(totals.itemDiscount > 0 || totals.taxTotal > 0) && (
                    <>
                      <div className="flex justify-between text-slate-500">
                        <span>Total price</span>
                        <span className="tabular-nums">{money(round2(valid.reduce((s, l) => s + l.price * l.qty, 0)))}</span>
                      </div>
                      {totals.itemDiscount > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Item discount</span>
                          <span className="tabular-nums">− {money(totals.itemDiscount)}</span>
                        </div>
                      )}
                      {(() => {
                        const added = round2(valid.reduce((s, l) => s + (l.taxInclusive ? 0 : l.taxAmount), 0));
                        const included = round2(totals.taxTotal - added);
                        return (
                          <>
                            {added > 0 && (
                              <div className="flex justify-between text-slate-500">
                                <span>Tax</span>
                                <span className="tabular-nums">+ {money(added)}</span>
                              </div>
                            )}
                            {included > 0 && (
                              <div className="flex justify-between text-xs text-slate-400">
                                <span>Tax included in price</span>
                                <span className="tabular-nums">{money(included)}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                  <div className="flex justify-between font-medium text-slate-700">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{money(totals.subtotal)}</span>
                  </div>
                  {ts?.billDiscount !== false && (
                    <div className="flex items-center justify-between gap-3 text-slate-600">
                      <span>Discount</span>
                      <span className="flex items-center gap-1">
                        <NumberInput value={f.discountPercent} min={0} max={100} onValueChange={(v) => setF((x) => ({ ...x, discountPercent: Math.min(100, v), discountAmount: 0 }))} className="h-8 w-16 px-2" />
                        <span className="text-xs">%</span>
                        <NumberInput value={f.discountPercent ? totals.discountAmount : f.discountAmount} min={0} onValueChange={(v) => setF((x) => ({ ...x, discountAmount: v, discountPercent: 0 }))} className="h-8 w-28 px-2" />
                      </span>
                    </div>
                  )}
                  {ts?.additionalCharges !== false && (
                    <div className="space-y-1.5">
                      {f.charges.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Input value={c.label} onChange={(e) => set('charges', f.charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Charge (e.g. Freight)" className="h-8" />
                          <NumberInput value={c.amount} onValueChange={(v) => set('charges', f.charges.map((x, j) => (j === i ? { ...x, amount: v } : x)))} className="h-8 w-28 px-2" />
                          <button type="button" onClick={() => set('charges', f.charges.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:text-rose-600" aria-label="Remove charge">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {!readOnly && f.charges.length < 5 && (
                        <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={() => set('charges', [...f.charges, { label: '', amount: 0 }])}>
                          + Add charges (freight, packing…)
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-slate-600">
                    <Checkbox checked={f.roundOff} onChange={(v) => set('roundOff', v)} label="Round off" disabled={readOnly} />
                    <span className="tabular-nums">{num(totals.roundOff)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="text-xl font-bold text-slate-900">{money(total)}</span>
              </div>
              {showProfit && (
                <div className="flex items-center justify-between text-xs" title="Sale value before tax, minus the purchase price of the items. Only shown here, never printed.">
                  <span className="text-slate-500">Estimated profit</span>
                  <span className={cn('font-semibold tabular-nums', profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{money(profit)}</span>
                </div>
              )}
              {m.settles && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <Checkbox
                      checked={f.cash || f.fullSettle}
                      onChange={(v) => setF((x) => ({ ...x, fullSettle: v, settled: v ? x.settled : 0 }))}
                      label={m.settledLabel || 'Settled'}
                      disabled={readOnly || f.cash || chequeCleared}
                    />
                    <NumberInput
                      value={settled}
                      min={0}
                      disabled={f.cash || f.fullSettle || chequeCleared}
                      onValueChange={(v) => setF((x) => ({ ...x, settled: v, fullSettle: false }))}
                      className="h-9 w-40"
                    />
                  </div>
                  {viaPayments > 0 && (
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Paid via linked payments</span>
                      <span className="tabular-nums">{money(viaPayments)}</span>
                    </div>
                  )}
                  {settled > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Payment type">
                        <Select value={paymentAccount} onChange={(e) => set('paymentAccount', e.target.value)} disabled={chequeCleared}>
                          {(accounts.data ?? []).map((a) => (
                            <option key={a._id} value={a._id}>
                              {a.name}
                            </option>
                          ))}
                          <option value={CHEQUE}>Cheque</option>
                        </Select>
                      </Field>
                      <Field label={paymentAccount === CHEQUE ? 'Cheque no.' : 'Reference'}>
                        <Input value={f.paymentRef} onChange={(e) => set('paymentRef', e.target.value)} placeholder={paymentAccount === CHEQUE ? 'e.g. 004512' : 'UTR / transaction id'} />
                      </Field>
                    </div>
                  )}
                  {settled > 0 && paymentAccount === CHEQUE && <ChequeNote cheque={doc?.cheque} incoming={MONEY_IN.includes(type)} />}
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-medium text-slate-700">Balance due</span>
                    <span className={cn('text-lg font-semibold tabular-nums', balance > 0 ? 'text-rose-600' : 'text-emerald-600')}>{money(balance)}</span>
                  </div>
                </>
              )}
              {creditWarn && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> This invoice takes {selectedParty?.name} over their credit limit of {money(selectedParty?.creditLimit)}.
                </p>
              )}
            </div>
          </Card>
        </div>
      </fieldset>

      {/* Sticky action bar */}
      {!readOnly && (
        <div className="fixed right-0 bottom-0 left-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-end gap-2 px-3 py-3 sm:px-5">
            {error && <p className="mr-auto max-w-xl text-sm text-rose-600">{error}</p>}
            <span className="mr-2 hidden text-xs text-slate-400 md:inline">Ctrl + S to save</span>
            <Button variant="outline" onClick={() => router.push(href(m.route))}>
              Cancel
            </Button>
            {!id && (
              <Button variant="outline" onClick={() => submit('new')} loading={save.isPending && save.variables === 'new'}>
                Save & New
              </Button>
            )}
            <Button variant="outline" onClick={() => submit('print')} loading={save.isPending && save.variables === 'print'}>
              Save & Print
            </Button>
            <Button onClick={() => submit('save')} loading={save.isPending && save.variables === 'save'}>
              {id ? 'Update' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      <PartyModal
        open={partyModal.open}
        initialName={partyModal.name}
        defaultType={side === 'purchase' ? 'supplier' : 'customer'}
        onOpenChange={(o) => setPartyModal((p) => ({ ...p, open: o }))}
        onSaved={(p) => applyParty(p._id, p)}
      />
      <ItemModal
        open={itemModal.open}
        initialName={itemModal.name}
        onOpenChange={(o) => setItemModal((p) => ({ ...p, open: o }))}
        onSaved={(it) => {
          if (itemModal.lineKey) chooseItem(itemModal.lineKey, it);
        }}
      />
      <ExpenseCategoryModal open={catModal.open} initialName={catModal.name} onOpenChange={(o) => setCatModal((c) => ({ ...c, open: o }))} onSaved={(cat) => set('expenseCategory', cat._id)} />
    </div>
  );
}
