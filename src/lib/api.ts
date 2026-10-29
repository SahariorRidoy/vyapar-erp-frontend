/**
 * Thin fetch wrapper around the Express API (proxied at /api/v1 by next.config.ts).
 * - sends cookies, the active company header and JSON
 * - transparently refreshes an expired access token once and retries
 * - throws ApiError with the server's message so UIs can toast it
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Paging of list endpoints (`pageMeta` on the server). */
export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/** `meta` of a list response: paging plus extras some lists add (summary, totals, unread…), typed per call through `M`. */
export type ApiMeta<M = unknown> = PageMeta & { [extra: string]: unknown } & M;

export interface ApiResult<T, M = unknown> {
  data: T;
  meta?: ApiMeta<M>;
  status: number;
}

let activeCompanyId: string | null = null;
export function setActiveCompany(id: string | null) {
  activeCompanyId = id;
}
export function getActiveCompany() {
  return activeCompanyId;
}

let refreshing: Promise<boolean> | null = null;
async function refreshSession() {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Query) {
  if (!params) return '';
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

const UNREACHABLE = 'The server is not responding. Check your connection and try again.';

/** Message for a failed response that did not come from the API itself (proxy or network errors). */
function transportError(status: number) {
  if (status === 413) return 'The file is too large to upload.';
  return status >= 500 ? UNREACHABLE : `Request failed (${status})`;
}

async function request<T, M = unknown>(method: string, path: string, body?: unknown, opts: { query?: Query; raw?: boolean; retry?: boolean } = {}): Promise<ApiResult<T, M>> {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (activeCompanyId) headers['X-Company-Id'] = activeCompanyId;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${qs(opts.query)}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, UNREACHABLE, 'NETWORK');
  }

  if (res.status === 401 && opts.retry !== false && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    if (await refreshSession()) return request<T, M>(method, path, body, { ...opts, retry: false });
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      // A full page load on purpose: it drops every cached query of the signed-out user.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    if (!res.ok) throw new ApiError(res.status, transportError(res.status));
    return { data: (await res.blob()) as T, status: res.status };
  }
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new ApiError(res.status, json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code, json?.error?.details);
  }
  return { data: json.data as T, meta: json.meta, status: res.status };
}

export const api = {
  get: <T, M = unknown>(path: string, query?: Query) => request<T, M>('GET', path, undefined, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string, query?: Query) => request<T>('DELETE', path, undefined, { query }),
  upload: async (files: File[] | FileList, context?: string) => {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    if (context) fd.append('context', context);
    return (await request<UploadedFile[]>('POST', '/files', fd)).data;
  },
  /** Downloads a binary response (Excel/CSV/JSON backup) and saves it with the server's filename. */
  download: async (path: string, query?: Query, fallbackName = 'download') => {
    const headers: Record<string, string> = {};
    if (activeCompanyId) headers['X-Company-Id'] = activeCompanyId;
    const get = () => fetch(`/api/v1${path}${qs(query)}`, { headers, credentials: 'include' }).catch(() => {
      throw new ApiError(0, UNREACHABLE, 'NETWORK');
    });
    let res = await get();
    if (res.status === 401 && (await refreshSession())) res = await get();
    if (!res.ok) {
      let msg = res.status >= 500 || res.status === 413 ? transportError(res.status) : `Download failed (${res.status})`;
      try {
        msg = (await res.json()).error.message;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    const cd = res.headers.get('content-disposition') ?? '';
    const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

export interface UploadedFile {
  _id: string;
  originalName: string;
  mime: string;
  size: number;
}

export const fileUrl = (id?: string | null, download = false) => (id ? `/api/v1/files/${id}${download ? '?download=1' : ''}` : '');

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
