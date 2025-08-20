// Centralized API client + shared types for the Arrivals app.
// It covers auth, arrivals CRUD, bulk ops, activity, uploads, exports and email.

// ==================
// Shared type models
// ==================
export type ID = string | number;
export type Role = "admin" | "planer" | "proizvodnja" | "transport" | "carina";

export type User = {
  id: ID;
  name: string;
  email: string;
  role: Role;
};

export type LoginResponse = {
  access_token: string;
  user: User;
};

export type CreateArrivalInput = {
  supplier: string;
  plate: string;
  type: "truck" | "container" | "van" | "other";
  carrier?: string;
  note?: string;
  status?: "announced" | "arrived" | "delayed" | "cancelled";
};

export type Arrival = Record<string, any> & {
  id?: ID;
  supplier?: string;
  plate?: string;
  type?: string;
  carrier?: string | null;
  note?: string | null;
  status?: string;
  created_at?: string;
  eta?: string | null;
};

export type Activity = {
  id: ID;
  arrival_id: ID;
  actor_id: ID | null;
  actor_email?: string | null;
  action: string; // e.g. "status_changed", "note_added", "file_uploaded"
  payload?: Record<string, any>;
  created_at: string;
};

export type Upload = {
  id: ID;
  arrival_id: ID;
  filename: string;
  original_name: string;
  size: number;
  content_type?: string;
  created_at: string;
};

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

// ==========
// Base setup
// ==========
// Default to localhost:8081 if not provided
const defaultBase = "http://localhost:8081";
const base = ((import.meta as any).env?.VITE_API_BASE ?? defaultBase).replace(/\/$/, "");

export function getToken() {
  try { return localStorage.getItem("token"); } catch { return null; }
}

export function setToken(value: string | null) {
  try {
    if (value) localStorage.setItem("token", value);
    else localStorage.removeItem("token");
  } catch {}
}

function makeHeaders(init?: RequestInit) {
  const token = getToken();
  const isFormData = init?.body instanceof FormData;
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers ?? {}),
  } as Record<string, string>;
}

async function parseMaybeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await res.json(); } catch {}
  }
  try { return await res.text(); } catch { return ""; }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, { ...init, headers: makeHeaders(init) });

  // 204 No Content support
  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    const payload = await parseMaybeJson(res);
    // If JWT expired/invalid, drop token so UI can redirect to login
    if (res.status === 401 || res.status === 422) setToken(null);
    const message = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(JSON.stringify({ status: res.status, message }));
  }

  return (await parseMaybeJson(res)) as T;
}

async function httpBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(`${base}${path}`, { ...init, headers: makeHeaders(init) });
  if (!res.ok) {
    const msg = await parseMaybeJson(res);
    if (res.status === 401 || res.status === 422) setToken(null);
    throw new Error(JSON.stringify({ status: res.status, message: msg }));
  }
  return await res.blob();
}

export async function safeText(res: Response) {
  try { return await res.text(); } catch { return ""; }
}

