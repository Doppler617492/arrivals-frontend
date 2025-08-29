// src/App.tsx

import React, { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "./utils/formatCurrency";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type FileMeta = { id: number; filename: string; url: string; uploaded_at: string; size?: number };
type ArrivalSearchResponse = { items: Arrival[]; total: number; page: number; per_page: number };

type User = { id: number; email: string; name: string; role: string };
type Arrival = {
  id: number;
  supplier: string;
  carrier: string | null;
  plate: string | null;           // Tablice
  type: string;                   // Tip (truck, container…)
  driver: string | null;          // Šofer
  pickup_date: string | null;     // Datum za podizanje robe (ISO)
  eta: string | null;             // Datum kad stiže (ISO)
  transport_price: number | null; // Cijena prevoza
  goods_price: number | null;     // Cijena robe
  status: "not shipped" | "shipped" | "arrived";
  note: string | null;
  created_at: string;
};

type Update = {
  id: number;
  arrival_id: number;
  user_id: number | null;
  message: string;
  created_at: string;
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8081";
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

async function apiUPLOAD<T>(path: string, form: FormData, auth = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) headers["Authorization"] = `Bearer ${getToken()}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}
function qs(params: Record<string, any>) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    u.set(k, String(v));
  });
  return u.toString();
}

// ——— helpers —————————————————————————————————————————————————————————————
function getToken() {
  return localStorage.getItem("token");
}
function setToken(t: string | null) {
  if (!t) localStorage.removeItem("token");
  else localStorage.setItem("token", t);
}

async function apiGET<T>(path: string, auth = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(auth ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 422) {
      // JWT expired/invalid – force logout by clearing token
      localStorage.removeItem("token");
    }
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}
async function apiPOST<T>(
  path: string,
  body: any,
  opts?: { auth?: boolean; useApiKey?: boolean }
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts?.auth ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(opts?.useApiKey && API_KEY ? { "X-API-Key": API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 422) {
      // JWT expired/invalid – force logout by clearing token
      localStorage.removeItem("token");
    }
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}
async function apiPATCH<T>(
  path: string,
  body: any,
  auth = false
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 422) {
      // JWT expired/invalid – force logout by clearing token
      localStorage.removeItem("token");
    }
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}
async function apiDELETE<T>(path: string, auth = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      ...(auth ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 422) {
      localStorage.removeItem("token");
    }
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (res.status === 204 || !ct.includes("application/json")) {
    // Some backends return no content on DELETE – synthesize a success payload.
    return { ok: true } as any;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : ({ ok: true } as any)) as T;
}

// Dozvole po ulozi – mora da se poklopi sa backend ROLE_FIELDS
const ROLE_FIELDS: Record<string, Set<string>> = {
  admin: new Set([
    "supplier","carrier","plate","type","driver","pickup_date","eta",
    "transport_price","goods_price","status","note"
  ]),
  planer: new Set(["supplier","type","pickup_date","eta","status","note"]),
  proizvodnja: new Set(["status","note"]),
  transport: new Set(["carrier","plate","driver","pickup_date","eta","status","note","transport_price"]),
  carina: new Set(["status","note"]),
  viewer: new Set([]),
};

const STATUSES: Arrival["status"][] = [
  "not shipped",
  "shipped",
  "arrived",
];

const STATUS_LABELS: Record<Arrival['status'], string> = {
  'not shipped': 'Nije otpremljeno',
  'shipped': 'U transportu',
  'arrived': 'Stiglo',
} as const;

// small helper to colorize status labels
function getStatusChipStyle(s: Arrival['status']): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.06)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  };
  const map: Record<Arrival['status'], React.CSSProperties> = {
    'not shipped': { background: 'rgba(148,163,184,0.15)', border: '1px solid rgba(148,163,184,0.35)' },
    shipped:       { background: 'rgba(59,130,246,0.15)',  border: '1px solid rgba(59,130,246,0.35)'  },
    arrived:       { background: 'rgba(34,197,94,0.15)',   border: '1px solid rgba(34,197,94,0.35)'   },
  } as const;
  return { ...base, ...(map[s] || {}) };
}

// ——— Export helpers ——————————————————————————————————————————————————————
function formatDateEU(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// Accepts user date input and normalizes to ISO string (UTC) or null.
// Supports "dd.mm.yyyy", "yyyy-mm-dd", and other JS-parseable strings.
function parseDateInput(val: any): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s) return null;

  // dd.mm.yyyy
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1; // 0-based
    const yyyy = Number(m[3]);
    const d = new Date(Date.UTC(yyyy, mm, dd));
    if (!isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  // yyyy-mm-dd (from <input type="date">)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    if (!isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  // Fallback: try native Date parsing
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
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
    "Cijena prevoza": typeof a.transport_price === "number" ? formatCurrency(a.transport_price) : "-",
    "Cijena robe": typeof a.goods_price === "number" ? formatCurrency(a.goods_price) : "-",
    Status: STATUS_LABELS[a.status] ?? a.status,
    Napomena: a.note || "-",
  }));
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

function exportArrivalsCSV(items: Arrival[]) {
  const rows = formatArrivalRows(items);
  const headers = Object.keys(rows[0] || {
    ID: "",
    "Dobavljač": "",
    "Prevoznik": "",
    "Tablice": "",
    "Tip": "",
    "Šofer": "",
    "Datum za podizanje": "",
    "Datum kad stiže": "",
    "Cijena prevoza": "",
    "Cijena robe": "",
    "Status": "",
    "Napomena": "",
  });
  const escape = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => escape((r as any)[h])).join(",")))
    .join("\n");
  // Prepend BOM so Excel properly detects UTF-8 (ćčđšž)
  downloadBlob(`arrivals_${new Date().toISOString().slice(0,10)}.csv`, "text/csv;charset=utf-8", "\uFEFF" + csv);
}

async function exportArrivalsXLSX(items: Arrival[]) {
  try {
    const XLSX = await import(/* @vite-ignore */ "xlsx");
    const rows = formatArrivalRows(items);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Arrivals");
    XLSX.writeFile(wb, `arrivals_${new Date().toISOString().slice(0,10)}.xlsx`);
  } catch (err) {
    // Fallback to CSV if xlsx lib is not installed
    console.warn("xlsx not available, falling back to CSV", err);
    exportArrivalsCSV(items);
  }
}

function exportArrivalsPDF(items: Arrival[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = formatArrivalRows(items);
  const head = [
    [
      "ID","Dobavljač","Prevoznik","Tablice","Tip","Šofer","Datum za podizanje","Datum kad stiže","Cijena prevoza","Cijena robe","Status","Napomena"
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
  doc.save(`arrivals_${new Date().toISOString().slice(0,10)}.pdf`);
}

// ——— Containers (remote API helpers) ————————————————————————————————
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
  placeno?: boolean; // preferred key on backend
  paid?: boolean;    // backward compatibility
  created_at?: string;
  updated_at?: string;
};

const mapApiToContainerRow = (c: ContainerApi): ContainerRow => ({
  id: c.id,
  supplier: (c as any).supplier ?? '',
  // proforma number: handle multiple backend variants and label-like keys
  proformaNo:
    (c as any).proformaNo ??
    (c as any).proforma_no ??
    (c as any).proforma ??
    (c as any)['proforma no'] ??
    (c as any)['proforma no:'] ??
    (c as any)['PROFORMA NO'] ??
    (c as any)['PROFORMA NO:'] ??
    '',
  etd: (c as any).etd ?? '',
  delivery: (c as any).delivery ?? '',
  eta: (c as any).eta ?? '',
  cargoQty: (c as any).cargoQty ?? (c as any).cargo_qty ?? '',
  cargo: (c as any).cargo ?? '',
  containerNo:
    (c as any).containerNo ??
    (c as any).container_no ??
    (c as any)['container no'] ??
    (c as any)['container no.'] ??
    '',
  roba: (c as any).roba ?? '',
  // contain price: accept various keys used by different sheets/backends
  containPrice:
    (c as any).containPrice ??
    (c as any).contain_price ??
    (c as any).containerPrice ??
    (c as any).container_price ??
    (c as any)['contain price'] ??
    (c as any)['contain. price'] ??
    (c as any)['CONTAIN. PRICE'] ??
    (c as any)['CONTAIN PRICE'] ??
    (c as any).price ??
    '',
  agent: (c as any).agent ?? '',
  total: (c as any).total ?? '',
  deposit: (c as any).deposit ?? '',
  balance: (c as any).balance ?? '',
  placeno: Boolean((c as any).placeno ?? (c as any).paid ?? false),
});

const mapRowToApiPayload = (r: ContainerRow): Partial<ContainerApi> => ({
  supplier: r.supplier ?? '',
  proformaNo: r.proformaNo ?? '',
  etd: r.etd || null,
  delivery: r.delivery || null,
  eta: r.eta || null,
  cargoQty: r.cargoQty ?? '',
  cargo: r.cargo ?? '',
  containerNo: r.containerNo ?? '',
  roba: r.roba ?? '',
  containPrice: r.containPrice ?? '',
  agent: r.agent ?? '',
  total: r.total ?? '',
  deposit: r.deposit ?? '',
  balance: r.balance ?? '',
  placeno: !!r.placeno,
  paid: !!r.placeno, // keep both for compatibility
});
// ——— Containers export helpers ————————————————————————————————————————————
type ContainerExportRow = {
  SUPPLIER: string;
  "PROFORMA NO:": string;
  ETD: string;
  Delivery: string;
  ETA: string;
  "CARGO QTY": string;
  CARGO: string;
  "CONTAINER NO.": string;
  ROBA: string;
  "CONTAIN. PRICE": string;
  AGENT: string;
  TOTAL: string;
  DEPOSIT: string;
  BALANCE: string;
  "Plaćanje": string; // plaćeno / nije plaćeno
};

function formatContainerRows(rows: { supplier:string; proformaNo:string; etd:string; delivery:string; eta:string; cargoQty:string; cargo:string; containerNo:string; roba:string; containPrice:string; agent:string; total:string; deposit:string; balance:string; placeno:boolean; }[]): ContainerExportRow[] {
  // Robust date formatter:
  // - Accepts "YYYY-MM-DD" (returns as-is)
  // - Accepts locale-like strings (tries Date.parse)
  // - Accepts Excel serial numbers (e.g. 45234)
  // - Returns "" if cannot parse (never "Invalid Date")
  const excelSerialToISO = (n: number) => {
    // Excel serial base: 1899-12-30
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0,10);
  };
  const fmtDate = (val: any): string => {
    if (val === null || val === undefined) return "";
    const raw = String(val).trim();
    if (!raw) return "";
    // Already ISO date (from <input type="date">)
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    // Numeric / Excel serial?
    const num = Number(raw);
    if (!isNaN(num) && raw !== "" && isFinite(num) && num > 10000) { // crude guard for serials
      const iso = excelSerialToISO(num);
      if (iso) return iso;
    }
    // Fallback: Date.parse
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    return ""; // give up gracefully
  };
  return rows.map(r => ({
    SUPPLIER: r.supplier || "",
    "PROFORMA NO:": r.proformaNo || "",
    ETD: fmtDate(r.etd),
    Delivery: fmtDate(r.delivery),
    ETA: fmtDate(r.eta),
    "CARGO QTY": r.cargoQty || "",
    CARGO: r.cargo || "",
    "CONTAINER NO.": r.containerNo || "",
    ROBA: r.roba || "",
    "CONTAIN. PRICE": r.containPrice || "",
    AGENT: r.agent || "",
    TOTAL: r.total || "",
    DEPOSIT: r.deposit || "",
    BALANCE: r.balance || "",
    "Plaćanje": r.placeno ? "plaćeno" : "nije plaćeno",
  }));
}

async function exportContainersXLSX(rows: any[]) {
  try {
    const XLSX = await import(/* @vite-ignore */ "xlsx");
    const data = formatContainerRows(rows);
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kontejneri");
    XLSX.writeFile(wb, `kontejneri_${new Date().toISOString().slice(0,10)}.xlsx`);
  } catch (err) {
    alert("Excel eksport nije dostupan: " + (err as any)?.message);
  }
}

function exportContainersPDF(rows: any[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const data = formatContainerRows(rows);
  const head = [[
    "SUPPLIER","PROFORMA NO:","ETD","Delivery","ETA","CARGO QTY","CARGO",
    "CONTAINER NO.","ROBA","CONTAIN. PRICE","AGENT","TOTAL","DEPOSIT","BALANCE","Plaćanje"
  ]];
  const body = data.map(r => [
    r["SUPPLIER"], r["PROFORMA NO:"], r.ETD, r.Delivery, r.ETA, r["CARGO QTY"], r.CARGO,
    r["CONTAINER NO."], r.ROBA, r["CONTAIN. PRICE"], r.AGENT, r.TOTAL, r.DEPOSIT, r.BALANCE, r["Plaćanje"]
  ]);
  doc.setFontSize(13);
  doc.text("Kontejneri — Izvoz", 14, 14);
  autoTable(doc, {
    head,
    body,
    startY: 18,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [63, 90, 224] },
    columnStyles: {
      0: { cellWidth: 28 },  // Supplier
      1: { cellWidth: 26 },  // Proforma
      2: { cellWidth: 18 },  // ETD
      3: { cellWidth: 20 },  // Delivery
      4: { cellWidth: 18 },  // ETA
      5: { cellWidth: 18 },  // Qty
      6: { cellWidth: 36 },  // Cargo
      7: { cellWidth: 30 },  // Container No.
      8: { cellWidth: 28 },  // Roba
      9: { cellWidth: 24 },  // Contain. Price
      10:{ cellWidth: 24 },  // Agent
      11:{ cellWidth: 22 },  // Total
      12:{ cellWidth: 22 },  // Deposit
      13:{ cellWidth: 22 },  // Balance
      14:{ cellWidth: 22 },  // Plaćanje
    },
  });
  doc.save(`kontejneri_${new Date().toISOString().slice(0,10)}.pdf`);
}

// ——— Login view ————————————————————————————————————————————————————————
function LoginView({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await apiPOST<{ access_token: string; user: User }>(
        "/auth/login",
        { email, password }
      );
      setToken(data.access_token);
      // validiramo token preko /auth/me (hvata slučajeve 422 ako bi se ponovo pojavili)
      const me = await apiGET<{ user: User }>("/auth/me", true);
      onLoggedIn(me.user);
    } catch (e: any) {
      setErr(e.message || "Greška pri prijavi");
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ...styles.centeredPage, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes floaty {
          0% { transform: translateY(0px); opacity: .9; }
          50% { transform: translateY(-8px); opacity: 1; }
          100% { transform: translateY(0px); opacity: .9; }
        }
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .login-bg {
          position: absolute;
          inset: -35%;
          background:
            radial-gradient(40% 40% at 20% 30%, rgba(99,102,241,0.22), transparent 60%),
            radial-gradient(35% 35% at 80% 20%, rgba(34,197,94,0.20), transparent 60%),
            radial-gradient(45% 45% at 50% 80%, rgba(59,130,246,0.20), transparent 60%);
          filter: blur(48px);
          animation: floaty 10s ease-in-out infinite;
        }
        .glass {
          width: 420px;
          max-width: 92vw;
          position: relative;
          padding: 22px 20px 20px 20px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.35);
          background: rgba(255,255,255,0.72);
          box-shadow:
            0 20px 60px rgba(15, 23, 42, 0.18),
            inset 0 1px 0 rgba(255,255,255,0.4);
          backdrop-filter: blur(10px);
        }
        .brand {
          display:flex; align-items:center; gap:12px; margin-bottom: 6px;
        }
        .brand-logo {
          width: 42px; height: 42px; border-radius: 10px;
          box-shadow: 0 8px 22px rgba(94,128,255,0.35);
          animation: floaty 8s ease-in-out infinite;
        }
        .brand-title {
          margin: 0; font-weight: 800; letter-spacing: .3px; font-size: 22px;
        }
        .brand-sub {
          margin: 2px 0 10px 0; opacity: .7; font-size: 13px;
        }
        .form-grid {
          display:grid; gap: 10px; margin-top: 6px;
        }
        .field {
          display:grid; gap:6px;
        }
        .label {
          font-size:12px; opacity:.8;
        }
        .inputx {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(0,0,0,0.12);
          background: #fff;
          color: #0b1220;
          outline: none;
          transition: box-shadow .2s ease, transform .05s ease, border-color .2s ease;
        }
        .inputx:focus {
          box-shadow: 0 0 0 4px rgba(94,128,255,0.15);
          border-color: rgba(94,128,255,0.55);
        }
        .primaryx {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(94,128,255,0.4);
          background: linear-gradient(180deg,#5e80ff,#3f5ae0);
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: transform .06s ease, box-shadow .2s ease, filter .2s ease;
        }
        .primaryx:hover {
          filter: brightness(1.02);
          box-shadow: 0 8px 22px rgba(63,90,224,0.28);
        }
        .primaryx:active { transform: translateY(1px); }
        .footer-note {
          margin-top: 10px; font-size: 12px; opacity: .65; text-align: center;
        }
        .divider {
          height:1px; background: linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06));
          margin: 4px 0 12px 0; border-radius: 999px;
        }
      `}</style>

      <div className="login-bg" />

      <form onSubmit={submit} className="glass" aria-label="Prijava na sistem">
        <div className="brand">
          <img src="/logo-cungu.png" alt="Cungu logo" className="brand-logo" />
          <div>
            <h2 className="brand-title">Arrivals</h2>
            <div className="brand-sub">Prijava na sistem</div>
          </div>
        </div>

        <div className="divider" />

        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="inputx"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@firma.com"
              type="email"
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="login-pass">Lozinka</label>
            <input
              id="login-pass"
              className="inputx"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="lozinka"
              autoComplete="current-password"
              required
            />
          </div>

          {err && <div style={{
            background: "rgba(255,0,0,0.08)",
            border: "1px solid rgba(255,0,0,0.25)",
            color: "#9b1c1c",
            padding: "8px 10px",
            borderRadius: 10
          }}>{err}</div>}

          <button disabled={loading} className="primaryx" type="submit">
            {loading ? "Učitavam..." : "Uloguj se"}
          </button>

          <div className="footer-note">© {new Date().getFullYear()} Cungu •  Created by Atdhe Tabaku</div>
        </div>
      </form>
    </div>
  );
}

