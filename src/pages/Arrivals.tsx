import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { FileIcon, TruckIcon, Filter, RotateCcw, Search, Plus, Calendar, Upload, Trash2 } from "lucide-react";
import ArrivalModal from "../components/ArrivalModal";
import type { Arrival } from "../components/ArrivalCard";

const statusMeta: Record<Arrival["status"], { label: string; badge: string; accent: string }> = {
  not_shipped: { label: "Najavljeno", badge: "bg-gray-300 text-gray-800", accent: "bg-gray-100" },
  shipped: { label: "U transportu", badge: "bg-blue-500 text-white", accent: "bg-blue-50" },
  arrived: { label: "Stiglo", badge: "bg-green-500 text-white", accent: "bg-green-50" },
};

const transportOptions = [
  { v: "", label: "Sve vrste" },
  { v: "truck", label: "Kamion" },
  { v: "container", label: "Kontejner" },
  { v: "van", label: "Kombi" },
  { v: "train", label: "Voz" },
];

export type LocationOption = { v: string; label: string };

export const locationOptions: LocationOption[] = [
  { v: "", label: "Sve lokacije" },
  { v: "Veleprodajni Magacin", label: "Veleprodajni Magacin" },
  { v: "Carinsko Skladiste", label: "Carinsko Skladiste" },
  { v: "Pg Centar", label: "Pg Centar" },
  { v: "Pg", label: "Pg" },
  { v: "Bar", label: "Bar" },
  { v: "Bar Centar", label: "Bar Centar" },
  { v: "Budva", label: "Budva" },
  { v: "Kotor Centar", label: "Kotor Centar" },
  { v: "Herceg Novi", label: "Herceg Novi" },
  { v: "Herceg Novi Centar", label: "Herceg Novi Centar" },
  { v: "Niksic", label: "Niksic" },
  { v: "Bijelo polje", label: "Bijelo polje" },
  { v: "Ulcinj Centar", label: "Ulcinj Centar" },
  { v: "Horeca", label: "Horeca" },
];

export const responsibleOptions = ["Ludvig", "Gazi", "Gezim", "Armir", "Rrezart", "Beki"];

export const allLocationValues = Array.from(new Set(locationOptions.filter(o => o.v).map(o => o.v))).sort((a, b) =>
  a.localeCompare(b, "sr", { sensitivity: "base" })
);

// Normalize various backend status strings into our 3 buckets
function normalizeStatus(s: any): "not_shipped" | "shipped" | "arrived" {
  const v = String(s || "").toLowerCase().replace(/\s+/g, "_");
  if (v === "announced" || v === "not_shipped" || v === "not-shipped" || v === "notshipped") return "not_shipped";
  if (v === "in_transit" || v === "in-transit" || v === "intransit" || v === "shipped") return "shipped";
  if (v === "arrived") return "arrived";
  return "not_shipped";
}

const API_BASE =
  import.meta.env.DEV
    ? ""
    : (import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "");

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "-");
const fmtMoney = (n?: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);

