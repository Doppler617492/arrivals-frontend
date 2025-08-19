import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Truck, LayoutGrid, Table as TableIcon, RefreshCw, Bell, Sun, Moon,
  Settings, FileText, LogOut, Search, Filter, Download, PlusCircle,
  Users, Layers, Menu, X
} from "lucide-react";

/** ========================
 *  Types
 *  ======================== */
type Arrival = {
  id: number;
  supplier: string;
  plate: string;
  type: "truck" | "container" | "trailer" | "van";
  status: "announced" | "arrived" | "unloaded" | "delayed";
  created_at: string;
  eta?: string | null;
  note?: string | null;
  carrier?: string | null;
};

type StatusFilter = "all" | Arrival["status"];
type ViewMode = "cards" | "table";

/** ========================
 *  Config (from .env)
 *  ======================== */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8081";
const API_KEY  = import.meta.env.VITE_API_KEY || "";

/** Status badge styles + labels */
const statusStyle: Record<Arrival["status"], string> = {
  announced: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  arrived:   "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  unloaded:  "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
  delayed:   "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
};
const statusLabel: Record<Arrival["status"], string> = {
  announced: "Najavljeno",
  arrived:   "Pristiglo",
  unloaded:  "Istovareno",
  delayed:   "Kašnjenje",
};

