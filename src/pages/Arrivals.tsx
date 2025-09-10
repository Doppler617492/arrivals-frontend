import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { DropResult } from "@hello-pangea/dnd";
import { FileIcon, TruckIcon, Filter, RotateCcw, Search, Plus, Calendar, Upload } from "lucide-react";
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

const locationOptions = [
  { v: "", label: "Sve lokacije" },
  { v: "Magacin", label: "Magacin" },
  { v: "Carinsko skladiste", label: "Carinsko skladište" },
  { v: "PG centar", label: "PG centar" },
  { v: "Bar centar", label: "Bar centar" },
  { v: "Kotor centar", label: "Kotor centar" },
  { v: "Bar", label: "Bar" },
  { v: "Ulcinj centar", label: "Ulcinj centar" },
  { v: "Podgorica", label: "Podgorica" },
  { v: "Bijelo polje", label: "Bijelo polje" },
  { v: "Niksic", label: "Nikšić" },
  { v: "Hercegnovi centar", label: "Hercegnovi centar" },
  { v: "Herceg novi", label: "Herceg Novi" },
  { v: "Budva", label: "Budva" },
];

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
    try {
      const data = await httpJSON<any[]>("/api/arrivals");
      const norm: Arrival[] = (Array.isArray(data) ? data : []).map((a: any) => ({
        id: Number(a.id),
        supplier: a.supplier ?? "",
        carrier: a.carrier ?? "",
        driver: a.driver ?? "",
        plate: a.plate ?? "",
        pickup_date: a.pickup_date ?? "",
        eta: a.eta ?? "",
        arrived_at: a.arrived_at ?? "",
        transport_type: a.transport_type ?? a.type ?? "",
        status: normalizeStatus(a.status),
        goods_cost: Number(a.goods_cost ?? a.goodsCost ?? 0),
        freight_cost: Number(a.freight_cost ?? a.freightCost ?? 0),
        location: a.location ?? "",
        note: a.note ?? "",
        files: Array.isArray(a.files) ? a.files : (a.files ? [a.files] : []),
      }));
      setArrivals(norm);
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
        <button className="border rounded px-3 py-1 bg-gray-100" onClick={onReset}>
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
                                className="p-1 rounded hover:bg-gray-100"
                                title="Fajlovi / Upload"
                                onClick={() => {
                                  setActive(a);
                                  setDetailOpen(true);
                                  setTimeout(() => window.dispatchEvent(new CustomEvent("open-upload", { detail: { id: a.id } })), 150);
                                }}
                              >
                                <Upload size={16} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 text-sm opacity-80" title="Broj fajlova">
                              <FileIcon size={16} />
                              <span>{a.files?.length || 0}</span>
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
        onSaved={(upd) => {
          setArrivals(prev => prev.map(x => x.id === upd.id ? { ...x, ...upd } : x));
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