// Centralized fetch client for the Django REST API.
// Reads VITE_API_BASE_URL, attaches JWT Bearer, disables HTTP caching,
// and transparently refreshes on 401.

const DEFAULT_BASE = "http://127.0.0.1:8000/api";
export const API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ||
  DEFAULT_BASE;

const ACCESS_KEY = "pharmacare.access";
const REFRESH_KEY = "pharmacare.refresh";

function isBrowser() {
  return typeof window !== "undefined";
}

export const tokenStore = {
  getAccess(): string | null {
    return isBrowser() ? localStorage.getItem(ACCESS_KEY) : null;
  },
  getRefresh(): string | null {
    return isBrowser() ? localStorage.getItem(REFRESH_KEY) : null;
  },
  set(access: string, refresh?: string) {
    if (!isBrowser()) return;
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    if (!isBrowser()) return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path: string, query?: Record<string, unknown>) {
  const base = API_BASE_URL.replace(/\/$/, "");
  const url = new URL(
    path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`,
  );
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

async function parseError(res: Response): Promise<ApiError> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    try {
      data = await res.text();
    } catch {
      /* ignore */
    }
  }
  let message: string | null = null;
  if (typeof data === "string") {
    message = data;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === "string") {
      message = obj.detail;
    } else {
      // DRF field errors: { field: ["err1", "err2"], ... }
      const parts: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const vals = Array.isArray(v) ? v.map(String) : [String(v)];
        parts.push(`${k}: ${vals.join(", ")}`);
      }
      if (parts.length) message = parts.join(" | ");
    }
  }
  return new ApiError(message || `Request failed (${res.status})`, res.status, data);
}

let refreshing: Promise<string | null> | null = null;
async function tryRefresh(): Promise<string | null> {
  if (refreshing) return refreshing;
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;
  refreshing = (async () => {
    try {
      const res = await fetch(buildUrl("/auth/refresh/"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { access?: string; refresh?: string };
      if (json.access) {
        tokenStore.set(json.access, json.refresh);
        return json.access;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

export async function apiFetch<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, headers = {}, signal, skipAuth } = opts;

  const doFetch = async (token: string | null) => {
    const finalHeaders: Record<string, string> = {
      Accept: "application/json",
      ...headers,
    };
    if (body !== undefined && !(body instanceof FormData)) {
      finalHeaders["Content-Type"] = "application/json";
    }
    if (token && !skipAuth) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }
    const url = buildUrl(path, query);
    try {
      return await fetch(url, {
        method,
        cache: "no-store",
        headers: finalHeaders,
        body:
          body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new Error(
        `Cannot reach the API at ${url}. Check that the Django server is running and that CORS allows this origin.`,
      );
    }
  };

  const token = skipAuth ? null : tokenStore.getAccess();
  let res = await doFetch(token);

  if (res.status === 401 && !skipAuth) {
    const newToken = await tryRefresh();
    if (newToken) {
      res = await doFetch(newToken);
    } else {
      tokenStore.clear();
      if (isBrowser() && !window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

/**
 * Fetch a binary asset (PDF, etc.) from the API with auth headers attached.
 * Returns an object URL the caller is responsible for revoking.
 */
export async function apiFetchBlobUrl(
  path: string,
  opts: { query?: Record<string, unknown>; accept?: string } = {},
): Promise<{ url: string; blob: Blob; filename?: string }> {
  const headers: Record<string, string> = {
    Accept: opts.accept ?? "*/*",
  };
  const token = tokenStore.getAccess();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(buildUrl(path, opts.query), {
    method: "GET",
    cache: "no-store",
    headers,
  });

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(buildUrl(path, opts.query), {
        method: "GET",
        cache: "no-store",
        headers,
      });
    }
  }

  if (!res.ok) throw await parseError(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  // Try to read filename from Content-Disposition
  let filename: string | undefined;
  const cd = res.headers.get("content-disposition");
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    if (m) filename = decodeURIComponent(m[1]);
  }

  return { url, blob, filename };
}
