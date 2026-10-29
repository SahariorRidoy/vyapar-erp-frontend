import { fmtDate, money, num, qty } from '@/lib/utils';
import type { PrintDoc } from './model';
import {
  BankBlock, FooterNote, ItemsTable, Lines, Logo, MetaList, PartyBlock, SellerContact, ShipBlock, SignBlock, TaxSummary, TermsBlock, TotalsBlock, Watermark, Words, extraMetaRows, metaRows, onColor, tint,
} from './blocks';

/* ------------------------------------------------------------------ */
/* 1. Classic – the familiar Vyapar layout                             */
/* ------------------------------------------------------------------ */
export function ClassicTemplate({ doc }: { doc: PrintDoc }) {
  return (
    <div className="relative p-9 text-[11px] leading-snug">
      <Watermark doc={doc} />
      <div className="mb-3 text-center text-[15px] font-bold tracking-wide uppercase" style={{ color: doc.theme }}>
        {doc.title}
      </div>
      <div className="flex items-start gap-4 border border-gray-400 p-3">
        <Logo doc={doc} className="h-16 w-16" />
        <div className="flex-1">
          <div className="text-[18px] font-bold">{doc.seller.name}</div>
          <SellerContact doc={doc} className="text-gray-700" />
        </div>
      </div>
      <div className="grid grid-cols-2 border-x border-b border-gray-400">
        <div className="space-y-2 border-r border-gray-400 p-3">
          <PartyBlock doc={doc} labelClass="text-gray-500" />
          <ShipBlock doc={doc} labelClass="text-gray-500" />
        </div>
        <div className="p-3">
          <MetaList doc={doc} className="ml-auto" />
        </div>
      </div>
      <div className="mt-3">
        <ItemsTable doc={doc} variant="boxed" />
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_260px] gap-4">
        <div className="space-y-3">
          <TaxSummary doc={doc} />
          <Words doc={doc} />
          <BankBlock doc={doc} />
          <TermsBlock doc={doc} />
        </div>
        <TotalsBlock doc={doc} className="self-start border border-gray-400 p-2.5" />
      </div>
      <SignBlock doc={doc} className="mt-8" />
      <FooterNote doc={doc} className="mt-4" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Modern – colour band header and striped table                    */
/* ------------------------------------------------------------------ */
export function ModernTemplate({ doc }: { doc: PrintDoc }) {
  const fg = onColor(doc.theme);
  return (
    <div className="relative text-[11px] leading-snug">
      <Watermark doc={doc} />
      <div className="flex items-start justify-between gap-6 px-9 pt-9 pb-7" style={{ background: doc.theme, color: fg }}>
        <div className="flex items-start gap-3">
          {doc.show.logo && <Logo doc={doc} className="h-14 w-14 rounded-lg bg-white p-1" />}
          <div>
            <div className="text-[20px] font-bold">{doc.seller.name}</div>
            <SellerContact doc={doc} className="opacity-90" />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-light tracking-wide uppercase">{doc.title}</div>
          <div className="mt-1 text-[13px] font-semibold"># {doc.number}</div>
          <div className="opacity-90">{fmtDate(doc.date)}</div>
        </div>
      </div>
      <div className="px-9 py-6">
        <div className="grid grid-cols-3 gap-6">
          <PartyBlock doc={doc} labelStyle={{ color: doc.theme }} />
          <ShipBlock doc={doc} labelStyle={{ color: doc.theme }} />
          <div className={doc.shipTo ? '' : 'col-start-3'}>
            <div className="mb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: doc.theme }}>
              Details
            </div>
            <MetaList doc={doc} className="w-full" />
          </div>
        </div>
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <ItemsTable doc={doc} variant="band" />
        </div>
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_270px] gap-6">
          <div className="space-y-4">
            <Words doc={doc} />
            <TaxSummary doc={doc} headStyle={{ background: tint(doc.theme, 0.12) }} />
            <BankBlock doc={doc} />
            <TermsBlock doc={doc} />
          </div>
          <div className="self-start rounded-lg p-4" style={{ background: tint(doc.theme, 0.07) }}>
            <TotalsBlock doc={doc} strongStyle={{ color: doc.theme }} />
          </div>
        </div>
        <SignBlock doc={doc} className="mt-10" />
        <FooterNote doc={doc} className="mt-6" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Minimal – typographic, hairlines only                            */
/* ------------------------------------------------------------------ */
export function MinimalTemplate({ doc }: { doc: PrintDoc }) {
  return (
    <div className="relative p-12 text-[11px] leading-relaxed text-gray-800">
      <Watermark doc={doc} />
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[28px] font-light tracking-tight text-gray-900">{doc.title}</div>
          <div className="mt-1 text-gray-500">
            {doc.number} · {fmtDate(doc.date)}
            {doc.dueDate ? ` · due ${fmtDate(doc.dueDate)}` : ''}
          </div>
        </div>
        <div className="text-right">
          <Logo doc={doc} className="mb-2 ml-auto h-12 w-28" />
          <div className="font-semibold text-gray-900">{doc.seller.name}</div>
          <SellerContact doc={doc} className="text-gray-500" />
        </div>
      </div>
      <div className="mt-10 grid grid-cols-3 gap-6">
        <PartyBlock doc={doc} labelClass="text-gray-400" />
        <ShipBlock doc={doc} labelClass="text-gray-400" />
        <div className={doc.shipTo ? '' : 'col-start-3'}>
          <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-400 uppercase">Reference</div>
          {extraMetaRows(doc).map(([k, v]) => (
            <div key={k}>
              <span className="text-gray-500">{k}:</span> {v}
            </div>
          ))}
          {doc.paymentType && (
            <div>
              <span className="text-gray-500">Payment:</span> {doc.paymentType}
            </div>
          )}
        </div>
      </div>
      <div className="mt-8">
        <ItemsTable doc={doc} variant="hairline" />
      </div>
      <div className="mt-6 flex justify-end">
        <TotalsBlock doc={doc} className="w-72" strong="border-gray-900 text-[16px]" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <Words doc={doc} />
          <TermsBlock doc={doc} />
        </div>
        <div className="space-y-4">
          <TaxSummary doc={doc} />
          <BankBlock doc={doc} />
        </div>
      </div>
      <SignBlock doc={doc} className="mt-12" />
      <FooterNote doc={doc} className="mt-6" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. VAT Invoice – fully boxed Mushak 6.3 style format                 */
/* ------------------------------------------------------------------ */
export function VatTemplate({ doc }: { doc: PrintDoc }) {
  const cell = 'border border-gray-500 p-2';
  const taxWords = doc.show.tax && doc.show.prices ? `VAT amount: ${money(doc.totals.tax)}` : '';
  return (
    <div className="relative p-7 text-[10.5px] leading-snug">
      <Watermark doc={doc} />
      <div className="mb-1 flex items-end justify-between">
        <div className="text-[14px] font-bold tracking-wide uppercase">
          {doc.title}
          {doc.type === 'SALE' && <span className="ml-2 text-[10px] font-semibold text-gray-600 normal-case">(Mushak 6.3)</span>}
        </div>
        <div className="text-[10px] text-gray-600 italic">{doc.type === 'SALE' ? 'Original for recipient' : ''}</div>
      </div>
      <div className="grid grid-cols-2">
        <div className={`${cell} flex gap-3`}>
          <Logo doc={doc} className="h-14 w-14" />
          <div>
            <div className="text-[14px] font-bold">{doc.seller.name}</div>
            <Lines text={doc.seller.address} />
            {doc.seller.phone && <div>Phone: {doc.seller.phone}</div>}
            {doc.seller.email && <div>Email: {doc.seller.email}</div>}
            {doc.seller.gstin && (
              <div>
                BIN: <b>{doc.seller.gstin}</b>
              </div>
            )}
            {doc.seller.pan && <div>TIN: {doc.seller.pan}</div>}
          </div>
        </div>
        <div className="grid grid-cols-2">
          {metaRows(doc).map(([k, v]) => (
            <div key={k} className={cell}>
              <div className="text-[9px] text-gray-500">{k}</div>
              <div className="font-semibold">{v}</div>
            </div>
          ))}
          {doc.paymentType && (
            <div className={cell}>
              <div className="text-[9px] text-gray-500">Mode of payment</div>
              <div className="font-semibold">{doc.paymentType}</div>
            </div>
          )}
        </div>
        <div className={cell}>
          <PartyBlock doc={doc} label={doc.type.startsWith('PURCHASE') ? 'Supplier (Bill from)' : 'Buyer (Bill to)'} labelClass="text-gray-500" />
        </div>
        <div className={cell}>
          {doc.shipTo ? (
            <ShipBlock doc={doc} labelClass="text-gray-500" />
          ) : (
            <>
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">Consignee (Ship to)</div>
              <div className="text-gray-500">Same as billing address</div>
            </>
          )}
        </div>
      </div>
      <div className="-mt-px">
        <ItemsTable doc={doc} variant="gst" />
      </div>
      <div className="-mt-px grid grid-cols-[minmax(0,1fr)_250px]">
        <div className={`${cell} space-y-1`}>
          <Words doc={doc} label="Amount chargeable (in words)" />
          {taxWords && <div className="text-gray-600">{taxWords}</div>}
        </div>
        <TotalsBlock doc={doc} className={cell} />
      </div>
      {doc.show.taxBreakup && (
        <div className="-mt-px">
          <TaxSummary doc={doc} headStyle={{ background: tint(doc.theme, 0.12) }} />
        </div>
      )}
      <div className="-mt-px grid grid-cols-2">
        <div className={`${cell} space-y-2`}>
          <BankBlock doc={doc} />
          <TermsBlock doc={doc} />
          <div>
            <div className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase">Declaration</div>
            <div>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div>
          </div>
        </div>
        <div className={cell}>
          <SignBlock doc={doc} className="h-full" />
        </div>
      </div>
      <div className="mt-2 text-center text-[9px] text-gray-500">This is a computer generated document.</div>
      <FooterNote doc={doc} className="mt-1" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Elegant – serif, centred, accent rules                           */
/* ------------------------------------------------------------------ */
export function ElegantTemplate({ doc }: { doc: PrintDoc }) {
  const serif = { fontFamily: 'Georgia, "Times New Roman", serif' };
  return (
    <div className="relative flex flex-1 text-[11px] leading-relaxed">
      <Watermark doc={doc} />
      <div className="w-2 shrink-0" style={{ background: doc.theme }} />
      <div className="flex-1 px-12 py-8">
        <div className="text-center">
          <Logo doc={doc} className="mx-auto mb-2 h-14 w-32" />
          <div className="text-[24px] tracking-[0.18em] uppercase" style={serif}>
            {doc.seller.name}
          </div>
          <SellerContact doc={doc} inline className="mt-1 text-gray-600" />
        </div>
        <div className="my-5 flex items-center gap-4">
          <div className="h-px flex-1" style={{ background: doc.theme }} />
          <div className="text-[13px] tracking-[0.3em] uppercase" style={{ ...serif, color: doc.theme }}>
            {doc.title}
          </div>
          <div className="h-px flex-1" style={{ background: doc.theme }} />
        </div>
        <div className="grid grid-cols-2 gap-10">
          <div className="space-y-3">
            <PartyBlock doc={doc} labelStyle={{ color: doc.theme, letterSpacing: '0.15em' }} />
            <ShipBlock doc={doc} labelStyle={{ color: doc.theme, letterSpacing: '0.15em' }} />
          </div>
          <MetaList doc={doc} className="ml-auto" />
        </div>
        <div className="mt-6">
          <ItemsTable doc={doc} variant="hairline" />
        </div>
        <div className="mt-5 flex justify-end">
          <div className="w-72 border-y-4 border-double py-2" style={{ borderColor: doc.theme }}>
            <TotalsBlock doc={doc} strong="text-[15px]" strongStyle={{ ...serif, color: doc.theme }} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-10">
          <div className="space-y-4">
            <Words doc={doc} />
            <TermsBlock doc={doc} />
          </div>
          <div className="space-y-4">
            <TaxSummary doc={doc} />
            <BankBlock doc={doc} />
          </div>
        </div>
        <SignBlock doc={doc} className="mt-8" />
        <div className="mt-6 text-center text-[12px] italic" style={{ ...serif, color: doc.theme }}>
          Thank you for your business
        </div>
        <FooterNote doc={doc} className="mt-2" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Compact – dense layout for long item lists                       */
/* ------------------------------------------------------------------ */
export function CompactTemplate({ doc }: { doc: PrintDoc }) {
  return (
    <div className="relative p-6 text-[10px] leading-tight">
      <Watermark doc={doc} />
      <div className="flex items-start justify-between gap-4 border-b-2 pb-2" style={{ borderColor: doc.theme }}>
        <div className="flex items-start gap-2">
          <Logo doc={doc} className="h-10 w-10" />
          <div>
            <div className="text-[14px] font-bold">{doc.seller.name}</div>
            <SellerContact doc={doc} inline className="text-gray-600" />
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-bold uppercase" style={{ color: doc.theme }}>
            {doc.title}
          </div>
          <div>
            {doc.numberLabel} <b>{doc.number}</b>
          </div>
          <div>Date: {fmtDate(doc.date)}</div>
          {doc.dueDate && <div>Due: {fmtDate(doc.dueDate)}</div>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 py-2">
        <PartyBlock doc={doc} labelClass="text-gray-500" />
        <ShipBlock doc={doc} labelClass="text-gray-500" />
        <div className={doc.shipTo ? '' : 'col-start-3'}>
          {extraMetaRows(doc).map(([k, v]) => (
            <div key={k}>
              {k}: <b>{v}</b>
            </div>
          ))}
          {doc.paymentType && (
            <div>
              Payment: <b>{doc.paymentType}</b>
            </div>
          )}
        </div>
      </div>
      <ItemsTable doc={doc} variant="compact" />
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_220px] gap-4">
        <div className="space-y-2">
          <Words doc={doc} />
          <TaxSummary doc={doc} />
          <div className="grid grid-cols-2 gap-3">
            <BankBlock doc={doc} />
            <TermsBlock doc={doc} />
          </div>
        </div>
        <TotalsBlock doc={doc} className="self-start" />
      </div>
      <SignBlock doc={doc} className="mt-4" />
      <FooterNote doc={doc} className="mt-2" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Thermal 80 mm – POS roll printers                                */
/* ------------------------------------------------------------------ */
export function ThermalTemplate({ doc }: { doc: PrintDoc }) {
  const dash = 'my-1.5 border-t border-dashed border-gray-500';
  const t = doc.totals;
  return (
    <div className="relative px-3 py-4 font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <Logo doc={doc} className="mx-auto mb-1 h-10 w-24 grayscale" />
        <div className="text-[13px] font-bold">{doc.seller.name}</div>
        <Lines text={doc.seller.address} />
        {doc.seller.phone && <div>Ph: {doc.seller.phone}</div>}
        {doc.seller.gstin && <div>BIN: {doc.seller.gstin}</div>}
      </div>
      <div className={dash} />
      <div className="text-center font-bold uppercase">{doc.title}</div>
      <div className="flex justify-between">
        <span>{doc.number}</span>
        <span>{fmtDate(doc.date)}</span>
      </div>
      {doc.buyer.name && <div>To: {doc.buyer.name}</div>}
      {doc.buyer.phone && <div>Ph: {doc.buyer.phone}</div>}
      {doc.cancelled && <div className="mt-1 text-center font-bold">*** CANCELLED ***</div>}
      <div className={dash} />
      {doc.lines.map((l) => (
        <div key={l.sn} className="mb-1">
          <div>{l.name}</div>
          <div className="flex justify-between">
            <span>
              {qty(l.qty)} {l.unit} {doc.show.prices ? `x ${num(l.price)}` : ''}
            </span>
            {doc.show.prices && <span>{num(l.amount)}</span>}
          </div>
          {l.discount > 0 && doc.show.prices && <div className="text-right">disc -{num(l.discount)}</div>}
        </div>
      ))}
      <div className={dash} />
      {doc.show.prices && (
        <>
          <div className="flex justify-between">
            <span>Items: {doc.lines.length}</span>
            <span>Qty: {qty(t.qty)}</span>
          </div>
          {(t.discount > 0 || t.charges.length > 0 || t.tax > 0) && (
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{num(t.subtotal)}</span>
            </div>
          )}
          {t.tax > 0 && (
            <div className="flex justify-between">
              <span>VAT</span>
              <span>{num(t.tax)}</span>
            </div>
          )}
          {t.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{num(t.discount)}</span>
            </div>
          )}
          {t.charges.map((c, i) => (
            <div key={i} className="flex justify-between">
              <span>{c.label}</span>
              <span>{num(c.amount)}</span>
            </div>
          ))}
          {Math.abs(t.roundOff) > 0 && (
            <div className="flex justify-between">
              <span>Round off</span>
              <span>{num(t.roundOff)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between text-[14px] font-bold">
            <span>TOTAL</span>
            <span>{money(t.total)}</span>
          </div>
          {doc.show.settlement && (
            <>
              <div className="flex justify-between">
                <span>{t.settledLabel}</span>
                <span>{num(t.settled)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Balance</span>
                <span>{num(t.balance)}</span>
              </div>
            </>
          )}
          {doc.paymentType && <div className="mt-1">Paid by: {doc.paymentType}</div>}
        </>
      )}
      {doc.walletNo && doc.totals.balance > 0 && (
        <div className="mt-2 text-center">
          Pay {money(doc.totals.balance)} by bKash / Nagad: <b>{doc.walletNo}</b>
        </div>
      )}
      <div className={dash} />
      <div className="text-center">{doc.footerNote || 'Thank you! Visit again.'}</div>
    </div>
  );
}
