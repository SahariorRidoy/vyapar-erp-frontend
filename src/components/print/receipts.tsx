import { fmtDate, money } from '@/lib/utils';
import type { PrintDoc } from './model';
import { Lines, Logo, SellerContact, SignBlock, Watermark, onColor, tint } from './blocks';

const verbs = (doc: PrintDoc) =>
  doc.type === 'PAYMENT_OUT' ? { party: 'Paid to', action: 'Paid', against: 'Against bills' } : { party: 'Received from', action: 'Received', against: 'Against invoices' };

function Against({ doc, className }: { doc: PrintDoc; className?: string }) {
  if (!doc.allocations.length && !(doc.advance > 0)) return null;
  const v = verbs(doc);
  return (
    <table className={`w-full border-collapse text-[11px] ${className ?? ''}`}>
      <thead>
        <tr className="bg-gray-100">
          <th className="border border-gray-300 px-2 py-1 text-left">{v.against}</th>
          <th className="border border-gray-300 px-2 py-1 text-right">Amount adjusted</th>
        </tr>
      </thead>
      <tbody>
        {doc.allocations.map((a) => (
          <tr key={a.number}>
            <td className="border border-gray-300 px-2 py-1">{a.number}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{money(a.amount)}</td>
          </tr>
        ))}
        {doc.advance > 0.004 && (
          <tr>
            <td className="border border-gray-300 px-2 py-1 text-gray-600">On account / advance</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{money(doc.advance)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/* 1. Receipt – classic */
export function ReceiptClassic({ doc }: { doc: PrintDoc }) {
  const v = verbs(doc);
  return (
    <div className="relative p-10 text-[12px] leading-relaxed">
      <Watermark doc={doc} />
      <div className="flex items-start gap-4 border-b-2 pb-4" style={{ borderColor: doc.theme }}>
        <Logo doc={doc} className="h-16 w-16" />
        <div className="flex-1">
          <div className="text-[20px] font-bold">{doc.seller.name}</div>
          <SellerContact doc={doc} className="text-gray-600" />
        </div>
      </div>
      <div className="mt-5 text-center text-[16px] font-bold tracking-wider uppercase" style={{ color: doc.theme }}>
        {doc.title}
      </div>
      <div className="mt-4 flex justify-between">
        <div>
          {doc.numberLabel} <b>{doc.number}</b>
        </div>
        <div>
          Date: <b>{fmtDate(doc.date)}</b>
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        <div className="flex gap-2 border-b border-dotted border-gray-400 pb-1">
          <span className="text-gray-600">{v.party}</span>
          <b>{doc.buyer.name}</b>
          {doc.buyer.phone && <span className="ml-auto text-gray-600">{doc.buyer.phone}</span>}
        </div>
        <div className="flex gap-2 border-b border-dotted border-gray-400 pb-1">
          <span className="text-gray-600">The sum of</span>
          <b>{doc.amountInWords}</b>
        </div>
        <div className="flex gap-2 border-b border-dotted border-gray-400 pb-1">
          <span className="text-gray-600">By</span>
          <b>{doc.paymentType || 'Cash'}</b>
          {doc.paymentRef && <span className="ml-4 text-gray-600">Ref: {doc.paymentRef}</span>}
        </div>
        {doc.description && (
          <div className="flex gap-2 border-b border-dotted border-gray-400 pb-1">
            <span className="text-gray-600">Towards</span>
            <span>{doc.description}</span>
          </div>
        )}
      </div>
      <Against doc={doc} className="mt-5" />
      <div className="mt-6 flex items-end justify-between">
        <div className="rounded-lg border-2 px-5 py-2 text-[18px] font-bold" style={{ borderColor: doc.theme, color: doc.theme }}>
          {money(doc.totals.total)}
        </div>
        <SignBlock doc={doc} />
      </div>
    </div>
  );
}

/* 2. Receipt – modern card */
export function ReceiptModern({ doc }: { doc: PrintDoc }) {
  const v = verbs(doc);
  const fg = onColor(doc.theme);
  return (
    <div className="relative text-[12px] leading-relaxed">
      <Watermark doc={doc} />
      <div className="flex items-center justify-between px-10 py-7" style={{ background: doc.theme, color: fg }}>
        <div className="flex items-center gap-3">
          {doc.show.logo && <Logo doc={doc} className="h-12 w-12 rounded-lg bg-white p-1" />}
          <div>
            <div className="text-[18px] font-bold">{doc.seller.name}</div>
            <div className="opacity-90">{[doc.seller.phone, doc.seller.email].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[18px] font-light uppercase">{doc.title}</div>
          <div className="font-semibold"># {doc.number}</div>
        </div>
      </div>
      <div className="px-10 py-8">
        <div className="rounded-2xl p-6 text-center" style={{ background: tint(doc.theme, 0.08) }}>
          <div className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: doc.theme }}>
            Amount {v.action.toLowerCase()}
          </div>
          <div className="mt-1 text-[34px] font-bold text-gray-900">{money(doc.totals.total)}</div>
          <div className="text-gray-600">{doc.amountInWords}</div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-3">
          {[
            [v.party, doc.buyer.name],
            ['Date', fmtDate(doc.date)],
            ['Payment mode', doc.paymentType || 'Cash'],
            ['Reference', doc.paymentRef || '—'],
            ['Phone', doc.buyer.phone || '—'],
            ['BIN', doc.buyer.gstin || '—'],
          ].map(([k, val]) => (
            <div key={k} className="border-b border-gray-100 pb-2">
              <div className="text-[10px] tracking-wider text-gray-500 uppercase">{k}</div>
              <div className="font-semibold">{val}</div>
            </div>
          ))}
        </div>
        {doc.description && (
          <div className="mt-4">
            <div className="text-[10px] tracking-wider text-gray-500 uppercase">Note</div>
            <Lines text={doc.description} />
          </div>
        )}
        {(doc.allocations.length > 0 || doc.advance > 0) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {doc.allocations.map((a) => (
              <span key={a.number} className="rounded-full border border-gray-200 px-3 py-1">
                {a.number}: <b>{money(a.amount)}</b>
              </span>
            ))}
            {doc.advance > 0.004 && (
              <span className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-gray-600">
                Advance: <b>{money(doc.advance)}</b>
              </span>
            )}
          </div>
        )}
        <SignBlock doc={doc} className="mt-12" />
      </div>
    </div>
  );
}

/* 3. Voucher – boxed money receipt with three signatures */
export function ReceiptVoucher({ doc }: { doc: PrintDoc }) {
  const v = verbs(doc);
  return (
    <div className="relative p-8 text-[12px]">
      <Watermark doc={doc} />
      <div className="border-2 border-gray-800">
        <div className="border-b-2 border-gray-800 p-3 text-center">
          <div className="text-[18px] font-bold uppercase">{doc.seller.name}</div>
          <SellerContact doc={doc} inline className="text-[11px] text-gray-700" />
        </div>
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
          <span>
            No. <b>{doc.number}</b>
          </span>
          <span className="rounded border border-gray-800 px-3 py-0.5 font-bold tracking-wider uppercase">{doc.title}</span>
          <span>
            Date <b>{fmtDate(doc.date)}</b>
          </span>
        </div>
        <div className="space-y-4 px-5 py-5 leading-loose">
          <div>
            {v.action} with thanks {doc.type === 'PAYMENT_OUT' ? 'to' : 'from'} M/s <span className="border-b border-gray-500 px-2 font-semibold">{doc.buyer.name}</span>
          </div>
          <div>
            the sum of <span className="border-b border-gray-500 px-2 font-semibold">{doc.amountInWords}</span>
          </div>
          <div>
            by <span className="border-b border-gray-500 px-2 font-semibold">{doc.paymentType || 'Cash'}</span>
            {doc.paymentRef && (
              <>
                {' '}
                Cheque / Ref. No. <span className="border-b border-gray-500 px-2 font-semibold">{doc.paymentRef}</span>
              </>
            )}
          </div>
          <div>
            towards{' '}
            <span className="border-b border-gray-500 px-2 font-semibold">
              {doc.allocations.length ? doc.allocations.map((a) => `${a.number} (${money(a.amount)})`).join(', ') : doc.description || 'on account'}
            </span>
          </div>
        </div>
        <div className="flex items-end justify-between border-t border-gray-800 px-5 py-4">
          <div className="border-2 border-gray-800 px-4 py-2 text-[18px] font-bold">{money(doc.totals.total)}</div>
          <div className="flex gap-10 text-center text-[10px] text-gray-700">
            <div>
              <div className="h-10" />
              <div className="border-t border-gray-500 px-4 pt-1">{doc.type === 'PAYMENT_OUT' ? "Receiver's signature" : "Payer's signature"}</div>
            </div>
            <div>
              <div className="h-10" />
              <div className="border-t border-gray-500 px-4 pt-1">Prepared by</div>
            </div>
            <div>
              <div className="h-10" />
              <div className="border-t border-gray-500 px-4 pt-1">For {doc.seller.name}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 4. Compact A5 receipt */
export function ReceiptCompact({ doc }: { doc: PrintDoc }) {
  const v = verbs(doc);
  return (
    <div className="relative p-6 text-[11px] leading-snug">
      <Watermark doc={doc} />
      <div className="flex items-start justify-between border-b pb-2" style={{ borderColor: doc.theme }}>
        <div>
          <div className="text-[14px] font-bold">{doc.seller.name}</div>
          <div className="text-gray-600">{[doc.seller.phone, doc.seller.gstin && `BIN ${doc.seller.gstin}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="text-right">
          <div className="font-bold uppercase" style={{ color: doc.theme }}>
            {doc.title}
          </div>
          <div>
            {doc.number} · {fmtDate(doc.date)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <span className="text-gray-500">{v.party}</span>
        <b>{doc.buyer.name}</b>
        <span className="text-gray-500">Amount</span>
        <b className="text-[14px]">{money(doc.totals.total)}</b>
        <span className="text-gray-500">In words</span>
        <span>{doc.amountInWords}</span>
        <span className="text-gray-500">Mode</span>
        <span>
          {doc.paymentType || 'Cash'}
          {doc.paymentRef ? ` · ${doc.paymentRef}` : ''}
        </span>
        {doc.allocations.length > 0 && (
          <>
            <span className="text-gray-500">Against</span>
            <span>{doc.allocations.map((a) => `${a.number} (${money(a.amount)})`).join(', ')}</span>
          </>
        )}
        {doc.description && (
          <>
            <span className="text-gray-500">Note</span>
            <span>{doc.description}</span>
          </>
        )}
      </div>
      <SignBlock doc={doc} className="mt-6" />
    </div>
  );
}

/* 5. Thermal receipt */
export function ReceiptThermal({ doc }: { doc: PrintDoc }) {
  const v = verbs(doc);
  const dash = 'my-1.5 border-t border-dashed border-gray-500';
  return (
    <div className="px-3 py-4 font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <div className="text-[13px] font-bold">{doc.seller.name}</div>
        {doc.seller.phone && <div>Ph: {doc.seller.phone}</div>}
      </div>
      <div className={dash} />
      <div className="text-center font-bold uppercase">{doc.title}</div>
      <div className="flex justify-between">
        <span>{doc.number}</span>
        <span>{fmtDate(doc.date)}</span>
      </div>
      {doc.cancelled && <div className="text-center font-bold">*** CANCELLED ***</div>}
      <div className={dash} />
      <div>
        {v.party}: {doc.buyer.name}
      </div>
      <div>Mode: {doc.paymentType || 'Cash'}</div>
      {doc.paymentRef && <div>Ref: {doc.paymentRef}</div>}
      {doc.allocations.map((a) => (
        <div key={a.number} className="flex justify-between">
          <span>{a.number}</span>
          <span>{money(a.amount)}</span>
        </div>
      ))}
      <div className={dash} />
      <div className="flex justify-between text-[14px] font-bold">
        <span>{v.action.toUpperCase()}</span>
        <span>{money(doc.totals.total)}</span>
      </div>
      <div className="mt-1">{doc.amountInWords}</div>
      <div className={dash} />
      <div className="text-center">Thank you!</div>
    </div>
  );
}