// ——— Users management (admin only) ——————————————————————————————————————
function UsersView() {
  const [rows, setRows] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string|null>(null);

  const [form, setForm] = React.useState<{name:string; email:string; password:string; role:string}>({
    name: "", email: "", password: "", role: "viewer",
  });

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const list = await apiGET<User[]>("/users", true);
      setRows(list);
    } catch(e:any) {
      setErr(e.message || "Greška");
    } finally { setLoading(false); }
  };
  React.useEffect(()=>{ load(); }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await apiPOST<User>("/users", form, { auth: true });
      setRows(prev => [created, ...prev]);
      setForm({ name:"", email:"", password:"", role:"viewer" });
    } catch(e:any){ alert(`Kreiranje korisnika nije uspjelo:\n${e.message}`); }
  };
  const updateRole = async (id:number, role:string) => {
    try{
      const u = await apiPATCH<User>(`/users/${id}`, { role }, true);
      setRows(prev => prev.map(r => r.id===id?u:r));
    } catch(e:any){ alert(`Izmjena uloge nije uspjela:\n${e.message}`); }
  };
  const remove = async (id:number) => {
    if(!confirm("Obrisati korisnika?")) return;
    try{
      await apiDELETE<{ok:boolean}>(`/users/${id}`, true);
      setRows(prev => prev.filter(r=>r.id!==id));
    } catch(e:any){ alert(`Brisanje nije uspjelo:\n${e.message}`); }
  };

  return (
    <div style={{ padding: 24 }}>
      <h3>Korisnici</h3>
      {err && <div style={styles.error}>{err}</div>}
      <form onSubmit={createUser} style={{ display:"grid", gap:8, maxWidth:480, marginBottom:16 }}>
        <input style={styles.input} placeholder="Ime" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
        <input style={styles.input} placeholder="Email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})}/>
        <input style={styles.input} type="password" placeholder="Lozinka" value={form.password} onChange={e=>setForm({...form, password:e.target.value})}/>
        <select style={styles.select} value={form.role} onChange={e=>setForm({...form, role:e.target.value})}>
          {["viewer","planer","proizvodnja","transport","carina","admin"].map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <div><button style={styles.primaryBtn} type="submit">Dodaj korisnika</button></div>
      </form>

      {loading ? <div>Učitavanje…</div> : (
        <div style={{overflowX:"auto"}}>
          <table style={styles.table}>
            <thead>
              <tr><th>ID</th><th>Ime</th><th>Email</th><th>Uloga</th><th style={{textAlign:"right"}}>Akcije</th></tr>
            </thead>
            <tbody>
              {rows.map(u=>(
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select style={styles.select} value={u.role} onChange={e=>updateRole(u.id, e.target.value)}>
                      {["viewer","planer","proizvodnja","transport","carina","admin"].map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{textAlign:"right"}}>
                    <button style={styles.dangerGhost} onClick={()=>remove(u.id)}>Obriši</button>
                  </td>
                </tr>
              ))}
              {rows.length===0 && <tr><td colSpan={5} style={{textAlign:"center", opacity:.7}}>Nema korisnika.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ——— Dashboard ————————————————————————————————————————————————————————
function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [items, setItems] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // search / pagination
  const [q, setQ] = useState("");
  const [qRaw, setQRaw] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("eta");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  // tabs: arrivals (default), users (admin only), updates (feed), and containers (manual table)
  const [tab, setTab] = useState<'arrivals' | 'users' | 'updates' | 'containers'>('arrivals');

  // modal – novi dolazak
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

  // updates modal
  const [openUpdates, setOpenUpdates] = useState<null | number>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [newNote, setNewNote] = useState("");

  // files modal
  const [openFiles, setOpenFiles] = useState<null | number>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);

  // containers – files modal
  const [openContainerFiles, setOpenContainerFiles] = useState<null | number>(null);
  const [containerFiles, setContainerFiles] = useState<FileMeta[]>([]);
  const [containerFilesLoading, setContainerFilesLoading] = useState(false);
  const [containerFilesErr, setContainerFilesErr] = useState<string | null>(null);

  const openFilesForContainer = async (containerId: number) => {
    setOpenContainerFiles(containerId);
    setContainerFiles([]);
    setContainerFilesErr(null);
    setContainerFilesLoading(true);
    try {
      const list = await apiGET<FileMeta[]>(`/api/containers/${containerId}/files`, true);
      setContainerFiles(list);
    } catch (e: any) {
      setContainerFilesErr(e.message || "Greška pri učitavanju fajlova");
    } finally {
      setContainerFilesLoading(false);
    }
  };
  const deleteContainerFile = async (fid: number) => {
    if (!openContainerFiles) return;
    if (!confirm("Obrisati fajl?")) return;
    try {
      await apiDELETE<{ok:boolean}>(`/api/containers/${openContainerFiles}/files/${fid}`, true);
      setContainerFiles(prev => prev.filter(f => f.id !== fid));
    } catch (e:any) {
      alert(`Brisanje fajla nije uspjelo:\n${e.message}`);
    }
  };

  const downloadContainerFile = async (fid: number) => {
    if (!openContainerFiles) return;
    try {
      const res = await fetch(`${API_BASE}/api/containers/${openContainerFiles}/files/${fid}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText} - ${text}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/i);
      const filename = (m && m[1]) || 'file';
      downloadBlob(filename, blob.type || 'application/octet-stream', blob);
    } catch (e: any) {
      alert(`Preuzimanje nije uspjelo:\n${e?.message || e}`);
    }
  };

  // global updates feed (Aktivnosti tab)
  const [feed, setFeed] = useState<Update[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedErr, setFeedErr] = useState<string | null>(null);

  // deleting state for arrivals
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ——— Helpers for money parsing / balance calculation ———
  const moneyToNumber = (val: any): number => {
    const raw = String(val ?? '').trim();
    if (!raw) return NaN;
    // remove currency symbols and spaces
    let s = raw.replace(/[^0-9,\.\-]/g, '');
    // if both comma and dot appear, assume comma is thousands sep -> remove commas
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/,/g, '');
    } else if (s.includes(',') && !s.includes('.')) {
      // European decimal comma -> convert to dot
      s = s.replace(/,/g, '.');
    }
    // remove any stray thousands separators
    s = s.replace(/(\d)[\s](?=\d{3}\b)/g, '$1');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  };

  // format number to European style string (thousands dot, decimal comma) without currency symbol
  const numberToEU = (n: number): string => {
    if (typeof n !== 'number' || isNaN(n)) return '';
    try {
      return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    } catch {
      // Fallback if Intl not available
      const s = n.toFixed(2);
      // add thousands separators manually
      const [intPart, decPart] = s.split('.');
      const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return `${withDots},${decPart}`;
    }
  };

  // take any user input and return EU-formatted string or empty string
  const formatEUInput = (val: any): string => {
    const num = moneyToNumber(val);
    return isNaN(num) ? '' : numberToEU(num);
  };

  const calcBalanceStr = (total: any, deposit: any): string => {
    const T = moneyToNumber(total);
    const D = moneyToNumber(deposit);
    if (isNaN(T) || isNaN(D)) return '';
    return numberToEU(T - D);
  };
  const isNearlyZero = (n: number) => Math.abs(n) < 0.005; // treat ±0.005 as zero for rounding
  // KONTEJNERI – ručna tabela sa statusom plaćanja (lokalno čuvanje)
  type ContainerRow = {
    id: number;
    supplier: string;         // SUPPLIER
    proformaNo: string;       // PROFORMA NO:
    etd: string;              // ETD (date)
    delivery: string;         // Delivery (date)
    eta: string;              // ETA (date)
    cargoQty: string;         // CARGO QTY
    cargo: string;            // CARGO
    containerNo: string;      // CONTAINER NO.
    roba: string;             // ROBA
    containPrice: string;     // CONTAIN. PRICE
    agent: string;            // AGENT
    total: string;            // TOTAL
    deposit: string;          // DEPOSIT
    balance: string;          // BALANCE
    placeno: boolean;         // status plaćanja (paid/unpaid)
  };

  const [containersRemote, setContainersRemote] = useState<boolean>(false);

  const tryLoadContainersRemote = async () => {
    try {
      const apiRows = await apiGET<ContainerApi[]>('/api/containers', true);
      // If the server returns nothing or an empty list, keep local data and stay in local mode.
      if (!Array.isArray(apiRows) || apiRows.length === 0) {
        setContainersRemote(false);
        return;
      }
      const rows = apiRows.map(mapApiToContainerRow);
      // only recalculate balance; do not auto-set placeno
      const fixed = rows.map(r => {
        const bal = calcBalanceStr(r.total, r.deposit);
        if (bal !== '') {
          r.balance = bal;
        }
        return r;
      });
      setContainersRemote(true);
      setContainersRows(fixed);
      try { localStorage.setItem(CONTAINERS_STORAGE_KEY, JSON.stringify(fixed)); } catch {}
    } catch {
      // Network/auth error – keep whatever is in localStorage/state
      setContainersRemote(false);
    }
  };

  const CONTAINERS_STORAGE_KEY = 'containersRowsV1';

  const [containersRows, setContainersRows] = useState<ContainerRow[]>(() => {
    try {
      const raw = localStorage.getItem(CONTAINERS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [] as ContainerRow[];
  });
  const [containersSearch, setContainersSearch] = useState('');
  const [containersFilter, setContainersFilter] = useState<'all'|'paid'|'unpaid'>('all');

  // Remove initial auto-load of remote containers on mount
  useEffect(() => {
    if (tab === 'containers') {
      tryLoadContainersRemote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const [containersCompact, setContainersCompact] = useState(true);

  // Uvoz iz Excel/CSV: mapira kolone iz fajla na nasa polja gdje je moguce
  const handleContainersUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const XLSX = await import(/* @vite-ignore */ 'xlsx');
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!json.length) return;

      const headers = Object.keys(json[0]);
      const norm = (s: string) => String(s || '').trim().toLowerCase();

      // mapiraj razne varijante headera iz fajla na naša polja
      const hmap = headers.reduce<Record<string,string>>((acc, h) => {
        const n = norm(h);
        if (['supplier','dobavljač','dobavljac','vendor'].includes(n)) acc['supplier'] = h;
        else if (['proforma no','proforma no:','proformano','proforma','proforma number','proforma_no','proforma-no','proforma #','proforma#'].includes(n)) acc['proformaNo'] = h;
        else if (['etd'].includes(n)) acc['etd'] = h;
        else if (['delivery','isporuka','dostava'].includes(n)) acc['delivery'] = h;
        else if (['eta','dolazak','arrival','expected'].includes(n)) acc['eta'] = h;
        else if (['cargo qty','qty','količina','kolicina'].includes(n)) acc['cargoQty'] = h;
        else if (['cargo','teret','opis tereta'].includes(n)) acc['cargo'] = h;
        else if (['container no','container no.','container','kontejner','kontejner no','cntr','broj kontejnera'].includes(n)) acc['containerNo'] = h;
        else if (['roba','goods','artikl','artikal'].includes(n)) acc['roba'] = h;
        else if (['contain. price','contain price','container price','container_price','contain price (usd)','contain price (eur)','cijena kontejnera','cena kontejnera','price','cijena','iznos'].includes(n)) acc['containPrice'] = h;
        else if (['agent','špediter','spediter','forwarder'].includes(n)) acc['agent'] = h;
        else if (['total','ukupno'].includes(n)) acc['total'] = h;
        else if (['deposit','avans','uplata'].includes(n)) acc['deposit'] = h;
        else if (['balance','saldo','preostalo'].includes(n)) acc['balance'] = h;
        else if (['plaćeno','placeno','paid','status placanja','status plaćanja'].includes(n)) acc['placeno'] = h;
        return acc;
      }, {});

      const toDateStr = (val: any) => {
        const raw = (val ?? '').toString();
        if (!raw) return '';
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0,10); // YYYY-MM-DD for <input type="date">
        return raw;
      };

      const rows: ContainerRow[] = json.map((r, i) => {
        const get = (key: keyof ContainerRow): any => {
          const hk = (hmap as any)[key];
          return hk ? r[hk] : '';
        };
        const paidRaw = (hmap['placeno'] ? String(r[hmap['placeno']]).toLowerCase() : '');
        const paid = ['1','da','yes','true','plaćeno','placeno','paid'].includes(paidRaw);
        const computedBalance = String(get('balance') || calcBalanceStr(get('total'), get('deposit')) || '');
        //const computedBalanceNum = parseFloat(computedBalance);
        return {
          id: Date.now() + i,
          supplier: String(get('supplier') || ''),
          proformaNo: String(get('proformaNo') || ''),
          etd: toDateStr(get('etd')),
          delivery: toDateStr(get('delivery')),
          eta: toDateStr(get('eta')),
          cargoQty: String(get('cargoQty') || ''),
          cargo: String(get('cargo') || ''),
          containerNo: String(get('containerNo') || ''),
          roba: String(get('roba') || ''),
          containPrice: String(get('containPrice') || ''),
          agent: String(get('agent') || ''),
          total: String(get('total') || ''),
          deposit: String(get('deposit') || ''),
          balance: computedBalance,
          placeno: paid,
        };
      });
      if (containersRemote) {
        try {
          // Upsert one by one (simpler than guessing a bulk format)
          for (const r of rows) {
            const payload = mapRowToApiPayload(r);
            try {
              const created = await apiPOST<ContainerApi>('/api/containers', payload, { auth: true });
              r.id = created.id;
            } catch {
              // If duplicate by proforma/container no., try to PATCH by id if present
            }
          }
          saveContainers([ ...rows, ...containersRows ]);
        } catch (err) {
          alert('Uvoz na server nije uspio – zadržavam lokalno.\n' + (err as any)?.message);
          setContainersRemote(false);
          saveContainers(rows);
        }
      } else {
        saveContainers(rows);
      }
    } catch (e) {
      alert('Uvoz nije uspio: ' + (e as any).message);
    } finally {
      ev.target.value = '';
    }
  };

  const saveContainers = (rows: ContainerRow[]) => {
    setContainersRows(rows);
    // Always mirror to local as cache
    try { localStorage.setItem(CONTAINERS_STORAGE_KEY, JSON.stringify(rows)); } catch {}
  };

  const addContainerRow = async () => {
    const blank: ContainerRow = {
      id: Date.now(),
      supplier: '',
      proformaNo: '',
      etd: '',
      delivery: '',
      eta: '',
      cargoQty: '',
      cargo: '',
      containerNo: '',
      roba: '',
      containPrice: '',
      agent: '',
      total: '',
      deposit: '',
      balance: '',
      placeno: false,
    };
    if (containersRemote) {
      try {
        const payload = mapRowToApiPayload(blank);
        const created = await apiPOST<ContainerApi>('/api/containers', payload, { auth: true });
        const row = mapApiToContainerRow(created);
        saveContainers([row, ...containersRows]);
        return;
      } catch (e:any) {
        alert('Kreiranje na serveru nije uspjelo – prebacio sam na lokalno.\n' + (e?.message || ''));
        setContainersRemote(false);
      }
    }
    // local fallback
    saveContainers([blank, ...containersRows]);
  };
  const removeContainerRow = async (id: number) => {
    if (!confirm('Obrisati red?')) return;
    if (containersRemote) {
      try {
        await apiDELETE<{ok:boolean}>(`/api/containers/${id}`, true);
        saveContainers(containersRows.filter(r => r.id !== id));
        return;
      } catch (e:any) {
        alert('Brisanje na serveru nije uspjelo – pokušavam lokalno.\n' + (e?.message || ''));
        setContainersRemote(false);
      }
    }
    saveContainers(containersRows.filter(r => r.id !== id));
  };

  // Otvori file picker za konkretan red
  const triggerContainerFilePick = (id: number) => {
    const el = document.getElementById(`containerFile_${id}`) as HTMLInputElement | null;
    el?.click();
  };

  // Upload selektovanih fajlova na backend i veži ih za dati kontejner
  const onContainerFilesSelected = async (id: number, ev: React.ChangeEvent<HTMLInputElement>) => {
    const fl = ev.target.files;
    if (!fl || fl.length === 0) return;
    const form = new FormData();
    Array.from(fl).forEach(f => form.append("file", f));
    try {
      // očekivani endpoint na backendu: /api/containers/{id}/files (Bearer auth)
      await apiUPLOAD(`/api/containers/${id}/files`, form, /*auth*/ true);
      alert("Fajl(ovi) uspješno uploadovani.");
    } catch (e:any) {
      alert(`Upload fajlova nije uspio:\n${e?.message || e}`);
    } finally {
      // reset input da može ponovni upload istih fajlova
      ev.target.value = "";
    }
  };
  const updateContainerCell = async (id: number, key: keyof ContainerRow, value: string | boolean) => {
    // First update the local model (format EU for total/deposit; auto-balance only)
    const nextRows = containersRows.map(r => {
      if (r.id !== id) return r;
      const next = { ...r } as ContainerRow;

      if (key === 'total' || key === 'deposit') {
        const euStr = typeof value === 'string' ? formatEUInput(value) : '';
        (next as any)[key] = euStr;
      } else {
        (next as any)[key] = value as any;
      }

      const bal = calcBalanceStr(next.total, next.deposit);
      if (bal !== '') {
        next.balance = bal;
      }
      return next;
    });
    saveContainers(nextRows);

    // Then try to persist remotely
    if (containersRemote) {
      try {
        const row = nextRows.find(r => r.id === id)!;
        const payload = mapRowToApiPayload(row);
        await apiPATCH<ContainerApi>(`/api/containers/${id}`, payload, true);
      } catch (e:any) {
        alert('Čuvanje na serveru nije uspjelo – promjena je ostala lokalno.\n' + (e?.message || ''));
        setContainersRemote(false);
      }
    }
  };
  const toggleContainerPaid = async (id: number) => {
    const nextRows = containersRows.map(r => r.id === id ? { ...r, placeno: !r.placeno } : r);
    saveContainers(nextRows);
    if (containersRemote) {
      try {
        const row = nextRows.find(r => r.id === id)!;
        await apiPATCH<ContainerApi>(`/api/containers/${id}`, { paid: row.placeno, placeno: row.placeno } as any, true);
      } catch (e:any) {
        alert('Ažuriranje statusa plaćanja na serveru nije uspjelo – promjena je ostala lokalno.\n' + (e?.message || ''));
        setContainersRemote(false);
      }
    }
  };

  const filteredContainers = containersRows.filter(r => {
    const q = containersSearch.trim().toLowerCase();
    const hay = [
      r.supplier, r.proformaNo, r.etd, r.delivery, r.eta,
      r.cargoQty, r.cargo, r.containerNo, r.roba,
      r.containPrice, r.agent, r.total, r.deposit, r.balance
    ].join(' ').toLowerCase();
    const textOK = !q || hay.includes(q);
    const filterOK = containersFilter === 'all' || (containersFilter==='paid' && r.placeno) || (containersFilter==='unpaid' && !r.placeno);
    return textOK && filterOK;
  });

  const containersAnalytics = useMemo(() => {
    const view = filteredContainers;
    const toNum = (s: any) => moneyToNumber(s) || 0;
    const safeBal = (r: any) => {
      // Preračunaj balans iz TOTAL i DEPOSIT da izbjegnemo nekonzistentnost
      const bal = calcBalanceStr(r.total, r.deposit);
      return toNum(bal);
    };

    const rows = view;
    const count = rows.length;
    const paidCount = rows.filter(r => r.placeno).length;
    const paidPct = count ? Math.round((paidCount / count) * 100) : 0;
    const sumTotal = rows.reduce((acc, r) => acc + toNum(r.total), 0);
    const sumDeposit = rows.reduce((acc, r) => acc + toNum(r.deposit), 0);
    const sumBalance = rows.reduce((acc, r) => acc + safeBal(r), 0);

    // Top dobavljači po BALANCE
    const bySupplier: Record<string, number> = {};
    rows.forEach(r => {
      const k = (r.supplier || '').trim() || '—';
      bySupplier[k] = (bySupplier[k] || 0) + safeBal(r);
    });
    const topSuppliers = Object.entries(bySupplier)
      .sort((a,b) => b[1]-a[1])
      .slice(0,5)
      .map(([name, val]) => ({ name, value: val }));

    // Top agenti po BALANCE
    const byAgent: Record<string, number> = {};
    rows.forEach(r => {
      const k = (r.agent || '').trim() || '—';
      byAgent[k] = (byAgent[k] || 0) + safeBal(r);
    });
    const topAgents = Object.entries(byAgent)
      .sort((a,b) => b[1]-a[1])
      .slice(0,5)
      .map(([name, val]) => ({ name, value: val }));

    // Mjesečni pregled: koristimo ETA ako postoji, inače ETD
    const monthKey = (r: any) => {
      const pick = (r.eta && String(r.eta)) || (r.etd && String(r.etd)) || '';
      if (!pick) return 'nepoznato';
      // očekujemo YYYY-MM-DD iz <input type="date">
      if (/^\d{4}-\d{2}-\d{2}$/.test(pick)) return pick.slice(0,7);
      const d = new Date(pick);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0,7);
      return 'nepoznato';
    };
    const byMonth: Record<string, {total:number; deposit:number; balance:number; count:number}> = {};
    rows.forEach(r => {
      const k = monthKey(r);
      if (!byMonth[k]) byMonth[k] = { total:0, deposit:0, balance:0, count:0 };
      byMonth[k].total += toNum(r.total);
      byMonth[k].deposit += toNum(r.deposit);
      byMonth[k].balance += safeBal(r);
      byMonth[k].count += 1;
    });
    const monthly = Object.entries(byMonth)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v }));

    // Aging po ETA/ETD
    const today = new Date();
    today.setHours(0,0,0,0);
    const dayDiff = (d: Date) => Math.floor((d.getTime() - today.getTime()) / (24*3600*1000));
    type AgingAgg = { label:string; count:number; balance:number };
    const aging: Record<string, AgingAgg> = {
      late: { label: 'Kasni (ETA prošla)', count: 0, balance: 0 },
      d0_30: { label: '0–30 dana', count: 0, balance: 0 },
      d31_60: { label: '31–60 dana', count: 0, balance: 0 },
      d61p: { label: '>60 dana', count: 0, balance: 0 },
      unknown: { label: 'Nepoznato', count: 0, balance: 0 },
    };
    rows.forEach(r => {
      const pick = (r.eta && String(r.eta)) || (r.etd && String(r.etd)) || '';
      let bucket: keyof typeof aging = 'unknown';
      if (pick) {
        let d: Date | null = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(pick)) d = new Date(pick + 'T00:00:00');
        else {
          const td = new Date(pick);
          d = isNaN(td.getTime()) ? null : td;
        }
        if (d) {
          d.setHours(0,0,0,0);
          const diff = dayDiff(d);
          if (diff < 0) bucket = 'late';
          else if (diff <= 30) bucket = 'd0_30';
          else if (diff <= 60) bucket = 'd31_60';
          else bucket = 'd61p';
        }
      }
      aging[bucket].count += 1;
      aging[bucket].balance += safeBal(r);
    });
    const agingBuckets = Object.values(aging);

    // Top roba (artikli) po BALANCE – ako je polje prazno koristi '—'
    const byCargo: Record<string, number> = {};
    rows.forEach(r => {
      const k = (r.roba || r.cargo || '').trim() || '—';
      byCargo[k] = (byCargo[k] || 0) + safeBal(r);
    });
    const topCargo = Object.entries(byCargo)
      .sort((a,b) => b[1]-a[1])
      .slice(0,5)
      .map(([name, value]) => ({ name, value }));

    return { count, paidPct, sumTotal, sumDeposit, sumBalance, topSuppliers, topAgents, monthly, agingBuckets, topCargo };
  }, [filteredContainers]);

  // --- Mini SVG bar chart for analytics ---
  const BarChart: React.FC<{ data: { name: string; value: number }[]; title: string }> = ({ data, title }) => {
    const items = (data || []).slice(0, 5);
    // use actual max > 0, fallback 1
    const max = Math.max(1, ...items.map(d => Math.max(0, d.value || 0)));
    // Wider canvas + more space for long labels
    const width = 1200;
    const leftPad = 320;
    const rightPad = 40;
    const barH = 22;
    const gap = 12;
    const topPad = 22;
    const height = items.length * (barH + gap) + topPad + 8;
    const minBar = 10; // ensure even the smallest value is visible

    return (
      <div
        style={{
          background: 'linear-gradient(180deg,#ffffff,#f6f8ff)',
          border: '1px solid rgba(63,90,224,.12)',
          borderRadius: 12,
          boxShadow: '0 8px 20px rgba(63,90,224,.08), inset 0 1px 0 rgba(255,255,255,.6)',
          padding: 14,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{title}</div>
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={title}
        >
          {/* baseline/axis */}
          <line
            x1={leftPad}
            y1={topPad - 6}
            x2={leftPad}
            y2={height - 6}
            stroke="rgba(0,0,0,0.08)"
          />
          {items.map((d, i) => {
            const y = topPad + i * (barH + gap);
            const scaled = Math.round(((d.value || 0) / max) * (width - leftPad - rightPad));
            const w = Math.max(minBar, scaled);
            return (
              <g key={i}>
                <text
                  x={0}
                  y={y + barH - 5}
                  style={{ fontSize: 12, opacity: 0.85 }}
                >
                  {d.name}
                </text>
                <rect
                  x={leftPad}
                  y={y}
                  width={w}
                  height={barH}
                  rx={7}
                  fill="#3f5ae0"
                  fillOpacity={0.9}
                />
                <text
                  x={leftPad + w + 8}
                  y={y + barH - 5}
                  style={{ fontSize: 12, fontWeight: 800 }}
                >
                  {formatCurrency(d.value || 0)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const may = useMemo(() => ROLE_FIELDS[user.role] || new Set<string>(), [user.role]);

  const kpis = useMemo(() => {
    const total = items.length;
    const delayed = 0;
    const arriving = items.filter(i => i.status === 'shipped').length;
    const arrived = items.filter(i => i.status === 'arrived').length;
    return { total, delayed, arriving, arrived };
  }, [items]);
  useEffect(() => {
    const loadFeed = async () => {
      setFeedLoading(true);
      setFeedErr(null);
      try {
        // try a dedicated endpoint first
        try {
          const rows = await apiGET<Update[]>('/api/updates', true);
          setFeed(rows);
        } catch {
          // fallback: gather from each arrival
          const arrivals = items.length ? items : await apiGET<Arrival[]>('/api/arrivals', true);
          const settled = await Promise.allSettled(
            arrivals.slice(0, 30).map(a => apiGET<Update[]>(`/api/arrivals/${a.id}/updates`, true).then(list =>
              list.map(u => ({ ...u, arrival_id: a.id }))
            ))
          );
          const merged: Update[] = [];
          for (const s of settled) {
            if (s.status === 'fulfilled') merged.push(...s.value);
          }
          merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          setFeed(merged.slice(0, 100));
        }
      } catch (e: any) {
        setFeedErr(e.message || 'Greška pri učitavanju aktivnosti');
      } finally {
        setFeedLoading(false);
      }
    };
    if (tab === 'updates') loadFeed();
  }, [tab]);

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
      const data = await apiGET<ArrivalSearchResponse>(`/api/arrivals/search?${query}`, true);
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      // fallback na staru listu ako search endpoint nije dostupan
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
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(qRaw);
    }, 300);
    return () => clearTimeout(t);
  }, [qRaw]);

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
      ev.target.value = "";
    } catch(e:any) {
      alert(`Upload nije uspio:\n${e.message}`);
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

  // status update
  const changeStatus = async (id: number, status: Arrival["status"]) => {
    try {
      const updated = await apiPATCH<Arrival>(`/api/arrivals/${id}/status`, { status }, true);
      setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
    } catch (e: any) {
      alert(`Neuspješna izmjena statusa:\n${e.message}`);
    }
  };

  // delete
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

  // create
  const createArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!API_KEY) {
        // Nema API ključa – nastavljamo sa Bearer tokenom (login) i pokušavamo dalje
        console.warn("VITE_API_KEY nije postavljen; pokušavam sa Bearer tokenom.");
      }
      const { supplier, carrier, plate, type, driver, pickup_date, eta, transport_price, goods_price, status, note } = newForm;
      const payload = {
        supplier,
        carrier,
        plate,
        type,
        driver,
        pickup_date: parseDateInput(pickup_date as any),
        eta: parseDateInput(eta as any),
        // Parse EU-style numbers like "1.234,56" for both prices
        transport_price: (transport_price === undefined || transport_price === null || String(transport_price).trim() === "")
          ? null
          : (isNaN(moneyToNumber(transport_price)) ? null : moneyToNumber(transport_price)),
        goods_price: (goods_price === undefined || goods_price === null || String(goods_price).trim() === "")
          ? null
          : (isNaN(moneyToNumber(goods_price)) ? null : moneyToNumber(goods_price)),
        status,
        note,
      };
      const created = await apiPOST<Arrival>("/api/arrivals", payload, {
        auth: true,
        useApiKey: true,
      });
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

  // updates
  const openArrivalUpdates = async (arrivalId: number) => {
    setOpenUpdates(arrivalId);
    setUpdates([]);
    setNewNote("");
    try {
      const rows = await apiGET<Update[]>(
        `/api/arrivals/${arrivalId}/updates`,
        /*auth*/ true // optional u backendu, al’ šaljemo Bearer kad imamo
      );
      setUpdates(rows);
    } catch (e: any) {
      alert(`Greška pri učitavanju beleški:\n${e.message}`);
    }
  };
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openUpdates) return;
    if (!newNote.trim()) return;
    try {
      const row = await apiPOST<Update>(
        `/api/arrivals/${openUpdates}/updates`,
        { message: newNote },
        { auth: true }
      );
      setUpdates((prev) => [...prev, row]);
      setNewNote("");
    } catch (e: any) {
      alert(`Beleška nije dodata:\n${e.message}`);
    }
  };

  // Set page title and favicon (must be outside of JSX)
  React.useEffect(() => {
    document.title = `Arrivals • ${user.name} (${user.role}) — Cungu`;
    // ensure favicon shows the company logo
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = '/logo-cungu.png';
  }, [user]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f7f9ff 0%, #eef2ff 60%, #f8fafc 100%)", color: "#0b1220" }}>
      <style>{`
        .kpiGlass{position:relative;background:linear-gradient(180deg,#ffffff,#f6f8ff);border:1px solid rgba(63,90,224,.12);border-radius:14px;box-shadow:0 10px 26px rgba(63,90,224,.08), inset 0 1px 0 rgba(255,255,255,.6)}
        .kpiGlass .label{font-size:12px;opacity:.7}
        .kpiGlass .value{font-size:22px;font-weight:800}
        .appBgDecor{position:fixed;inset:-30% -20% auto -20%;height:70vh;z-index:0;pointer-events:none;filter:blur(60px);opacity:.55;background:
          radial-gradient(40% 35% at 15% 30%, rgba(63,90,224,.22), transparent 60%),
          radial-gradient(35% 30% at 85% 20%, rgba(34,197,94,.18), transparent 60%),
          radial-gradient(50% 45% at 50% 85%, rgba(59,130,246,.18), transparent 60%);
        }
        .topbar{position:sticky;top:0;z-index:50;background:linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.86));backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,0,0,.06);box-shadow:0 6px 30px rgba(15,23,42,.08)}
        .pillTab{border-radius:999px;border:1px solid rgba(63,90,224,.25)!important;background:linear-gradient(180deg,#f8faff,#eef2ff)!important;padding:8px 12px!important}
        .pillTab[aria-current="true"], .pillTab.active{background:linear-gradient(180deg,#5e80ff,#3f5ae0)!important;color:#fff!important;border-color:rgba(63,90,224,.6)!important;box-shadow:0 8px 20px rgba(63,90,224,.28)}
        .pageTitle{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 14px}
        .pageTitle .left{display:flex;align-items:center;gap:12px}
        .pageTitle .logo{width:34px;height:34px;border-radius:8px;box-shadow:0 10px 26px rgba(94,128,255,.28)}
        .pageTitle h3{margin:0;font-size:20px;font-weight:800;letter-spacing:.2px}
        .pageTitle .sub{font-size:12px;opacity:.7}
        .tabBadge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 6px;margin-left:8px;border-radius:999px;border:1px solid rgba(63,90,224,.25);background:linear-gradient(180deg,#f0f4ff,#e6ecff);font-size:11px;line-height:1;font-weight:700}
        .miniStat{position:relative;background:linear-gradient(180deg,#ffffff,#f6f8ff);border:1px solid rgba(63,90,224,.12);border-radius:12px;box-shadow:0 8px 20px rgba(63,90,224,.08), inset 0 1px 0 rgba(255,255,255,.6);padding:10px 12px}
      `}</style>
      <div className="appBgDecor" />
      <header className="topbar" style={styles.header}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo-cungu.png" alt="Cungu" style={{ width:28, height:28, borderRadius:6, boxShadow:'0 8px 18px rgba(94,128,255,.28)' }} />
          <div style={{ display:'flex', alignItems:'baseline', gap:8, fontWeight:800, letterSpacing:'.2px' }}>
            <span>Arrivals</span>
            <span style={{ fontWeight:500, opacity:.75 }}>• {user.name} ({user.role})</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <nav style={styles.tabs}>
            <button
              className={`pillTab ${tab === 'arrivals' ? 'active' : ''}`}
              style={{
                ...styles.tabBtn,
                ...(tab === 'arrivals' ? styles.tabBtnActive : {})
              }}
              aria-current={tab === 'arrivals' ? 'true' : undefined}
              onClick={() => setTab('arrivals')}
            >
              Dolasci <span className="tabBadge">{total}</span>
            </button>
            <button
              className={`pillTab ${tab === 'updates' ? 'active' : ''}`}
              style={{
                ...styles.tabBtn,
                ...(tab === 'updates' ? styles.tabBtnActive : {})
              }}
              aria-current={tab === 'updates' ? 'true' : undefined}
              onClick={() => setTab('updates')}
              title="Aktivnosti (globalne beleške)"
            >
              Aktivnosti
            </button>
            <button
              className={`pillTab ${tab === 'containers' ? 'active' : ''}`}
              style={{
                ...styles.tabBtn,
                ...(tab === 'containers' ? styles.tabBtnActive : {})
              }}
              aria-current={tab === 'containers' ? 'true' : undefined}
              onClick={() => setTab('containers')}
              title="Kontejneri (ručna tabela sa statusom plaćanja)"
            >
              Kontejneri <span className="tabBadge">{filteredContainers.length}</span>
            </button>
            {user.role === 'admin' && (
              <button
                className={`pillTab ${tab === 'users' ? 'active' : ''}`}
                style={{
                  ...styles.tabBtn,
                  ...(tab === 'users' ? styles.tabBtnActive : {})
                }}
                aria-current={tab === 'users' ? 'true' : undefined}
                onClick={() => setTab('users')}
                title="Upravljanje korisnicima"
              >
                Korisnici
              </button>
            )}
          </nav>

          <button style={styles.secondaryBtn} onClick={load}>Osveži</button>
          <button style={styles.secondaryBtn} onClick={() => setOpenCreate(true)}>+ Novi dolazak</button>
          <button style={styles.dangerGhost} onClick={() => { setToken(null); onLogout(); }}>Odjava</button>
        </div>
      </header>

      <main style={{ padding: 24 }}>
        {tab === 'arrivals' && (
          <div className="pageTitle">
            <div className="left">
              <img src="/logo-cungu.png" alt="Cungu" className="logo" />
              <div>
                <h3>Dolasci</h3>
                <div className="sub">Pregled & upravljanje dolascima</div>
              </div>
            </div>
          </div>
        )}
        {tab === 'updates' && (
          <div className="pageTitle">
            <div className="left">
              <img src="/logo-cungu.png" alt="Cungu" className="logo" />
              <div>
                <h3>Aktivnosti</h3>
                <div className="sub">Globalne beleške i istorija radnji</div>
              </div>
            </div>
          </div>
        )}
        {tab === 'containers' && (
          <div className="pageTitle">
            <div className="left">
              <img src="/logo-cungu.png" alt="Cungu" className="logo" />
              <div>
                <h3>Kontejneri</h3>
                <div className="sub">Plaćanja, bilansi i datumi (ETD/ETA)</div>
              </div>
            </div>
          </div>
        )}
        {tab === 'users' && (
          <div className="pageTitle">
            <div className="left">
              <img src="/logo-cungu.png" alt="Cungu" className="logo" />
              <div>
                <h3>Korisnici</h3>
                <div className="sub">Uloge i pristup sistemu</div>
              </div>
            </div>
          </div>
        )}
        {loading && <div>Učitavanje...</div>}
        {err && <div style={styles.error}>{err}</div>}

        {tab === 'arrivals' && !loading && !err && (
          <div style={styles.kpiRow}>
            <div className="kpiGlass" style={styles.kpiCard}>
              <div className="label" style={styles.kpiLabel}>Ukupno</div>
              <div className="value" style={styles.kpiValue}>{kpis.total}</div>
            </div>
            <div className="kpiGlass" style={styles.kpiCard}>
              <div className="label" style={styles.kpiLabel}>U dolasku</div>
              <div className="value" style={styles.kpiValue}>{kpis.arriving}</div>
            </div>
            <div className="kpiGlass" style={styles.kpiCard}>
              <div className="label" style={styles.kpiLabel}>Stiglo</div>
              <div className="value" style={styles.kpiValue}>{kpis.arrived}</div>
            </div>
            <div className="kpiGlass" style={styles.kpiCardDanger}>
              <div className="label" style={styles.kpiLabel}>Kašnjenja</div>
              <div className="value" style={styles.kpiValue}>{kpis.delayed}</div>
            </div>
          </div>
        )}

        {tab === 'arrivals' && (
          <div style={{ display:"grid", gap:8, gridTemplateColumns:"1.2fr .8fr .8fr .6fr .6fr", marginBottom: 12 }}>
            <input
              style={styles.input}
              placeholder="Pretraga (dobavljač…)"
              value={qRaw}
              onChange={(e) => setQRaw(e.target.value)}
            />
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
        )}

        {tab === 'arrivals' && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', margin: '8px 0 12px' }}>
            <button
              style={styles.secondaryBtn}
              onClick={() => exportArrivalsCSV(items)}
              title="Izvezi CSV"
            >CSV</button>
            <button
              style={styles.secondaryBtn}
              onClick={() => exportArrivalsPDF(items)}
              title="Izvezi PDF"
            >PDF</button>
            <button
              style={styles.secondaryBtn}
              onClick={() => exportArrivalsXLSX(items)}
              title="Izvezi Excel (XLSX)"
            >Excel</button>
          </div>
        )}

        {!loading && !err && tab === 'arrivals' && (
          <div style={{ overflowX: "auto", width: "100%" }}>
            <div style={{ fontSize: 12, opacity: 0.65, margin: '4px 0 8px' }}>
              Savjet: <strong>dupli klik</strong> na polje za brzo uređivanje. Status mijenjajte iz padajućeg menija.
            </div>
            <style>{`
              .compactTable { font-size: 12px; line-height: 1.25; }
              .compactTable th, .compactTable td { padding: 6px 8px; }
              .compactTable .noteCell {
                max-width: 280px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .compactTable, .compactTable th, .compactTable td { box-sizing: border-box; }
              .compactTable th { font-weight: 600; }
              /* Uklonjen globalni nowrap – dozvoljavamo automatsko raspoređivanje kolona */
              /* Usklađeno poravnanje: i th i td blago udesno (osim kolone Akcije) */
              .compactTable thead th:not(:last-child) {
                padding-left: 14px;
              }
              .compactTable tbody td:not(:last-child) {
                padding-left: 14px;
              }
              /* Uskladi poravnanje: header lijevo, osim kolone Akcije desno */
              .compactTable thead th { text-align: left; }
              .compactTable thead th:last-child { text-align: right; }
            `}</style>
            <table className="compactTable" style={styles.table}>
              {/* Uklonjen colgroup sa fiksnim širinama radi boljeg poravnanja */}
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
                  <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>Akcije</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
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
                    <td>
                      {a.type}
                    </td>
                    <td>
                      {may.has("plate") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.plate || ""}
                          onSave={async (val) => {
                            try {
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { plate: val }, true);
                              setItems(prev => prev.map(x => x.id === a.id ? upd : x));
                            } catch (e:any) { alert(`Čuvanje nije uspjelo:\n${e.message}`); }
                          }}
                        />
                      ) : (a.plate || "-")}
                    </td>
                    <td>
  {may.has("driver") || user.role==="admin" ? (
    <InlineEdit
      value={a.driver || ""}
      onSave={async (val) => {
        // 1) Optimistička promjena – odmah prikaži novi tekst
        setItems(prev => prev.map(x => x.id === a.id ? { ...x, driver: val } : x));
        try {
          // 2) Spremi na server
          const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { driver: val }, true);
          // 3) Uskladi sa server odgovorom (ako backend nešto transformiše)
          setItems(prev => prev.map(x => x.id === a.id ? { ...x, ...upd } : x));
        } catch (e:any) {
          alert(`Čuvanje nije uspjelo:\n${e.message}`);
          // (opcionalno) pokušaj refetch da vratiš original ako je palo
          try {
            const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
            setItems(prev => prev.map(x => x.id === a.id ? fresh : x));
          } catch {}
        }
      }}
    />
  ) : (a.driver && a.driver.trim() ? a.driver : "-")}
</td>
                    <td>
                      {may.has("pickup_date") || user.role==="admin" ? (
                        <InlineEdit
                          value={a.pickup_date ? formatDateEU(a.pickup_date) : ""}
                          onSave={async (val) => {
                            const iso = parseDateInput(val);
                            // 1) Optimistička promjena – odmah prikaži novi datum
                            setItems(prev => prev.map(x => x.id === a.id ? { ...x, pickup_date: iso } : x));
                            try {
                              // 2) Spremi na server
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { pickup_date: iso }, true);
                              // 3) Uskladi sa server odgovorom (ako backend nešto transformiše)
                              setItems(prev => prev.map(x => x.id === a.id ? { ...x, ...upd } : x));
                            } catch (e:any) {
                              alert(`Čuvanje nije uspjelo:\n${e.message}`);
                              // (opcionalno) pokušaj refetch da vratiš original ako je palo
                              try {
                                const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
                                setItems(prev => prev.map(x => x.id === a.id ? fresh : x));
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
                          onSave={async (val) => {
                            try {
                              const iso = parseDateInput(val);
                              const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { eta: iso }, true);
                              setItems(prev => prev.map(x => x.id === a.id ? upd : x));
                            } catch (e:any) { alert(`Čuvanje nije uspjelo:\n${e.message}`); }
                          }}
                        />
                      ) : formatDateEU(a.eta)}
                    </td>
                    <td>
  {may.has("transport_price") || user.role==="admin" ? (
    <InlineEdit
      value={a.transport_price != null ? String(a.transport_price) : ""}
      onSave={async (val) => {
        // Parse European input like "1.234,56" -> 1234.56; allow empty to clear
        const parsed = String(val).trim() === "" ? null : moneyToNumber(val);
        const num = parsed === null || isNaN(parsed) ? null : parsed;

        // 1) Optimistički prikaži novu vrijednost odmah
        setItems(prev => prev.map(x => x.id === a.id ? { ...x, transport_price: num } : x));

        try {
          // 2) Sačuvaj na serveru
          const upd = await apiPATCH<Arrival>(`/api/arrivals/${a.id}`, { transport_price: num }, true);

          // 3) Uskladi sa server-odgovorom (ako backend radi transformacije)
          setItems(prev => prev.map(x => x.id === a.id ? { ...x, ...upd } : x));
        } catch (e:any) {
          alert(`Čuvanje nije uspjelo:\n${e.message}`);
          // (opciono) pokušaj refetch da vratiš original ako je palo
          try {
            const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
            setItems(prev => prev.map(x => x.id === a.id ? fresh : x));
          } catch {}
        }
      }}
    />
  ) : (a.transport_price != null ? formatCurrency(a.transport_price) : "-")}
</td>
                    <td>
  {may.has("goods_price") || user.role === "admin" ? (
    <InlineEdit
      value={a.goods_price != null ? String(a.goods_price) : ""}
      onSave={async (val) => {
        // EU format "1.234,56" -> 1234.56; prazno čisti vrijednost
        const parsed = String(val).trim() === "" ? null : moneyToNumber(val);
        const num = parsed === null || isNaN(parsed) ? null : parsed;

        // 1) Optimistički prikaži odmah
        setItems((prev) =>
          prev.map((x) => (x.id === a.id ? { ...x, goods_price: num } : x))
        );

        try {
          // 2) Sačuvaj na serveru
          const upd = await apiPATCH<Arrival>(
            `/api/arrivals/${a.id}`,
            { goods_price: num },
            true
          );

          // 3) Uskladi s onim što server vrati
          setItems((prev) =>
            prev.map((x) => (x.id === a.id ? { ...x, ...upd } : x))
          );
        } catch (e: any) {
          alert(`Čuvanje nije uspjelo:\n${e.message}`);
          // (opciono) pokušaj refetch da vratiš original
          try {
            const fresh = await apiGET<Arrival>(`/api/arrivals/${a.id}`, true);
            setItems((prev) => prev.map((x) => (x.id === a.id ? fresh : x)));
          } catch {}
        }
      }}
    />
  ) : a.goods_price != null ? (
    formatCurrency(a.goods_price) + " €"
  ) : (
    "-"
                    )}
                    </td> 
                    <td>
                      {may.has("status") || user.role === "admin" ? (
                        <select
                          value={a.status}
                          onChange={(e) =>
                            changeStatus(a.id, e.target.value as Arrival["status"])
                          }
                          style={styles.select}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={getStatusChipStyle(a.status)}>{STATUS_LABELS[a.status] ?? a.status}</span>
                      )}
                    </td>
                    <td className="noteCell">
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
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        style={styles.ghostBtn}
                        onClick={() => openArrivalFiles(a.id)}
                        title="Fajlovi"
                      >
                        Fajlovi
                      </button>
                      <button
                        style={styles.ghostBtn}
                        onClick={() => openArrivalUpdates(a.id)}
                        title="Beleške / Aktivnosti"
                      >
                        Beleške
                      </button>
                      <button
                        style={styles.dangerGhost}
                        onClick={() => removeArrival(a.id)}
                        title="Obriši"
                        disabled={deletingId === a.id}
                      >
                        {deletingId === a.id ? "Brišem…" : "Obriši"}
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && !loading && (
                  <tr>
                    <td colSpan={13} style={{ textAlign: "center", opacity: 0.7 }}>
                      Nema zapisa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
              <div>Ukupno: {total}</div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button style={styles.secondaryBtn} onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>←</button>
                <span>Strana {page}</span>
                <button style={styles.secondaryBtn} onClick={()=>setPage(p=>p+1)} disabled={items.length < perPage && (page*perPage >= total)}>→</button>
              </div>
            </div>
          </div>
        )}
        {tab === 'updates' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <h3>Aktivnosti</h3>
            {feedLoading && <div>Učitavanje aktivnosti…</div>}
            {feedErr && <div style={styles.error}>{feedErr}</div>}
            {!feedLoading && !feedErr && (
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                <style>{`
  .updatesTable { table-layout: fixed; }
  /* Pomjeri SVE th i td udesno i poravnaj lijevo tako da stoje tačno ispod naslova */
  .updatesTable thead th, .updatesTable tbody td { padding-left: 20px; text-align: left; }
  /* Fiksne širine po koloni da ne "plešu" */
  .updatesTable .timeCol { width: 200px; }
  .updatesTable .idCol { width: 90px; }
  .updatesTable .msgCol { width: 560px; }
  .updatesTable .userCol { width: 140px; }
  .updatesTable .msgCell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`}</style>
                <table className="compactTable updatesTable" style={styles.table}>
                  <colgroup>
                    <col className="timeCol" />
                    <col className="idCol" />
                    <col className="msgCol" />
                    <col className="userCol" />
                  </colgroup>
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
                        <td className="msgCell">{u.message}</td>
                        <td>{u.user_id ?? '-'}</td>
                      </tr>
                    ))}
                    {feed.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign:'center', opacity:.7 }}>Nema aktivnosti.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === 'containers' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <h3>Kontejneri</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:10, maxWidth:1300 }}>
              <div className="miniStat">
                <div style={{ fontSize:12, opacity:.7 }}>Broj zapisa</div>
                <div style={{ fontSize:20, fontWeight:800 }}>{filteredContainers.length}</div>
              </div>
              <div className="miniStat">
                <div style={{ fontSize:12, opacity:.7 }}>Plaćeno (%)</div>
                <div style={{ fontSize:20, fontWeight:800 }}>{containersAnalytics.paidPct}%</div>
              </div>
              <div className="miniStat">
                <div style={{ fontSize:12, opacity:.7 }}>Ukupno (TOTAL)</div>
                <div style={{ fontSize:18, fontWeight:800 }}>{formatCurrency(containersAnalytics.sumTotal || 0)}</div>
              </div>
              <div className="miniStat">
                <div style={{ fontSize:12, opacity:.7 }}>Balans (BALANCE)</div>
                <div style={{ fontSize:18, fontWeight:800 }}>{formatCurrency(containersAnalytics.sumBalance || 0)}</div>
              </div>
            </div>
            {/* Mini grafikoni: top dobavljači / top agenti po balansu */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, width: '100%', maxWidth: 'none' }}>
              <BarChart title="Top dobavljači po balansu" data={containersAnalytics.topSuppliers} />
              <BarChart title="Top agenti po balansu" data={containersAnalytics.topAgents} />
            </div>
            {false && (
              <div>
                {/* (removed duplicate textual analysis) Top dobavljači po BALANCE */}
              </div>
            )}
            {false && (
              <div>
                {/* (removed duplicate textual analysis) Top agenti po BALANCE */}
              </div>
            )}
            <div style={{ display:'grid', gap:8, gridTemplateColumns:'auto 1fr .6fr auto auto auto auto', alignItems:'center', maxWidth:1300 }}>
              <button style={styles.primaryBtn} onClick={addContainerRow}>+ Novi red</button>
              <input
                style={styles.input}
                placeholder="Pretraga (broj, dobavljač, prevoznik, napomena…)"
                value={containersSearch}
                onChange={(e)=>setContainersSearch(e.target.value)}
              />
              <select style={styles.select} value={containersFilter} onChange={(e)=>setContainersFilter(e.target.value as any)}>
                <option value="all">Svi</option>
                <option value="paid">Plaćeno</option>
                <option value="unpaid">Neplaćeno</option>
              </select>
              <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                <input type="checkbox" checked={containersCompact} onChange={(e)=>setContainersCompact(e.target.checked)} />
                Kompaktno
              </label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleContainersUpload} />
              {/* Export dugmad */}
              <button
                style={styles.secondaryBtn}
                onClick={()=>exportContainersPDF(filteredContainers)}
                title="Izvezi u PDF"
              >
                PDF
              </button>
              <button
                style={styles.secondaryBtn}
                onClick={()=>exportContainersXLSX(filteredContainers)}
                title="Izvezi u Excel (XLSX)"
              >
                Excel
              </button>
              <div style={{ fontSize:12, opacity:.7, justifySelf:'end' }}>
                <span style={{ display:'inline-block', width:8, height:8, borderRadius:999, marginRight:6, background: containersRemote ? '#22c55e' : '#f59e0b', boxShadow:'0 0 0 3px rgba(0,0,0,0.06)' }} />
                {containersRemote ? 'Podaci se čuvaju na serveru.' : 'Podaci se čuvaju lokalno (browser).'}
              </div>
            </div>
            {openContainerFiles !== null && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                }}
                onClick={() => setOpenContainerFiles(null)}
              >
                <div
                  style={{
                    width: 720,
                    maxWidth: '92vw',
                    background: '#fff',
                    color: '#0b1220',
                    borderRadius: 12,
                    boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
                    padding: 16,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>Fajlovi — kontejner #{openContainerFiles}</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id="containerFilesModalInput"
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(ev) => onContainerFilesSelected(openContainerFiles!, ev)}
                      />
                      <button
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: '#f5f7fb' }}
                        onClick={() => (document.getElementById('containerFilesModalInput') as HTMLInputElement)?.click()}
                      >
                        + Dodaj fajl(ove)
                      </button>
                      <button
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: '#fef2f2', color: '#9a0521' }}
                        onClick={() => setOpenContainerFiles(null)}
                      >
                        Zatvori
                      </button>
                    </div>
                  </div>

                  {containerFilesErr && (
                    <div style={{ marginBottom: 8, padding: 8, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                      {containerFilesErr}
                    </div>
                  )}
                  {containerFilesLoading ? (
                    <div style={{ padding: 16 }}>Učitavanje fajlova…</div>
                  ) : (
                    <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                      <table className="compactTable" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc' }}>
                            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Naziv fajla</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Veličina</th>
                            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Datum</th>
                            <th style={{ textAlign: 'right', padding: '8px 12px' }}>Akcije</th>
                          </tr>
                        </thead>
                        <tbody>
                          {containerFiles.length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ padding: '10px 12px', textAlign: 'center', opacity: 0.7 }}>Nema fajlova.</td>
                            </tr>
                          ) : (
                            containerFiles.map((f) => (
                              <tr key={f.id}>
                                <td style={{ padding: '6px 12px' }}>{f.filename}</td>
                                <td style={{ padding: '6px 12px' }}>{typeof f.size === 'number' ? `${f.size} B` : '—'}</td>
                                <td style={{ padding: '6px 12px' }}>{new Date(f.uploaded_at).toLocaleString()}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <button
                                    style={{ marginRight: 6, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.15)', background: '#f5f7fb' }}
                                    onClick={() => downloadContainerFile(f.id)}
                                    title="Preuzmi"
                                  >
                                    Preuzmi
                                  </button>
                                  <button
                                    style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(240, 100, 120, 0.5)', background: '#fef2f2', color: '#9a0521' }}
                                    onClick={() => deleteContainerFile(f.id)}
                                    title="Obriši"
                                  >
                                    Obriši
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ANALIZE – radi nad onim što je filtrirano/traženo */}
            <div className="cont-analytics">
              <style>{`
                .cont-analytics .statRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;max-width:1300px}
                .cont-analytics .statCard{position:relative;padding:14px;border-radius:14px;border:1px solid rgba(0,0,0,.08);color:#0b1220;overflow:hidden}
                .cont-analytics .statCard .label{font-size:12px;opacity:.75}
                .cont-analytics .statCard .value{font-size:22px;font-weight:800}
                .cont-analytics .statCard.blue{background:linear-gradient(180deg,#eef2ff,#f8fafc)}
                .cont-analytics .statCard.green{background:linear-gradient(180deg,#ecfdf5,#f8fafc)}
                .cont-analytics .statCard.amber{background:linear-gradient(180deg,#fff7ed,#f8fafc)}
                .cont-analytics .statCard.purple{background:linear-gradient(180deg,#f5f3ff,#f8fafc)}
                .cont-analytics .miniBar{height:8px;border-radius:999px;background:#e5e7eb;overflow:hidden;margin-top:8px}
                .cont-analytics .miniBar > span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#5e80ff,#34c76f)}
                .cont-analytics .twoCol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;max-width:1300px}
                .cont-analytics .panel{padding:12px;border-radius:12px;border:1px solid rgba(0,0,0,.08);background:#fff}
                .cont-analytics table thead th{background:#f8fafc}
                .badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:11px;border:1px solid rgba(0,0,0,.08)}
                .badge.gray{background:#f1f5f9}
                .badge.red{background:#fee2e2;border-color:#fecaca;color:#991b1b}
                .badge.yellow{background:#fef3c7;border-color:#fde68a;color:#92400e}
                .badge.green{background:#dcfce7;border-color:#bbf7d0;color:#166534}
              `}</style>
              <h4 style={{ margin:'6px 0' }}>Analize</h4>

              <div className="statRow">
                <div className="statCard blue">
                  <div className="label">Broj redova</div>
                  <div className="value">{containersAnalytics.count}</div>
                </div>
                <div className="statCard green">
                  <div className="label">% plaćenih</div>
                  <div className="value">{containersAnalytics.paidPct}%</div>
                  <div className="miniBar"><span style={{ width: containersAnalytics.paidPct + '%' }} /></div>
                </div>
                <div className="statCard amber">
                  <div className="label">Σ TOTAL</div>
                  <div className="value">{formatCurrency(containersAnalytics.sumTotal)}</div>
                </div>
                <div className="statCard purple">
                  <div className="label">Σ DEPOSIT / BALANCE</div>
                  <div className="value">{formatCurrency(containersAnalytics.sumDeposit)} / {formatCurrency(containersAnalytics.sumBalance)}</div>
                </div>
              </div>

              <div className="twoCol">
                <div className="panel">
                  <div style={{ fontSize:12, opacity:.75, marginBottom:6 }}>Top dobavljači po BALANCE</div>
                  <table className="compactTable" style={{ ...styles.table, minWidth: 'unset' }}>
                    <thead><tr><th>Dobavljač</th><th style={{textAlign:'right'}}>BALANCE</th></tr></thead>
                    <tbody>
                      {containersAnalytics.topSuppliers.map((r,i)=>(
                        <tr key={i}><td>{r.name}</td><td style={{textAlign:'right'}}>{formatCurrency(r.value)}</td></tr>
                      ))}
                      {containersAnalytics.topSuppliers.length===0 && <tr><td colSpan={2} style={{opacity:.7}}>—</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="panel">
                  <div style={{ fontSize:12, opacity:.75, marginBottom:6 }}>Top agenti po BALANCE</div>
                  <table className="compactTable" style={{ ...styles.table, minWidth: 'unset' }}>
                    <thead><tr><th>Agent</th><th style={{textAlign:'right'}}>BALANCE</th></tr></thead>
                    <tbody>
                      {containersAnalytics.topAgents.map((r,i)=>(
                        <tr key={i}><td>{r.name}</td><td style={{textAlign:'right'}}>{formatCurrency(r.value)}</td></tr>
                      ))}
                      {containersAnalytics.topAgents.length===0 && <tr><td colSpan={2} style={{opacity:.7}}>—</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="twoCol">
                <div className="panel">
                  <div style={{ fontSize:12, opacity:.75, marginBottom:6 }}>Aging (po ETA → ETD)</div>
                  <table className="compactTable" style={{ ...styles.table, minWidth: 'unset' }}>
                    <thead>
                      <tr>
                        <th>Grupa</th>
                        <th>Broj</th>
                        <th style={{textAlign:'right'}}>Σ BALANCE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containersAnalytics.agingBuckets.map((r,i)=> (
                        <tr key={i}>
                          <td>
                            <span className={
                              'badge ' +
                              (r.label.includes('Kasni') ? 'red' :
                               r.label.includes('0–30') ? 'green' :
                               r.label.includes('31–60') ? 'yellow' :
                               r.label.includes('&gt;60') || r.label.includes('>60') ? 'red' : 'gray')
                            }>{r.label}</span>
                          </td>
                          <td>{r.count}</td>
                          <td style={{textAlign:'right'}}>{formatCurrency(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel">
                  <div style={{ fontSize:12, opacity:.75, marginBottom:6 }}>Top roba / cargo po BALANCE</div>
                  <table className="compactTable" style={{ ...styles.table, minWidth: 'unset' }}>
                    <thead>
                      <tr>
                        <th>Roba / Cargo</th>
                        <th style={{textAlign:'right'}}>Σ BALANCE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containersAnalytics.topCargo.map((r,i)=> (
                        <tr key={i}>
                          <td>{r.name}</td>
                          <td style={{textAlign:'right'}}>{formatCurrency(r.value)}</td>
                        </tr>
                      ))}
                      {containersAnalytics.topCargo.length===0 && <tr><td colSpan={2} style={{opacity:.7}}>—</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
              <style>{`
                .containersTable { table-layout: fixed; }
                .containersTable thead th, .containersTable tbody td { padding-left: 20px; text-align: left; }
                .containersTable .supplierCol     { width: 180px; }
                .containersTable .proformaCol     { width: 140px; }
                .containersTable .etdCol          { width: 120px; }
                .containersTable .deliveryCol     { width: 120px; }
                .containersTable .etaCol          { width: 120px; }
                .containersTable .cargoQtyCol     { width: 110px; }
                .containersTable .cargoCol        { width: 180px; }
                .containersTable .containerNoCol  { width: 160px; }
                .containersTable .robaCol         { width: 180px; }
                .containersTable .containPriceCol { width: 140px; }
                .containersTable .agentCol        { width: 140px; }
                .containersTable .totalCol        { width: 130px; }
                .containersTable .depositCol      { width: 130px; }
                .containersTable .balanceCol      { width: 130px; }
                .containersTable .paidCol         { width: 130px; }
                .cellInput { width: 100%; box-sizing: border-box; padding:8px 10px; border:1px solid rgba(0,0,0,0.15); border-radius:8px; background:#fff; color:#0b1220; }
                .containersTable.isCompact th, .containersTable.isCompact td { font-size: 11px; padding: 4px 6px; }
                .containersTable .cargoCol, .containersTable .robaCol { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .paidBadge { display:inline-block; padding:6px 10px; border-radius:999px; border:1px solid rgba(0,0,0,0.1); font-size:12px; cursor:pointer; user-select:none; }
                .paidTrue  { background:#e8f7ee; color:#147a3d; border-color:#34c76f; }
                .paidFalse { background:#fde8ea; color:#a3122c; border-color:#f06a7a; }
              `}</style>
              <table className={"compactTable updatesTable containersTable" + (containersCompact ? " isCompact" : "")} style={styles.table}>
                <colgroup>
                  <col className="supplierCol" />
                  <col className="proformaCol" />
                  <col className="etdCol" />
                  <col className="deliveryCol" />
                  <col className="etaCol" />
                  <col className="cargoQtyCol" />
                  <col className="cargoCol" />
                  <col className="containerNoCol" />
                  <col className="robaCol" />
                  <col className="containPriceCol" />
                  <col className="agentCol" />
                  <col className="totalCol" />
                  <col className="depositCol" />
                  <col className="balanceCol" />
                  <col className="paidCol" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>SUPPLIER</th>
                    <th>PROFORMA NO:</th>
                    <th>ETD</th>
                    <th>Delivery</th>
                    <th>ETA</th>
                    <th>CARGO QTY</th>
                    <th>CARGO</th>
                    <th>CONTAINER NO.</th>
                    <th>ROBA</th>
                    <th>CONTAIN. PRICE</th>
                    <th>AGENT</th>
                    <th>TOTAL</th>
                    <th>DEPOSIT</th>
                    <th>BALANCE</th>
                    <th>Plaćanje</th>
                    <th style={{ textAlign:'right' }}>Akcije</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContainers.map(r => (
                    <tr key={r.id}>
                      <td><input className="cellInput" value={r.supplier} onChange={e=>updateContainerCell(r.id, 'supplier', e.target.value)} /></td>
                      <td><input className="cellInput" value={r.proformaNo} onChange={e=>updateContainerCell(r.id, 'proformaNo', e.target.value)} /></td>
                      <td><input className="cellInput" type="date" value={r.etd} onChange={e=>updateContainerCell(r.id, 'etd', e.target.value)} /></td>
                      <td><input className="cellInput" type="date" value={r.delivery} onChange={e=>updateContainerCell(r.id, 'delivery', e.target.value)} /></td>
                      <td><input className="cellInput" type="date" value={r.eta} onChange={e=>updateContainerCell(r.id, 'eta', e.target.value)} /></td>
                      <td><input className="cellInput" value={r.cargoQty} onChange={e=>updateContainerCell(r.id, 'cargoQty', e.target.value)} placeholder="npr. 24" /></td>
                      <td><input className="cellInput" value={r.cargo} onChange={e=>updateContainerCell(r.id, 'cargo', e.target.value)} /></td>
                      <td><input className="cellInput" value={r.containerNo} onChange={e=>updateContainerCell(r.id, 'containerNo', e.target.value)} placeholder="MSKU1234567" /></td>
                      <td><input className="cellInput" value={r.roba} onChange={e=>updateContainerCell(r.id, 'roba', e.target.value)} /></td>
                      <td><input className="cellInput" value={r.containPrice} onChange={e=>updateContainerCell(r.id, 'containPrice', e.target.value)} placeholder="€" /></td>
                      <td><input className="cellInput" value={r.agent} onChange={e=>updateContainerCell(r.id, 'agent', e.target.value)} /></td>
                      <td><input className="cellInput" value={r.total} onChange={e=>updateContainerCell(r.id, 'total', e.target.value)} placeholder="€" /></td>
                      <td><input className="cellInput" value={r.deposit} onChange={e=>updateContainerCell(r.id, 'deposit', e.target.value)} placeholder="€" /></td>
                      <td>
                        {/* Display formatted balance as read-only */}
                        <input className="cellInput" value={formatCurrency(r.balance)} readOnly placeholder="€" />
                      </td>
                      <td>
                        <span
                          className={`paidBadge ${r.placeno ? 'paidTrue' : 'paidFalse'}`}
                          onClick={()=>toggleContainerPaid(r.id)}
                          title="Klik za promjenu statusa"
                        >
                          {r.placeno ? 'plaćeno' : 'nije plaćeno'}
                        </span>
                      </td>
                      <td style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                        {/* Fajlovi dugme */}
                        <button
                          style={{ ...styles.ghostBtn, padding:'4px 8px', fontSize:12, marginRight:6 }}
                          onClick={()=>openFilesForContainer(r.id)}
                          title="Prikaži fajlove za ovaj kontejner"
                        >
                          Fajlovi
                        </button>
                        {/* Upload dugme + skriveni file input (vezan za ovaj red) */}
                        <input
                          id={`containerFile_${r.id}`}
                          type="file"
                          multiple
                          style={{ display:'none' }}
                          onChange={(ev)=>onContainerFilesSelected(r.id, ev)}
                          accept="*/*"
                        />
                        <button
                          style={{ ...styles.ghostBtn, padding:'4px 8px', fontSize:12, marginRight:6 }}
                          onClick={()=>triggerContainerFilePick(r.id)}
                          title="Upload fajlova za ovaj kontejner"
                        >
                          Upload
                        </button>
                        <button
                          style={{ ...styles.dangerGhost, padding:'4px 8px', fontSize:12 }}
                          onClick={()=>removeContainerRow(r.id)}
                          title="Obriši red"
                        >
                          Obriši
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredContainers.length === 0 && (
                    <tr><td colSpan={16} style={{ textAlign:'center', opacity:.7, padding:14 }}>Nema redova. Dodaj novi red ili uvezi iz Excel-a.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {tab === 'users' && user.role === 'admin' && <UsersView />}
      </main>

      {/* Modal – kreiranje */}
      {openCreate && (
        <div style={styles.modalBackdrop} onClick={() => setOpenCreate(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Novi dolazak</h3>
            <form onSubmit={createArrival} style={{ display: "grid", gap: 8 }}>
              <label style={styles.label}>Dobavljač</label>
              <input
                style={styles.input}
                required
                value={newForm.supplier || ""}
                onChange={(e) => setNewForm({ ...newForm, supplier: e.target.value })}
              />
              <label style={styles.label}>Prevoznik</label>
      {/* Modal – fajlovi za KONTEJNERE */}
      {openContainerFiles && (
        <div style={styles.modalBackdrop} onClick={() => setOpenContainerFiles(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Fajlovi (kontejner #{openContainerFiles})</h3>
            {containerFilesErr && <div style={styles.error}>{containerFilesErr}</div>}
            {containerFilesLoading ? (
              <div>Učitavanje…</div>
            ) : (
              <div style={{ display:'grid', gap:8 }}>
                {containerFiles.length === 0 && (
                  <div style={{ opacity:.7 }}>Nema fajlova.</div>
                )}
                {containerFiles.map(f => (
                  <div key={f.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, padding:'8px 10px' }}>
                    <div>
                      <div style={{ fontWeight:600 }}>{f.filename}</div>
                      <div style={{ fontSize:12, opacity:.7 }}>
                        {new Date(f.uploaded_at).toLocaleString()} • {typeof f.size==='number' ? `${f.size} B` : ''}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <a href={f.url} target="_blank" rel="noreferrer" style={styles.secondaryBtn}>Otvori</a>
                      <button style={styles.dangerGhost} onClick={()=>deleteContainerFile(f.id)}>Obriši</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop:12, textAlign:'right' }}>
              <button style={styles.secondaryBtn} onClick={() => setOpenContainerFiles(null)}>Zatvori</button>
            </div>
          </div>
        </div>
      )}
              <input
                style={styles.input}
                value={newForm.carrier || ""}
                onChange={(e) => setNewForm({ ...newForm, carrier: e.target.value })}
              />
              {/* Tablice polje uklonjeno */}
              <label style={styles.label}>Tip</label>
              <select
                style={styles.select}
                value={newForm.type || "truck"}
                onChange={(e) => setNewForm({ ...newForm, type: e.target.value })}
              >
                {( ["truck", "van", "container", "air", "rail", "ship"] as string[] ).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <label style={styles.label}>ETA</label>
              <input
                style={styles.input}
                type="datetime-local"
                value={newForm.eta || ""}
                onChange={(e) => setNewForm({ ...newForm, eta: e.target.value })}
              />
              <label style={styles.label}>Status</label>
              <select
                style={styles.select}
                value={newForm.status || "announced"}
                onChange={(e) =>
                  setNewForm({
                    ...newForm,
                    status: e.target.value as Arrival["status"],
                  })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label style={styles.label}>Napomena</label>
              <textarea
                style={styles.textarea}
                value={newForm.note || ""}
                onChange={(e) => setNewForm({ ...newForm, note: e.target.value })}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button style={styles.primaryBtn} type="submit">
                  Sačuvaj
                </button>
                <button
                  style={styles.secondaryBtn}
                  type="button"
                  onClick={() => setOpenCreate(false)}
                >
                  Otkaži
                </button>
              </div>
              {!API_KEY && (
                <div style={styles.warn}>
                  Upozorenje: VITE_API_KEY nije postavljen – kreiranje neće raditi.
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal – beleške */}
      {openUpdates && (
        <div style={styles.modalBackdrop} onClick={() => setOpenUpdates(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Beleške / Aktivnosti</h3>
            <div
              style={{
                maxHeight: 260,
                overflow: "auto",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: 8,
                marginBottom: 12,
              }}
            >
              {updates.map((u) => (
                <div key={u.id} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {new Date(u.created_at).toLocaleString()} • korisnik #{u.user_id ?? "-"}
                  </div>
                  <div>{u.message}</div>
                </div>
              ))}
              {updates.length === 0 && (
                <div style={{ opacity: 0.7 }}>Još nema beleški.</div>
              )}
            </div>
            <form onSubmit={addNote} style={{ display: "grid", gap: 8 }}>
              <textarea
                style={styles.textarea}
                placeholder="Dodaj belešku…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.primaryBtn} type="submit">
                  Sačuvaj belešku
                </button>
                <button
                  style={styles.secondaryBtn}
                  type="button"
                  onClick={() => setOpenUpdates(null)}
                >
                  Zatvori
                </button>
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
            <div style={{ marginBottom: 8 }}>
              <input type="file" multiple onChange={uploadFiles} />
            </div>
            <div style={{ maxHeight: 260, overflow:"auto", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:8 }}>
              {files.map(f=>(
                <div key={f.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"6px 4px" }}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color:"#9fb3ff" }}>{f.filename}</a>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontSize:12, opacity:.7 }}>{new Date(f.uploaded_at).toLocaleString()}</span>
                    <button style={styles.dangerGhost} onClick={()=>deleteFile(f.id)}>Obriši</button>
                  </div>
                </div>
              ))}
              {files.length===0 && <div style={{ opacity:.7 }}>Još nema fajlova.</div>}
            </div>
            <div style={{ marginTop: 8, textAlign:"right" }}>
              <button style={styles.secondaryBtn} onClick={()=>setOpenFiles(null)}>Zatvori</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ——— InlineEdit ————————————————————————————————————————————————————————
function InlineEdit({ value, onSave, textarea }: { value: string; textarea?: boolean; onSave: (val: string) => void }) {
  const [val, setVal] = React.useState(value);
  const [editing, setEditing] = React.useState(false);
  useEffect(()=>{ setVal(value); }, [value]);
  const commit = () => {
    if (val !== value) onSave(val);
    setEditing(false);
  };
  if (!editing) {
    return <div onDoubleClick={()=>setEditing(true)} style={{ cursor:"text" }}>{value || "-"}</div>;
  }
  return textarea ? (
    <div>
      <textarea style={styles.textarea} value={val} onChange={e=>setVal(e.target.value)} onBlur={commit} />
      <div style={{ display:"flex", gap:8, marginTop:6 }}>
        <button style={styles.primaryBtn} type="button" onClick={commit}>Sačuvaj</button>
        <button style={styles.secondaryBtn} type="button" onClick={()=>{ setVal(value); setEditing(false); }}>Otkaži</button>
      </div>
    </div>
  ) : (
    <input
      style={styles.input}
      value={val}
      onChange={e=>setVal(e.target.value)}
      onBlur={commit}
      autoFocus
    />
  );
}

// ——— Root ———————————————————————————————————————————————————————————————
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  // na mount: probaj valid token
  useEffect(() => {
    (async () => {
      const t = getToken();
      if (!t) {
        setChecking(false);
        return;
      }
      try {
        const me = await apiGET<{ user: User }>("/auth/me", true);
        setUser(me.user);
      } catch {
        setToken(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return (
      <div style={styles.centeredPage}>
        <div>Provera sesije…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoggedIn={setUser} />;
  }

  return <Dashboard user={user} onLogout={() => setUser(null)} />;
}

// ——— tiny styles ———————————————————————————————————————————————————————
const styles: Record<string, React.CSSProperties> = {
  centeredPage: {
    minHeight: "100vh",
    display: "grid",
    background: "#f7f8fa",
    color: "#0b1220",
    placeItems: "center",
    padding: 24,
  },
  card: {
    width: 360,
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    position: "sticky",
    top: 0,
    background: "#ffffff",
    zIndex: 2,
  },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "#ffffff",
    color: "#0b1220",
    outline: "none",
  },
  textarea: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "#ffffff",
    color: "#0b1220",
    outline: "none",
    minHeight: 80,
  },
  label: { fontSize: 12, opacity: 0.8 },
  error: {
    background: "rgba(255,0,0,0.08)",
    border: "1px solid rgba(255,0,0,0.25)",
    color: "#9b1c1c",
    padding: "8px 10px",
    borderRadius: 8,
    marginTop: 8,
  },
  warn: {
    background: "rgba(255,165,0,0.10)",
    border: "1px solid rgba(255,165,0,0.25)",
    color: "#8a5a00",
    padding: "8px 10px",
    borderRadius: 8,
    marginTop: 8,
  },
  hint: { fontSize: 12, opacity: 0.7, marginTop: 8 },
  primaryBtn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid rgba(94,128,255,0.4)",
    background: "linear-gradient(180deg,#5e80ff,#3f5ae0)",
    color: "white",
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "#ffffff",
    color: "#0b1220",
    cursor: "pointer",
  },
  dangerGhost: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(209,44,44,0.35)",
    background: "transparent",
    color: "#d12c2c",
    cursor: "pointer",
  },
  ghostBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.14)",
    background: "transparent",
    color: "#0b1220",
    cursor: "pointer",
    marginRight: 6,
  },
  select: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(0,0,0,0.15)",
    background: "#ffffff",
    color: "#0b1220",
  },
  table: {
    width: "100%",
    minWidth: "1200px", // smanjeno sa 1520px da stane u većinu ekrana bez “rezanja”
    fontSize: 12,
    borderCollapse: "separate",
    borderSpacing: 0,
    tableLayout: "auto", // auto layout – bolje poravnanje bez fiksnih kolona
    wordBreak: "break-word",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "grid",
    placeItems: "center",
    padding: 20,
    zIndex: 10,
  },
  modal: {
    width: 520,
    maxWidth: "100%",
    background: "#ffffff",
    color: "#0b1220",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: 16,
  },
  tabs: {
    display: 'flex',
    gap: 6,
    padding: 4,
    borderRadius: 10,
    background: 'rgba(0,0,0,0.04)',
    border: '1px solid rgba(0,0,0,0.08)'
  },
  tabBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid transparent',
    background: 'transparent',
    color: '#0b1220',
    cursor: 'pointer',
  },
  tabBtnActive: {
    background: 'rgba(0,0,0,0.06)',
    border: '1px solid rgba(0,0,0,0.14)'
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 10,
    marginBottom: 12,
  },
  kpiCard: {
    padding: 12,
    borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.03), rgba(0,0,0,0.01))',
    border: '1px solid rgba(0,0,0,0.08)',
  },
  kpiCardDanger: {
    padding: 12,
    borderRadius: 12,
    background: 'linear-gradient(180deg, rgba(244,63,94,0.10), rgba(244,63,94,0.05))',
    border: '1px solid rgba(244,63,94,0.20)',
  },
  kpiLabel: { fontSize: 12, opacity: 0.75 },
  kpiValue: { fontSize: 22, fontWeight: 700 },
};