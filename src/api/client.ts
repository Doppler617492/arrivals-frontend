// src/api/client.ts
const RAW_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8081";
export const API_BASE = RAW_BASE.replace(/\/+$/, ""); // bez završnog '/'

export const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;
const AUTH_COOKIES = String(import.meta.env.VITE_AUTH_COOKIES || "0").toLowerCase() === "1";

export function getToken() { return localStorage.getItem("token"); }

function ensureAuth(): string {
  const t = getToken();
  if (!t) {
    // Do not send requests with "Bearer null"; block early with a clear error
    try { window.dispatchEvent(new CustomEvent('auth:missing')); } catch {}
    throw new Error("401 Unauthorized: missing token");
  }
  return t;
}
export function setToken(t: string | null, remember: boolean = true) {
  if (!t) {
    try { localStorage.removeItem("token"); localStorage.removeItem("access_token"); } catch {}
    try { sessionStorage.removeItem("token"); sessionStorage.removeItem("access_token"); } catch {}
    return;
  }
  try {
    if (remember) {
      localStorage.setItem("token", t);
      localStorage.setItem("access_token", t);
    } else {
      sessionStorage.setItem("token", t);
      sessionStorage.setItem("access_token", t);
    }
  } catch {}
}

export function qs(params: Record<string, any>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.set(k, String(v)); });
  return u.toString();
}

function makeUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}

function getCookie(name: string): string | undefined {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()\[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : undefined;
  } catch { return undefined; }
}

/* ------------------------------ internals ------------------------------ */
async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 || res.status === 422) localStorage.removeItem("token");
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  const len = res.headers.get("content-length");
  if (res.status === 204 || len === "0") {
    return ({ ok: true } as unknown) as T;
  }
  if (!ct.includes("application/json")) {
    // pokušaj JSON, ako ne može — vrati {ok:true}
    const text = await res.text();
    try { return JSON.parse(text) as T; } catch { return ({ ok: true } as unknown) as T; }
  }
  return res.json();
}

function withTimeout(ms?: number) {
  if (!ms) return undefined;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(id) };
}

/* --------------------------------- GET --------------------------------- */
export async function apiGET<T>(path: string, auth = false): Promise<T> {
  const t = withTimeout(30_000);
  try {
    const token = auth ? ensureAuth() : undefined;
    const res = await fetch(makeUrl(path), {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: AUTH_COOKIES ? 'include' : undefined,
      signal: t?.signal,
    });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}

/* --------------------------------- POST -------------------------------- */
export async function apiPOST<T>(
  path: string,
  body: any,
  opts?: { auth?: boolean; useApiKey?: boolean }
): Promise<T> {
  const t = withTimeout(30_000);
  try {
    const url = makeUrl(path);
    const token = opts?.auth ? ensureAuth() : undefined;
    let res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts?.useApiKey && API_KEY ? { "X-API-Key": API_KEY } : {}),
        ...(AUTH_COOKIES ? { 'X-CSRF-TOKEN': getCookie('csrf_access_token') || '' } : {}),
      },
      body: JSON.stringify(body),
      credentials: AUTH_COOKIES ? 'include' : undefined,
      signal: t?.signal,
    });
    // Fallback #1: some servers require trailing slash for POST (405/308)
    if (!res.ok && (res.status === 405 || res.status === 308)) {
      const hasSlash = /\/$/.test(url);
      const toggled = hasSlash ? url.replace(/\/$/, "") : `${url}/`;
      res = await fetch(toggled, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts?.useApiKey && API_KEY ? { "X-API-Key": API_KEY } : {}),
          ...(AUTH_COOKIES ? { 'X-CSRF-TOKEN': getCookie('csrf_access_token') || '' } : {}),
        },
        body: JSON.stringify(body),
        credentials: AUTH_COOKIES ? 'include' : undefined,
        signal: t?.signal,
      });
    }
    // Fallback #2: explicit create endpoint for arrivals if still 405
    if (!res.ok && res.status === 405 && /\/api\/arrivals\/?$/.test(url)) {
      const alt = url.replace(/\/api\/arrivals\/?$/, "/api/arrivals/create");
      res = await fetch(alt, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts?.useApiKey && API_KEY ? { "X-API-Key": API_KEY } : {}),
          ...(AUTH_COOKIES ? { 'X-CSRF-TOKEN': getCookie('csrf_access_token') || '' } : {}),
        },
        body: JSON.stringify(body),
        credentials: AUTH_COOKIES ? 'include' : undefined,
        signal: t?.signal,
      });
    }
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}

/* -------------------------------- PATCH -------------------------------- */
export async function apiPATCH<T>(path: string, body: any, auth = false): Promise<T> {
  const t = withTimeout(30_000);
  try {
    const token = auth ? ensureAuth() : undefined;
    const res = await fetch(makeUrl(path), {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(AUTH_COOKIES ? { 'X-CSRF-TOKEN': getCookie('csrf_access_token') || '' } : {}),
      },
      body: JSON.stringify(body),
      credentials: AUTH_COOKIES ? 'include' : undefined,
      signal: t?.signal,
    });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}

/* -------------------------------- DELETE ------------------------------- */
export async function apiDELETE<T>(path: string, auth = false): Promise<T> {
  const t = withTimeout(30_000);
  try {
    const token = auth ? ensureAuth() : undefined;
    const res = await fetch(makeUrl(path), {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(AUTH_COOKIES ? { 'X-CSRF-TOKEN': getCookie('csrf_access_token') || '' } : {}),
      },
      credentials: AUTH_COOKIES ? 'include' : undefined,
      signal: t?.signal,
    });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}

/* -------------------------------- UPLOAD ------------------------------- */
export async function apiUPLOAD<T>(path: string, form: FormData, auth = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) {
    const token = ensureAuth();
    headers["Authorization"] = `Bearer ${token}`;
  }
  const t = withTimeout(60_000);
  try {
    const res = await fetch(makeUrl(path), { method: "POST", headers: {
      ...headers,
      ...(AUTH_COOKIES ? { 'X-CSRF-TOKEN': getCookie('csrf_access_token') || '' } : {}),
    }, body: form, signal: t?.signal, credentials: AUTH_COOKIES ? 'include' : undefined });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}
