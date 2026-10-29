import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let currencySymbol = '৳';
let dateFormat = 'DD/MM/YYYY';
let decimals = 2;
/** 1 = January … 12 = December; Bangladesh's fiscal year starts in July. */
let fyStartMonth = 7;
// en-IN gives the lakh / crore grouping (1,23,45,678) that Bangladesh uses too
let nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Applies the company's Settings ▸ General choices to every amount and date shown in the app. */
export function setFormatting(opts: { currencySymbol?: string; dateFormat?: string; decimalPlaces?: number; fyStartMonth?: number }) {
  if (opts.currencySymbol) currencySymbol = opts.currencySymbol;
  if (opts.dateFormat) dateFormat = opts.dateFormat;
  if (opts.fyStartMonth && opts.fyStartMonth >= 1 && opts.fyStartMonth <= 12) fyStartMonth = opts.fyStartMonth;
  const d = Math.min(4, Math.max(0, Math.round(opts.decimalPlaces ?? decimals)));
  if (d !== decimals) {
    decimals = d;
    nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
}
export const num = (n: number | undefined | null, digits = 2) =>
  digits === 2 ? nf.format(Number(n) || 0) : (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });
export const money = (n: number | undefined | null, symbol = true) => {
  const v = Number(n) || 0;
  return `${v < 0 ? '-' : ''}${symbol ? currencySymbol + ' ' : ''}${nf.format(Math.abs(v))}`;
};
export const qty = (n: number | undefined | null) => (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
/** Business dates are calendar days stored at UTC midnight: read them as that day in every time zone. */
const calendarDay = (d: string | Date) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z$/.test(d) ? d.slice(0, 10) : d);
export const fmtDate = (d?: string | Date | null) => (d ? dayjs(calendarDay(d)).format(dateFormat) : '');
export const fmtDateTime = (d?: string | Date | null) => (d ? dayjs(d).format(`${dateFormat} hh:mm A`) : '');
/** "1 bill", "3 bills", "1 party", "2 parties": a count with the right word form. */
export function plural(n: number, one: string, many = one.endsWith('y') && !/[aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : `${one}s`) {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
/** "just now", "5 minutes ago", "yesterday"; older than a week falls back to the date. */
export function timeAgo(d?: string | Date | null, now = Date.now()) {
  if (!d) return '';
  const secs = Math.round((new Date(d).getTime() - now) / 1000);
  const abs = Math.abs(secs);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(secs / 86400), 'day');
  return fmtDate(d);
}
export const isoDate = (d?: string | Date | null) => (d ? dayjs(calendarDay(d)).format('YYYY-MM-DD') : '');
export const today = () => dayjs().format('YYYY-MM-DD');
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Formats a moment in the company's time zone (falls back to Bangladesh time for an unknown zone). */
export function inZone(at: Date, timeZone: string | undefined, opts: Intl.DateTimeFormatOptions, locale = 'en-GB') {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: timeZone || 'Asia/Dhaka', ...opts }).format(at);
  } catch {
    return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dhaka', ...opts }).format(at);
  }
}

export function initials(name?: string) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');
}

/** Date range presets used by every list & report filter. */
export const RANGE_PRESETS = [
  { key: 'today', label: 'Today', range: () => [dayjs(), dayjs()] },
  { key: 'yesterday', label: 'Yesterday', range: () => [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')] },
  { key: 'this_week', label: 'This Week', range: () => [dayjs().startOf('week'), dayjs()] },
  { key: 'this_month', label: 'This Month', range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
  { key: 'last_month', label: 'Last Month', range: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { key: 'this_quarter', label: 'This Quarter', range: () => [dayjs().startOf('month').subtract(dayjs().month() % 3, 'month'), dayjs()] },
  {
    key: 'this_fy', label: 'This Financial Year',
    range: () => {
      const m = fyStartMonth - 1;
      const start = dayjs().month() >= m ? dayjs().month(m).startOf('month') : dayjs().subtract(1, 'year').month(m).startOf('month');
      return [start, start.add(1, 'year').subtract(1, 'day')];
    },
  },
  { key: 'this_year', label: 'This Year', range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
  { key: 'all', label: 'All Time', range: () => [null, null] },
] as const;

export function presetRange(key: string): { from: string; to: string } {
  const p = RANGE_PRESETS.find((x) => x.key === key) ?? RANGE_PRESETS[3];
  const [a, b] = p.range() as [dayjs.Dayjs | null, dayjs.Dayjs | null];
  return { from: a ? a.format('YYYY-MM-DD') : '', to: b ? b.format('YYYY-MM-DD') : '' };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`;
}
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}
/** Amount in words with Lakh / Crore, as written on Bangladeshi invoices and cheques. */
export function amountInWords(amount: number, currency = 'Taka', sub = 'Paisa') {
  const n = Math.abs(Math.round((amount + Number.EPSILON) * 100) / 100);
  let taka = Math.floor(n);
  const paisa = Math.round((n - taka) * 100);
  if (taka === 0 && paisa === 0) return `Zero ${currency} Only`;
  const parts: string[] = [];
  const crore = Math.floor(taka / 10000000);
  taka %= 10000000;
  const lakh = Math.floor(taka / 100000);
  taka %= 100000;
  const thousand = Math.floor(taka / 1000);
  taka %= 1000;
  if (crore) parts.push(`${crore > 99 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (taka) parts.push(threeDigits(taka));
  let out = parts.length ? `${parts.join(' ')} ${currency}` : '';
  if (paisa) out += `${out ? ' and ' : ''}${twoDigits(paisa)} ${sub}`;
  return `${out} Only`;
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
