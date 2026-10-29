/* eslint-disable @next/next/no-img-element -- print sheets render uploaded logos as plain images so the PDF snapshot can capture them */
import type { CSSProperties, ReactNode } from 'react';
import { cn, fmtDate, money, num, qty } from '@/lib/utils';
import type { PrintDoc } from './model';

/** Mixes a hex colour with white (amount 0..1 of the colour kept) – plain hex so PDF snapshots render it. */
export function tint(hex: string, keep: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
  const mix = (c: number) => Math.round(c * keep + 255 * (1 - keep)).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

/** Readable text colour on top of the theme colour. */
export function onColor(hex: string) {
  const h = hex.replace('#', '').padEnd(6, '0');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#111827' : '#ffffff';
}

export function Lines({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  return (
    <div className={className}>
      {text.split('\n').map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

export function Logo({ doc, className }: { doc: PrintDoc; className?: string }) {
  if (!doc.show.logo || !doc.seller.logo) return null;
  return <img src={doc.seller.logo} alt="" crossOrigin="anonymous" className={cn('object-contain', className)} />;
}

export function SellerContact({ doc, className, inline }: { doc: PrintDoc; className?: string; inline?: boolean }) {
  const s = doc.seller;
  const contact = [s.phone && `Phone: ${s.phone}`, s.email && `Email: ${s.email}`].filter(Boolean);
  return (
    <div className={className}>
      <Lines text={s.address} />
      {inline ? <div>{contact.join('  |  ')}</div> : contact.map((c) => <div key={c}>{c}</div>)}
      {s.gstin && <div>BIN: <b>{s.gstin}</b></div>}
    </div>
  );
}

export function PartyBlock({ doc, label, className, labelClass, labelStyle }: { doc: PrintDoc; label?: string; className?: string; labelClass?: string; labelStyle?: CSSProperties }) {
  const b = doc.buyer;
  if (!b.name && !b.address) return null;
  return (
    <div className={className}>
      <div className={cn('mb-1 text-[10px] font-semibold tracking-wider uppercase', labelClass)} style={labelStyle}>
        {label ?? doc.partyLabel}
      </div>
      <div className="text-[13px] font-semibold">{b.name}</div>
      <Lines text={b.address} />
      {b.phone && <div>Phone: {b.phone}</div>}
      {b.email && <div>Email: {b.email}</div>}
      {b.gstin && <div>BIN: {b.gstin}</div>}
    </div>
  );
}

export function ShipBlock({ doc, className, labelClass, labelStyle }: { doc: PrintDoc; className?: string; labelClass?: string; labelStyle?: CSSProperties }) {
  if (!doc.shipTo) return null;
  return (
    <div className={className}>
      <div className={cn('mb-1 text-[10px] font-semibold tracking-wider uppercase', labelClass)} style={labelStyle}>
        Ship To
      </div>
      <Lines text={doc.shipTo} />
    </div>
  );
}

/** Number, dates and references as label/value rows. */
export function metaRows(doc: PrintDoc): [string, string][] {
  const rows: [string, string][] = [
    [doc.numberLabel, doc.number],
    ['Date', fmtDate(doc.date)],
  ];
  if (doc.dueDate) rows.push([doc.type === 'SALE_ORDER' || doc.type === 'PURCHASE_ORDER' ? 'Delivery Date' : 'Due Date', fmtDate(doc.dueDate)]);
  if (doc.refNo) rows.push([doc.refLabel, doc.refNo]);
  if (doc.deliveryDivision && doc.kind === 'document') rows.push(['Delivery Division', doc.deliveryDivision]);
  if (doc.category) rows.push(['Category', doc.category]);
  return rows;
}

/** Meta rows a template has not already shown in its header (number, date, due date). */
export function extraMetaRows(doc: PrintDoc) {
  return metaRows(doc).filter(([k]) => k !== doc.numberLabel && k !== 'Date' && k !== 'Due Date' && k !== 'Delivery Date');
}

export function MetaList({ doc, className, labelClass }: { doc: PrintDoc; className?: string; labelClass?: string }) {
  return (
    <table className={className}>
      <tbody>
        {metaRows(doc).map(([k, v]) => (
          <tr key={k}>
            <td className={cn('py-0.5 pr-3 align-top whitespace-nowrap', labelClass ?? 'text-gray-500')}>{k}</td>
            <td className="py-0.5 text-right font-semibold">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type TableVariant = 'boxed' | 'band' | 'hairline' | 'gst' | 'compact';

/** The item table every document template shares; the variant only changes the look. */
export function ItemsTable({ doc, variant, theme }: { doc: PrintDoc; variant: TableVariant; theme?: string }) {
  const { show } = doc;
  const gst = variant === 'gst';
  const head: { key: string; label: string; right?: boolean; w?: string }[] = [
    { key: 'sn', label: '#', w: 'w-7' },
    { key: 'name', label: 'Item name' },
  ];
  if (show.hsn) head.push({ key: 'hsn', label: 'HS Code' });
  head.push({ key: 'qty', label: 'Quantity', right: true });
  if (show.prices) {
    head.push({ key: 'price', label: gst ? 'Rate' : 'Price/Unit', right: true });
    if (show.discount) head.push({ key: 'disc', label: 'Discount', right: true });
    if (gst && show.tax) head.push({ key: 'taxable', label: 'Taxable Value', right: true });
    if (show.tax) head.push({ key: 'tax', label: 'VAT', right: true });
    head.push({ key: 'amount', label: 'Amount', right: true });
  }

  const cell = (key: string, l: PrintDoc['lines'][number]): ReactNode => {
    switch (key) {
      case 'sn':
        return l.sn;
      case 'name':
        return (
          <>
            <div className="font-medium">{l.name}</div>
            {l.description && <div className="text-[10px] text-gray-500">{l.description}</div>}
          </>
        );
      case 'hsn':
        return l.hsn || '';
      case 'qty':
        return `${qty(l.qty)}${l.unit ? ` ${l.unit}` : ''}`;
      case 'price':
        return num(l.price);
      case 'disc':
        return l.discount > 0 ? (
          <>
            {num(l.discount)}
            {l.discountPercent ? <div className="text-[10px] text-gray-500">({l.discountPercent}%)</div> : null}
          </>
        ) : (
          ''
        );
      case 'taxable':
        return num(l.taxable);
      case 'tax':
        return l.taxAmount ? (
          <>
            {num(l.taxAmount)}
            <div className="text-[10px] text-gray-500">({l.taxRate}%)</div>
          </>
        ) : (
          ''
        );
      case 'amount':
        return num(l.amount);
    }
    return null;
  };

  const footCell = (key: string): ReactNode => {
    switch (key) {
      case 'name':
        return 'Total';
      case 'qty':
        return qty(doc.totals.qty);
      case 'disc':
        return num(doc.totals.itemDiscount);
      case 'taxable':
        return num(doc.totals.taxable);
      case 'tax':
        return num(doc.totals.tax);
      case 'amount':
        return num(doc.totals.subtotal);
    }
    return '';
  };

  const t = theme ?? doc.theme;
  const styles: Record<TableVariant, { table: string; th: string; td: string; thStyle?: CSSProperties; foot: string; footStyle?: CSSProperties; row?: (i: number) => CSSProperties | undefined }> = {
    boxed: { table: 'border border-gray-400', th: 'border border-gray-400 bg-gray-100 px-1.5 py-1.5 font-semibold', td: 'border-x border-gray-400 px-1.5 py-1.5 align-top', foot: 'border border-gray-400 bg-gray-50 px-1.5 py-1.5 font-semibold' },
    band: {
      table: '',
      th: 'px-2 py-2 font-semibold',
      thStyle: { background: t, color: onColor(t) },
      td: 'px-2 py-2 align-top border-b border-gray-200',
      foot: 'px-2 py-2 font-semibold',
      footStyle: { background: tint(t, 0.1) },
      row: (i) => (i % 2 ? { background: '#f9fafb' } : undefined),
    },
    hairline: { table: '', th: 'border-b border-gray-900 px-1 py-2 text-[10px] font-semibold tracking-wider uppercase', td: 'border-b border-gray-200 px-1 py-2 align-top', foot: 'px-1 py-2 font-semibold' },
    gst: { table: 'border border-gray-500', th: 'border border-gray-500 px-1 py-1 text-[10px] font-bold', thStyle: { background: tint(t, 0.12) }, td: 'border-x border-gray-500 px-1 py-1 align-top', foot: 'border border-gray-500 px-1 py-1 font-bold' },
    compact: { table: 'border-y border-gray-400', th: 'border-b border-gray-400 px-1 py-1 text-[10px] font-semibold', td: 'px-1 py-0.5 align-top', foot: 'border-t border-gray-400 px-1 py-1 font-semibold' },
  };
  const s = styles[variant];
  return (
    <table className={cn('w-full border-collapse', s.table)}>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h.key} className={cn(s.th, h.right ? 'text-right' : 'text-left', h.w)} style={s.thStyle}>
              {h.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {doc.lines.map((l, i) => (
          <tr key={l.sn} style={s.row?.(i)}>
            {head.map((h) => (
              <td key={h.key} className={cn(s.td, h.right && 'text-right tabular-nums')}>
                {cell(h.key, l)}
              </td>
            ))}
          </tr>
        ))}
        {doc.lines.length === 0 && (
          <tr>
            <td colSpan={head.length} className={cn(s.td, 'py-4 text-center text-gray-500')}>
              {doc.description || 'No items'}
            </td>
          </tr>
        )}
      </tbody>
      {doc.lines.length > 1 && (
        <tfoot>
          <tr>
            {head.map((h) => (
              <td key={h.key} className={cn(s.foot, h.right && 'text-right tabular-nums')} style={s.footStyle}>
                {footCell(h.key)}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

/** Subtotal → total → received → balance. */
export function TotalsBlock({ doc, className, strong, strongStyle }: { doc: PrintDoc; className?: string; strong?: string; strongStyle?: CSSProperties }) {
  if (!doc.show.prices) return null;
  const t = doc.totals;
  const row = (label: ReactNode, value: string, cls?: string, style?: CSSProperties) => (
    <div className={cn('flex justify-between gap-6 py-0.5', cls)} style={style}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  const hasAdjust = t.discount > 0 || t.charges.length > 0 || Math.abs(t.roundOff) > 0;
  return (
    <div className={className}>
      {(hasAdjust || doc.show.tax) && row('Sub Total', money(t.subtotal))}
      {t.discount > 0 && row(`Discount${t.discountPercent ? ` (${t.discountPercent}%)` : ''}`, `- ${money(t.discount)}`)}
      {t.charges.map((c, i) => (
        <div key={i}>{row(c.label, money(c.amount))}</div>
      ))}
      {Math.abs(t.roundOff) > 0 && row('Round Off', `${t.roundOff > 0 ? '+' : '-'} ${money(Math.abs(t.roundOff))}`)}
      {row('Total', money(t.total), cn('mt-1 border-t border-current/20 pt-1.5 text-[14px] font-bold', strong), strongStyle)}
      {doc.show.settlement && (
        <>
          {row(t.settledLabel, money(t.settled))}
          {row('Balance', money(t.balance), 'font-semibold')}
        </>
      )}
      {t.previousBalance !== undefined && t.currentBalance !== undefined && (
        <div className="mt-1.5 border-t border-gray-200 pt-1.5 text-gray-600">
          {row('Previous Balance', money(t.previousBalance))}
          {row('Current Balance', money(t.currentBalance), 'font-semibold text-gray-900')}
        </div>
      )}
    </div>
  );
}

/** VAT summary grouped by rate. */
export function TaxSummary({ doc, className, headStyle }: { doc: PrintDoc; className?: string; headStyle?: CSSProperties }) {
  if (!doc.show.taxBreakup || !doc.taxRows.length) return null;
  const sum = (k: 'taxable' | 'tax') => doc.taxRows.reduce((s, r) => s + r[k], 0);
  return (
    <table className={cn('w-full border-collapse text-[10px]', className)}>
      <thead>
        <tr style={headStyle} className={headStyle ? undefined : 'bg-gray-100'}>
          <th className="border border-gray-300 px-1.5 py-1 text-left whitespace-nowrap">VAT %</th>
          <th className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">Taxable Value</th>
          <th className="border border-gray-300 px-1.5 py-1 text-right whitespace-nowrap">VAT</th>
        </tr>
      </thead>
      <tbody>
        {doc.taxRows.map((r) => (
          <tr key={r.rate}>
            <td className="border border-gray-300 px-1.5 py-1 whitespace-nowrap">{r.rate}%</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(r.taxable)}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(r.tax)}</td>
          </tr>
        ))}
        {doc.taxRows.length > 1 && (
          <tr className="font-semibold">
            <td className="border border-gray-300 px-1.5 py-1">Total</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(sum('taxable'))}</td>
            <td className="border border-gray-300 px-1.5 py-1 text-right">{num(sum('tax'))}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function Words({ doc, className, label = 'Amount in words' }: { doc: PrintDoc; className?: string; label?: string }) {
  if (!doc.show.amountInWords) return null;
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">{label}</div>
      <div className="font-medium">{doc.amountInWords}</div>
    </div>
  );
}

export function BankBlock({ doc, className }: { doc: PrintDoc; className?: string }) {
  if (!doc.show.bankDetails || (!doc.bankDetails && !doc.walletNo)) return null;
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">Payment details</div>
      <Lines text={doc.bankDetails} />
      {doc.walletNo && <div>bKash / Nagad: <b>{doc.walletNo}</b></div>}
    </div>
  );
}

export function TermsBlock({ doc, className }: { doc: PrintDoc; className?: string }) {
  return (
    <div className={className}>
      {doc.description && (
        <div className="mb-2">
          <div className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">Description</div>
          <Lines text={doc.description} />
        </div>
      )}
      {doc.show.terms && doc.terms && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">Terms &amp; conditions</div>
          <Lines text={doc.terms} />
        </div>
      )}
    </div>
  );
}

export function SignBlock({ doc, className }: { doc: PrintDoc; className?: string }) {
  if (!doc.show.signature) return null;
  return (
    <div className={cn('flex items-end justify-between gap-8', className)}>
      {doc.show.receiverSign ? (
        <div className="text-center">
          <div className="h-14" />
          <div className="min-w-40 border-t border-gray-400 pt-1 text-[10px] text-gray-600">Receiver&apos;s signature &amp; stamp</div>
        </div>
      ) : (
        <span />
      )}
      <div className="text-center">
        <div className="mb-1 text-[11px]">For {doc.seller.name}</div>
        {doc.seller.signature ? <img src={doc.seller.signature} alt="" crossOrigin="anonymous" className="mx-auto h-14 object-contain" /> : <div className="h-14" />}
        <div className="min-w-40 border-t border-gray-400 pt-1 text-[10px] text-gray-600">Authorised signatory</div>
      </div>
    </div>
  );
}

export function Watermark({ doc }: { doc: PrintDoc }) {
  if (!doc.cancelled) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <span className="-rotate-30 rounded-xl border-8 border-red-500/30 px-8 text-[96px] font-black tracking-widest text-red-500/25">CANCELLED</span>
    </div>
  );
}

export function FooterNote({ doc, className }: { doc: PrintDoc; className?: string }) {
  if (!doc.footerNote) return null;
  return <div className={cn('text-center text-[10px] text-gray-500', className)}>{doc.footerNote}</div>;
}