// --- Lokalni store notifikacija (localStorage) ---
type Noti = { id: string; text: string; unread: boolean; at: number };
const LS_NOTIFS = "arrivals_notifications";
function readNotifs(): Noti[] {
  try { const raw = localStorage.getItem(LS_NOTIFS); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch { return []; }
}
function writeNotifs(list: Noti[]) {
  try { localStorage.setItem(LS_NOTIFS, JSON.stringify(list)); window.dispatchEvent(new Event("notifications-changed")); } catch {}
}
function pushNotif(text: string) {
  const list = readNotifs();
  list.unshift({ id: crypto.randomUUID?.() || String(Date.now()), text, unread: true, at: Date.now() });
  writeNotifs(list);
}
// Sprječavanje duplih deadline notifikacija
const LS_SEEN = "arrivals_deadline_seen";
function readSeen(): Record<string, number> { try { return JSON.parse(localStorage.getItem(LS_SEEN) || "{}"); } catch { return {}; } }
function writeSeen(map: Record<string, number>) { try { localStorage.setItem(LS_SEEN, JSON.stringify(map)); } catch {} }
function checkDeadlines(list: Arrival[]) {
  const seen = readSeen();
  const now = new Date();
  for (const a of list) {
    const id = a.id;
    // Pickup rok: prošao, a status još Najavljeno
    if (a.pickup_date && normalizeStatus(a.status) === "not_shipped") {
      const pd = new Date(a.pickup_date);
      if (!isNaN(+pd) && pd < now) {
        const key = `${id}:pickup_overdue`;
        if (!seen[key]) {
          pushNotif(`Rok za preuzimanje je prošao (#${id}, ${a.supplier || "pošiljka"})`);
          seen[key] = Date.now();
        }
      }
    }
    // ETA rok: prošao, a status još U transportu
    if (a.eta && normalizeStatus(a.status) === "shipped") {
      const ed = new Date(a.eta);
      if (!isNaN(+ed) && ed < now) {
        const key = `${id}:eta_overdue`;
        if (!seen[key]) {
          pushNotif(`Rok za dolazak je prošao (#${id}, ${a.supplier || "pošiljka"})`);
          seen[key] = Date.now();
        }
      }
    }
  }
  writeSeen(seen);
}

async function httpJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include", // send cookies/session if backend uses them
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} :: ${body}`);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? await res.json() : (await res.text() as any)) as T;
}

export default function ArrivalsPage() {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusF, setStatusF] = useState<"" | Arrival["status"]>("");
  const [transportF, setTransportF] = useState("");
  const [locationF, setLocationF] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [active, setActive] = useState<Arrival | null>(null);

  // Expose the same location lists used by the filter to the whole app (ArrivalModal, etc.)
  useEffect(() => {
    try {
      // raw values without the empty "Sve lokacije"
      (window as any).ALL_LOCATIONS = allLocationValues;
      // option objects (label + value) without the empty one
      (window as any).LOCATION_OPTIONS = locationOptions.filter(o => o.v);

      // Let any listeners know locations are ready/updated
      window.dispatchEvent(new CustomEvent("locations-set", { detail: { values: (window as any).ALL_LOCATIONS, options: (window as any).LOCATION_OPTIONS } }));
    } catch {}
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const inRange = (iso: string) => {
      if (!iso) return true;
      const d = iso.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    };
    return arrivals.filter((a) => {
      if (statusF && a.status !== statusF) return false;
      if (transportF && a.transport_type !== transportF) return false;
      if (locationF && a.location?.toLowerCase() !== locationF.toLowerCase()) return false;
      if (!inRange(a.eta || "")) return false;
      if (ql) {
        const hay = [a.supplier, a.carrier, a.driver, a.plate, a.location, String(a.id)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [arrivals, statusF, transportF, locationF, dateFrom, dateTo, q]);

  async function load() {
    setLoading(true);
    // snapshot previous arrivals by id for responsible backfill
    const prevById = new Map<number, Arrival>(arrivals.map(a => [a.id, a]));
    try {
      const data = await httpJSON<any[]>("/api/arrivals");
      // Enhanced mapping for files_count and backfill for zero counts
      const raw: any[] = Array.isArray(data) ? data : [];
      // read local overrides for responsible (persisted in ArrivalCard)
      let overrides: Record<string, string> = {};
      try {
        const overridesRaw = localStorage.getItem("arrivalResponsibleOverrides");
        overrides = overridesRaw ? JSON.parse(overridesRaw) : {};
      } catch {}
      // read local overrides for location (persisted on save)
      let locOverrides: Record<string, string> = {};
      try {
        const locRaw = localStorage.getItem("arrivalLocationOverrides");
        locOverrides = locRaw ? JSON.parse(locRaw) : {};
      } catch {}
      const norm: Arrival[] = raw.map((a: any) => ({
        id: Number(a.id),
        supplier: a.supplier ?? "",
        carrier: a.carrier ?? "",
        driver: a.driver ?? "",
        plate: a.plate ?? "",
        pickup_date: a.pickup_date ?? "",
        eta: a.eta ?? "",
        arrived_at: a.arrived_at ?? "",
        transport_type: a.transport_type ?? a.type ?? "",
        // also mirror to `type` for downstream components that may read it
        type: a.transport_type ?? a.type ?? "",
        status: normalizeStatus(a.status),
        goods_cost: Number(a.goods_cost ?? a.goodsCost ?? 0),
        freight_cost: Number(a.freight_cost ?? a.freightCost ?? 0),
        // be robust to alternate keys + prefer overrides and previous value if list API omits location
        location: (() => {
          const fromOverride = locOverrides[String(a.id)] || "";
          if (fromOverride && String(fromOverride).trim() !== "") return String(fromOverride);
          const v = a.location ?? a.place ?? "";
          if (v && String(v).trim() !== "") return String(v);
          const prev = prevById.get(Number(a.id));
          return prev?.location ?? "";
        })(),
        responsible: (() => {
          const fromOverride = overrides[String(a.id)] || "";
          if (fromOverride && String(fromOverride).trim() !== "") return String(fromOverride);
          const v = a.responsible ?? a.assignee_name ?? a.assignee ?? a.assignee_id ?? "";
          if (v && String(v).trim() !== "") return String(v);
          const prev = prevById.get(Number(a.id));
          return prev?.responsible ?? "";
        })(),
        note: a.note ?? "",
        files: Array.isArray(a.files) ? a.files : (a.files ? [a.files] : []),
        // accept multiple casing variants from API and fallback to counted array
        files_count: Number(
          a.files_count ??
          a.filesCount ??
          a.file_count ??
          (Array.isArray(a.files) ? a.files.length : 0)
        ),
      }));
      // Persist discovered responsibles to localStorage so they survive refresh, even if /api/arrivals omits them
      try {
        const overridesRaw0 = localStorage.getItem("arrivalResponsibleOverrides");
        const existing0: Record<string, string> = overridesRaw0 ? JSON.parse(overridesRaw0) : {};
        const merged0: Record<string, string> = { ...existing0 };
        for (const it of norm) {
          if (it.responsible && String(it.responsible).trim() !== "") {
            merged0[String(it.id)] = String(it.responsible);
          }
        }
        localStorage.setItem("arrivalResponsibleOverrides", JSON.stringify(merged0));
      } catch {}
      // Persist discovered locations to localStorage so they survive refresh, even if /api/arrivals omits them
      try {
        const locRaw0 = localStorage.getItem("arrivalLocationOverrides");
        const locExisting0: Record<string, string> = locRaw0 ? JSON.parse(locRaw0) : {};
        const locMerged0: Record<string, string> = { ...locExisting0 };
        for (const it of norm) {
          if (it.location && String(it.location).trim() !== "") {
            locMerged0[String(it.id)] = String(it.location);
          }
        }
        localStorage.setItem("arrivalLocationOverrides", JSON.stringify(locMerged0));
      } catch {}
      setArrivals(norm);
      setLoading(false);
      // best-effort: if some items still show 0, probe their files endpoint to backfill counts (non-blocking)
      {
        try {
          const zeros = norm.filter(x => !Number.isFinite(x.files_count) || x.files_count === 0);
          if (zeros.length) {
            zeros.forEach(async (x) => {
              try {
                const res = await fetch(`${API_BASE}/api/arrivals/${x.id}/files`, {
                  credentials: "include",
                  headers: {
                    Accept: "application/json",
                    ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
                  },
                });
                if (!res.ok) return;
                const arr = await res.json();
                const cnt = Array.isArray(arr) ? arr.length : (Array.isArray(arr?.items) ? arr.items.length : 0);
                if (cnt > 0) {
                  setArrivals(prev => prev.map(it => it.id === x.id ? { ...it, files_count: cnt } : it));
                }
              } catch {}
            });
          }
        } catch {}
      }
      // best-effort: if some items still miss responsible, probe detail endpoint (non-blocking)
      {
        try {
          const needResp = norm.filter(x => !x.responsible);
          if (needResp.length) {
            needResp.forEach(async (x) => {
              try {
                const r = await fetch(`${API_BASE}/api/arrivals/${x.id}`, {
                  credentials: "include",
                  headers: {
                    Accept: "application/json",
                    ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
                  },
                });
                if (!r.ok) return;
                const item = await r.json();
                const resp = item?.responsible ?? item?.assignee_name ?? item?.assignee ?? item?.assignee_id ?? "";
                if (resp && String(resp).trim() !== "") {
                  const val = String(resp);
                  setArrivals(prev => prev.map(it => it.id === x.id ? { ...it, responsible: val } : it));
                  try {
                    const overridesRaw2 = localStorage.getItem("arrivalResponsibleOverrides");
                    const existing2: Record<string, string> = overridesRaw2 ? JSON.parse(overridesRaw2) : {};
                    existing2[String(x.id)] = val;
                    localStorage.setItem("arrivalResponsibleOverrides", JSON.stringify(existing2));
                  } catch {}
                }
              } catch {}
            });
          }
        } catch {}
      }
      // best-effort: if some items still miss location, probe detail endpoint (non-blocking)
      {
        try {
          const needLoc = norm.filter(x => !x.location);
          if (needLoc.length) {
            needLoc.forEach(async (x) => {
              try {
                const r = await fetch(`${API_BASE}/api/arrivals/${x.id}`, {
                  credentials: "include",
                  headers: {
                    Accept: "application/json",
                    ...(localStorage.getItem("token") ? { Authorization: `Bearer ${localStorage.getItem("token")}` } : {}),
                  },
                });
                if (!r.ok) return;
                const item = await r.json();
                const loc = item?.location ?? item?.place ?? "";
                if (loc && String(loc).trim() !== "") {
                  const val = String(loc);
                  setArrivals(prev => prev.map(it => it.id === x.id ? { ...it, location: val } : it));
                  try {
                    const locRaw2 = localStorage.getItem("arrivalLocationOverrides");
                    const locExisting2: Record<string, string> = locRaw2 ? JSON.parse(locRaw2) : {};
                    locExisting2[String(x.id)] = val;
                    localStorage.setItem("arrivalLocationOverrides", JSON.stringify(locExisting2));
                  } catch {}
                }
              } catch {}
            });
          }
        } catch {}
      }
    } catch (e) {
      console.error("Ne mogu učitati arrivals", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onFilesUpdated = () => { load(); };
    window.addEventListener("files-updated", onFilesUpdated as EventListener);
    return () => window.removeEventListener("files-updated", onFilesUpdated as EventListener);
  }, []);

  useEffect(() => {
    const onArrivalsRefetch = () => { load(); };
    window.addEventListener("arrivals-refetch", onArrivalsRefetch as EventListener);
    return () => window.removeEventListener("arrivals-refetch", onArrivalsRefetch as EventListener);
  }, []);

  useEffect(() => {
    const onArrivalUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const id = Number(detail.id);
      const patch = (detail.patch || {}) as Partial<Arrival>;
      if (!id) return;
      setArrivals(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
    };
    window.addEventListener("arrival-updated", onArrivalUpdated as EventListener);
    return () => window.removeEventListener("arrival-updated", onArrivalUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (arrivals.length) checkDeadlines(arrivals);
    const t = setInterval(() => {
      if (arrivals.length) checkDeadlines(arrivals);
    }, 120000); // svake 2 min
    return () => clearInterval(t);
  }, [arrivals]);

  useEffect(() => {
    const onGlobalSearch = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (typeof detail.q === "string") setQ(detail.q);
    };
    const onNewEntry = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (!detail.type || detail.type === "arrival") {
        setActive(null);
        setDetailOpen(true);
      }
    };
    window.addEventListener("global-search", onGlobalSearch as EventListener);
    window.addEventListener("new-entry", onNewEntry as EventListener);
    return () => {
      window.removeEventListener("global-search", onGlobalSearch as EventListener);
      window.removeEventListener("new-entry", onNewEntry as EventListener);
    };
  }, []);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const id = Number(draggableId);
    const nextStatus = destination.droppableId as Arrival["status"];
    const prevStatus = source.droppableId as Arrival["status"];
    setArrivals((prev) => prev.map((a) => (a.id === id ? { ...a, status: nextStatus } : a)));

    try {
      await httpJSON(`/api/arrivals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      try {
        const from = statusMeta[prevStatus].label;
        const to = statusMeta[nextStatus].label;
        pushNotif(`Status promijenjen (#${id}): ${from} → ${to}`);
      } catch {}
    } catch (e: any) {
      // revert optimistic update and surface server error
      setArrivals(prev => prev.map(a => a.id === id ? { ...a, status: source.droppableId as Arrival["status"] } : a));
      const msg = e?.message || String(e);
      console.error("Ne mogu sačuvati status:", msg);
      alert(`Ažuriranje statusa odbijeno.\n${msg}`);
    }
  };

  const onReset = () => {
    setStatusF("");
    setTransportF("");
    setLocationF("");
    setDateFrom("");
    setDateTo("");
    setQ("");
  };

  const byStatus = useMemo(() => {
    const map: Record<Arrival["status"], Arrival[]> = { not_shipped: [], shipped: [], arrived: [] };
    for (const a of filtered) {
      const key = normalizeStatus(a.status as any);
      (map as any)[key].push({ ...a, status: key });
    }
    return map;
  }, [filtered]);

  return (
    <div className="p-3 md:p-4 lg:p-6">
      <div className="mb-4 bg-white border rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-[160px]">
          <Filter size={16} className="opacity-70" />
          <span className="font-semibold">Filteri</span>
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value as any)} className="border rounded px-2 py-1">
          <option value="">Svi statusi</option>
          <option value="not_shipped">Najavljeno</option>
          <option value="shipped">U transportu</option>
          <option value="arrived">Stiglo</option>
        </select>
        <select value={transportF} onChange={(e) => setTransportF(e.target.value)} className="border rounded px-2 py-1">
          {transportOptions.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={locationF} onChange={(e) => setLocationF(e.target.value)} className="border rounded px-2 py-1">
          {locationOptions.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border rounded px-2 py-1" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border rounded px-2 py-1" />
        <div className="flex items-center gap-2 flex-1">
          <Search size={16} className="opacity-70" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pretraži..."
            className="border rounded px-2 py-1 w-full"
          />
        </div>
        <button
          className="rounded px-3 py-1 bg-red-600 text-white hover:bg-red-700"
          onClick={onReset}
        >
          <RotateCcw size={14} className="inline mr-1" /> Reset
        </button>
      </div>

      <div className="mb-4 flex justify-end">
        <button
          className="flex items-center gap-2 px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => { setActive(null); setDetailOpen(true); }}
        >
          <Plus size={16} /> Novi unos
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(statusMeta) as Array<Arrival["status"]>).map((key) => (
            <Droppable droppableId={key} key={key}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="bg-white border rounded-xl shadow-sm p-3 min-h-[400px]">
                  <div className={`mb-3 px-2 py-1 rounded ${statusMeta[key].accent}`}>
                    <h2 className="font-semibold text-gray-700">
                      {statusMeta[key].label} ({byStatus[key].length})
                    </h2>
                  </div>
                  {loading && byStatus[key].length === 0 && <div className="text-sm opacity-60">Učitavanje…</div>}
                  {byStatus[key].map((a, index) => (
                    <Draggable key={a.id} draggableId={String(a.id)} index={index}>
                      {(drag) => (
                        <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} className="bg-white rounded shadow p-3 mb-2">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold">#{a.id}</span>
                            <span className={`text-xs px-2 py-1 rounded ${statusMeta[a.status].badge}`}>{statusMeta[a.status].label}</span>
                          </div>
                          <div className="font-semibold">{a.supplier}</div>
                          {/* Responsible & Location meta */}
                          <div className="text-sm mb-0.5 flex items-center gap-4 text-gray-700">
                            <span className="flex items-center gap-1" title="Odgovorna osoba">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
                              {a.responsible || '—'}
                            </span>
                            <span className="flex items-center gap-1" title="Lokacija">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-map-pin"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                              {a.location || '—'}
                            </span>
                          </div>
                          <div className="text-sm mb-0.5 flex items-center gap-1">
                            <Calendar size={14} className="opacity-80" /> Preuzimanje: {fmtDate(a.pickup_date)}
                          </div>
                          <div className="text-sm">ETA: {fmtDate(a.eta)}</div>
                          <div className="text-sm flex items-center gap-1">
                            <TruckIcon size={14} /> {a.plate}
                          </div>
                          <div className="text-sm">Prevoznik: {a.carrier}</div>
                          <div className="text-xs opacity-80">Cijena robe: {fmtMoney(Number(a.goods_cost) || 0)}</div>
                          <div className="text-xs opacity-80 mb-1">Cijena prevoza: {fmtMoney(Number(a.freight_cost) || 0)}</div>
                          <div className="text-sm font-bold" title={`Roba + Prevoz`}>
                            Cijena: {fmtMoney((Number(a.goods_cost) || 0) + (Number(a.freight_cost) || 0))}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              <button
                                className="text-sm underline opacity-80 hover:opacity-100"
                                onClick={() => { setActive(a); setDetailOpen(true); }}
                              >
                                Detalji
                              </button>
                              <button
                                className="w-10 h-10 inline-flex items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-100"
                                title="Fajlovi / Upload"
                                aria-label={`Fajlovi / Upload za pošiljku #${a.id}`}
                                onClick={() => {
                                  setActive(a);
                                  setDetailOpen(true);
                                  setTimeout(() => window.dispatchEvent(new CustomEvent("open-upload", { detail: { id: a.id } })), 150);
                                }}
                              >
                                <Upload size={24} strokeWidth={2.4} />
                              </button>
                              <button
                                className="w-10 h-10 inline-flex items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700"
                                title="Obriši karticu"
                                aria-label={`Obriši pošiljku #${a.id}`}
                                onClick={async () => {
                                  const yes = window.confirm(`Da li sigurno želiš da obrišeš pošiljku #${a.id}?`);
                                  if (!yes) return;
                                  // optimistično uklanjanje iz liste
                                  setArrivals(prev => prev.filter(it => it.id !== a.id));
                                  try {
                                    await httpJSON(`/api/arrivals/${a.id}`, { method: "DELETE" });
                                    try {
                                      // obavijest
                                      pushNotif(`Obrisana pošiljka #${a.id}${a.supplier ? " – " + a.supplier : ""}`);
                                    } catch {}
                                  } catch (e: any) {
                                    // vrati stavku ako je došlo do greške
                                    setArrivals(prev => [...prev, a].sort((x, y) => x.id - y.id));
                                    console.error("Brisanje nije uspjelo:", e?.message || e);
                                    alert(`Brisanje nije uspjelo.\n${e?.message || e}`);
                                  }
                                }}
                              >
                                <Trash2 size={24} strokeWidth={2.4} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 text-sm opacity-80" title="Broj fajlova">
                              <FileIcon size={16} />
                              <span>{(a as any).files_count ?? (Array.isArray(a.files) ? a.files.length : 0)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
      <ArrivalModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        arrival={active}
        // Provide the same locations as in the filter (without the empty option)
        // @ts-expect-error ArrivalModal will accept this prop; typing will be added in that file next
        locations={allLocationValues}
        // Full location option objects (labels + values) for the dropdown
        // @ts-expect-error ArrivalModal will accept this prop; typing will be added in that file next
        locationOptions={locationOptions.filter(o => o.v)}
        // Provide responsible people options used in the dropdown
        // @ts-expect-error ArrivalModal will accept this prop; typing will be added in that file next
        responsibles={responsibleOptions}
        onSaved={(upd) => {
          setArrivals(prev => prev.map(x => x.id === upd.id ? { ...x, ...upd } : x));
          // Persist responsible override if present in the saved payload/response
          try {
            const r = (upd as any).responsible || (upd as any).assignee_name || (upd as any).assignee || "";
            if (r && String(r).trim() !== "") {
              const overridesRaw3 = localStorage.getItem("arrivalResponsibleOverrides");
              const existing3: Record<string, string> = overridesRaw3 ? JSON.parse(overridesRaw3) : {};
              existing3[String(upd.id)] = String(r);
              localStorage.setItem("arrivalResponsibleOverrides", JSON.stringify(existing3));
            }
          } catch {}
          // Persist location override if present in the saved payload/response
          try {
            const loc = (upd as any).location || (upd as any).place || "";
            if (loc && String(loc).trim() !== "") {
              const locRaw3 = localStorage.getItem("arrivalLocationOverrides");
              const locExisting3: Record<string, string> = locRaw3 ? JSON.parse(locRaw3) : {};
              locExisting3[String(upd.id)] = String(loc);
              localStorage.setItem("arrivalLocationOverrides", JSON.stringify(locExisting3));
            }
          } catch {}
          try {
            if (!active) {
              pushNotif(`Kreirana nova pošiljka #${upd.id}${upd.supplier ? " – " + upd.supplier : ""}`);
            } else {
              const before = normalizeStatus(active.status as any);
              const after = normalizeStatus((upd.status as any) || before);
              if (before !== after) {
                const from = statusMeta[before].label;
                const to = statusMeta[after].label;
                pushNotif(`Status promijenjen (#${upd.id}): ${from} → ${to}`);
              }
            }
          } catch {}
        }}
      />
    </div>
  );
}