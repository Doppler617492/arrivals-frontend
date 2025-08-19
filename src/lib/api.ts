// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8081';
const API_KEY  = import.meta.env.VITE_API_KEY  || '';


async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers || {});
  headers.set('Content-Type', 'application/json');
  if (API_KEY) headers.set('X-API-Key', API_KEY);

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export type Arrival = {
  id: number;
  supplier: string;
  carrier?: string | null;
  plate: string;
  type: 'truck' | 'container' | 'van';
  eta?: string | null;
  status: 'announced' | 'arrived' | 'delayed';
  note?: string | null;
  created_at: string;
};

export const api = {
  list: () => request<Arrival[]>('/api/arrivals'),
  create: (data: Partial<Arrival>) =>
    request<Arrival>('/api/arrivals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Arrival>) =>
    request<Arrival>(`/api/arrivals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

export { API_BASE, API_KEY };