// src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
// density toggle
import styles from "../styles";
import type { User, Arrival, Update, FileMeta } from "../types";
import InlineEdit from "../components/InlineEdit";
import {
  apiGET,
  apiPOST,
  apiPATCH,
  apiDELETE,
  apiUPLOAD,
  API_KEY,
  qs,
  setToken,
} from "../api/client";
import { formatCurrency } from "../utils/formatCurrency";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/** ▲▲▲ IMPORTI — ostaju kako su u projektu ▲▲▲
 *  Ispod su lokalne pomoćne funkcije koje je Dashboard koristio u App.tsx.
 */

/* ---- Status i per-role dozvole (moraju biti u skladu sa backend-om) ---- */
const ROLE_FIELDS: Record<string, Set<string>> = {
  admin: new Set([
    "supplier",
    "carrier",
    "plate",
    "type",
    "driver",
    "pickup_date",
    "eta",
    "transport_price",
    "goods_price",
    "status",
    "note",
  ]),
  planer: new Set(["supplier", "type", "pickup_date", "eta", "status", "note"]),
  proizvodnja: new Set(["status", "note"]),
  transport: new Set([
    "carrier",
    "plate",
    "driver",
    "pickup_date",
    "eta",
    "status",
    "note",
    "transport_price",
  ]),
  carina: new Set(["status", "note"]),
  viewer: new Set([]),
};

const STATUSES: Arrival["status"][] = ["not shipped", "shipped", "arrived"];

const STATUS_LABELS: Record<Arrival["status"], string> = {
  "not shipped": "Nije otpremljeno",
  shipped: "U transportu",
  arrived: "Stiglo",
} as const;

function getStatusChipStyle(s: Arrival["status"]): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  };
  const map: Record<Arrival["status"], React.CSSProperties> = {
    "not shipped": {
      background: "rgba(148,163,184,0.15)",
      border: "1px solid rgba(148,163,184,0.35)",
    },
    shipped: {
      background: "rgba(59,130,246,0.15)",
      border: "1px solid rgba(59,130,246,0.35)",
    },
    arrived: {
      background: "rgba(34,197,94,0.15)",
      border: "1px solid rgba(34,197,94,0.35)",
    },
  } as const;
  return { ...base, ...(map[s] || {}) };
}

/* --------------------- Datumi i export helpers --------------------- */
function formatDateEU(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
function parseDateInput(val: any): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const d = new Date(Date.UTC(yyyy, mm, dd));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function downloadBlob(filename: string, mime: string, data: string | Blob) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatArrivalRows(items: Arrival[]) {
  return items.map((a) => ({
    ID: a.id,
    Dobavljač: a.supplier,
    Prevoznik: a.carrier || "-",
    Tablice: a.plate || "-",
    Tip: a.type || "-",
    Šofer: a.driver || "-",
    "Datum za podizanje": formatDateEU(a.pickup_date),
    "Datum kad stiže": formatDateEU(a.eta),
    "Cijena prevoza":
      typeof a.transport_price === "number"
        ? formatCurrency(a.transport_price)
        : "-",
    "Cijena robe":
      typeof a.goods_price === "number" ? formatCurrency(a.goods_price) : "-",
    Status: STATUS_LABELS[a.status] ?? a.status,
    Napomena: a.note || "-",
  }));
}

function exportArrivalsCSV(items: Arrival[]) {
  const rows = formatArrivalRows(items);
  const headers = Object.keys(
    rows[0] || {
      ID: "",
      Dobavljač: "",
      Prevoznik: "",
      Tablice: "",
      Tip: "",
      Šofer: "",
      "Datum za podizanje": "",
      "Datum kad stiže": "",
      "Cijena prevoza": "",
      "Cijena robe": "",
      Status: "",
      Napomena: "",
    }
  );
  const escape = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => escape((r as any)[h])).join(",")))
    .join("\n");
  downloadBlob(
    `arrivals_${new Date().toISOString().slice(0, 10)}.csv`,
    "text/csv;charset=utf-8",
    "\uFEFF" + csv // BOM (ćčđšž)
  );
}

