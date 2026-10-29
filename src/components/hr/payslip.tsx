'use client';
/* eslint-disable @next/next/no-img-element -- print sheets render uploaded logos as plain images so the PDF snapshot can capture them */
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import { api, errorMessage, fileUrl } from '@/lib/api';
import type { Company } from '@/lib/types';
import { amountInWords, fmtDate, money, plural } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NoAccess, PageLoader } from '@/components/ui/misc';
import { tint } from '@/components/print/blocks';
import { PAPER } from '@/components/print/registry';
import { saveBlob, sheetToPdf, waitForAssets } from '@/components/print/pdf';
import { monthLabel, type PayrollRow } from './shared';

interface PayslipData extends Omit<PayrollRow, 'employee' | 'paymentAccount'> {
  employee: {
    _id: string;
    name: string;
    code?: string;
    designation?: string;
    department?: string;
    joinDate?: string;
    phone?: string;
    email?: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    salaryType?: 'monthly' | 'daily';
    salary?: number;
  } | null;
  paymentAccount?: { _id: string; name: string; kind?: string } | null;
}

const mask = (acct?: string) => (acct && acct.length > 4 ? `${'•'.repeat(Math.min(8, acct.length - 4))}${acct.slice(-4)}` : (acct ?? ''));

/** A4 salary slip used for print and PDF. Plain hex colours only so the PDF snapshot matches the screen. */
function PayslipSheet({ p, company, theme, logo, signature }: { p: PayslipData; company: Company; theme: string; logo?: string; signature?: string }) {
  const e = p.employee;
  const gross = p.earned + p.allowances + p.bonus;
  const totalDeductions = p.deductions + p.advanceDeduction;
  const address = [company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ');
  const rowCls = 'flex justify-between gap-4 border-b border-gray-100 px-4 py-2 text-[13px]';
  const info: [string, string | undefined][] = [
    ['Employee name', e?.name],
    ['Employee code', e?.code],
    ['Designation', e?.designation],
    ['Department', e?.department],
    ['Date of joining', fmtDate(e?.joinDate)],
    ['Salary basis', e?.salaryType === 'daily' ? `Daily wage ${money(p.basic)}` : `Monthly ${money(p.basic)}`],
  ];
  const bank: [string, string | undefined][] = [
    ['Bank', e?.bankName],
    ['Account number', mask(e?.accountNumber)],
    ['Routing No.', e?.ifsc],
    ['Paid from', p.paymentAccount?.name],
    ['Paid on', p.paidOn ? fmtDate(p.paidOn) : 'Not paid yet'],
  ];

  return (
    <div className="flex flex-1 flex-col p-10 text-gray-900">
      <header className="flex items-start justify-between gap-6 border-b-2 pb-5" style={{ borderColor: theme }}>
        <div className="flex items-start gap-4">
          {logo && <img src={logo} alt="" crossOrigin="anonymous" className="h-16 w-16 object-contain" />}
          <div>
            <p className="text-xl font-bold" style={{ color: theme }}>
              {company.name}
            </p>
            {address && <p className="mt-0.5 max-w-sm text-xs text-gray-600">{address}</p>}
            <p className="text-xs text-gray-600">{[company.phone && `Phone: ${company.phone}`, company.email && `Email: ${company.email}`].filter(Boolean).join(' · ')}</p>
            {company.gstin && <p className="text-xs text-gray-600">BIN: {company.gstin}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tracking-wide uppercase" style={{ color: theme }}>
            Salary Slip
          </p>
          <p className="text-sm text-gray-600">{monthLabel(p.month)}</p>
          {p.status !== 'paid' && <p className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">DRAFT · NOT PAID</p>}
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-6">
        {[info, bank].map((list, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-gray-200">
            <p className="px-4 py-2 text-[11px] font-semibold tracking-wide uppercase" style={{ background: tint(theme, 0.1), color: theme }}>
              {i === 0 ? 'Employee details' : 'Payment details'}
            </p>
            {list.map(([k, v]) => (
              <div key={k} className={rowCls}>
                <span className="text-gray-500">{k}</span>
                <span className="text-right font-medium">{v || '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-gray-200">
        <p className="px-4 py-2 text-[11px] font-semibold tracking-wide uppercase" style={{ background: tint(theme, 0.1), color: theme }}>
          Attendance
        </p>
        <div className="grid grid-cols-6 divide-x divide-gray-100 text-center">
          {[
            ['Working days', p.workingDays],
            ['Present', p.presentDays],
            ['Half days', p.halfDays],
            ['Leave', p.leaveDays],
            ['Absent', p.absentDays],
            ['Payable days', p.payableDays],
          ].map(([k, v]) => (
            <div key={k} className="px-2 py-3">
              <p className="text-lg font-semibold">{v ?? 0}</p>
              <p className="text-[11px] text-gray-500">{k}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-6">
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <p className="flex justify-between px-4 py-2 text-[11px] font-semibold tracking-wide uppercase" style={{ background: tint(theme, 0.1), color: theme }}>
            <span>Earnings</span>
            <span>Amount</span>
          </p>
          <div className={rowCls}>
            <span>{e?.salaryType === 'daily' ? `Wages (${plural(p.payableDays, 'day')})` : 'Basic salary (earned)'}</span>
            <span className="tabular-nums">{money(p.earned)}</span>
          </div>
          <div className={rowCls}>
            <span>Allowances</span>
            <span className="tabular-nums">{money(p.allowances)}</span>
          </div>
          <div className={rowCls}>
            <span>Bonus / incentive</span>
            <span className="tabular-nums">{money(p.bonus)}</span>
          </div>
          <div className="flex justify-between px-4 py-2.5 text-[13px] font-semibold">
            <span>Gross earnings</span>
            <span className="tabular-nums">{money(gross)}</span>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <p className="flex justify-between px-4 py-2 text-[11px] font-semibold tracking-wide uppercase" style={{ background: tint(theme, 0.1), color: theme }}>
            <span>Deductions</span>
            <span>Amount</span>
          </p>
          <div className={rowCls}>
            <span>Deductions (PF, ESI, others)</span>
            <span className="tabular-nums">{money(p.deductions)}</span>
          </div>
          <div className={rowCls}>
            <span>Salary advance recovery</span>
            <span className="tabular-nums">{money(p.advanceDeduction)}</span>
          </div>
          <div className={rowCls}>
            <span className="text-gray-400">—</span>
            <span />
          </div>
          <div className="flex justify-between px-4 py-2.5 text-[13px] font-semibold">
            <span>Total deductions</span>
            <span className="tabular-nums">{money(totalDeductions)}</span>
          </div>
        </div>
      </section>

      <section className="mt-6 flex items-center justify-between gap-6 rounded-lg px-5 py-4" style={{ background: tint(theme, 0.1) }}>
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-gray-600 uppercase">Net pay</p>
          <p className="mt-0.5 text-sm text-gray-700">{amountInWords(p.net)}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums" style={{ color: theme }}>
          {money(p.net)}
        </p>
      </section>

      {p.note && (
        <p className="mt-4 text-xs text-gray-600">
          <span className="font-semibold text-gray-700">Note: </span>
          {p.note}
        </p>
      )}

      <div className="mt-auto flex items-end justify-between pt-16 text-xs text-gray-600">
        <div className="text-center">
          <div className="h-12" />
          <p className="w-48 border-t border-gray-300 pt-1.5">Employee signature</p>
        </div>
        <div className="text-center">
          {signature ? <img src={signature} alt="" crossOrigin="anonymous" className="mx-auto h-12 object-contain" /> : <div className="h-12" />}
          <p className="w-48 border-t border-gray-300 pt-1.5">For {company.name}</p>
        </div>
      </div>
      <p className="mt-6 text-center text-[10px] text-gray-400">This is a computer-generated salary slip.</p>
    </div>
  );
}

/** Full-screen salary slip preview with print and PDF download. */
export function PayslipPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cid, href, company, settings } = useCompany();
  const q = useQuery({ queryKey: [cid, 'hr', 'payslip', id], queryFn: async () => (await api.get<PayslipData>(`/hr/payroll/${id}`)).data, retry: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const paper = PAPER.A4;

  useLayoutEffect(() => {
    const el = containerRef.current;
    const sheet = sheetRef.current;
    if (!el || !sheet) return;
    const measure = () => {
      setScale(capturing ? 1 : Math.min(1, (el.clientWidth - 24) / paper.widthPx));
      setHeight(sheet.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [paper.widthPx, capturing, q.data]);

  const p = q.data;
  useEffect(() => {
    if (p?.employee && company) document.title = `Salary slip ${monthLabel(p.month)} · ${p.employee.name}`;
  }, [p, company]);

  const fileName = p ? `Salary-slip-${p.month}-${(p.employee?.name ?? 'employee').replace(/\s+/g, '-')}.pdf` : 'salary-slip.pdf';
  const download = useCallback(async () => {
    if (!sheetRef.current) return;
    setBusy(true);
    setCapturing(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      saveBlob(await sheetToPdf(sheetRef.current, 'A4'), fileName);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCapturing(false);
      setBusy(false);
    }
  }, [fileName]);
  const print = useCallback(async () => {
    if (sheetRef.current) await waitForAssets(sheetRef.current);
    window.print();
  }, []);

  if (q.isLoading || !settings) return <PageLoader label="Preparing salary slip…" />;
  if (!p || !company) return <div className="p-6"><NoAccess what="this salary slip" /></div>;

  const theme = settings.print.themeColor || '#2563eb';
  const pageCss = `
    @media print {
      @page { size: A4; margin: 6mm 0; }
      html, body { background: #fff !important; }
      .print-scale { width: auto !important; height: auto !important; }
      .print-sheet { transform: none !important; box-shadow: none !important; min-height: 0 !important; }
      .print-main { padding: 0 !important; overflow: visible !important; }
    }`;

  return (
    <div className="min-h-screen bg-slate-100">
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />
      <header className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5">
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push(href('/hr/payroll')))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-slate-900">Salary slip · {p.employee?.name}</h1>
            <Badge tone={p.status === 'paid' ? 'green' : 'amber'}>{p.status === 'paid' ? 'Paid' : 'Draft'}</Badge>
          </div>
          <p className="truncate text-xs text-slate-500">
            {monthLabel(p.month)} · Net pay {money(p.net)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={download} loading={busy}>
          {!busy && <Download className="h-4 w-4" />} PDF
        </Button>
        <Button size="sm" onClick={print}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </header>
      <main ref={containerRef} className="print-main overflow-x-hidden p-3 sm:p-6 lg:p-8">
        <div className="print-scale mx-auto" style={{ width: paper.widthPx * scale, height: height ? height * scale : undefined }}>
          <div
            ref={sheetRef}
            className="print-sheet flex flex-col bg-white shadow-[0_8px_30px_rgb(15_23_42/0.12)]"
            style={{ width: paper.widthPx, minHeight: paper.minHeightPx, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
          >
            <PayslipSheet
              p={p}
              company={company}
              theme={theme}
              logo={settings.print.showLogo && company.logo ? fileUrl(company.logo) : undefined}
              signature={settings.print.showSignature && company.signature ? fileUrl(company.signature) : undefined}
            />
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
  );
}
