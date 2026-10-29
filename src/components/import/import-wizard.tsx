'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { invalidateCompany } from '@/lib/query';
import { cn, plural } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/input';
import { NoAccess, PageHeader } from '@/components/ui/misc';

/** A row as the API's /import/parse returns it: the sheet row number, the record's fields and its problems. */
export interface ImportRow {
  row: number;
  name: string;
  errors: string[];
}

export interface ImportColumn<R> {
  label: string;
  align?: 'right';
  render: (r: R) => ReactNode;
}

interface ParseResult<R> {
  rows: R[];
  valid: number;
  invalid: number;
}
interface ImportResult {
  created: number;
  skipped: { name: string; reason: string }[];
}

const STEPS = ['Download template', 'Upload file', 'Review', 'Done'];

/**
 * The Excel import flow shared by items and parties: template, upload, row-by-row review, import, summary.
 * The API area provides GET /<resource>/import/template, POST /<resource>/import/parse and POST /<resource>/bulk.
 */
export function ImportWizard<R extends ImportRow>({
  resource,
  noun,
  title,
  description,
  templateHelp,
  doneNote,
  columns,
  minWidth = 1000,
}: {
  resource: 'items' | 'parties';
  /** What one row is, in the singular and plural ('party', 'parties') */
  noun: { one: string; many: string };
  title: string;
  description: string;
  templateHelp: ReactNode;
  doneNote?: string;
  columns: ImportColumn<R>[];
  minWidth?: number;
}) {
  const { cid, href, can } = useCompany();
  const router = useRouter();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParseResult<R> | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const count = (n: number) => plural(n, noun.one, noun.many);
  const many = noun.many;

  const parse = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post<ParseResult<R>>(`/${resource}/import/parse`, fd)).data;
    },
    onSuccess: (r) => {
      setParsed(r);
      setExcluded(new Set());
      setOnlyErrors(false);
      if (!r.rows.length) toast.error(`The file has no ${noun.one} rows`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const ready = useMemo(() => (parsed?.rows ?? []).filter((r) => !r.errors.length && !excluded.has(r.row)), [parsed, excluded]);

  const run = useMutation({
    mutationFn: async () => {
      const rows = ready.map(({ errors: _e, row: _r, ...rest }) => rest);
      return (await api.post<ImportResult>(`/${resource}/bulk`, { [resource]: rows })).data;
    },
    onSuccess: (r) => {
      invalidateCompany(qc, cid);
      setResult(r);
      toast.success(`${count(r.created)} imported`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!can(`${resource}.import`)) return <NoAccess what={`importing ${many}`} />;

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return toast.error('Choose an Excel (.xlsx) or CSV file');
    setFileName(file.name);
    setResult(null);
    parse.mutate(file);
    if (input.current) input.current.value = '';
  };
  const reset = () => {
    setParsed(null);
    setResult(null);
    setFileName('');
    setExcluded(new Set());
  };
  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await api.download(`/${resource}/import/template`, undefined, `${resource}-import-template.xlsx`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  const step = result ? 3 : parsed ? 2 : 1;
  const rows = (parsed?.rows ?? []).filter((r) => !onlyErrors || r.errors.length);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link href={href(`/${resource}`)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label={`Back to ${many}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
            {title}
          </span>
        }
        description={description}
      />

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', i < step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : i === step ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500')}>
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600')}>{i < step ? '✓' : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {result ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">{count(result.created)} imported</h2>
          {doneNote && <p className="mt-1 text-sm text-slate-500">{doneNote}</p>}
          {result.skipped.length > 0 && (
            <div className="mx-auto mt-5 max-w-lg rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm">
              <p className="font-medium text-amber-800">{result.skipped.length} skipped</p>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-amber-800">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    <b>{s.name}</b>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Import another file
            </Button>
            <Button onClick={() => router.push(href(`/${resource}`))}>Go to {many}</Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-900">1. Download the template</p>
            <p className="mt-1 text-sm text-slate-500">{templateHelp}</p>
            <Button className="mt-4" variant="outline" onClick={downloadTemplate} loading={downloading}>
              {!downloading && <Download className="h-4 w-4" />} Download template (.xlsx)
            </Button>
          </Card>
          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-900">2. Upload your file</p>
            <div
              role="button"
              tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files);
              }}
              className={cn(
                'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
                dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50',
              )}
            >
              {parse.isPending ? <FileSpreadsheet className="h-8 w-8 animate-pulse text-blue-500" /> : <Upload className="h-8 w-8 text-slate-400" />}
              <p className="mt-2 text-sm font-medium text-slate-700">{parse.isPending ? `Reading ${fileName}…` : fileName ? `${fileName} (click to choose another)` : 'Drop the file here or click to browse'}</p>
              <p className="text-xs text-slate-500">Excel (.xlsx) or CSV, up to 5,000 rows</p>
            </div>
            <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => pick(e.target.files)} />
          </Card>
        </div>
      )}

      {parsed && !result && parsed.rows.length > 0 && (
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-900">3. Review</span>
              <Badge tone="green">{ready.length} ready</Badge>
              {parsed.invalid > 0 && <Badge tone="red">{parsed.invalid} with errors (skipped)</Badge>}
              {excluded.size > 0 && <Badge tone="slate">{excluded.size} excluded</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {parsed.invalid > 0 && <Checkbox checked={onlyErrors} onChange={setOnlyErrors} label="Show only rows with errors" />}
              <Button onClick={() => run.mutate()} loading={run.isPending} disabled={!ready.length}>
                Import {count(ready.length)}
              </Button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm" style={{ minWidth }}>
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2">Row</th>
                  {columns.map((c) => (
                    <th key={c.label} className={cn('px-3 py-2', c.align === 'right' && 'text-right')}>
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const bad = r.errors.length > 0;
                  const off = bad || excluded.has(r.row);
                  return (
                    <tr key={r.row} className={cn(bad ? 'bg-rose-50/50' : off ? 'opacity-50' : '')}>
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={!off}
                          disabled={bad}
                          onChange={(v) =>
                            setExcluded((s) => {
                              const n = new Set(s);
                              if (v) n.delete(r.row);
                              else n.add(r.row);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.row}</td>
                      {columns.map((c) => (
                        <td key={c.label} className={cn('px-3 py-2', c.align === 'right' && 'text-right')}>
                          {c.render(r)}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        {bad ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {r.errors.join(', ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {excluded.has(r.row) ? 'Excluded' : 'Ready'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
