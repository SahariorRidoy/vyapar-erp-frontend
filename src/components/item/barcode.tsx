import type { CSSProperties } from 'react';
import JsBarcode from 'jsbarcode';

/** Code 128 modules of `value` as a string of 1 (bar) and 0 (space), or null when it cannot be encoded. */
export function code128(value: string): string | null {
  if (!value) return null;
  // JsBarcode's object renderer returns the encoding without touching the DOM, so this also runs on the server
  const out: { encodings?: { data: string }[] } = {};
  let valid = true;
  JsBarcode(out, value, { format: 'CODE128', valid: (v: boolean) => (valid = v) });
  const data = out.encodings?.map((e) => e.data).join('');
  return valid && data ? data : null;
}

/** Quiet zone each side, in modules (the Code 128 minimum is 10). */
const QUIET = 10;

/**
 * A scannable Code 128 barcode drawn as SVG bars. It stretches to the width it is given, which keeps the
 * bar ratios intact, so a scanner reads it at any label size.
 */
export function Barcode({ value, className, style }: { value: string; className?: string; style?: CSSProperties }) {
  const data = code128(value);
  if (!data) return <span className="text-[10px] text-rose-600">Cannot encode “{value}”</span>;
  const bars: { x: number; w: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== '1') continue;
    const last = bars[bars.length - 1];
    if (last && last.x + last.w === i + QUIET) last.w += 1;
    else bars.push({ x: i + QUIET, w: 1 });
  }
  const width = data.length + QUIET * 2;
  return (
    <svg viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" shapeRendering="crispEdges" className={className} style={style} role="img" aria-label={`Barcode ${value}`}>
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={40} fill="#000" />
      ))}
    </svg>
  );
}
