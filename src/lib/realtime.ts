// Realtime client using agreed URL and resource/action event schema.
// URL: wss://<host>/ws?v=1&topics=arrivals,containers&token=<JWT>

export type RTEvent = {
  type: string;                 // e.g. 'containers.updated'
  resource?: string;            // 'containers' | 'arrivals' | 'system'
  action?: string;              // 'created' | 'updated' | 'deleted' | 'ping' | 'bulk'
  id?: number | string;
  ts?: string;
  v?: number;
  changes?: Record<string, any>;
  data?: Record<string, any>;
  by?: Record<string, any>;
  requestId?: string;
  events?: RTEvent[];           // for bulk
};

type Listener = (e: RTEvent) => void;

function deduceWsUrl(): string | null {
  // Prefer explicit VITE_WS_URL; otherwise derive from API base
  const explicit = (import.meta as any).env?.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const apiBase = ((import.meta as any).env?.VITE_API_BASE || "").toString().replace(/\/$/, "");
  if (!apiBase) {
    // default dev base
    return `ws://localhost:8081/ws?v=1&topics=arrivals,containers`;
  }
  try {
    const u = new URL(apiBase);
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${u.host}/ws?v=1&topics=arrivals,containers`;
  } catch {
    return null;
  }
}

class RealtimeBus {
  private listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private retries = 0;
  private keepaliveTimer: any = null;
  private readonly baseDelay = Number(((import.meta as any).env?.VITE_WS_BACKOFF_BASE_MS) ?? 1000);
  private readonly maxDelay = Number(((import.meta as any).env?.VITE_WS_BACKOFF_MAX_MS) ?? 30000);
  private readonly pingMs   = Number(((import.meta as any).env?.VITE_WS_KEEPALIVE_MS) ?? 20000);

  init() {
    const baseUrl = deduceWsUrl();
    if (!baseUrl) return;
    // Append token if present
    const token = safeGetToken();
    const url = token ? `${baseUrl}&token=${encodeURIComponent(token)}` : baseUrl;
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        // Reset backoff and start keepalive pings
        this.retries = 0;
        if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
        this.keepaliveTimer = setInterval(() => {
          try { this.ws?.send(JSON.stringify({ type: 'system.ping', ts: Date.now() })); } catch {}
        }, this.pingMs);
      };
      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
      this.ws.onclose = () => {
        if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
        this.scheduleReconnect();
      };
      this.ws.onerror = () => { /* silent */ };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(this.baseDelay * Math.pow(2, this.retries), this.maxDelay) + jitter;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.retries = Math.min(this.retries + 1, 10);
      this.init();
    }, delay);
  }

  private handleMessage(raw: any) {
    try {
      const msg = JSON.parse(raw);
      if (msg?.type === 'system.bulk' && Array.isArray(msg.events)) {
        msg.events.forEach((e: any) => this.emit(normalizeEvent(e)));
        return;
      }
      this.emit(normalizeEvent(msg));
    } catch {}
  }

  private emit(e: RTEvent) {
    this.listeners.forEach((fn) => {
      try { fn(e); } catch {}
    });
  }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

function safeGetToken(): string | null {
  try { return localStorage.getItem('token') || localStorage.getItem('access_token'); } catch { return null; }
}

function normalizeEvent(e: any): RTEvent {
  if (!e || typeof e !== 'object') return { type: 'system.unknown', v: 1 } as RTEvent;
  // If using shorthand like { resource:'containers', action:'updated', id, changes }
  if (!e.type && e.resource && e.action) {
    e.type = `${e.resource}.${e.action}`;
  }
  return e as RTEvent;
}

export const realtime = new RealtimeBus();

// React Query integration
import type { QueryClient } from '@tanstack/react-query';

export function wireRealtimeToQueryClient(qc: QueryClient) {
  try { realtime.init(); } catch {}
  realtime.on((evt) => {
    // Containers events
    if (evt.type === 'containers.updated' && evt.id) {
      const idNum = Number(evt.id);
      // Update any list caches that include this item
      qc.setQueriesData({ queryKey: ['containers'] }, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        let changed = false;
        const next = oldData.map((r: any) => {
          if (Number(r.id) !== idNum) return r;
          changed = true;
          return { ...r, ...(evt.changes || {}), ...(evt.data || {}) };
        });
        return changed ? next : oldData;
      });
      // Update item-level cache if present
      qc.setQueryData(['containers', idNum], (old: any) => old ? { ...old, ...(evt.changes || {}), ...(evt.data || {}) } : old);
    }
    if ((evt.type === 'containers.created' || evt.type === 'containers.deleted') && evt.resource === 'containers') {
      // Simpler approach: invalidate to refetch
      qc.invalidateQueries({ queryKey: ['containers'] }).catch(() => {});
      // Also invalidate analytics that depend on containers
      qc.invalidateQueries({ queryKey: ['analytics','containers'] }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['analytics'] }).catch(() => {});
    }

    // Arrivals events
    if (evt.type === 'arrivals.updated' && evt.id) {
      const idNum = Number(evt.id);
      qc.setQueriesData({ queryKey: ['arrivals'] }, (oldData: any) => {
        if (!Array.isArray(oldData)) return oldData;
        let changed = false;
        const next = oldData.map((r: any) => {
          if (Number(r.id) !== idNum) return r;
          changed = true;
          return { ...r, ...(evt.changes || {}), ...(evt.data || {}) };
        });
        return changed ? next : oldData;
      });
      // Update item-level cache if present
      qc.setQueryData(['arrivals', idNum], (old: any) => old ? { ...old, ...(evt.changes || {}), ...(evt.data || {}) } : old);
    }
    if ((evt.type === 'arrivals.created' || evt.type === 'arrivals.deleted') && evt.resource === 'arrivals') {
      qc.invalidateQueries({ queryKey: ['arrivals'] }).catch(() => {});
      // Invalidate arrivals analytics caches (any filter combos)
      qc.invalidateQueries({ queryKey: ['analytics','arrivals'] }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['analytics'] }).catch(() => {});
    }
  });
}

// Initialize without React Query (no-ops if not wired)
export function initRealtime() { try { realtime.init(); } catch {} }