/** Basic error boundary to avoid blank screen and show runtime errors */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: any; stack?: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    // keep a bit of context; we don't rethrow to avoid crash
    this.setState({ stack: info?.componentStack });
    // Also log to console for devtools
    console.error("UI crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen w-screen p-6 bg-rose-50 text-rose-900">
          <div className="mx-auto max-w-2xl bg-white ring-1 ring-rose-200 rounded-lg p-4 shadow">
            <h1 className="text-lg font-semibold mb-2">Dogodila se greška u interfejsu</h1>
            <div className="text-sm whitespace-pre-wrap">
              {String(this.state.error?.message ?? this.state.error)}
            </div>
            {this.state.stack && (
              <pre className="mt-3 text-xs text-slate-500 overflow-auto max-h-64">
                {this.state.stack}
              </pre>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => location.reload()} className="px-3 py-2 text-sm rounded-md bg-slate-900 text-white">Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}

/** ========================
 *  App (modern layout)
 *  ======================== */
export default function App() {
  // core state
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading,  setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [filter, setFilter]           = useState<StatusFilter>(() => (localStorage.getItem("flt_status") as StatusFilter) || "all");
  const [q,      setQ]                = useState<string>(() => localStorage.getItem("flt_q")  || "");
  const [supplierFlt, setSupplierFlt] = useState<string>(() => localStorage.getItem("flt_supplier") || "");

  // view & dark mode
  const [view, setView]               = useState<ViewMode>(() => (localStorage.getItem("view_mode") as ViewMode) || "cards");
  const [dark, setDark]               = useState<boolean>(() => localStorage.getItem("theme") === "dark");

  // notifications & toasts
  const hasNotif = typeof window !== "undefined" && "Notification" in window;
  const [notifGranted, setNotifGranted] = useState<boolean>(() => hasNotif && Notification.permission === "granted");
  type Toast = { id: number; text: string; tone?: "info" | "success" | "warn" | "error" };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };
  const requestNotif = async () => {
    if (!hasNotif) return pushToast("Browser ne podržava notifikacije", "warn");
    const perm = await Notification.requestPermission();
    setNotifGranted(perm === "granted");
    if (perm === "granted") pushToast("Notifikacije uključene", "success");
  };
  const notify = (title: string, body?: string) => {
    if (hasNotif && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  };
  const beep = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02);
      o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); o.stop(ctx.currentTime + 0.18);
    } catch {}
  };

  // mobile sidebar
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // selection & pagination
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const [page, setPage]     = useState<number>(() => Number(localStorage.getItem("page"))      || 1);
  const [pageSize, setPageSize] = useState<number>(() => Number(localStorage.getItem("page_size")) || 15);

  // quick add form state
  const [supplier, setSupplier] = useState("");
  const [plate,    setPlate]    = useState("");
  const [type,     setType]     = useState<Arrival["type"]>("truck");
  const [note,     setNote]     = useState("");
  const [carrier,  setCarrier]  = useState("");
  const [eta,      setEta]      = useState("");

  // detail drawer
  const [selected, setSelected] = useState<Arrival | null>(null);

  // previous snapshot (for notifications)
  const prevMapRef = useRef<Map<number, Arrival>>(new Map());

  // API headers
  const apiHeaders = useMemo(() => ({
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {})
  }), []);

  /** ---------- effects ---------- */
  useEffect(() => {
    const root = document.documentElement;
    if (dark) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else      { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [dark]);

  useEffect(() => {
    localStorage.setItem("flt_status", filter);
    localStorage.setItem("flt_q",      q);
    localStorage.setItem("flt_supplier", supplierFlt);
    localStorage.setItem("view_mode", view);
  }, [filter, q, supplierFlt, view]);

  useEffect(() => {
    localStorage.setItem("page", String(page));
    localStorage.setItem("page_size", String(pageSize));
  }, [page, pageSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  /** ---------- core functions ---------- */
  async function load() {
    try {
      setLoading(true);
      const res  = await fetch(`${API_BASE}/api/arrivals`, { headers: apiHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Arrival[];

      // notifications diff
      const next = new Map<number, Arrival>();
      data.forEach(a => next.set(a.id, a));
      const prev = prevMapRef.current;
      if (prev.size > 0) {
        for (const a of data) {
          if (!prev.has(a.id)) {
            pushToast(`Novi dolazak: ${a.supplier} • ${a.plate}`, "success");
            notify("Novi dolazak", `${a.supplier} • ${a.plate}`); beep();
          }
        }
        for (const [id, p] of prev.entries()) {
          const n = next.get(id);
          if (n && p.status !== "arrived" && n.status === "arrived") {
            pushToast(`Stigao: ${n.supplier} • ${n.plate}`, "success");
            notify("Stigao kamion", `${n.supplier} • ${n.plate}`); beep();
          }
        }
      }
      prevMapRef.current = next;
      setArrivals(data);
      setErr(null);
    } catch (e: any) {
      setErr(`Neuspjelo učitavanje: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  async function createArrival() {
    if (!supplier || !plate) return;
    try {
      const res = await fetch(`${API_BASE}/api/arrivals`, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          supplier,
          plate: plate.toUpperCase(),
          type,
          carrier: carrier || null,
          eta: eta || null,
          note: note || null
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSupplier(""); setPlate(""); setType("truck"); setCarrier(""); setEta(""); setNote("");
      pushToast("Zapis dodat", "success");
      await load();
    } catch (e: any) {
      setErr(`Greška pri dodavanju: ${e?.message ?? e}`);
      pushToast("Greška pri dodavanju", "error");
    }
  }

  async function updateStatus(id: number, status: Arrival["status"]) {
    try {
      const res = await fetch(`${API_BASE}/api/arrivals/${id}`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pushToast(`Status izmijenjen → ${status}`, "success");
      await load();
    } catch (e: any) {
      setErr(`Greška pri izmjeni statusa: ${e?.message ?? e}`);
      pushToast("Greška pri izmjeni statusa", "error");
    }
  }

  async function bulkUpdate(status: Arrival["status"]) {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        fetch(`${API_BASE}/api/arrivals/${id}`, {
          method: "PATCH",
          headers: apiHeaders,
          body: JSON.stringify({ status })
        })
      ));
      clearSelection();
      pushToast(`Grupno postavljeno: ${status}`, "success");
      await load();
    } catch (e: any) {
      setErr(`Greška pri grupnoj akciji: ${e?.message ?? e}`);
      pushToast("Greška pri grupnoj akciji", "error");
    }
  }

  // computed
  const stats = useMemo(() => {
    const s = { total: arrivals.length, announced: 0, arrived: 0, unloaded: 0, delayed: 0 } as { total: number } & Record<Arrival["status"], number>;
    for (const a of arrivals) s[a.status]++;
    return s;
  }, [arrivals]);

  const filtered = useMemo(() => {
    const byStatus = filter === "all" ? arrivals : arrivals.filter(a => a.status === filter);
    const qTrim  = q.trim().toLowerCase();
    const supTrim= supplierFlt.trim().toLowerCase();
    return byStatus.filter(a => {
      const okQ  = !qTrim ||
        a.plate.toLowerCase().includes(qTrim) ||
        a.supplier.toLowerCase().includes(qTrim) ||
        (a.carrier || "").toLowerCase().includes(qTrim) ||
        (a.note    || "").toLowerCase().includes(qTrim);
      const okSup= !supTrim || a.supplier.toLowerCase().includes(supTrim);
      return okQ && okSup;
    });
  }, [arrivals, filter, q, supplierFlt]);

  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of arrivals) set.add(a.supplier);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [arrivals]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage= Math.min(page, totalPages);
  const startIdx    = (currentPage - 1) * pageSize;
  const pageItems   = filtered.slice(startIdx, startIdx + pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const allVisibleSelected = pageItems.length > 0 && pageItems.every(a => selectedIds.has(a.id));
  const toggleSelectAllVisible = () => setSelectedIds(prev => {
    const n = new Set(prev);
    if (allVisibleSelected) pageItems.forEach(a => n.delete(a.id));
    else                    pageItems.forEach(a => n.add(a.id));
    return n;
  });

  /** ---------- export ---------- */
  const exportCSV = () => {
    const rows = [
      ["ID","Dobavljač","Prevoznik","Tablica","Tip","Status","Datum","ETA","Napomena"],
      ...filtered.map(a=>[
        a.id, a.supplier, a.carrier??"", a.plate, a.type, a.status,
        new Date(a.created_at).toLocaleString(), a.eta??"", a.note??""
      ])
    ];
    const csv = rows.map(r=>r.map(v=>{ const s=String(v??""); return /[",\n;]/.test(s)? `"${s.replace(/"/g,'""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`arrivals_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
    pushToast("CSV eksportovan (filtrirani zapisi)","success");
  };
  const exportPDF = () => {
    const w=window.open("","_blank"); if(!w) return;
    const style = `<style>
      body{font-family:ui-sans-serif,system-ui,-apple-system;padding:24px;}
      h1{font-size:18px;margin:0 0 12px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border:1px solid #ddd;padding:6px 8px;} th{background:#f3f4f6;text-align:left;}
    </style>`;
    const rows = filtered.map(a=>`
      <tr><td>${a.id}</td><td>${esc(a.supplier)}</td><td>${esc(a.carrier??"")}</td>
      <td>${esc(a.plate)}</td><td>${esc(a.type)}</td><td>${esc(a.status)}</td>
      <td>${esc(new Date(a.created_at).toLocaleString())}</td><td>${esc(a.eta??"")}</td><td>${esc(a.note??"")}</td></tr>
    `).join("");
    w.document.write(`<html><head><title>Arrivals PDF</title>${style}</head><body>
      <h1>Arrivals — filtrirani zapisi (${filtered.length})</h1>
      <table><thead><tr>
        <th>ID</th><th>Dobavljač</th><th>Prevoznik</th><th>Tablica</th><th>Tip</th><th>Status</th><th>Datum</th><th>ETA</th><th>Napomena</th>
      </tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close(); w.focus(); w.print(); pushToast("PDF pripremljen (Print → Save as PDF)","success");
  };

  /** ---------- JSX ---------- */
  return (
    <ErrorBoundary>
      <div className="h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden">
      {/* Toasts */}
      <div className="fixed top-3 right-3 z-[60] space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-3 py-2 rounded-lg shadow ring-1 text-sm
            ${t.tone === "success" ? "bg-emerald-50 ring-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-900"
            : t.tone === "warn" ? "bg-amber-50 ring-amber-200 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-900"
            : t.tone === "error" ? "bg-rose-50 ring-rose-200 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-900"
            : "bg-slate-50 ring-slate-200 text-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:ring-slate-700"}`}>
            {t.text}
          </div>
        ))}
      </div>

      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
          <div className="h-14 px-4 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
            <div className="h-9 w-9 grid place-items-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-sm">
              <Truck size={18} />
            </div>
            <div className="font-semibold">Arrivals</div>
          </div>
          <nav className="p-2 space-y-1 text-sm">
            <NavItem icon={<LayoutGrid size={16} />} label="Dashboard" active />
            <NavItem icon={<Truck size={16} />}     label="Dolazci"   />
            <NavItem icon={<Users size={16} />}      label="Dobavljači" />
            <NavItem icon={<Layers size={16} />}     label="Skladišta" />
            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800" />
            <NavItem icon={<FileText size={16} />} label="Izvještaji" />
            <NavItem icon={<Settings size={16} />} label="Podešavanja" />
          </nav>
          <div className="mt-auto p-3">
            <button className="w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-700/60">
              <LogOut size={14} /> Odjava
            </button>
          </div>
        </aside>

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-14 shrink-0 sticky top-0 z-10 bg-white/70 dark:bg-slate-900/70 backdrop-blur border-b border-slate-200 dark:border-slate-800">
            <div className="h-full px-3 sm:px-4 flex items-center gap-2">
              <div className="md:hidden mr-1">
                <button
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open menu"
                  className="h-9 w-9 grid place-items-center rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Menu size={16} />
                </button>
              </div>
              {/* Search */}
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  placeholder="Pretraga: tablica / dobavljač / prevoznik / napomena"
                  className="w-full pl-9 pr-3 h-9 rounded-md bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 focus:outline-none"
                />
              </div>
              {/* Quick actions */}
              <div className="flex items-center gap-2">
                <button onClick={load} title="Refresh" className="h-9 px-3 inline-flex items-center gap-2 rounded-md bg-slate-900 text-white text-xs hover:bg-black">
                  <RefreshCw size={14} /> Refresh
                </button>
                <button
                  onClick={() => setView(view === "cards" ? "table" : "cards")}
                  className="h-9 px-3 inline-flex items-center gap-2 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-xs"
                >
                  {view === "cards" ? <> <TableIcon size={14} /> Tabela  </> : <> <LayoutGrid size={14} /> Kartice  </>}
                </button>
                <button
                  onClick={() => setDark(!dark)}
                  title="Dark mode"
                  className="h-9 px-3 inline-flex items-center gap-2 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-xs"
                >
                  {dark ? <> <Sun size={14} /> Light </> : <> <Moon size={14} /> Dark </>}
                </button>
                <button
                  onClick={requestNotif}
                  className={`h-9 px-3 inline-flex items-center gap-2 rounded-md text-xs ring-1
                    ${notifGranted ? "bg-emerald-50 ring-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-900"
                                   : "bg-white dark:bg-slate-800 ring-slate-200 dark:ring-slate-700"}`}
                >
                  <Bell size={14} /> {notifGranted ? "On" : "Notifikacije"}
                </button>
                <button onClick={exportCSV} className="h-9 px-3 inline-flex items-center gap-2 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-xs">
                  <Download size={14} /> CSV
                </button>
                <button onClick={exportPDF} className="h-9 px-3 inline-flex items-center gap-2 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-xs">
                  <Download size={14} /> PDF
                </button>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 overflow-auto">
            <div className="mx-auto max-w-7xl px-3 sm:px-4 py-6 space-y-6">

              {/* Stats */}
              <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Stat label="Ukupno"      value={stats.total}      />
                <Stat label="Najavljeno"  value={stats.announced}  badgeClass={statusStyle.announced} />
                <Stat label="Pristigli"   value={stats.arrived}    badgeClass={statusStyle.arrived}   />
                <Stat label="Istovareno"  value={stats.unloaded}   badgeClass={statusStyle.unloaded}  />
                <Stat label="Kašnjenje"   value={stats.delayed}    badgeClass={statusStyle.delayed}   />
              </section>

              {/* Filters */}
              <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                <div className="p-4 grid gap-4 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Filter size={14}/> Pretraga
                    </label>
                    <input
                      value={q}
                      onChange={(e)=>{ setQ(e.target.value); setPage(1); }}
                      placeholder="npr. XYZ-001 ili Podravka"
                      className="mt-1 rounded-md w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Dobavljač (auto-complete)</label>
                    <input
                      list="suppliers"
                      value={supplierFlt}
                      onChange={(e)=>{ setSupplierFlt(e.target.value); setPage(1); }}
                      placeholder="npr. Podravka"
                      className="mt-1 rounded-md w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700"
                    />
                    <datalist id="suppliers">
                      {supplierOptions.map(s => <option key={s} value={s}/>)}
                    </datalist>
                  </div>
                  <div className="lg:col-span-4">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Status</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(["all","announced","arrived","unloaded","delayed"] as StatusFilter[]).map(f=>(
                        <button key={f}
                          onClick={()=>{ setFilter(f); setPage(1); }}
                          className={`text-xs px-3 h-9 rounded-md ring-1 transition
                            ${filter===f ? "bg-slate-900 text-white ring-slate-900"
                                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
                          {f==="all" ? "Sve" : statusLabel[f as Arrival["status"]]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Quick Add */}
              <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-base font-semibold flex items-center gap-2"><PlusCircle size={16}/> Novi dolazak</h2>
                  <span className="text-xs text-slate-500">API: {API_BASE} • Key: {API_KEY? "ok":"missing"}</span>
                </div>
                <div className="p-4 grid gap-4 sm:grid-cols-3">
                  <Field label="Dobavljač">
                    <input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="npr. Podravka"
                      className="h-9 rounded-md px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700"/>
                  </Field>
                  <Field label="Reg. tablica">
                    <input value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())} placeholder="npr. MNE-XYZ-001"
                      className="h-9 rounded-md px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 uppercase"/>
                  </Field>
                  <Field label="Tip vozila">
                    <select value={type} onChange={e=>setType(e.target.value as Arrival["type"])}
                      className="h-9 rounded-md px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
                      <option value="truck">Kamion</option>
                      <option value="container">Kontejner</option>
                      <option value="trailer">Šleper</option>
                      <option value="van">Kombi</option>
                    </select>
                  </Field>
                  <Field label="Prevoznik">
                    <input value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="npr. DHL / lokalni"
                      className="h-9 rounded-md px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700"/>
                  </Field>
                  <Field label="ETA (opciono)">
                    <input value={eta} onChange={e=>setEta(e.target.value)} placeholder="YYYY-MM-DD HH:mm"
                      className="h-9 rounded-md px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700"/>
                  </Field>
                  <Field label="Napomena (opciono)">
                    <input value={note} onChange={e=>setNote(e.target.value)} placeholder="rampa 2, prioritet"
                      className="h-9 rounded-md px-3 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700"/>
                  </Field>
                  <div className="sm:col-span-3 flex items-center justify-end">
                    <button onClick={createArrival} disabled={!supplier || !plate}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 text-white px-4 py-2 font-medium hover:bg-black disabled:opacity-40">
                      <PlusCircle size={16}/> Dodaj
                    </button>
                  </div>
                </div>
              </section>

              {/* Listing */}
              {view === "cards" ? (
                <CardsView
                  loading={loading}
                  items={pageItems}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  onOpen={setSelected}
                  onUpdate={updateStatus}
                  pagination={
                    <Pagination
                      page={currentPage}
                      totalPages={totalPages}
                      onPrev={()=>setPage(p=>Math.max(1,p-1))}
                      onNext={()=>setPage(p=>Math.min(totalPages,p+1))}
                      pageSize={pageSize}
                      onPageSize={(n)=>{ setPageSize(n); setPage(1); }}
                      leftExtra={
                        <button onClick={toggleSelectAllVisible}
                          className="text-sm px-3 h-9 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
                          {allVisibleSelected ? "Unselect visible" : "Select visible"}
                        </button>
                      }
                    />
                  }
                />
              ) : (
                <TableView
                  loading={loading}
                  items={pageItems}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  allVisibleSelected={allVisibleSelected}
                  toggleSelectAllVisible={toggleSelectAllVisible}
                  onOpen={setSelected}
                  onUpdate={updateStatus}
                  pagination={
                    <Pagination
                      page={currentPage}
                      totalPages={totalPages}
                      onPrev={()=>setPage(p=>Math.max(1,p-1))}
                      onNext={()=>setPage(p=>Math.min(totalPages,p+1))}
                      pageSize={pageSize}
                      onPageSize={(n)=>{ setPageSize(n); setPage(1); }}
                      leftExtra={
                        <div className="flex items-center gap-2">
                          <button onClick={toggleSelectAllVisible}
                            className="text-sm px-3 h-9 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
                            {allVisibleSelected ? "Unselect visible" : "Select visible"}
                          </button>
                          <button onClick={()=>bulkUpdate("arrived")} disabled={selectedIds.size===0}
                            className="text-sm px-3 h-9 rounded-md bg-emerald-600 text-white disabled:opacity-40">
                            Mark as arrived ({selectedIds.size})
                          </button>
                          <button onClick={clearSelection} disabled={selectedIds.size===0}
                            className="text-sm px-3 h-9 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 disabled:opacity-40">
                            Clear
                          </button>
                        </div>
                      }
                    />
                  }
                />
              )}

              {err && (
                <div className="text-rose-700 bg-rose-50 ring-1 ring-rose-200 px-3 py-2 rounded dark:text-rose-300 dark:bg-rose-950/50 dark:ring-rose-900">
                  {err}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile sidebar */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 h-full w-72 max-w-[80%] bg-white dark:bg-slate-900 shadow-xl ring-1 ring-slate-200 dark:ring-slate-800 flex flex-col"
            role="dialog"
            aria-modal="true"
          >
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 grid place-items-center rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-white">
                  <Truck size={16} />
                </div>
                <div className="font-semibold">Arrivals</div>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
                className="h-8 w-8 grid place-items-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <nav className="p-2 space-y-1 text-sm">
              <NavItem icon={<LayoutGrid size={16} />} label="Dashboard" active />
              <NavItem icon={<Truck size={16} />} label="Dolazci" />
              <NavItem icon={<Users size={16} />} label="Dobavljači" />
              <NavItem icon={<Layers size={16} />} label="Skladišta" />
              <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-800" />
              <NavItem icon={<FileText size={16} />} label="Izvještaji" />
              <NavItem icon={<Settings size={16} />} label="Podešavanja" />
            </nav>

            <div className="mt-auto p-3">
              <button className="w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-700/60">
                <LogOut size={14} /> Odjava
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer a={selected} onClose={()=>setSelected(null)} onUpdate={updateStatus}/>
      )}
      </div>
    </ErrorBoundary>
  );
}

/** --------- Helper components --------- */
function NavItem({ icon, label, active = false }: { icon: ReactNode; label: string; active?: boolean }) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg
        ${active ? "bg-slate-900 text-white"
                 : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
    >
      {icon} <span>{label}</span>
    </button>
  );
}

function Stat({ label, value, badgeClass }: { label: string; value: number; badgeClass?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 inline-flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100 ${badgeClass ? "px-2 py-1 rounded-lg "+badgeClass : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Th({ children, className="" }: { children: ReactNode; className?: string }) {
  return <th className={`text-left font-semibold px-4 py-3 ${className}`}>{children}</th>;
}

function Td({
  children, className="", colSpan, onClick,
}: {
  children: ReactNode; className?: string; colSpan?: number;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td
      className={`px-4 py-3 align-middle text-slate-700 dark:text-slate-200 ${className}`}
      colSpan={colSpan}
      onClick={onClick}
    >
      {children}
    </td>
  );
}

function ActionButtons({ a, onUpdate }: { a: Arrival; onUpdate: (id: number, s: Arrival["status"]) => void }) {
  return (
    <>
      <button
        onClick={(e)=>{ e.stopPropagation(); onUpdate(a.id,"arrived"); }}
        disabled={a.status!=="announced"}
        className="text-xs px-3 h-8 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
      >Arrived</button>
      <button
        onClick={(e)=>{ e.stopPropagation(); onUpdate(a.id,"unloaded"); }}
        disabled={a.status!=="arrived"}
        className="text-xs px-3 h-8 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"
      >Unloaded</button>
      <button
        onClick={(e)=>{ e.stopPropagation(); onUpdate(a.id,"delayed"); }}
        disabled={a.status==="delayed" || a.status==="unloaded"}
        className="text-xs px-3 h-8 rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40"
      >Delayed</button>
    </>
  );
}

function ArrivalCard({ a, onUpdate, onOpen }: { a: Arrival; onUpdate: (id:number,s:Arrival["status"])=>void; onOpen:(a:Arrival)=>void }) {
  return (
    <div className="relative bg-white dark:bg-slate-900 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 shadow-sm p-4 flex flex-col gap-3 cursor-pointer hover:ring-slate-300 dark:hover:ring-slate-700 transition"
         onClick={()=>onOpen(a)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{a.supplier}</div>
          <div className="text-xs text-slate-500">{a.carrier ?? "—"}</div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${statusStyle[a.status]}`}>{a.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="font-mono">{a.plate}</div>
        <div className="text-right capitalize">{a.type}</div>
        <div className="col-span-2 text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</div>
        {a.note && <div className="col-span-2 text-xs text-slate-600">{a.note}</div>}
      </div>
      <div className="mt-auto pt-2 flex items-center gap-2" onClick={(e)=>e.stopPropagation()}>
        <ActionButtons a={a} onUpdate={onUpdate}/>
      </div>
    </div>
  );
}

/** Views */
function CardsView({
  loading, items, selectedIds, toggleSelect, onOpen, onUpdate, pagination
}: {
  loading:boolean; items:Arrival[]; selectedIds:Set<number>;
  toggleSelect:(id:number)=>void; onOpen:(a:Arrival)=>void; onUpdate:(id:number,s:Arrival["status"])=>void;
  pagination: ReactNode;
}) {
  return (
    <section className="grid gap-6">
      {loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} className="h-36 bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 rounded-xl animate-pulse"/>
          ))}
        </div>
      )}
      {!loading && items.length===0 && (
        <div className="text-sm text-slate-500">Nema zapisa.</div>
      )}
      {!loading && items.length>0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(a=>(
            <div key={a.id} className={`relative ${selectedIds.has(a.id) ? "ring-2 ring-sky-400 rounded-xl" : ""}`}>
              <label className="absolute top-2 left-2 z-10 inline-flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-2 py-1 rounded-md ring-1 ring-slate-200 dark:ring-slate-700 text-xs">
                <input type="checkbox" checked={selectedIds.has(a.id)} onChange={()=>toggleSelect(a.id)}/> Select
              </label>
              <ArrivalCard a={a} onUpdate={onUpdate} onOpen={onOpen}/>
            </div>
          ))}
        </div>
      )}
      {pagination}
    </section>
  );
}