async function exportArrivalsXLSX(items: Arrival[]) {
  try {
    const XLSX = await import(/* @vite-ignore */ "xlsx");
    const rows = formatArrivalRows(items);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Arrivals");
    XLSX.writeFile(
      wb,
      `arrivals_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  } catch (err) {
    console.warn("xlsx nije dostupan – CSV fallback", err);
    exportArrivalsCSV(items);
  }
}

function exportArrivalsPDF(items: Arrival[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = formatArrivalRows(items);
  const head = [
    [
      "ID",
      "Dobavljač",
      "Prevoznik",
      "Tablice",
      "Tip",
      "Šofer",
      "Datum za podizanje",
      "Datum kad stiže",
      "Cijena prevoza",
      "Cijena robe",
      "Status",
      "Napomena",
    ],
  ];
  const body = rows.map((r: any) => [
    r.ID,
    r["Dobavljač"],
    r["Prevoznik"],
    r["Tablice"],
    r["Tip"],
    r["Šofer"],
    r["Datum za podizanje"],
    r["Datum kad stiže"],
    r["Cijena prevoza"],
    r["Cijena robe"],
    r["Status"],
    r["Napomena"],
  ]);
  doc.setFontSize(14);
  doc.text("Dolasci — Izvoz", 14, 14);
  autoTable(doc, {
    head,
    body,
    startY: 18,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [63, 90, 224] },
  });
  doc.save(`arrivals_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/* --------------------- Helpers za novac (EU format) --------------------- */
const moneyToNumber = (val: any): number => {
  const raw = String(val ?? "").trim();
  if (!raw) return NaN;
  let s = raw.replace(/[^0-9,\.\-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",") && !s.includes(".")) s = s.replace(/,/g, ".");
  s = s.replace(/(\d)[\s](?=\d{3}\b)/g, "$1");
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
};
const numberToEU = (n: number): string => {
  if (typeof n !== "number" || isNaN(n)) return "";
  try {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    const s = n.toFixed(2);
    const [i, d] = s.split(".");
    return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`;
  }
};
const calcBalanceStr = (total: any, deposit: any): string => {
  const T = moneyToNumber(total);
  const D = moneyToNumber(deposit);
  if (isNaN(T) || isNaN(D)) return "";
  return numberToEU(T - D);
};
/* ----------------------- KONTEJNERI (tipovi + mapiranja) ----------------------- */
type ContainerApi = {
  id: number;
  supplier: string;
  proformaNo: string;
  etd: string | null;
  delivery: string | null;
  eta: string | null;
  cargoQty: string;
  cargo: string;
  containerNo: string;
  roba: string;
  containPrice: string;
  agent: string;
  total: string;
  deposit: string;
  balance: string;
  placeno?: boolean;
  paid?: boolean;
  created_at?: string;
  updated_at?: string;
};
type ContainerRow = {
  id: number;
  supplier: string;
  proformaNo: string;
  etd: string;
  delivery: string;
  eta: string;
  cargoQty: string;
  cargo: string;
  containerNo: string;
  roba: string;
  containPrice: string;
  agent: string;
  total: string;
  deposit: string;
  balance: string;
  placeno: boolean;
};

const mapApiToContainerRow = (c: ContainerApi): ContainerRow => ({
  id: c.id,
  supplier: (c as any).supplier ?? "",
  proformaNo:
    (c as any).proformaNo ??
    (c as any).proforma_no ??
    (c as any).proforma ??
    (c as any)["proforma no"] ??
    (c as any)["proforma no:"] ??
    (c as any)["PROFORMA NO"] ??
    (c as any)["PROFORMA NO:"] ??
    "",
  etd: (c as any).etd ?? "",
  delivery: (c as any).delivery ?? "",
  eta: (c as any).eta ?? "",
  cargoQty: (c as any).cargoQty ?? (c as any).cargo_qty ?? "",
  cargo: (c as any).cargo ?? "",
  containerNo:
    (c as any).containerNo ??
    (c as any).container_no ??
    (c as any)["container no"] ??
    (c as any)["container no."] ??
    "",
  roba: (c as any).roba ?? "",
  containPrice:
    (c as any).containPrice ??
    (c as any).contain_price ??
    (c as any).containerPrice ??
    (c as any).container_price ??
    (c as any)["contain price"] ??
    (c as any)["contain. price"] ??
    (c as any)["CONTAIN. PRICE"] ??
    (c as any)["CONTAIN PRICE"] ??
    (c as any).price ??
    "",
  agent: (c as any).agent ?? "",
  total: (c as any).total ?? "",
  deposit: (c as any).deposit ?? "",
  balance: (c as any).balance ?? "",
  placeno: Boolean((c as any).placeno ?? (c as any).paid ?? false),
});
const mapRowToApiPayload = (r: ContainerRow): Partial<ContainerApi> => ({
  supplier: r.supplier ?? "",
  proformaNo: r.proformaNo ?? "",
  etd: r.etd || null,
  delivery: r.delivery || null,
  eta: r.eta || null,
  cargoQty: r.cargoQty ?? "",
  cargo: r.cargo ?? "",
  containerNo: r.containerNo ?? "",
  roba: r.roba ?? "",
  containPrice: r.containPrice ?? "",
  agent: r.agent ?? "",
  total: r.total ?? "",
  deposit: r.deposit ?? "",
  balance: r.balance ?? "",
  placeno: !!r.placeno,
  paid: !!r.placeno,
});
/* ----------------------- Users (admin) — isti kao u App.tsx ----------------------- */
function UsersView() {
  const [rows, setRows] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<{
    name: string;
    email: string;
    password: string;
    role: string;
  }>({
    name: "",
    email: "",
    password: "",
    role: "viewer",
  });

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await apiGET<User[]>("/users", true);
      setRows(list);
    } catch (e: any) {
      setErr(e.message || "Greška");
    } finally {
      setLoading(false);
    }
  };
  React.useEffect(() => {
    load();
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiPOST<User>("/users", form, { auth: true });
      setRows((prev) => [created, ...prev]);
      setForm({ name: "", email: "", password: "", role: "viewer" });
    } catch (e: any) {
      alert(`Kreiranje korisnika nije uspjelo:\n${e.message}`);
    }
  };
  const updateRole = async (id: number, role: string) => {
    try {
      const u = await apiPATCH<User>(`/users/${id}`, { role }, true);
      setRows((prev) => prev.map((r) => (r.id === id ? u : r)));
    } catch (e: any) {
      alert(`Izmjena uloge nije uspjela:\n${e.message}`);
    }
  };
  const remove = async (id: number) => {
    if (!confirm("Obrisati korisnika?")) return;
    try {
      await apiDELETE<{ ok: boolean }>(`/users/${id}`, true);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(`Brisanje nije uspjelo:\n${e.message}`);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h3>Korisnici</h3>
      {err && <div style={styles.error}>{err}</div>}
      <form
        onSubmit={createUser}
        style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 16 }}
      >
        <input
          style={styles.input}
          placeholder="Ime"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          style={styles.input}
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="Lozinka"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          style={styles.select}
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          {["viewer", "planer", "proizvodnja", "transport", "carina", "admin"].map(
            (r) => (
              <option key={r} value={r}>
                {r}
              </option>
            )
          )}
        </select>
        <div>
          <button style={styles.primaryBtn} type="submit">
            Dodaj korisnika
          </button>
        </div>
      </form>

      {loading ? (
        <div>Učitavanje…</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Ime</th>
                <th>Email</th>
                <th>Uloga</th>
                <th style={{ textAlign: "right" }}>Akcije</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      style={styles.select}
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                    >
                      {[
                        "viewer",
                        "planer",
                        "proizvodnja",
                        "transport",
                        "carina",
                        "admin",
                      ].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      style={styles.dangerGhost}
                      onClick={() => remove(u.id)}
                    >
                      Obriši
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", opacity: 0.7 }}>
                    Nema korisnika.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
/* ----------------------- Mini bar chart za analitiku ----------------------- */
/* ================================ KONTEJNERI — FULL VIEW ================================ */
function ContainersView({ user, compact }: { user: User; compact: boolean }) {
  const canEdit = user.role === "admin";

  const [rows, setRows] = useState<ContainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // search/sort/paging
  const [q, setQ] = useState("");
  const [qRaw, setQRaw] = useState("");
  const [sortBy, setSortBy] = useState<string>("eta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  // create modal
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState<ContainerRow>({
    id: 0,
    supplier: "",
    proformaNo: "",
    etd: "",
    delivery: "",
    eta: "",
    cargoQty: "",
    cargo: "",
    containerNo: "",
    roba: "",
    containPrice: "",
    agent: "",
    total: "",
    deposit: "",
    balance: "",
    placeno: false,
  });

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(qRaw);
    }, 300);
    return () => clearTimeout(t);
  }, [qRaw]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const query = qs({
        q,
        sort: sortBy,
        order: sortDir,
        page,
        page_size: perPage,
      });
      try {
        const data = await apiGET<{
          items: ContainerApi[];
          total: number;
          page: number;
          per_page: number;
        }>(`/api/containers/search?${query}`, true);
        setRows(data.items.map(mapApiToContainerRow));
        setTotal(data.total);
      } catch {
        const list = await apiGET<ContainerApi[]>("/api/containers", true);
        setRows(list.map(mapApiToContainerRow));
        setTotal(list.length);
      }
    } catch (e: any) {
      setErr(e.message || "Greška");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sortBy, sortDir, page, perPage]);

  // helpers
  const computeBalance = (total: string, deposit: string) => {
    const b = calcBalanceStr(total, deposit);
    return b ?? "";
  };

  // CRUD handlers
  const createRow = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = mapRowToApiPayload({
        ...form,
        balance: computeBalance(form.total, form.deposit),
      } as ContainerRow);
      const created = await apiPOST<ContainerApi>("/api/containers", payload, {
        auth: true,
      });
      const row = mapApiToContainerRow(created);
      setRows((prev) => [row, ...prev]);
      setOpenCreate(false);
      setForm({
        id: 0,
        supplier: "",
        proformaNo: "",
        etd: "",
        delivery: "",
        eta: "",
        cargoQty: "",
        cargo: "",
        containerNo: "",
        roba: "",
        containPrice: "",
        agent: "",
        total: "",
        deposit: "",
        balance: "",
        placeno: false,
      });
    } catch (e: any) {
      alert(`Kreiranje nije uspjelo:\n${e.message}`);
    }
  };

  const updateField = async (id: number, patch: Partial<ContainerRow>) => {
    try {
      const current = rows.find((r) => r.id === id);
      if (!current) return;
      // optimistic
      const optimistic: ContainerRow = { ...current, ...patch };
      // auto-balance if total/deposit touched
      if ("total" in patch || "deposit" in patch) {
        optimistic.balance = computeBalance(
          optimistic.total,
          optimistic.deposit
        );
      }
      setRows((prev) => prev.map((r) => (r.id === id ? optimistic : r)));

      const payload = mapRowToApiPayload(optimistic);
      const upd = await apiPATCH<ContainerApi>(`/api/containers/${id}`, payload, true);
      const mapped = mapApiToContainerRow(upd);
      setRows((prev) => prev.map((r) => (r.id === id ? mapped : r)));
    } catch (e: any) {
      alert(`Čuvanje nije uspjelo:\n${e.message}`);
      try {
        const fresh = await apiGET<ContainerApi>(`/api/containers/${id}`, true);
        const mapped = mapApiToContainerRow(fresh);
        setRows((prev) => prev.map((r) => (r.id === id ? mapped : r)));
      } catch {}
    }
  };

  const removeRow = async (id: number) => {
    if (!confirm("Obrisati kontejner?")) return;
    try {
      setDeletingId(id);
      await apiDELETE<{ ok: boolean }>(`/api/containers/${id}`, true);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(`Brisanje nije uspjelo:\n${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // export CSV (simple)
  const exportCSV = () => {
    const headers = [
      "ID",
      "Dobavljač",
      "Proforma",
      "ETD",
      "Isporuka",
      "ETA",
      "Količina",
      "Teret",
      "Kontejner",
      "Roba",
      "Cijena kontejnera",
      "Agent",
      "Ukupno",
      "Depozit",
      "Balans",
      "Plaćeno",
    ];
    const escape = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv =
      [headers.join(",")]
        .concat(
          rows.map((r) =>
            [
              r.id,
              r.supplier,
              r.proformaNo,
              r.etd,
              r.delivery,
              r.eta,
              r.cargoQty,
              r.cargo,
              r.containerNo,
              r.roba,
              r.containPrice,
              r.agent,
              r.total,
              r.deposit,
              r.balance,
              r.placeno ? "da" : "ne",
            ]
              .map(escape)
              .join(",")
          )
        )
        .join("\n");
    downloadBlob(
      `containers_${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8",
      "\uFEFF" + csv
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 14px" }}>
        <img src="/logo-cungu.png" alt="Cungu" style={{ width: 34, height: 34, borderRadius: 8 }} />
        <div>
          <h3 style={{ margin: 0 }}>Kontejneri</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Pregled i upravljanje kontejnerima</div>
        </div>
      </div>

      {err && <div style={styles.error}>{err}</div>}
      {loading && <div>Učitavanje…</div>}

      {!loading && !err && (
        <>
          {/* Filters */}
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1.4fr .8fr .6fr .6fr .6fr" , marginBottom: 12 }}>
            <input style={styles.input} placeholder="Pretraga (dobavljač, kontejner…)" value={qRaw} onChange={(e)=>setQRaw(e.target.value)} />
            <select style={styles.select} value={sortBy} onChange={(e)=>setSortBy(e.target.value)}>
              <option value="eta">po ETA</option>
              <option value="supplier">po dobavljaču</option>
              <option value="containerNo">po kontejneru</option>
            </select>
            <select style={styles.select} value={sortDir} onChange={(e)=>setSortDir(e.target.value as any)}>
              <option value="desc">↓ opadajuće</option>
              <option value="asc">↑ rastuće</option>
            </select>
            <select style={styles.select} value={perPage} onChange={(e)=>{ setPerPage(Number(e.target.value)); setPage(1); }}>
              {[10,20,50].map(n => <option key={n} value={n}>{n}/str.</option>)}
            </select>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={styles.secondaryBtn} onClick={exportCSV}>CSV</button>
              <button style={styles.secondaryBtn} onClick={load}>Osveži</button>
              {canEdit && <button style={styles.secondaryBtn} onClick={()=>setOpenCreate(true)}>+ Novi</button>}
            </div>
          </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 10px' }}>
          <label style={{ fontSize: 12, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={compact} onChange={() => { /* controlled by parent; noop here */ }} />
            Kompaktno
          </label>
        </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <div style={{ fontSize:12, opacity:.65, margin:'4px 0 8px' }}>
              Savjet: <strong>dupli klik</strong> za brzo uređivanje. Polja "Ukupno" i "Depozit" automatski računaju "Balans".
            </div>
          <table className={compact ? 'compactTable' : ''} style={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Dobavljač</th>
                  <th>Proforma</th>
                  <th>ETD</th>
                  <th>Isporuka</th>
                  <th>ETA</th>
                  <th>Količina</th>
                  <th>Teret</th>
                  <th>Kontejner</th>
                  <th>Roba</th>
                  <th>Cijena kontejnera</th>
                  <th>Agent</th>
                  <th>Ukupno</th>
                  <th>Depozit</th>
                  <th>Balans</th>
                  <th>Plaćeno</th>
                  <th style={{ textAlign:"right" }}>Akcije</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.supplier} onSave={(v)=>updateField(r.id, { supplier: v })} />
                    ) : r.supplier}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.proformaNo} onSave={(v)=>updateField(r.id, { proformaNo: v })} />
                    ) : r.proformaNo}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.etd} onSave={(v)=>updateField(r.id, { etd: v })} />
                    ) : r.etd}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.delivery} onSave={(v)=>updateField(r.id, { delivery: v })} />
                    ) : r.delivery}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.eta} onSave={(v)=>updateField(r.id, { eta: v })} />
                    ) : r.eta}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.cargoQty} onSave={(v)=>updateField(r.id, { cargoQty: v })} />
                    ) : r.cargoQty}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.cargo} onSave={(v)=>updateField(r.id, { cargo: v })} />
                    ) : r.cargo}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.containerNo} onSave={(v)=>updateField(r.id, { containerNo: v })} />
                    ) : r.containerNo}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.roba} onSave={(v)=>updateField(r.id, { roba: v })} />
                    ) : r.roba}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.containPrice} onSave={(v)=>updateField(r.id, { containPrice: v })} />
                    ) : r.containPrice}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.agent} onSave={(v)=>updateField(r.id, { agent: v })} />
                    ) : r.agent}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.total} onSave={(v)=>updateField(r.id, { total: v })} />
                    ) : r.total}</td>
                    <td>{canEdit ? (
                      <InlineEdit value={r.deposit} onSave={(v)=>updateField(r.id, { deposit: v })} />
                    ) : r.deposit}</td>
                    <td>{r.balance}</td>
                    <td>
                      {canEdit ? (
                        <input
                          type="checkbox"
                          checked={!!r.placeno}
                          onChange={(e)=>updateField(r.id, { placeno: e.target.checked })}
                        />
                      ) : (r.placeno ? "da" : "ne")}
                    </td>
                    <td style={{ textAlign:"right", whiteSpace:"nowrap" }}>
                      {canEdit ? (
                        <button style={styles.dangerGhost} onClick={()=>removeRow(r.id)} disabled={deletingId===r.id}>
                          {deletingId===r.id ? "Brišem…" : "Obriši"}
                        </button>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={17} style={{ textAlign:"center", opacity:.7 }}>Nema zapisa.</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Paging */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
              <div>Ukupno: {total}</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button style={styles.secondaryBtn} onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>←</button>
                <span>Strana {page}</span>
                <button style={styles.secondaryBtn} onClick={()=>setPage(p=>p+1)} disabled={rows.length < perPage && (page*perPage >= total)}>→</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal – kreiranje */}
      {openCreate && canEdit && (
        <div style={styles.modalBackdrop} onClick={() => setOpenCreate(false)}>
          <div style={styles.modal} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{ marginTop:0 }}>Novi kontejner</h3>
            <form onSubmit={createRow} style={{ display:"grid", gap:8, gridTemplateColumns:"1fr 1fr", alignItems:"center" }}>
              <label style={styles.label}>Dobavljač</label>
              <input style={styles.input} value={form.supplier} required onChange={(e)=>setForm({...form, supplier:e.target.value})} />

              <label style={styles.label}>Proforma</label>
              <input style={styles.input} value={form.proformaNo} onChange={(e)=>setForm({...form, proformaNo:e.target.value})} />

              <label style={styles.label}>ETD</label>
              <input style={styles.input} value={form.etd} onChange={(e)=>setForm({...form, etd:e.target.value})} />

              <label style={styles.label}>Isporuka</label>
              <input style={styles.input} value={form.delivery} onChange={(e)=>setForm({...form, delivery:e.target.value})} />

              <label style={styles.label}>ETA</label>
              <input style={styles.input} value={form.eta} onChange={(e)=>setForm({...form, eta:e.target.value})} />

              <label style={styles.label}>Količina</label>
              <input style={styles.input} value={form.cargoQty} onChange={(e)=>setForm({...form, cargoQty:e.target.value})} />

              <label style={styles.label}>Teret</label>
              <input style={styles.input} value={form.cargo} onChange={(e)=>setForm({...form, cargo:e.target.value})} />

              <label style={styles.label}>Kontejner</label>
              <input style={styles.input} value={form.containerNo} onChange={(e)=>setForm({...form, containerNo:e.target.value})} />

              <label style={styles.label}>Roba</label>
              <input style={styles.input} value={form.roba} onChange={(e)=>setForm({...form, roba:e.target.value})} />

              <label style={styles.label}>Cijena kontejnera</label>
              <input style={styles.input} value={form.containPrice} onChange={(e)=>setForm({...form, containPrice:e.target.value})} />

              <label style={styles.label}>Agent</label>
              <input style={styles.input} value={form.agent} onChange={(e)=>setForm({...form, agent:e.target.value})} />

              <label style={styles.label}>Ukupno</label>
              <input style={styles.input} value={form.total} onChange={(e)=>setForm({...form, total:e.target.value, balance: computeBalance(e.target.value, form.deposit)})} />

              <label style={styles.label}>Depozit</label>
              <input style={styles.input} value={form.deposit} onChange={(e)=>setForm({...form, deposit:e.target.value, balance: computeBalance(form.total, e.target.value)})} />

              <label style={styles.label}>Balans</label>
              <input style={styles.input} value={form.balance} readOnly />

              <label style={styles.label}>Plaćeno</label>
              <input type="checkbox" checked={form.placeno} onChange={(e)=>setForm({...form, placeno:e.target.checked})} />

              <div style={{ gridColumn:"1 / -1", display:"flex", gap:8, marginTop:8 }}>
                <button style={styles.primaryBtn} type="submit">Sačuvaj</button>
                <button style={styles.secondaryBtn} type="button" onClick={()=>setOpenCreate(false)}>Otkaži</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
/* ================================== DASHBOARD ================================== */

export default function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  // ——— Arrivals state
  // Table density (to match stari "kompaktni" izgled)
  const [compact, setCompact] = useState(true);
  const [items, setItems] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ——— Search / sort / paging
  const [q, setQ] = useState("");
  const [qRaw, setQRaw] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("eta");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  // ——— Tabs
  const [tab, setTab] = useState<'arrivals' | 'updates' | 'containers' | 'users'>('arrivals');

  // ——— Create modal
  const [openCreate, setOpenCreate] = useState(false);
  const [newForm, setNewForm] = useState<Partial<Arrival>>({
    supplier: "",
    carrier: "",
    plate: "",
    type: "truck",
    driver: "",
    pickup_date: "",
    eta: "",
    transport_price: null,
    goods_price: null,
    status: "not shipped",
    note: "",
  });
// ——— Updates (per-arrival)
  const [openUpdates, setOpenUpdates] = useState<null | number>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [newNote, setNewNote] = useState("");

  // ——— Files (per-arrival)
  const [openFiles, setOpenFiles] = useState<null | number>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);

  // ——— Global feed (Aktivnosti)
  const [feed, setFeed] = useState<Update[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedErr, setFeedErr] = useState<string | null>(null);

  // ——— Delete busy flag
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ——— Role permissions
  const may = useMemo(() => ROLE_FIELDS[user.role] || new Set<string>(), [user.role]);

  // ——— KPIs
  const kpis = useMemo(() => {
    const total = items.length;
    const arriving = items.filter(i => i.status === 'shipped').length;
    const arrived = items.filter(i => i.status === 'arrived').length;
    const delayed = 0; // (možemo dodati logiku kasnije)
    return { total, arriving, arrived, delayed };
  }, [items]);

  // ——— Title/favicon
  useEffect(() => {
    document.title = `Arrivals • ${user.name} (${user.role}) — Cungu`;
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = '/logo-cungu.png';
  }, [user]);

  // ——— Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qRaw); }, 300);
    return () => clearTimeout(t);
  }, [qRaw]);
  // ——— Load arrivals (search endpoint, sa fallback-om)
  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const query = qs({
        q,
        status: statusFilter || undefined,
        sort: sortBy,
        order: sortDir,
        page,
        page_size: perPage,
      });
      const data = await apiGET<{ items: Arrival[]; total: number; page: number; per_page: number }>(`/api/arrivals/search?${query}`, true);
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      try {
        const data = await apiGET<Arrival[]>("/api/arrivals", true);
        setItems(data);
        setTotal(data.length);
      } catch (err2:any) {
        setErr(e.message || "Greška");
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [q, statusFilter, sortBy, sortDir, page, perPage]);
  // Automatic refresh every 30 seconds for arrivals data
  useEffect(() => {
    const interval = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(interval);
  }, [q, statusFilter, sortBy, sortDir, page, perPage, perPage]);
// ——— Load global feed (Aktivnosti) kada se otvori tab
  useEffect(() => {
    const run = async () => {
      setFeedLoading(true);
      setFeedErr(null);
      try {
        try {
          const rows = await apiGET<Update[]>('/api/updates', true);
          setFeed(rows);
        } catch {
          const arrivals = items.length ? items : await apiGET<Arrival[]>('/api/arrivals', true);
          const settled = await Promise.allSettled(
            arrivals.slice(0, 30).map(a => apiGET<Update[]>(`/api/arrivals/${a.id}/updates`, true).then(list =>
              list.map(u => ({ ...u, arrival_id: a.id }))
            ))
          );
          const merged: Update[] = [];
          for (const s of settled) if (s.status === 'fulfilled') merged.push(...s.value);
          merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          setFeed(merged.slice(0, 100));
        }
      } catch (e:any) {
        setFeedErr(e.message || 'Greška pri učitavanju aktivnosti');
      } finally {
        setFeedLoading(false);
      }
    };
    if (tab === 'updates') run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ——— Files modal (arrivals)
  const openArrivalFiles = async (arrivalId: number) => {
    setOpenFiles(arrivalId);
    setFiles([]);
    try {
      const list = await apiGET<FileMeta[]>(`/api/arrivals/${arrivalId}/files`, true);
      setFiles(list);
    } catch (e:any) {
      alert(`Greška pri učitavanju fajlova:\n${e.message}`);
    }
  };
  const uploadFiles = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    if (!openFiles) return;
    const fl = ev.target.files;
    if (!fl || fl.length === 0) return;
    const form = new FormData();
    Array.from(fl).forEach(f => form.append("file", f));
    try {
      const result = await apiUPLOAD<FileMeta[]>(`/api/arrivals/${openFiles}/files`, form, true);
      setFiles(prev => [...prev, ...result]);
    } catch(e:any) {
      alert(`Upload nije uspio:\n${e.message}`);
    } finally {
      ev.target.value = "";
    }
  };
  const deleteFile = async (fid: number) => {
    if (!openFiles) return;
    if (!confirm("Obrisati fajl?")) return;
    try {
      await apiDELETE<{ok:boolean}>(`/api/arrivals/${openFiles}/files/${fid}`, true);
      setFiles(prev => prev.filter(f => f.id !== fid));
    } catch(e:any) {
      alert(`Brisanje fajla nije uspjelo:\n${e.message}`);
    }
  };

  // ——— Status
  const changeStatus = async (id: number, status: Arrival["status"]) => {
    try {
      const updated = await apiPATCH<Arrival>(`/api/arrivals/${id}/status`, { status }, true);
      setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    } catch (e: any) {
      alert(`Neuspješna izmjena statusa:\n${e.message}`);
    }
  };

  // ——— Delete
  const removeArrival = async (id: number) => {
    if (!confirm("Obrisati ovaj zapis?")) return;
    try {
      setDeletingId(id);
      await apiDELETE<{ ok: boolean }>(`/api/arrivals/${id}`, true);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      alert(`Brisanje nije uspjelo:\n${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // ——— Create
  const createArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { supplier, carrier, plate, type, driver, pickup_date, eta, transport_price, goods_price, status, note } = newForm;
      const payload = {
        supplier, carrier, plate, type, driver,
        pickup_date: parseDateInput(pickup_date as any),
        eta: parseDateInput(eta as any),
        transport_price: (transport_price==null || String(transport_price).trim()==="") ? null : (isNaN(moneyToNumber(transport_price)) ? null : moneyToNumber(transport_price)),
        goods_price: (goods_price==null || String(goods_price).trim()==="") ? null : (isNaN(moneyToNumber(goods_price)) ? null : moneyToNumber(goods_price)),
        status, note,
      };
      const created = await apiPOST<Arrival>("/api/arrivals", payload, { auth: true, useApiKey: true });
      setItems((prev) => [created, ...prev]);
      setOpenCreate(false);
      setNewForm({
        supplier: "",
        carrier: "",
        plate: "",
        type: "truck",
        driver: "",
        pickup_date: "",
        eta: "",
        transport_price: null,
        goods_price: null,
        status: "not shipped",
        note: "",
      });
    } catch (e: any) {
      alert(`Kreiranje nije uspjelo:\n${e.message}`);
    }
  };

  // ——— Per-arrival updates (notes)
  const openArrivalUpdates = async (arrivalId: number) => {
    setOpenUpdates(arrivalId);
    setUpdates([]);
    setNewNote("");
    try {
      const rows = await apiGET<Update[]>(`/api/arrivals/${arrivalId}/updates`, true);
      setUpdates(rows);
    } catch (e:any) {
      alert(`Greška pri učitavanju beleški:\n${e.message}`);
    }
  };
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openUpdates) return;
    if (!newNote.trim()) return;
    try {
      const row = await apiPOST<Update>(`/api/arrivals/${openUpdates}/updates`, { message: newNote }, { auth: true });
      setUpdates((prev) => [...prev, row]);
      setNewNote("");
    } catch (e:any) {
      alert(`Beleška nije dodata:\n${e.message}`);
    }
  };

  // ——— UI
  return (
    <div style={styles.pageRoot}>
      {/* Header / Tabs */}
      <header style={styles.header}>
        <div style={{ maxWidth: 1200, width: "100%", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <img src="/logo-cungu.png" alt="Cungu" style={{ width:28, height:28, borderRadius:6 }} />
            <div style={{ display:'flex', alignItems:'baseline', gap:8, fontWeight:800 }}>
              <span>Arrivals</span>
              <span style={{ fontWeight:500, opacity:.75 }}>• {user.name} ({user.role})</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            <nav style={styles.tabs}>
              <button className={tab==='arrivals' ? 'active' : ''} style={{ ...styles.tabBtn, ...(tab==='arrivals'?styles.tabBtnActive:{}) }} onClick={()=>setTab('arrivals')}>Dolasci <span className="tabBadge">{total}</span></button>
              <button className={tab==='updates' ? 'active' : ''} style={{ ...styles.tabBtn, ...(tab==='updates'?styles.tabBtnActive:{}) }} onClick={()=>setTab('updates')}>Aktivnosti</button>
              <button className={tab==='containers' ? 'active' : ''} style={{ ...styles.tabBtn, ...(tab==='containers'?styles.tabBtnActive:{}) }} onClick={()=>setTab('containers')}>Kontejneri</button>
              {user.role==='admin' && (
                <button className={tab==='users' ? 'active' : ''} style={{ ...styles.tabBtn, ...(tab==='users'?styles.tabBtnActive:{}) }} onClick={()=>setTab('users')}>Korisnici</button>
              )}
            </nav>
            <button style={styles.secondaryBtn} onClick={load}>Osveži</button>
            <button style={styles.secondaryBtn} onClick={() => setOpenCreate(true)}>+ Novi dolazak</button>
            <button style={styles.dangerGhost} onClick={() => { setToken(null); onLogout(); }}>Odjava</button>
          </div>
        </div>
      </header>

      <main style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 1200, width: "100%" }}>
        {/* Page title */}
        {tab === 'arrivals' && (
          <div style={{ display:'flex', alignItems:'center', gap:12, margin:'8px 0 14px' }}>
            <img src="/logo-cungu.png" alt="Cungu" style={{ width:34, height:34, borderRadius:8 }} />
            <div>
              <h3 style={{ margin:0 }}>Dolasci</h3>
              <div style={{ fontSize:12, opacity:.7 }}>Pregled & upravljanje dolascima</div>
            </div>
          </div>
        )}

        {loading && <div>Učitavanje…</div>}
        {err && <div style={styles.error}>{err}</div>}

        {/* KPI */}
        {tab === 'arrivals' && !loading && !err && (
          <div style={styles.kpiRow}>
            <div style={styles.kpiCard}><div style={styles.kpiLabel}>Ukupno</div><div style={styles.kpiValue}>{kpis.total}</div></div>
            <div style={styles.kpiCard}><div style={styles.kpiLabel}>U dolasku</div><div style={styles.kpiValue}>{kpis.arriving}</div></div>
            <div style={styles.kpiCard}><div style={styles.kpiLabel}>Stiglo</div><div style={styles.kpiValue}>{kpis.arrived}</div></div>
            <div style={styles.kpiCardDanger}><div style={styles.kpiLabel}>Kašnjenja</div><div style={styles.kpiValue}>{kpis.delayed}</div></div>
          </div>
        )}

        {/* Filters */}
        {tab === 'arrivals' && (
          <>
            <div style={{ display:"grid", gap:8, gridTemplateColumns:"1.2fr .8fr .8fr .6fr .6fr", marginBottom: 12 }}>
              <input style={styles.input} placeholder="Pretraga (dobavljač…)" value={qRaw} onChange={(e)=>setQRaw(e.target.value)} />
              <select style={styles.select} value={statusFilter} onChange={e=>{ setPage(1); setStatusFilter(e.target.value); }}>
                <option value="">Svi statusi</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <select style={styles.select} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                <option value="eta">po ETA</option>
                <option value="supplier">po dobavljaču</option>
                <option value="status">po statusu</option>
              </select>
              <select style={styles.select} value={sortDir} onChange={e=>setSortDir(e.target.value as any)}>
                <option value="desc">↓ opadajuće</option>
                <option value="asc">↑ rastuće</option>
              </select>
              <select style={styles.select} value={perPage} onChange={e=>{ setPerPage(Number(e.target.value)); setPage(1); }}>
                {[10,20,50].map(n=><option key={n} value={n}>{n}/str.</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 10px' }}>
              <label style={{ fontSize: 12, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} />
                Kompaktno
              </label>
            </div>

            {/* Export dugmad */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', margin:'8px 0 12px' }}>
              <button style={styles.secondaryBtn} onClick={() => exportArrivalsCSV(items)}>CSV</button>
              <button style={styles.secondaryBtn} onClick={() => exportArrivalsPDF(items)}>PDF</button>
              <button style={styles.secondaryBtn} onClick={() => exportArrivalsXLSX(items)}>Excel</button>
            </div>
          </>
        )}
{/* Table */}
        {tab === 'arrivals' && !loading && !err && (
          <div style={{ overflowX:'auto', width:'100%' }}>
            <div style={{ fontSize:12, opacity:.65, margin:'4px 0 8px' }}>
              Savjet: <strong>dupli klik</strong> na polje za brzo uređivanje. Status mijenjajte iz padajućeg menija.
            </div>
            <table className={compact ? 'compactTable' : ''} style={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Dobavljač</th>
                  <th>Prevoznik</th>
                  <th>Tip</th>
                  <th>Tablice</th>
                  <th>Šofer</th>
                  <th>Datum za podizanje</th>
                  <th>Datum kad stiže</th>
                  <th>Cijena prevoza</th>
                  <th>Cijena robe</th>
                  <th>Status</th>
                  <th>Napomena</th>
                  <th style={{ textAlign:'right' }}>Akcije</th>
                </tr>
              </thead>
              <tbody>
                {items.map(a => (
                  <tr key={a.id}>
                    <td>{a.id}</td>
                    <td>
                      {may.has("supplier") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.supplier}
                          onSave={async (val)=>{
                            try{
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { supplier: val }, true);
                              setItems(prev => prev.map(x=>x.id===a.id?upd:x));
                            }catch(e:any){ alert(`Čuvanje nije uspjelo:\n${e.message}`); }
                          }}
                        />
                      ) : a.supplier}
                    </td>
                    <td>{a.carrier || "-"}</td>
                    <td>{a.type}</td>
                    <td>
                      {may.has("plate") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.plate || ""}
                          onSave={async (val)=>{
                            try{
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { plate: val }, true);
                              setItems(prev => prev.map(x=>x.id===a.id?upd:x));
                            }catch(e:any){ alert(`Čuvanje nije uspjelo:\n${e.message}`); }
                          }}
                        />
                      ) : (a.plate || "-")}
                    </td>
                    <td>
                      {may.has("driver") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.driver || ""}
                          onSave={async (val)=>{
                            // optimistično
                            setItems(prev => prev.map(x => x.id===a.id ? { ...x, driver: val } : x));
                            try{
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { driver: val }, true);
                              setItems(prev => prev.map(x => x.id===a.id ? { ...x, ...upd } : x));
                            }catch(e:any){
                              alert(`Čuvanje nije uspjelo:\n${e.message}`);
                              try {
                                const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
                                setItems(prev => prev.map(x => x.id===a.id ? fresh : x));
                              } catch {}
                            }
                          }}
                        />
                      ) : (a.driver || "-")}
                    </td>
                    <td>
                      {may.has("pickup_date") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.pickup_date ? formatDateEU(a.pickup_date) : ""}
                          onSave={async (val)=>{
                            const iso = parseDateInput(val);
                            setItems(prev => prev.map(x => x.id===a.id ? { ...x, pickup_date: iso } : x));
                            try{
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { pickup_date: iso }, true);
                              setItems(prev => prev.map(x => x.id===a.id ? { ...x, ...upd } : x));
                            }catch(e:any){
                              alert(`Čuvanje nije uspjelo:\n${e.message}`);
                              try {
                                const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
                                setItems(prev => prev.map(x => x.id===a.id ? fresh : x));
                              } catch {}
                            }
                          }}
                        />
                      ) : formatDateEU(a.pickup_date)}
                    </td>
                    <td>
                      {may.has("eta") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.eta ? formatDateEU(a.eta) : ""}
                          onSave={async (val)=>{
                            try{
                              const iso = parseDateInput(val);
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { eta: iso }, true);
                              setItems(prev => prev.map(x => x.id===a.id ? upd : x));
                            }catch(e:any){ alert(`Čuvanje nije uspjelo:\n${e.message}`); }
                          }}
                        />
                      ) : formatDateEU(a.eta)}
                    </td>
                    <td>
                      {may.has("transport_price") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.transport_price != null ? String(a.transport_price) : ""}
                          onSave={async (val)=>{
                            const parsed = String(val).trim()==="" ? null : moneyToNumber(val);
                            const num = parsed==null || isNaN(parsed) ? null : parsed;
                            setItems(prev => prev.map(x => x.id===a.id ? { ...x, transport_price: num } : x));
                            try{
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { transport_price: num }, true);
                              setItems(prev => prev.map(x => x.id===a.id ? { ...x, ...upd } : x));
                            }catch(e:any){
                              alert(`Čuvanje nije uspjelo:\n${e.message}`);
                              try {
                                const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
                                setItems(prev => prev.map(x => x.id===a.id ? fresh : x));
                              } catch {}
                            }
                          }}
                        />
                         ) : (a.transport_price != null ? formatCurrency(a.transport_price) : "-")}
                    </td>
                    <td>
                      {may.has("goods_price") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.goods_price != null ? String(a.goods_price) : ""}
                          onSave={async (val)=>{
                            const parsed = String(val).trim()==="" ? null : moneyToNumber(val);
                            const num = parsed==null || isNaN(parsed) ? null : parsed;
                            setItems(prev => prev.map(x => x.id===a.id ? { ...x, goods_price: num } : x));
                            try{
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { goods_price: num }, true);
                              setItems(prev => prev.map(x => x.id===a.id ? { ...x, ...upd } : x));
                            }catch(e:any){
                              alert(`Čuvanje nije uspjelo:\n${e.message}`);
                              try {
                                const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
                                setItems(prev => prev.map(x => x.id===a.id ? fresh : x));
                              } catch {}
                            }
                          }}
                        />
                      ) : (a.goods_price != null ? `${formatCurrency(a.goods_price)} €` : "-")}
                    </td>
                    <td>
                      {may.has("status") || user.role==="admin" ? (
                        <select style={styles.select} value={a.status} onChange={(e)=>changeStatus(a.id, e.target.value as Arrival["status"])}>
                          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      ) : <span style={getStatusChipStyle(a.status)}>{STATUS_LABELS[a.status] ?? a.status}</span>}
                    </td>
                    <td>
                      {may.has("note") || user.role==="admin" ? (
                        <InlineEdit
                          textarea
                          value={a.note || ""}
                          onSave={async (val)=>{
                            try{
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { note: val }, true);
                              setItems(prev => prev.map(x=>x.id===a.id?upd:x));
                            }catch(e:any){ alert(`Čuvanje nije uspjelo:\n${e.message}`); }
                          }}
                        />
                      ) : (a.note || "-")}
                    </td>
                    <td style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                      <button style={styles.ghostBtn} onClick={()=>openArrivalFiles(a.id)}>Fajlovi</button>
                      <button style={styles.ghostBtn} onClick={()=>openArrivalUpdates(a.id)}>Beleške</button>
                      <button style={styles.dangerGhost} onClick={()=>removeArrival(a.id)} disabled={deletingId===a.id}>
                        {deletingId===a.id ? "Brišem…" : "Obriši"}
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={13} style={{ textAlign:'center', opacity:.7 }}>Nema zapisa.</td></tr>
                )}
              </tbody>
            </table>
            {/* Paging */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
              <div>Ukupno: {total}</div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button style={styles.secondaryBtn} onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>←</button>
                <span>Strana {page}</span>
                <button style={styles.secondaryBtn} onClick={()=>setPage(p=>p+1)} disabled={items.length < perPage && (page*perPage >= total)}>→</button>
              </div>
            </div>
          </div>
        )}

        {/* Aktivnosti (global feed) */}
        {tab === 'updates' && (
          <div style={{ display:'grid', gap:8 }}>
            <h3>Aktivnosti</h3>
            {feedLoading && <div>Učitavanje aktivnosti…</div>}
            {feedErr && <div style={styles.error}>{feedErr}</div>}
            {!feedLoading && !feedErr && (
              <div style={{ border:'1px solid rgba(0,0,0,0.08)', borderRadius:8, overflow:'hidden' }}>
                <table className="compactTable" style={styles.table}>
                  <thead>
                    <tr>
                      <th>Vrijeme</th>
                      <th>Dolazak</th>
                      <th>Poruka</th>
                      <th>Korisnik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feed.map(u => (
                      <tr key={u.id}>
                        <td>{new Date(u.created_at).toLocaleString()}</td>
                        <td>#{u.arrival_id}</td>
                        <td>{u.message}</td>
                        <td>{u.user_id ?? '-'}</td>
                      </tr>
                    ))}
                    {feed.length===0 && <tr><td colSpan={4} style={{ textAlign:'center', opacity:.7 }}>Nema aktivnosti.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
 {/* Kontejneri — FULL */}
        {tab === 'containers' && (
          <ContainersView user={user} compact={compact} />
        )}

        {/* Users (admin) */}
        {tab === 'users' && user.role === 'admin' && <UsersView />}
        </div>
      </main>

      {/* Modal – kreiranje */}
      {openCreate && (
        <div style={styles.modalBackdrop} onClick={() => setOpenCreate(false)}>
          <div style={styles.modal} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{ marginTop:0 }}>Novi dolazak</h3>
            <form onSubmit={createArrival} style={{ display:'grid', gap:8 }}>
              <label style={styles.label}>Dobavljač</label>
              <input style={styles.input} required value={newForm.supplier || ""} onChange={(e)=>setNewForm({ ...newForm, supplier: e.target.value })} />

              <label style={styles.label}>Prevoznik</label>
              <input style={styles.input} value={newForm.carrier || ""} onChange={(e)=>setNewForm({ ...newForm, carrier: e.target.value })} />

              <label style={styles.label}>Tip</label>
              <select style={styles.select} value={newForm.type || "truck"} onChange={(e)=>setNewForm({ ...newForm, type: e.target.value })}>
                {(["truck","van","container","air","rail","ship"] as string[]).map(t=> <option key={t} value={t}>{t}</option>)}
              </select>

              <label style={styles.label}>ETA</label>
              <input style={styles.input} type="datetime-local" value={newForm.eta || ""} onChange={(e)=>setNewForm({ ...newForm, eta: e.target.value })} />

              <label style={styles.label}>Status</label>
              <select style={styles.select} value={newForm.status || "not shipped"} onChange={(e)=>setNewForm({ ...newForm, status: e.target.value as Arrival["status"] })}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>

              <label style={styles.label}>Napomena</label>
              <textarea style={styles.textarea} value={newForm.note || ""} onChange={(e)=>setNewForm({ ...newForm, note: e.target.value })} />

              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <button style={styles.primaryBtn} type="submit">Sačuvaj</button>
                <button style={styles.secondaryBtn} type="button" onClick={()=>setOpenCreate(false)}>Otkaži</button>
              </div>

              {!API_KEY && (
                <div style={styles.warn}>
                  Upozorenje: VITE_API_KEY nije postavljen – kreiranje možda neće raditi (ako backend zahtijeva X-API-Key).
                </div>
              )}
            </form>
          </div>
        </div>
      )}
      {/* Modal – beleške */}
      {openUpdates && (
        <div style={styles.modalBackdrop} onClick={() => setOpenUpdates(null)}>
          <div style={styles.modal} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{ marginTop:0 }}>Beleške / Aktivnosti</h3>
            <div style={{ maxHeight:260, overflow:"auto", border:"1px solid rgba(0,0,0,0.08)", borderRadius:8, padding:8, marginBottom:12 }}>
              {updates.map((u)=>(
                <div key={u.id} style={{ padding:"6px 8px", borderBottom:"1px solid rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize:12, opacity:.8 }}>{new Date(u.created_at).toLocaleString()} • korisnik #{u.user_id ?? "-"}</div>
                  <div>{u.message}</div>
                </div>
              ))}
              {updates.length===0 && <div style={{ opacity:.7 }}>Još nema beleški.</div>}
            </div>
            <form onSubmit={addNote} style={{ display:'grid', gap:8 }}>
              <textarea style={styles.textarea} placeholder="Dodaj belešku…" value={newNote} onChange={(e)=>setNewNote(e.target.value)} />
              <div style={{ display:'flex', gap:8 }}>
                <button style={styles.primaryBtn} type="submit">Sačuvaj belešku</button>
                <button style={styles.secondaryBtn} type="button" onClick={()=>setOpenUpdates(null)}>Zatvori</button>
              </div>
            </form>
          </div>
        </div>
      )}
 {/* Modal – fajlovi */}
      {openFiles && (
        <div style={styles.modalBackdrop} onClick={() => setOpenFiles(null)}>
          <div style={styles.modal} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{ marginTop:0 }}>Fajlovi za dolazak #{openFiles}</h3>
            <div style={{ marginBottom:8 }}>
              <input type="file" multiple onChange={uploadFiles} />
            </div>
            <div style={{ maxHeight:260, overflow:"auto", border:"1px solid rgba(0,0,0,0.08)", borderRadius:8, padding:8 }}>
              {files.map(f=>(
                <div key={f.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid rgba(0,0,0,0.06)", padding:"6px 4px" }}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color:"#3f5ae0" }}>{f.filename}</a>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:12, opacity:.7 }}>{new Date(f.uploaded_at).toLocaleString()}</span>
                    <button style={styles.dangerGhost} onClick={()=>deleteFile(f.id)}>Obriši</button>
                  </div>
                </div>
              ))}
              {files.length===0 && <div style={{ opacity:.7 }}>Još nema fajlova.</div>}
            </div>
            <div style={{ marginTop:8, textAlign:'right' }}>
              <button style={styles.secondaryBtn} onClick={()=>setOpenFiles(null)}>Zatvori</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}