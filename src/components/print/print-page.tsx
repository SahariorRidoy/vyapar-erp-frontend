'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Download, Loader2, Mail, MessageCircle, Palette, Printer, Save, Share2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Txn } from '@/lib/types';
import { TXN, txnHref } from '@/lib/txn';
import { cn, fmtDate, money } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Select, Switch } from '@/components/ui/input';
import { NoAccess, PageLoader } from '@/components/ui/misc';
import { LoadError } from '@/components/ui/fallback';
import { StatusBadge } from '@/components/ui/badge';
import { buildPrintDoc } from './model';
import { PAPER, defaultTemplate, templatesFor, type TemplateDef } from './registry';
import { saveBlob, sheetToPdf, waitForAssets } from './pdf';
import { EmailDocumentModal } from './email-modal';

const SWATCHES = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#0f172a', '#4d7c0f', '#0369a1'];

/** Full-screen print preview with template picker, PDF, email and share. */
export function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { cid, href, can, company, settings } = useCompany();
  const asChallan = search.get('as') === 'challan';

  const q = useQuery({ queryKey: [cid, 'transactions', 'detail', id], queryFn: async () => (await api.get<Txn>(`/transactions/${id}`)).data });
  const txn = q.data;
  const m = txn ? TXN[txn.type] : null;
  const kind: 'document' | 'receipt' = m?.isPayment ? 'receipt' : 'document';

  const [templateKey, setTemplateKey] = useState<string | null>(search.get('t'));
  const [theme, setTheme] = useState<string | null>(null);
  const [showPrices, setShowPrices] = useState(true);

  const [emailOpen, setEmailOpen] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'share' | null>(null);
  const [scale, setScale] = useState(1);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const template: TemplateDef | null = useMemo(() => {
    if (!txn || !settings) return null;
    const list = templatesFor(kind);
    return list.find((t) => t.key === templateKey) ?? defaultTemplate(txn.type, kind, settings.print);
  }, [txn, settings, kind, templateKey]);
  const paper = PAPER[template?.paper ?? 'A4'];

  const doc = useMemo(() => (txn && company && settings ? buildPrintDoc(txn, company, settings, { asChallan, showPrices, theme: theme ?? undefined }) : null), [txn, company, settings, asChallan, showPrices, theme]);

  // Fit the sheet into narrow screens without changing its real size (print/PDF use 100%).
  useLayoutEffect(() => {
    const el = containerRef.current;
    const sheet = sheetRef.current;
    if (!el || !sheet) return;
    const measure = () => {
      const avail = el.clientWidth - 24;
      setScale(capturing ? 1 : Math.min(1, avail / paper.widthPx));
      setSheetHeight(sheet.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [paper.widthPx, capturing, doc, template]);

  useEffect(() => {
    if (txn && company) document.title = `${txn.number} · ${company.name}`;
  }, [txn, company]);

  const fileName = txn ? `${(asChallan ? 'Challan' : TXN[txn.type].label).replace(/\s+/g, '-')}-${txn.number}.pdf` : 'document.pdf';

  const makePdf = useCallback(async () => {
    if (!sheetRef.current || !template) throw new Error('Nothing to export');
    setCapturing(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      return await sheetToPdf(sheetRef.current, template.paper);
    } finally {
      setCapturing(false);
    }
  }, [template]);

  const downloadPdf = useCallback(async () => {
    setBusy('pdf');
    try {
      saveBlob(await makePdf(), fileName);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [makePdf, fileName]);

  const print = useCallback(async () => {
    if (sheetRef.current) await waitForAssets(sheetRef.current);
    window.print();
  }, []);

  const shareText = useMemo(() => {
    if (!txn || !company) return '';
    const lines = [
      `${asChallan ? 'Delivery Challan' : (doc?.title ?? '')} ${txn.number} from ${company.name}`,
      `Date: ${fmtDate(txn.date)}`,
      m?.settles && !m.isPayment ? `Amount: ${money(txn.total)} · Balance: ${money(txn.balance)}` : `Amount: ${money(txn.total)}`,
      settings?.print.upiId && txn.type === 'SALE' && txn.balance > 0 ? `Pay by bKash / Nagad: ${settings.print.upiId}` : '',
      `Thank you!`,
    ];
    return lines.filter(Boolean).join('\n');
  }, [txn, company, doc, asChallan, m, settings]);

  const whatsapp = () => {
    const digits = (txn?.phone || (typeof txn?.party === 'object' && txn?.party?.phone) || '').replace(/\D/g, '');
    // Local Bangladeshi mobile numbers (01XXXXXXXXX) need the 880 country code for WhatsApp
    const phone = digits.length === 11 && digits.startsWith('01') ? `880${digits.slice(1)}` : digits;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(shareText)}`, '_blank', 'noopener');
  };

  const nativeShare = async () => {
    setBusy('share');
    try {
      const blob = await makePdf();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: fileName, text: shareText });
      else {
        saveBlob(blob, fileName);
        toast.info('PDF downloaded. Attach it in WhatsApp or email.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // ?autoprint=1, ?pdf=1, ?email=1 run once the sheet and its images are ready
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || !doc || !sheetRef.current) return;
    autoDone.current = true;
    const auto = search.get('autoprint') === '1' ? 'print' : search.get('pdf') === '1' ? 'pdf' : search.get('email') === '1' ? 'email' : null;
    if (!auto) return;
    const t = setTimeout(() => {
      if (auto === 'print') void print();
      else if (auto === 'pdf') void downloadPdf();
      else setEmailOpen(true);
    }, 400);
    return () => clearTimeout(t);
  }, [doc, search, print, downloadPdf]);

  const saveDefault = useMutation({
    mutationFn: async () => {
      if (!txn || !template) return;
      await api.put('/settings/section/print', { templates: { ...(settings?.print.templates ?? {}), [txn.type]: template.key }, ...(theme ? { themeColor: theme } : {}) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [cid, 'settings'] });
      toast.success(`Saved as the default for ${m?.plural ?? 'this document'}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading || !settings) return <PageLoader label="Preparing document…" />;
  if (q.isError) return <LoadError error={q.error} what="this document" home={href('/dashboard')} homeLabel="Go to dashboard" onRetry={() => q.refetch()} />;
  if (!txn || !doc || !template || !m) return <div className="p-6"><NoAccess what="this document" /></div>;
  if (!can(`${m.perm}.view`)) return <div className="p-6"><NoAccess what={m.plural} /></div>;

  const Tpl = template.Component;
  const list = templatesFor(kind);
  const pageCss = `
    @media print {
      @page { size: ${template.paper === '80mm' ? `80mm ${Math.max(60, Math.ceil(sheetHeight * 0.2646) + 4)}mm` : template.paper}; margin: ${template.paper === '80mm' ? '0' : '6mm 0'}; }
      html, body { background: #fff !important; }
      .print-scale { width: auto !important; height: auto !important; }
      .print-sheet { transform: none !important; box-shadow: none !important; min-height: 0 !important; }
      .print-main { padding: 0 !important; overflow: visible !important; }
    }`;

  const options = (
    <>
      {(asChallan || txn.type === 'DELIVERY_CHALLAN') && (
        <Switch checked={showPrices} onCheckedChange={setShowPrices} label="Show prices" description="Print rates and amounts on the challan" />
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />
      <header className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push(href(txnHref(txn.type, txn._id))))}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {asChallan ? 'Delivery Challan' : m.label} {txn.number}
            </h1>
            <StatusBadge txn={txn} />
          </div>
          <p className="truncate text-xs text-slate-500">
            {doc.buyer.name || '—'} · {money(txn.total)} · {template.name}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={whatsapp} title="Send on WhatsApp">
          <MessageCircle className="h-4 w-4 text-emerald-600" /> <span className="hidden sm:inline">WhatsApp</span>
        </Button>
        <Button variant="outline" size="sm" onClick={nativeShare} loading={busy === 'share'} title="Share PDF">
          {busy !== 'share' && <Share2 className="h-4 w-4" />} <span className="hidden sm:inline">Share</span>
        </Button>
        {can('email.use') && (
          <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>
            <Mail className="h-4 w-4" /> <span className="hidden sm:inline">Email</span>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={downloadPdf} loading={busy === 'pdf'}>
          {busy !== 'pdf' && <Download className="h-4 w-4" />} PDF
        </Button>
        <Button size="sm" onClick={print}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </header>

      <div className="flex">
        <aside className="no-print sticky top-[57px] hidden h-[calc(100vh-57px)] w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 lg:block">
          <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{kind === 'receipt' ? 'Receipt format' : 'Template'}</p>
          <div className="space-y-1.5">
            {list.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTemplateKey(t.key)}
                className={cn(
                  'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                  template.key === t.key ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{t.name}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{t.paper}</span>
                    {template.key === t.key && <Check className="h-4 w-4 text-blue-600" />}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{t.description}</span>
              </button>
            ))}
          </div>
          <p className="mt-5 mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <Palette className="h-3.5 w-3.5" /> Colour
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTheme(c)}
                className={cn('h-7 w-7 rounded-full ring-offset-2', (theme ?? doc.theme) === c && 'ring-2 ring-slate-900')}
                style={{ background: c }}
                aria-label={`Use colour ${c}`}
              />
            ))}
            <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-slate-400" title="Custom colour">
              <input type="color" value={theme ?? doc.theme} onChange={(e) => setTheme(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              <span className="flex h-full items-center justify-center text-xs text-slate-500">+</span>
            </label>
          </div>
          <div className="mt-5 space-y-3">{options}</div>
          {can('settings.manage') && (
            <Button variant="outline" className="mt-5 w-full" onClick={() => saveDefault.mutate()} loading={saveDefault.isPending}>
              {!saveDefault.isPending && <Save className="h-4 w-4" />} Use as default for {m.plural}
            </Button>
          )}
          <p className="mt-3 text-xs text-slate-500">Logo, signature, bank details, bKash / Nagad number and terms come from Settings ▸ Print.</p>
        </aside>

        <main ref={containerRef} className="print-main min-w-0 flex-1 overflow-x-hidden p-3 sm:p-6 lg:p-8">
          <div className="no-print mb-3 grid grid-cols-2 gap-2 lg:hidden">
            <Select value={template.key} onChange={(e) => setTemplateKey(e.target.value)} aria-label="Template">
              {list.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {SWATCHES.slice(0, 6).map((c) => (
                <button key={c} type="button" onClick={() => setTheme(c)} className={cn('h-6 w-6 shrink-0 rounded-full ring-offset-1', (theme ?? doc.theme) === c && 'ring-2 ring-slate-900')} style={{ background: c }} aria-label={`Use colour ${c}`} />
              ))}
            </div>
            <div className="col-span-2">{options}</div>
          </div>
          <div className="print-scale mx-auto" style={{ width: paper.widthPx * scale, height: sheetHeight ? sheetHeight * scale : undefined }}>
            <div
              ref={sheetRef}
              className="print-sheet flex flex-col bg-white text-gray-900 shadow-[0_8px_30px_rgb(15_23_42/0.12)]"
              style={{ width: paper.widthPx, minHeight: paper.minHeightPx, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
            >
              <Tpl doc={doc} />
            </div>
          </div>
          {capturing && (
            <div className="no-print fixed inset-0 z-30 flex items-center justify-center bg-white/60">
              <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Creating PDF…
              </span>
            </div>
          )}
        </main>
      </div>

      <EmailDocumentModal open={emailOpen} onOpenChange={setEmailOpen} txn={txn} title={asChallan ? 'Delivery Challan' : doc.title} fileName={fileName} makePdf={makePdf} />
    </div>
  );
}