function TableView({
  loading, items, selectedIds, toggleSelect, allVisibleSelected, toggleSelectAllVisible,
  onOpen, onUpdate, pagination
}: {
  loading:boolean; items:Arrival[]; selectedIds:Set<number>; toggleSelect:(id:number)=>void;
  allVisibleSelected:boolean; toggleSelectAllVisible:()=>void; onOpen:(a:Arrival)=>void; onUpdate:(id:number,s:Arrival["status"])=>void;
  pagination: ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <tr>
              <Th className="w-10">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible}/>
              </Th>
              <Th>Dobavljač</Th><Th>Prevoznik</Th><Th>Tablica</Th><Th>Tip</Th><Th>Status</Th><Th>Datum</Th><Th>Napomena</Th>
              <Th className="text-right pr-4">Akcije</Th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({length:5}).map((_,i)=>(
              <tr key={i} className="animate-pulse">
                <Td><div className="h-4 w-5 bg-slate-200 dark:bg-slate-700 rounded"/></Td>
                <Td><div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded"/></Td>
                <Td><div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded"/></Td>
                <Td><div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded"/></Td>
                <Td><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded"/></Td>
                <Td><div className="h-6 w-24 bg-slate-200 dark:bg-slate-700 rounded-full"/></Td>
                <Td><div className="h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded"/></Td>
                <Td><div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded"/></Td>
                <Td><div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded ml-auto"/></Td>
              </tr>
            ))}
            {!loading && items.length===0 && (
              <tr><Td colSpan={9}><div className="py-10 text-center text-slate-500">Nema zapisa.</div></Td></tr>
            )}
            {!loading && items.map(a=>(
              <tr key={a.id}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/70 cursor-pointer"
                  onClick={()=>onOpen(a)}>
                <Td onClick={(e)=>e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={()=>toggleSelect(a.id)}/>
                </Td>
                <Td className="font-medium">{a.supplier}</Td>
                <Td>{a.carrier ?? "—"}</Td>
                <Td className="font-mono">{a.plate}</Td>
                <Td className="capitalize">{a.type}</Td>
                <Td>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${statusStyle[a.status]}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70"/> {a.status}
                  </span>
                </Td>
                <Td>{new Date(a.created_at).toLocaleString()}</Td>
                <Td className="text-slate-600">{a.note ?? "—"}</Td>
                <Td className="text-right pr-4" onClick={(e)=>e.stopPropagation()}>
                  <div className="inline-flex items-center gap-2">
                    <ActionButtons a={a} onUpdate={onUpdate}/>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination}
    </section>
  );
}

function Pagination({
  page, totalPages, onPrev, onNext, pageSize, onPageSize, leftExtra,
}: {
  page:number; totalPages:number; onPrev:()=>void; onNext:()=>void;
  pageSize:number; onPageSize:(n:number)=>void; leftExtra?:ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">{leftExtra}</div>
      <div className="flex items-center gap-3">
        <select value={pageSize} onChange={e=>onPageSize(Number(e.target.value))}
                className="h-9 rounded-md px-2 bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
          {[10,15,25,50,100].map(n=> <option key={n} value={n}>{n}/page</option>)}
        </select>
        <button onClick={onPrev} className="px-3 h-9 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">Prev</button>
        <span className="text-sm">{page} / {totalPages}</span>
        <button onClick={onNext} className="px-3 h-9 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">Next</button>
      </div>
    </div>
  );
}

function DetailDrawer({ a, onClose, onUpdate }:{ a:Arrival; onClose:()=>void; onUpdate:(id:number,s:Arrival["status"])=>void }) {
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}/>
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-xl ring-1 ring-slate-200 dark:ring-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Detalji zapisa</div>
            <div className="text-lg font-semibold">{a.supplier} <span className="font-normal text-slate-500">— {a.plate}</span></div>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="p-5 grid gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${statusStyle[a.status]}`}>{a.status}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600">{new Date(a.created_at).toLocaleString()}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Info label="Dobavljač" value={a.supplier}/>
            <Info label="Prevoznik" value={a.carrier ?? "—"}/>
            <Info label="Tip" value={a.type}/>
            <Info label="Tablica" value={a.plate} mono/>
            <Info label="ETA" value={a.eta ?? "—"}/>
            <div className="col-span-3">
              <div className="text-xs text-slate-500">Napomena</div>
              <div className="text-slate-800 dark:text-slate-200">{a.note ?? "—"}</div>
            </div>
          </div>
        </div>
        <div className="mt-auto px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <ActionButtons a={a} onUpdate={onUpdate}/>
          <div className="ml-auto">
            <button onClick={onClose} className="text-sm px-3 h-9 rounded-md bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">Zatvori</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
function Info({ label, value, mono=false }: { label:string; value:string; mono?:boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`${mono?"font-mono":""}`}>{value}</div>
    </div>
  );
}

/** utils */
function esc(s:string){ return s.replace(/[&<>"']/g,(m)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]!)); }