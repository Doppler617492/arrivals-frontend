// src/api/client.ts
const RAW_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8081";
export const API_BASE = RAW_BASE.replace(/\/+$/, ""); // bez završnog '/'

export const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

export function getToken() { return localStorage.getItem("token"); }
export function setToken(t: string | null) { !t ? localStorage.removeItem("token") : localStorage.setItem("token", t); }

export function qs(params: Record<string, any>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.set(k, String(v)); });
  return u.toString();
}

function makeUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
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
    const res = await fetch(makeUrl(path), {
      headers: {
        Accept: "application/json",
        ...(auth ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
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
    const res = await fetch(makeUrl(path), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(opts?.auth ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(opts?.useApiKey && API_KEY ? { "X-API-Key": API_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal: t?.signal,
    });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}

/* -------------------------------- PATCH -------------------------------- */
export async function apiPATCH<T>(path: string, body: any, auth = false): Promise<T> {
  const t = withTimeout(30_000);
  try {
    const res = await fetch(makeUrl(path), {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify(body),
      signal: t?.signal,
    });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}

/* -------------------------------- DELETE ------------------------------- */
export async function apiDELETE<T>(path: string, auth = false): Promise<T> {
  const t = withTimeout(30_000);
  try {
    const res = await fetch(makeUrl(path), {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        ...(auth ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      signal: t?.signal,
    });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}

/* -------------------------------- UPLOAD ------------------------------- */
export async function apiUPLOAD<T>(path: string, form: FormData, auth = false): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) headers["Authorization"] = `Bearer ${getToken()}`;
  const t = withTimeout(60_000);
  try {
    const res = await fetch(makeUrl(path), { method: "POST", headers, body: form, signal: t?.signal });
    return await handleJson<T>(res);
  } finally { t?.done?.(); }
}