// ==========
// API surface
// ==========
export const api = {
  // ----- Auth -----
  login: (email: string, password: string) =>
    http<LoginResponse>(`/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) })
      .then((data) => { setToken(data.access_token); return data; }),
  me: () => http<User>(`/auth/me`),
  logout: () => { setToken(null); return Promise.resolve(); },

  // ----- Arrivals -----
  listArrivals: () => http<Arrival[]>(`/api/arrivals`),
  getArrival: (id: ID) => http<Arrival>(`/api/arrivals/${id}`),
  createArrival: (data: CreateArrivalInput) => http<Arrival>(`/api/arrivals`, { method: "POST", body: JSON.stringify(data) }),
  updateArrival: (id: ID, patch: Partial<Arrival>) => http<Arrival>(`/api/arrivals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  bulkUpdate: (ids: ID[], patch: Partial<Arrival>) => http<Arrival[]>(`/api/arrivals/bulk`, { method: "POST", body: JSON.stringify({ ids, patch }) }),

  // Primary delete (matches backend DELETE /api/arrivals/<id>), with graceful fallback
  deleteArrival: async (id: ID) => {
    try {
      return await http<ApiResponse<{ deleted_id: ID }>>(`/api/arrivals/${id}`, { method: "DELETE" });
    } catch (e) {
      // If DELETE is not allowed (405) or route missing (404), fallback to POST /api/arrivals/bulk-delete
      let status: number | undefined;
      try {
        const parsed = JSON.parse((e as Error).message);
        status = parsed?.status;
      } catch {}
      if (status === 405 || status === 404) {
        const resp = await http<ApiResponse<{ deleted_ids: ID[] }>>(`/api/arrivals/bulk-delete`, {
          method: "POST",
          body: JSON.stringify({ ids: [id] }),
        });
        // normalize shape to match single delete caller expectations
        return { ok: resp.ok, data: { deleted_id: (resp as any).data?.deleted_ids?.[0] ?? id } } as ApiResponse<{ deleted_id: ID }>;
      }
      throw e;
    }
  },

  // Some servers/frameworks dislike DELETE bodies; try DELETE with JSON, then fall back to POST bulk-delete
  bulkDelete: async (ids: ID[]) => {
    try {
      return await http<ApiResponse<{ deleted_ids: ID[] }>>(`/api/arrivals/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
    } catch (e) {
      // If method not allowed or route missing, try a compatible fallback
      const err = ((): { status?: number } => { try { return JSON.parse((e as Error).message); } catch { return {}; } })();
      if (err?.status === 405 || err?.status === 404) {
        return await http<ApiResponse<{ deleted_ids: ID[] }>>(`/api/arrivals/bulk-delete`, {
          method: "POST",
          body: JSON.stringify({ ids }),
        });
      }
      throw e;
    }
  },

  // ----- Activity (Updates tab) -----
  listActivity: (arrivalId: ID) => http<Activity[]>(`/api/arrivals/${arrivalId}/activity`),
  postActivity: (arrivalId: ID, action: string, payload?: Record<string, any>) =>
    http<Activity>(`/api/arrivals/${arrivalId}/activity`, { method: "POST", body: JSON.stringify({ action, payload }) }),

  // ----- File uploads (CRM / docs) -----
  listUploads: (arrivalId: ID) => http<Upload[]>(`/api/arrivals/${arrivalId}/files`),
  uploadFile: (arrivalId: ID, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return http<Upload>(`/api/arrivals/${arrivalId}/files`, { method: "POST", body: fd });
  },
  deleteFile: (arrivalId: ID, uploadId: ID) => http<{ ok: boolean }>(`/api/arrivals/${arrivalId}/files/${uploadId}`, { method: "DELETE" }),
  downloadFile: (arrivalId: ID, uploadId: ID) => httpBlob(`/api/arrivals/${arrivalId}/files/${uploadId}`),

  // ----- Users & roles -----
  listUsers: () => http<User[]>(`/api/users`),
  createUser: (user: Partial<User> & { password: string }) => http<User>(`/api/users`, { method: "POST", body: JSON.stringify(user) }),
  updateUser: (id: ID, patch: Partial<User> & { password?: string }) => http<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteUser: (id: ID) => http<ApiResponse<{ deleted_id: ID }>>(`/api/users/${id}`, { method: "DELETE" }),

  // ----- Export (CSV / PDF / XLSX) -----
  export: (format: "csv" | "pdf" | "xlsx", ids?: ID[]) =>
    httpBlob(`/api/arrivals/export/${format}${ids?.length ? `?ids=${encodeURIComponent(ids.join(","))}` : ""}`),

  // ----- Email share -----
  shareByEmail: (payload: { to: string; subject?: string; message?: string; arrival_ids?: ID[] }) =>
    http<ApiResponse<null>>(`/api/share/email`, { method: "POST", body: JSON.stringify(payload) }),

  // ----- Health -----
  health: () => http<{ ok: boolean }>(`/health`),
};
