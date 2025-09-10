// Centralized API client + shared types for the Arrivals app.
// It covers auth, arrivals CRUD, bulk ops, activity, uploads, exports and email.
//
// Table cell utility classes for rendering Arrivals:
// - Use "px-2 py-1" for all <td>
// - ID column: <td className="px-2 py-1 text-xs text-gray-400 text-center">{arrival.id}</td>
// - Other columns: <td className="px-2 py-1 truncate">{...}</td> or add "whitespace-nowrap" as needed

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
  carrier: string;
  driver: string;
  plate: string;
  pickup_date: string;
  eta: string;
  transport_type: "truck" | "container" | "van" | "train";
  status?: "not_shipped" | "shipped" | "arrived";
  goods_cost: number;
  freight_cost: number;
  location: string;
  note?: string;
};

export type Arrival = Record<string, any> & {
  id: ID;
  supplier: string;
  carrier: string;
  driver: string;
  plate: string;
  pickup_date: string;
  eta: string;
  arrived_at?: string | null;
  transport_type: "truck" | "container" | "van" | "train";
  status: "not_shipped" | "shipped" | "arrived";
  goods_cost: number;
  freight_cost: number;
  location: string;
  note?: string | null;
  files: string[];
};

// Containers (kontejneri)
export type Container = {
  id?: ID;
  supplier: string;
  proforma?: string | null;
  etd?: string | null;            // YYYY-MM-DD
  delivery?: string | null;       // date or free text
  eta?: string | null;            // YYYY-MM-DD
  cargo_qty?: number | null;
  type?: string | null;           // e.g. 40HQ
  container_no?: string | null;
  goods?: string | null;          // "roba"
  container_price?: number | null;
  agent?: string | null;
  total?: number | null;
  deposit?: number | null;
  balance?: number | null;
  status?: "paid" | "unpaid" | "partial" | string | null;
  note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CreateContainerInput = Omit<Container, "id" | "created_at" | "updated_at">;

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
  if (res.status === 204) return undefined as unknown as T;
  if (!res.ok) {
    const payload = await parseMaybeJson(res);
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

  // ----- Containers -----
  listContainers: () =>
    http<Container[]>(`/api/containers`)
      .then((data) => data ?? [])
      .catch(() => []),

  getContainer: (id: ID) =>
    http<Container>(`/api/containers/${id}`)
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  createContainer: (data: CreateContainerInput) =>
    http<Container>(`/api/containers`, { method: "POST", body: JSON.stringify(data) })
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  updateContainer: (id: ID, patch: Partial<Container>) =>
    http<Container>(`/api/containers/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  deleteContainer: (id: ID) =>
    http<ApiResponse<{ deleted_id: ID }>>(`/api/containers/${id}`, { method: "DELETE" })
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  // Toggle paid/unpaid
  setContainerPaid: (id: ID, paid: boolean) =>
    http<Container>(`/api/containers/${id}/paid`, {
      method: "POST",
      body: JSON.stringify({ paid }),
    })
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  // Generic status setter (e.g., "paid", "unpaid", "partial", or custom)
  setContainerStatus: (id: ID, status: NonNullable<Container["status"]>) =>
    http<Container>(`/api/containers/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    })
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  // Files for a specific container
  listContainerFiles: (id: ID) =>
    http<Upload[]>(`/api/containers/${id}/files`)
      .then((data) => data ?? [])
      .catch(() => []),

  uploadContainerFile: (id: ID, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return http<Upload>(`/api/containers/${id}/files`, { method: "POST", body: fd })
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message }));
  },

  deleteContainerFile: (id: ID, uploadId: ID) =>
    http<{ ok: boolean }>(`/api/containers/${id}/files/${uploadId}`, { method: "DELETE" })
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  downloadContainerFile: (id: ID, uploadId: ID) =>
    httpBlob(`/api/containers/${id}/files/${uploadId}`)
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: (error as Error).message })),

  // ----- Arrivals -----
  listArrivals: () =>
    http<Arrival[]>(`/api/arrivals`)
      .then(data => data ?? [])
      .catch(() => []),

  getArrival: (id: ID) =>
    http<Arrival>(`/api/arrivals/${id}`)
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  createArrival: (data: CreateArrivalInput) =>
    http<Arrival>(`/api/arrivals`, { method: "POST", body: JSON.stringify(data) })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  updateArrival: (id: ID, patch: Partial<Arrival>) =>
    http<Arrival>(`/api/arrivals/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  bulkUpdate: (ids: ID[], patch: Partial<Arrival>) =>
    http<Arrival[]>(`/api/arrivals/bulk`, { method: "POST", body: JSON.stringify({ ids, patch }) })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  // Delete with graceful fallback (prefer explicit POST route first)
  deleteArrival: async (id: ID): Promise<ApiResponse<{ deleted_id: ID }>> => {
    // 1) Preferred explicit delete POST route
    try {
      const resp = await http<ApiResponse<{ deleted_id: ID }>>(`/api/arrivals/${id}/delete`, { method: "POST" });
      if (resp?.data?.deleted_id != null) return { ok: true, data: resp.data };
    } catch (e) {
      // swallow and try next strategy
    }
    // 2) Standard RESTful delete
    try {
      const resp = await http<ApiResponse<{ deleted_id: ID }>>(`/api/arrivals/${id}`, { method: "DELETE" });
      return { ok: true, data: resp.data ?? { deleted_id: id } };
    } catch (e) {
      // 3) Bulk-delete single id as last resort
      try {
        const resp = await http<ApiResponse<{ deleted_ids: ID[] }>>(`/api/arrivals/bulk-delete`, {
          method: "POST",
          body: JSON.stringify({ ids: [id] }),
        });
        return { ok: true, data: { deleted_id: resp?.data?.deleted_ids?.[0] ?? id } };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    }
  },

  bulkDelete: async (ids: ID[]): Promise<ApiResponse<{ deleted_ids: ID[] }>> => {
    // 1) Preferred explicit delete POST route
    try {
      const resp = await http<ApiResponse<{ deleted_ids: ID[] }>>(`/api/arrivals/delete`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (resp?.data?.deleted_ids) return { ok: true, data: resp.data };
    } catch (e) {
      // ignore and try next
    }
    // 2) Alternate bulk-delete route
    try {
      const resp = await http<ApiResponse<{ deleted_ids: ID[] }>>(`/api/arrivals/bulk-delete`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      if (resp?.data?.deleted_ids) return { ok: true, data: resp.data };
    } catch (e) {
      // ignore and try next
    }
    // 3) RESTful bulk DELETE as last resort
    try {
      const resp = await http<ApiResponse<{ deleted_ids: ID[] }>>(`/api/arrivals/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      return { ok: true, data: resp.data ?? { deleted_ids: ids } };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  },

  // ----- Activity -----
  listActivity: (arrivalId: ID) =>
    http<Activity[]>(`/api/arrivals/${arrivalId}/activity`)
      .then(data => data ?? [])
      .catch(() => []),

  postActivity: (arrivalId: ID, action: string, payload?: Record<string, any>) =>
    http<Activity>(`/api/arrivals/${arrivalId}/activity`, { method: "POST", body: JSON.stringify({ action, payload }) })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  // ----- Files -----
  listUploads: (arrivalId: ID) =>
    http<Upload[]>(`/api/arrivals/${arrivalId}/files`)
      .then(data => data ?? [])
      .catch(() => []),

  uploadFile: (arrivalId: ID, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return http<Upload>(`/api/arrivals/${arrivalId}/files`, { method: "POST", body: fd })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message }));
  },

  deleteFile: (arrivalId: ID, uploadId: ID) =>
    http<{ ok: boolean }>(`/api/arrivals/${arrivalId}/files/${uploadId}`, { method: "DELETE" })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  downloadFile: (arrivalId: ID, uploadId: ID) =>
    httpBlob(`/api/arrivals/${arrivalId}/files/${uploadId}`)
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  // ----- Users -----
  listUsers: () =>
    http<User[]>(`/api/users`)
      .then(data => data ?? [])
      .catch(() => []),

  createUser: (user: Partial<User> & { password: string }) =>
    http<User>(`/api/users`, { method: "POST", body: JSON.stringify(user) })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  updateUser: (id: ID, patch: Partial<User> & { password?: string }) =>
    http<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  deleteUser: (id: ID) =>
    http<ApiResponse<{ deleted_id: ID }>>(`/api/users/${id}`, { method: "DELETE" })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  // ----- Export -----
  export: (format: "csv" | "pdf" | "xlsx", ids?: ID[]) =>
    httpBlob(`/api/arrivals/export/${format}${ids?.length ? `?ids=${encodeURIComponent(ids.join(","))}` : ""}`),

  // ----- Email -----
  shareByEmail: (payload: { to: string; subject?: string; message?: string; arrival_ids?: ID[] }) =>
    http<ApiResponse<null>>(`/api/share/email`, { method: "POST", body: JSON.stringify(payload) })
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),

  // ----- Header helpers (NEW) -----
  searchContainers: async (query: string) => {
    // 1) Try dedicated search endpoint
    try {
      const r = await http<Container[]>(`/api/containers/search?q=${encodeURIComponent(query)}`);
      return r ?? [];
    } catch {
      // 2) fallback: filter client-side
      try {
        const all = await http<Container[]>(`/api/containers`);
        const q = query.toLowerCase();
        return (all ?? []).filter(r => {
          const vals = [
            r.id, r.container_no, r.supplier, r.proforma, r.agent, r.eta, r.etd, r.delivery
          ].filter(Boolean).map(String);
          return vals.some(v => v.toLowerCase().includes(q));
        });
      } catch {
        return [];
      }
    }
  },

  getNotifications: async (): Promise<Array<{id:number;text:string;read?:boolean}>> => {
    try {
      return await http<Array<{id:number;text:string;read?:boolean}>>(`/api/notifications`);
    } catch {
      // fallback demo data
      return [
        { id: 1, text: "Nova pošiljka je stigla (CN-123)", read: false },
        { id: 2, text: "Dug je plaćen (INV-4578)", read: false },
        { id: 3, text: "ETA promijenjen za CN-987", read: true },
      ];
    }
  },

  // ----- Settings & Account (compat) -----
  // These helpers try modern "/api/..." endpoints first and gracefully fall back
  // to legacy non-prefixed routes used by the older backend ("/general", "/me", 
  // "/notifications", "/sessions"). This avoids 401/405 noise when the
  // frontend and backend are slightly out of sync.

  // General (system) settings
  _getGeneral: async (): Promise<Record<string, any>> => {
    // Try modern route
    try { return await http<Record<string, any>>(`/api/general`); } catch {}
    // Fallback legacy route
    return await http<Record<string, any>>(`/general`);
  },
  _saveGeneral: async (payload: Record<string, any>): Promise<{ ok: boolean } & { data?: any; error?: string }> => {
    // Prefer PATCH on modern API, then POST, then legacy POST.
    try { const d = await http<any>(`/api/general`, { method: "PATCH", body: JSON.stringify(payload) }); return { ok: true, data: d }; } catch {}
    try { const d = await http<any>(`/api/general`, { method: "POST", body: JSON.stringify(payload) }); return { ok: true, data: d }; } catch {}
    try { const d = await http<any>(`/general`, { method: "POST", body: JSON.stringify(payload) }); return { ok: true, data: d }; } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  },

  // Current user (account/me)
  meCompat: async (): Promise<User | null> => {
    try { return await http<User>(`/auth/me`); } catch {}
    try { return await http<User>(`/me`); } catch { return null; }
  },

  // Active sessions list (for Security settings)
  listSessions: async (): Promise<Array<{ id: ID; ip?: string; ua?: string; last_seen?: string }>> => {
    try { return await http<Array<{ id: ID; ip?: string; ua?: string; last_seen?: string }>>(`/api/sessions`); } catch {}
    try { return await http<Array<{ id: ID; ip?: string; ua?: string; last_seen?: string }>>(`/sessions`); } catch { return []; }
  },

  // Notifications (compat wrapper used by Settings)
  getNotificationsCompat: async (): Promise<Array<{id:number;text:string;read?:boolean}>> => {
    try { return await http<Array<{id:number;text:string;read?:boolean}>>(`/api/notifications`); } catch {}
    try { return await http<Array<{id:number;text:string;read?:boolean}>>(`/notifications`); } catch { return []; }
  },

  // ----- Health -----
  health: () =>
    http<{ ok: boolean }>(`/health`)
      .then(data => ({ ok: true, data }))
      .catch(error => ({ ok: false, error: (error as Error).message })),
};

// Containers export
export const containersExport = (format: "csv" | "xlsx" | "pdf", ids?: ID[]) =>
  httpBlob(`/api/containers/export/${format}${ids?.length ? `?ids=${encodeURIComponent(ids.join(","))}` : ""}`);

// ---- Compatibility shim: some modules import { deleteContainer } directly ----
export async function deleteContainer(id: ID) {
  return api.deleteContainer(id);
}