import { useEffect, useRef, useState } from "react";
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

/* =========================
   Types
========================= */
type Container = {
  id: number;
  supplier: string;
  proforma_no?: string;
  cargo?: string;            // tip (npr. 40HQ)
  container_no?: string;
  roba?: string;
  etd?: string;
  delivery?: string;
  eta?: string;
  cargo_qty?: number;
  contain_price?: number;    // €
  total?: number;            // €
  deposit?: number;          // €
  balance?: number;          // €
  agent?: string;
  status?: string;
  paid?: boolean;
};

/* =========================
   Config
========================= */
const API_BASE: string = ((import.meta as any)?.env?.VITE_API_BASE || "http://localhost:8081").replace(/\/$/, "");

type FileMeta = {
  id: number;
  filename: string;
  url?: string;
  size?: number;
  created_at?: string;
};

/* =========================
   Auth helpers
========================= */
function useToken() {
  const [t, setT] = useState<string | null>(localStorage.getItem("token"));
  useEffect(() => {
    const onStorage = () => setT(localStorage.getItem("token"));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return t;
}
function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function patchContainer(id: number, payload: Record<string, any>) {
  const res = await fetch(`${API_BASE}/api/containers/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      // some backends are picky with Accept header when body can be empty
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  // Try to parse JSON if present; otherwise read text
  let data: any = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { data = await res.json(); } catch { data = null; }
  } else {
    try { data = await res.text(); } catch { data = null; }
  }
  if (!res.ok) {
    throw new Error(`PATCH failed: ${res.status} ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  // Some backends respond 200 with a body that just contains "403" or "405" or similar
  if (
    data === "403" ||
    data === "405" ||
    (typeof data === "string" && (data.trim() === "403" || data.trim() === "405")) ||
    (data && typeof data === "object" && (data.status === 403 || data.code === 403 || data.status === 405 || data.code === 405))
  ) {
    throw new Error("PATCH failed: backend returned error in body");
  }
  return data ?? {};
}

// Try various verbs and encodings in case backend is picky
function encodeForm(obj: Record<string, any>) {
  const usp = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    usp.append(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  });
  return usp.toString();
}

async function updateContainerWithFallbacks(id: number, payload: Record<string, any>) {
  const tries = [
    { url: `${API_BASE}/api/containers/${id}`, method: "PATCH", type: "json", body: payload },
    { url: `${API_BASE}/api/containers/${id}`, method: "PUT",   type: "json", body: payload },
    { url: `${API_BASE}/api/containers/${id}`, method: "POST",  type: "json", body: payload },
    { url: `${API_BASE}/api/containers`,       method: "PATCH", type: "json", body: { id, ...payload } },
    { url: `${API_BASE}/api/containers`,       method: "POST",  type: "json", body: { id, ...payload } },
    { url: `${API_BASE}/api/containers/${id}`, method: "POST",  type: "form", body: payload },
    { url: `${API_BASE}/api/containers`,       method: "POST",  type: "form", body: { id, ...payload } },
  ];
  let lastErr: any = null;
  for (const t of tries) {
    try {
      const headers: Record<string, string> = { Accept: "application/json,text/plain;q=0.9,*/*;q=0.8", ...authHeaders() };
      let body: any;
      if (t.type === "json") {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(t.body);
      } else if (t.type === "form") {
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
        body = encodeForm(t.body);
      }
      const res = await fetch(t.url, { method: t.method, headers, body });
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Some backends reply 200 with body "403" or "405" as plain text
      const badBody = (typeof data === "string" ? data.trim() : "") as string;
      if (badBody === "403" || badBody === "405") throw new Error(`Body says ${badBody}`);
      if (data && typeof data === "object" && (data.error || data.errors || data.status === 403 || data.code === 403)) {
        throw new Error(data.error || JSON.stringify(data.errors) || "403");
      }
      return data ?? {};
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error("All update attempts failed");
}


/* =========================
   Utils
========================= */

/** Robust truthy parser for various backend boolean encodings */
function isTruthy(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (v === null || v === undefined) return false;
  // numbers like 1/0 or "1"/"0"
  const n = Number(v);
  if (!Number.isNaN(n)) return n === 1;
  const s = String(v).toLowerCase().trim();
  if (!s) return false;
  return (
    s === "true" ||
    s === "yes" ||
    s === "y" ||
    s === "da" ||
    s === "paid" ||
    s === "plaćeno" ||
    s === "placeno" ||
    s === "on"
  );
}
const fmtCurrency = (v?: number | null) => {
  const n = Number(v || 0);
  // format sa 2 decimale; Excel export dobija raw broj
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
const sumBy = (rows: Container[], key: keyof Container) =>
  rows.reduce((acc, r) => acc + (Number(r[key] ?? 0) || 0), 0);

// Date helpers: show dd.MM.yy in read-mode; store/send as YYYY-MM-DD
function toEU(iso?: string) {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${String(y).slice(2)}`; // dd.MM.yy
}
function fromEU(eu?: string) {
  if (!eu) return "";
  // accept dd.MM.yy or dd.MM.yyyy
  const m = eu.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!m) return eu;
  const dd = m[1].padStart(2, "0");
  const MM = m[2].padStart(2, "0");
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yyyy}-${MM}-${dd}`; // ISO
}

// Map alignment to CSS class (so we can keep column alignment consistent via CSS)
function alignToClass(align?: "left" | "right" | "center") {
  return align === "right" ? "al-right" : align === "center" ? "al-center" : "al-left";
}

// Light inline editable cell. DblClick to edit, Enter/Blur to save, Esc to cancel.
function EditableCell({
  row,
  field,
  type = "text",
  isCurrency = false,
  options,
  onSave,
  align,
  min,
  max,
}: {
  row: Container;
  field: keyof Container;
  type?: "text" | "number" | "date" | "select";
  isCurrency?: boolean;
  options?: string[]; // for select/status
  onSave: (value: any) => Promise<void> | void;
  align?: "left" | "right" | "center";
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<any>(row[field] ?? (type === "number" ? 0 : ""));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    setValue(row[field] ?? (type === "number" ? 0 : ""));
  }, [row[field]]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  async function commit() {
    let v: any = value;
    if (type === "number") {
      v = Number(v || 0);
      if (typeof min === "number" && v < min) v = min;
      if (typeof max === "number" && v > max) v = max;
    }
    if (type === "date") {
      // allow manual EU input in text form, but input type=date gives ISO
      if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(String(v))) v = fromEU(String(v));
    }
    await onSave(v);
    setEditing(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setEditing(false); setValue(row[field] ?? ""); }
  }

  const baseStyle: React.CSSProperties = { textAlign: align || (isCurrency ? "right" : undefined) };
  const tdClassName = alignToClass(align || (isCurrency ? "right" : "left"));

  if (!editing) {
    let display: any = row[field] ?? "";
    if (type === "date") display = toEU(String(display));
    if (isCurrency) display = fmtCurrency(Number(display || 0));

    // status badge coloring for all statuses
    let badgeClass = "ghost";
    if (type === "select") {
      const sv = String(display).toLowerCase();
      if (sv.includes("plaćeno")) badgeClass = "green";
      else if (sv.includes("nije")) badgeClass = "red";
      else if (sv.includes("transport")) badgeClass = "blue";
      else if (sv.includes("luci")) badgeClass = "amber";
      else if (sv.includes("spreman")) badgeClass = "gray";
    }

    return (
      <td style={baseStyle} className={tdClassName} onDoubleClick={() => setEditing(true)} title="Dvaput kliknite za uređivanje">
        {type === "select" ? (
          <span className={`pill ${badgeClass}`}>{String(display) || "—"}</span>
        ) : (
          display || "—"
        )}
      </td>
    );
  }

  // edit mode
  return (
    <td style={baseStyle} className={tdClassName}>
      {type === "select" && options ? (
        <select
          ref={inputRef as any}
          value={String(value || "")}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          className="cell-input"
          style={{ width: "100%", boxSizing: "border-box" }}
        >
          {options.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      ) : type === "date" ? (
        <input
          ref={inputRef as any}
          type="date"
          value={String(value || "").includes("-") ? String(value || "") : fromEU(String(value || ""))}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          className="cell-input"
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      ) : (
        <input
          ref={inputRef as any}
          type={type}
          value={value as any}
          onChange={(e) => setValue((type === "number" ? Number((e.target as HTMLInputElement).value) : (e.target as HTMLInputElement).value) as any)}
          onBlur={commit}
          onKeyDown={onKey}
          className={`cell-input${isCurrency ? " right" : ""}`}
          step={type === "number" ? (isCurrency ? 0.01 : 1) : undefined}
          min={min}
          max={max}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      )}
    </td>
  );
}

/* =========================
   Page
========================= */
export default function ContainersPage() {
  // upload refs
  const fileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});
  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  // files modal
  const [filesModalId, setFilesModalId] = useState<number | null>(null);
  const [filesList, setFilesList] = useState<FileMeta[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);

  // table state
  const [rows, setRows] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Record<number, boolean>>({});
  const [searchText, setSearchText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // show/hide filters
  const [filtersOpen, setFiltersOpen] = useState<boolean>(true);

  // ---- filters & sorting (page header) ----
  const [filterSupplier, setFilterSupplier] = useState<string>(""); // empty = all
  const [filterPaid, setFilterPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [filterFrom, setFilterFrom] = useState<string>(""); // ISO date
  const [filterTo, setFilterTo] = useState<string>("");     // ISO date
  const [filterDateField, setFilterDateField] = useState<"eta" | "etd" | "delivery">("eta");
  const [sortBy, setSortBy] = useState<"id" | "supplier" | "eta" | "etd" | "total" | "balance" | "paid">("eta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // --- pick up global search (?q=...) from URL and apply to table search ---
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    // Read ?q whenever URL changes (e.g., Header navigate or manual edit)
    const sp = new URLSearchParams(location.search || "");
    const q = sp.get("q") || "";
    setSearchText(q);
  }, [location.search]);

  // --- keep URL ?q in sync when user types locally (shareable links) ---
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(location.search || "");
      const current = sp.get("q") || "";
      const next = searchText.trim();
      // avoid needless navigations / loops
      if (next === current) return;
      if (next) sp.set("q", next);
      else sp.delete("q");
      navigate({
        pathname: location.pathname,
        search: sp.toString() ? `?${sp.toString()}` : "",
      }, { replace: true });
    }, 300); // small debounce for nicer UX and fewer history entries
    return () => clearTimeout(t);
  }, [searchText, location.pathname, location.search, navigate]);

  // unique suppliers for dropdown
  const supplierOptions = React.useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.supplier) s.add(String(r.supplier)); });
    return Array.from(s).sort((a,b) => a.localeCompare(b, "sr"));
  }, [rows]);

  // auth
  const token = useToken();

  // selection helpers (bulk delete)
  const isSelected = (id: number) => selectedIds.has(id);
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // inline new row
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRow, setNewRow] = useState<Partial<Container>>({
    supplier: "",
    proforma_no: "",
    cargo: "",
    container_no: "",
    roba: "",
    etd: "",
    delivery: "",
    eta: "",
    cargo_qty: 1,
    contain_price: 0,
    total: 0,
    deposit: 0,
    balance: 0,
    agent: "",
    paid: false,
  });

  /* -------- data -------- */
  async function refresh() {
    setLoading(true);
    try {
      const res = await api.listContainers();
      const data = (res as any)?.ok ? (res as any).data : res;
      if (Array.isArray(data)) {
        const normalized = (data as any[]).map((r: any) => {
          // --- normalize alternate field names coming from backend ---
          const proforma_no =
            r.proforma_no ?? r.proforma ?? r.proformaNo ?? r.proforma_number ?? r.pf_no ?? r.pfNumber ?? "";
          const container_no =
            r.container_no ?? r.container ?? r.containerNo ?? r.container_number ?? r.containerno ?? r.containerNum ?? "";
          const cargo_qtyRaw =
            r.cargo_qty ?? r.qty ?? r.quantity ?? r.cargoQty ?? r.cargo_quantity ?? null;

          const cargo_qty = cargo_qtyRaw == null ? undefined : Number(cargo_qtyRaw);

          // derive boolean "paid" from several possible backend fields (robust)
          const paidBool =
            isTruthy(r.paid) ||
            isTruthy((r as any).placeno) ||   // ← support Serbian field name from backend
            isTruthy((r as any).is_paid) ||
            isTruthy((r as any).isPaid) ||
            isTruthy((r as any).payment) ||
            isTruthy((r as any).payment_status) ||
            isTruthy((r as any).status);

          // --- normalize money fields from multiple possible backend keys and encodings ---
          const num = (v: any) => {
            if (v === null || v === undefined || v === "") return 0;
            if (typeof v === "number") return Number.isFinite(v) ? v : 0;
            const s0 = String(v).trim();
            // EU: '.' thousands + ',' decimal
            if (s0.includes(".") && s0.includes(",")) {
              const s = s0.replace(/\./g, "").replace(/,/g, ".");
              const n = Number(s);
              return Number.isFinite(n) ? n : 0;
            }
            if (s0.includes(",") && !s0.includes(".")) {
              const s = s0.replace(/\s/g, "").replace(/,/g, ".");
              const n = Number(s);
              return Number.isFinite(n) ? n : 0;
            }
            const n = Number(s0.replace(/\s/g, ""));
            return Number.isFinite(n) ? n : 0;
          };

          const contain_price =
            num(r.contain_price ?? r.price ?? (r as any).cijena ?? (r as any)["cijena"] ?? (r as any)["cijena (eur)"] ?? (r as any).contain_price_eur);

          const total =
            num(r.total ?? (r as any).ukupno ?? (r as any)["total (eur)"] ?? (r as any).total_eur);

          const deposit =
            num(r.deposit ?? (r as any).depozit ?? (r as any)["depozit (eur)"] ?? (r as any).deposit_eur);

          const balance =
            num(r.balance ?? (r as any).balans ?? (r as any)["balans (eur)"] ?? (r as any).balance_eur);

          return {
            ...r,
            proforma_no,
            container_no,
            cargo_qty,
            contain_price,
            total,
            deposit,
            balance,
            paid: !!paidBool,
          };
        });
        setRows(normalized as Container[]);
        setSelectedIds(prev => {
          const keep = new Set<number>();
          normalized.forEach((r: any) => { if (prev.has(Number(r.id))) keep.add(Number(r.id)); });
          return keep;
        });
      } else {
        setRows([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const id = setInterval(refresh, 300000);
    return () => clearInterval(id);
  }, []);

  // -------- search & visible rows --------
  const filteredRows = React.useMemo(() => {
    const q = searchText.trim().toLowerCase();

    // 1) text search
    let list = rows.filter((r) => {
      if (!q) return true;
      const values: any[] = [
        r.id,
        r.supplier,
        r.proforma_no,
        r.cargo,
        r.container_no,
        r.roba,
        r.agent,
        r.etd,
        r.delivery,
        r.eta,
        r.cargo_qty,
        r.contain_price,
        r.total,
        r.deposit,
        r.balance,
        r.paid ? "placeno" : "nije placeno",
      ];
      return values
        .filter((v) => v !== undefined && v !== null)
        .some((v) => String(v).toLowerCase().includes(q));
    });

    // 2) supplier filter
    if (filterSupplier) {
      list = list.filter(r => String(r.supplier || "") === filterSupplier);
    }

    // 3) paid filter
    if (filterPaid !== "all") {
      const desired = filterPaid === "paid";
      list = list.filter(r => !!r.paid === desired);
    }

    // 4) date range filter on selected field
    const getDate = (r: Container) => {
      const v = (filterDateField === "eta" ? r.eta : filterDateField === "etd" ? r.etd : r.delivery) || "";
      return v;
    };
    if (filterFrom) {
      list = list.filter(r => {
        const v = getDate(r);
        return v && v >= filterFrom;
      });
    }
    if (filterTo) {
      list = list.filter(r => {
        const v = getDate(r);
        return v && v <= filterTo;
      });
    }

    // 5) sorting
    const toNum = (x: any) => Number(x ?? 0);
    const toStr = (x: any) => String(x ?? "").toLowerCase();
    const cmp = (a: Container, b: Container) => {
      let aa: any, bb: any;
      switch (sortBy) {
        case "id": aa = toNum(a.id); bb = toNum(b.id); break;
        case "supplier": aa = toStr(a.supplier); bb = toStr(b.supplier); break;
        case "eta": aa = String(a.eta || ""); bb = String(b.eta || ""); break;
        case "etd": aa = String(a.etd || ""); bb = String(b.etd || ""); break;
        case "total": aa = toNum(a.total); bb = toNum(b.total); break;
        case "balance": aa = toNum(a.balance); bb = toNum(b.balance); break;
        case "paid": aa = a.paid ? 1 : 0; bb = b.paid ? 1 : 0; break;
        default: aa = 0; bb = 0;
      }
      if (aa < bb) return sortDir === "asc" ? -1 : 1;
      if (aa > bb) return sortDir === "asc" ? 1 : -1;
      return 0;
    };
    list = [...list].sort(cmp);

    return list;
  }, [rows, searchText, filterSupplier, filterPaid, filterFrom, filterTo, filterDateField, sortBy, sortDir]);

  const totalSumVisible = React.useMemo(() => sumBy(filteredRows, "total"), [filteredRows]);
  const depositSumVisible = React.useMemo(() => sumBy(filteredRows, "deposit"), [filteredRows]);
  const balanceSumVisible = React.useMemo(() => sumBy(filteredRows, "balance"), [filteredRows]);
  // When a row is marked as paid, its balance should not count toward the footer total
  const paidBalanceSumVisible = React.useMemo(() => sumBy(filteredRows.filter(r => !!r.paid), "balance"), [filteredRows]);
  const netTotalSumVisible = React.useMemo(() => totalSumVisible - paidBalanceSumVisible, [totalSumVisible, paidBalanceSumVisible]);

  /* -------- files -------- */
  async function listFiles(containerId: number) {
    setFilesModalId(containerId);
    setFilesLoading(true);
    setFilesList([]);
    setPreviewUrl(null);
    setPreviewName(null);
    try {
      const res = await fetch(`${API_BASE}/api/containers/${containerId}/files`, {
        method: "GET",
        headers: { Accept: "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error(`List files failed: ${res.status}`);
      const data = await res.json();
      const raw: any[] = Array.isArray(data) ? data : data.files || [];
      const items: FileMeta[] = raw.map((it: any) => ({
        id: Number(it.id),
        filename: String(it.filename || it.name || `file-${it.id}`),
        size: typeof it.size === "number" ? it.size : undefined,
        created_at: it.created_at || it.createdAt,
        url: it.url || `${API_BASE}/api/containers/${containerId}/files/${it.id}`,
      }));
      setFilesList(items);
    } catch (err) {
      console.error(err);
      alert("Ne mogu učitati fajlove za ovaj kontejner.");
      setFilesList([]);
    } finally {
      setFilesLoading(false);
    }
  }
  async function uploadFiles(containerId: number, files: FileList | null) {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    try {
      const res = await fetch(`${API_BASE}/api/containers/${containerId}/files`, {
        method: "POST",
        headers: { ...authHeaders() }, // NE stavljati Content-Type uz FormData
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }
      if (filesModalId === containerId) await listFiles(containerId);
      alert("Fajlovi su uploadovani.");
    } catch (err) {
      console.error(err);
      alert("Upload fajlova nije uspio.");
    } finally {
      const input = fileInputsRef.current[containerId];
      if (input) input.value = "";
    }
  }
  async function deleteFile(containerId: number, fileId: number) {
    if (!confirm("Obrisati fajl?")) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/containers/${containerId}/files/${fileId}`,
        { method: "DELETE", headers: { ...authHeaders() } }
      );
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await listFiles(containerId);
      setPreviewUrl(null);
      setPreviewName(null);
    } catch (err) {
      console.error(err);
      alert("Brisanje fajla nije uspjelo.");
    }
  }
  function onPickNewFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setNewFiles((prev) => [...prev, ...Array.from(files)]);
    if (newFileInputRef.current) newFileInputRef.current.value = "";
  }
  function removeNewFileAt(idx: number) {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  /* -------- import (Excel/CSV) -------- */
  function onClickImport() {
    // open hidden file input
    importInputRef.current?.click();
  }

  async function onImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const name = (file.name || "").toLowerCase();

    try {
      if (name.endsWith(".csv")) {
        // Simple client-side CSV import (UTF-8). First row is header.
        const text = await file.text();
        await importFromCSV(text);
        alert("CSV import završen.");
        await refresh();
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        // Prefer backend if available; gracefully fall back to client-side SheetJS
        try {
          const fd = new FormData();
          fd.append("file", file, file.name);
          const res = await fetch(`${API_BASE}/api/containers/import`, {
            method: "POST",
            headers: { ...authHeaders() }, // NE postavljati Content-Type, browser dodaje multipart boundary
            body: fd,
          });

          if (res.ok) {
            alert("Excel import poslan serveru i obrađen.");
            await refresh();
          } else {
            // If server says route/method not allowed, try parsing in-browser
            if (res.status === 405 || res.status === 404) {
              await importFromXLSX(file);
              alert("Excel import završen (obrada u pregledaču).");
              await refresh();
            } else {
              const msg = await res.text().catch(() => "");
              throw new Error(`Import nije uspio: ${res.status} ${msg}`);
            }
          }
        } catch (err) {
          // If network/backend fails, try client-side as last resort
          try {
            await importFromXLSX(file);
            alert("Excel import završen (obrada u pregledaču).");
            await refresh();
          } catch (xlsxErr: any) {
            throw xlsxErr;
          }
        }
      } else {
        alert("Nepodržan format. Dozvoljeni: .xlsx, .xls, .csv");
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Import nije uspio.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function parseCSVLine(line: string): string[] {
    // Minimal CSV parser: supports quoted fields with commas and double-quote escaping
    const out: string[] = [];
    let i = 0, cur = "", inQ = false;
    while (i < line.length) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        } else {
          cur += ch; i++; continue;
        }
      } else {
        if (ch === ',') { out.push(cur.trim()); cur = ""; i++; continue; }
        if (ch === '"') { inQ = true; i++; continue; }
        cur += ch; i++; continue;
      }
    }
    out.push(cur.trim());
    return out;
  }

  // Normalize header names: lowercase, strip accents/diacritics, collapse separators and punctuation
  function normKey(s: string) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      // collapse spaces and common punctuation (._/:;()-)
      .replace(/[\s._/:;()\-]+/g, " ")
      .trim();
  }

  // Try to extract new id from various backend response shapes
  function getNewIdFromCreate(res: any): number | null {
    if (!res) return null;
    const obj = typeof res === "string" ? (() => { try { return JSON.parse(res); } catch { return null; } })() : res;
    if (!obj) return null;
    const direct = (obj as any).id ?? (obj as any).ID ?? (obj as any).Id;
    if (typeof direct === "number") return direct;
    const data = (obj as any).data;
    if (data && typeof data === "object") {
      if (typeof (data as any).id === "number") return (data as any).id;
      if (Array.isArray(data) && data.length && typeof data[0].id === "number") return data[0].id;
    }
    return null;
  }

  async function importFromCSV(text: string) {
    // Split and ignore empty lines
    const linesRaw = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (linesRaw.length === 0) return;

    // Find header row within the first 10 non-empty lines
    let headerRow = 0;
    const candidateHeaders = [
      "supplier","dobavljac","dobavljač","proforma","proforma no","pf no","etd","eta","delivery","qty","kolicina","quantity",
      "tip","cargo","type","container","kontejner","container no","container number","roba","goods","product",
      "cijena","cijena eur","price","contain price","contain_price",
      "agent","total","ukupno","deposit","depozit","balance","balans",
      "paid","placeno","plaćeno","payment status","status"
    ].map(normKey);

    for (let i = 0; i < Math.min(linesRaw.length, 10); i++) {
      const cols = parseCSVLine(linesRaw[i]).map(normKey);
      const hits = cols.filter(c => candidateHeaders.includes(c)).length;
      if (hits >= 2) { headerRow = i; break; }
    }

    const headersRaw = parseCSVLine(linesRaw[headerRow]);
    // Keep raw headers for fallbacks (e.g., "Unnamed: 15")
    const headers = headersRaw.map(normKey);

    // hIndex helper uses normalized comparison and many aliases
    const hIndex = (names: string[]) => {
      const tries = names.map(normKey);
      for (let i = 0; i < headers.length; i++) {
        if (tries.includes(headers[i])) return i;
      }
      return -1;
    };

    const idx = {
      supplier: hIndex(["supplier","dobavljac","dobavljač"]),
      proforma: hIndex(["proforma","proforma_no","proforma number","proforma no","pf_no","pf no","pf number"]),
      etd: hIndex(["etd"]),
      delivery: hIndex(["delivery","isporuka"]),
      eta: hIndex(["eta"]),
      qty: hIndex(["qty","kolicina","količina","quantity","cargo_qty","cargo quantity"]),
      cargo: hIndex(["tip","cargo","type"]),
      container: hIndex(["kontejner","container","container_no","container no","container number","broj kontejnera","kontejner broj"]),
      roba: hIndex(["roba","goods","product","artikal"]),
      contain_price: hIndex(["cijena","cijena eur","price","contain price","contain_price","cijena kontejnera"]),
      agent: hIndex(["agent","spediter","špediter"]),
      total: hIndex(["total","ukupno","total (eur)","ukupno (eur)"]),
      deposit: hIndex(["deposit","depozit","deposit (eur)","depozit (eur)"]),
      balance: hIndex(["balance","balans","balance (eur)","balans (eur)"]),
      paid: hIndex(["paid","placeno","plaćeno","payment_status","payment status","status"]),
    };
    // Fallback: detect unnamed "paid/status" column (e.g., Excel "Unnamed: 15")
    if (idx.paid === -1) {
      for (let i = 0; i < headersRaw.length; i++) {
        const raw = String(headersRaw[i] ?? "").toLowerCase();
        if (raw.startsWith("unnamed")) { idx.paid = i; break; }
      }
    }

    // create sequentially to avoid hammering the API
    for (let li = headerRow + 1; li < linesRaw.length; li++) {
      const cols = parseCSVLine(linesRaw[li]);
      if (cols.length === 0) continue;

      const pick = (i: number) => (i >= 0 && i < cols.length ? cols[i] : "");
      const toNum = (v: any) => {
        if (v === null || v === undefined || v === "") return 0;
        if (typeof v === "number") return Number.isFinite(v) ? v : 0;
        const s0 = String(v).trim();
        // If both separators exist, assume EU style ('.' thousands, ',' decimal)
        if (s0.includes(".") && s0.includes(",")) {
          const s = s0.replace(/\./g, "").replace(/,/g, ".");
          const n = Number(s);
          return Number.isFinite(n) ? n : 0;
        }
        // If only comma exists, treat comma as decimal separator
        if (s0.includes(",") && !s0.includes(".")) {
          const s = s0.replace(/\s/g, "").replace(/,/g, ".");
          const n = Number(s);
          return Number.isFinite(n) ? n : 0;
        }
        // Default: plain Number after removing thin spaces
        const n = Number(s0.replace(/\s/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
      const truthy = (v: any) => isTruthy(v);

      // Normalize EU date formats to ISO
      const normDate = (v: string) => {
        const s = String(v || "").trim();
        if (!s) return "";
        // dd.MM.yy(yy) or dd/MM/yy(yy) or dd-MM-yy(yy)
        if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s)) return fromEU(s);
        return s; // assume already ISO
      };

      const proforma_no = pick(idx.proforma);
      const container_no = pick(idx.container);
      const qty = toNum(pick(idx.qty));
      // Handle combined patterns like "1 x 40HQ" in CARGO QTY
      let qtyParsed = qty;
      let cargoTypeFromQty = "";
      const rawQtyCell = pick(idx.qty);
      if ((!qtyParsed || qtyParsed === 0) && rawQtyCell) {
        const m = String(rawQtyCell).match(/(\d+)\s*[xX]\s*([0-9A-Za-z\-]+)/);
        if (m) {
          qtyParsed = Number(m[1]);
          cargoTypeFromQty = m[2];
        }
      }
      // Fallback: detect container number anywhere in the row if column missing
      let container_no_detected = container_no;
      if (!container_no_detected) {
        const joined = cols.join(" ");
        const mC = joined.match(/\b([A-Z]{4}\d{7})\b/i);
        if (mC) container_no_detected = mC[1].toUpperCase();
      }

      const payload: any = {
        supplier: pick(idx.supplier),
        proforma_no,
        proforma: proforma_no,
        etd: normDate(pick(idx.etd)),
        delivery: normDate(pick(idx.delivery)),
        eta: normDate(pick(idx.eta)),
        cargo_qty: qtyParsed,
        qty: qtyParsed,
        quantity: qtyParsed,
        cargo: pick(idx.cargo) || cargoTypeFromQty,
        type: pick(idx.cargo) || cargoTypeFromQty, // some backends expect 'type' instead of 'cargo'
        container_no: container_no_detected,
        container: container_no_detected,
        containerNo: container_no_detected,
        container_number: container_no_detected,
        containerno: container_no_detected,
        containerNum: container_no_detected,
        roba: pick(idx.roba),
        contain_price: toNum(pick(idx.contain_price)),
        price: toNum(pick(idx.contain_price)), // extra alias
        agent: pick(idx.agent),
        total: toNum(pick(idx.total)),
        deposit: toNum(pick(idx.deposit)),
        balance: toNum(pick(idx.balance)),
        paid: truthy(pick(idx.paid)),
        payment_status: truthy(pick(idx.paid)) ? "paid" : "unpaid", // alias for strict backends
        // If header missing, try to detect "plaćeno/placeno/paid" anywhere in the row
        ...( (idx.paid === -1 || !pick(idx.paid)) && (()=>{
            const rowTxt = cols.join(" ").toLowerCase();
            const isPaid = rowTxt.includes("plaćeno") || rowTxt.includes("placeno") || rowTxt.includes("paid");
            return { paid: isPaid };
          })() ),
      };

      try {
        // 1) Create the container
        const created = await api.createContainer(payload as any).catch((e: any) => {
          console.warn("Create via api.createContainer failed, will try direct fallbacks", e);
          return null;
        });

        // Try to obtain the new id
        let newId = getNewIdFromCreate(created as any);

        // If we didn't get an ID, try a couple of direct create fallbacks (JSON and FORM)
        if (!newId) {
          // JSON to collection
          try {
            const resC = await fetch(`${API_BASE}/api/containers`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json, text/plain;q=0.9, */*;q=0.8", ...authHeaders() },
              body: JSON.stringify(payload),
            });
            if (resC.ok) {
              const ct = resC.headers.get("content-type") || "";
              const data = ct.includes("application/json") ? await resC.json().catch(() => null) : await resC.text().catch(() => null);
              newId = getNewIdFromCreate(data);
            }
          } catch {}
        }
        if (!newId) {
          // FORM to collection
          try {
            const usp = new URLSearchParams();
            Object.entries(payload).forEach(([k, v]) => {
              if (v === undefined || v === null) return;
              usp.append(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
            });
            const resF = await fetch(`${API_BASE}/api/containers`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json, text/plain;q=0.9, */*;q=0.8", ...authHeaders() },
              body: usp.toString(),
            });
            if (resF.ok) {
              const ct2 = resF.headers.get("content-type") || "";
              const data2 = ct2.includes("application/json") ? await resF.json().catch(() => null) : await resF.text().catch(() => null);
              newId = getNewIdFromCreate(data2);
            }
          } catch {}
        }

        // 2) Force-update with a wide alias payload so stricter backends persist all fields
        if (newId) {
          await updateContainerWithFallbacks(newId, {
            // proforma aliases
            proforma_no: payload.proforma_no, proforma: payload.proforma, proformaNo: payload.proforma_no, proforma_number: payload.proforma_no, pf_no: payload.proforma_no, pfNumber: payload.proforma_no,
            // dates
            etd: payload.etd, delivery: payload.delivery, eta: payload.eta,
            // qty aliases
            cargo_qty: payload.cargo_qty, qty: payload.cargo_qty, quantity: payload.cargo_qty, cargoQty: payload.cargo_qty, cargo_quantity: payload.cargo_qty,
            // cargo/type
            cargo: payload.cargo, type: payload.type,
            // container aliases
            container_no: payload.container_no, container: payload.container_no, containerNo: payload.container_no, container_number: payload.container_no, containerno: payload.container_no, containerNum: payload.container_no,
            // money fields + aliases
            contain_price: payload.contain_price, price: payload.price,
            total: payload.total, deposit: payload.deposit, balance: payload.balance,
            // paid/status
            paid: payload.paid, payment_status: payload.payment_status, status: payload.paid ? "plaćeno" : "nije plaćeno",
            // extras
            supplier: payload.supplier, roba: payload.roba, agent: payload.agent,
          }).catch((e) => {
            console.warn("Post-create update failed for id", newId, e);
          });
        }
      } catch (e) {
        console.error("Ne mogu kreirati iz CSV/Excel reda", li + 1, e, payload);
      }
    }
  }

  // Excel import fallback using SheetJS (xlsx) in-browser
  async function importFromXLSX(file: File) {
    try {
      const buf = await file.arrayBuffer();
      // Dynamic import to avoid adding weight if unused
      // @ts-ignore — allow untyped dynamic import
      const XLSX = (await import("xlsx")).default || (await import("xlsx"));
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      // Reuse our robust CSV pipeline by converting the sheet to CSV
      const csv: string = XLSX.utils.sheet_to_csv(ws);
      await importFromCSV(csv);
    } catch (e) {
      console.error("XLSX parse failed", e);
      throw new Error("Ne mogu parsirati Excel u browseru. Instaliraj paket 'xlsx' ili koristi CSV.");
    }
  }

  /* -------- actions -------- */
  async function onDelete(id: number) {
    if (!token) return alert("Niste prijavljeni.");
    if (!confirm("Obrisati ovaj kontejner?")) return;
    await api.deleteContainer(id as any);
    await refresh();
  }
  async function bulkDeleteSelected() {
    if (!token) return alert("Niste prijavljeni.");
    if (selectedIds.size === 0) return;
    const ok = confirm("Da li ste sigurni da želite obrisati izabrane redove?");
    if (!ok) return;
    try {
      // delete in parallel but not too aggressively
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => api.deleteContainer(id as any).catch((e: any) => {
        console.error("Delete failed for", id, e);
      })));
      // optimistically remove from UI and then refresh
      setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
      clearSelection();
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Masovno brisanje nije uspjelo za neke stavke. Provjerite konzolu.");
    }
  }
  async function togglePaid(row: Container) {
    if (!token) return alert("Niste prijavljeni.");
    const prevPaid = !!row.paid;
    const prevBalance = Number(row.balance ?? 0);

    const nextPaid = !prevPaid;
    // When marking as paid, balance goes to 0; when unmarking, balance = total - deposit
    const recomputedBalance = Number(row.total ?? 0) - Number(row.deposit ?? 0);
    const nextBalance = nextPaid ? 0 : recomputedBalance;

    setToggling((m) => ({ ...m, [row.id]: true }));

    // ---- optimistic UI update (affects button color + footer sums immediately)
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, paid: nextPaid, balance: nextBalance } : r
      )
    );

    try {
      // Minimal PATCH that your backend accepts
      await patchContainer(row.id, { placeno: nextPaid, paid: nextPaid });

      // Optionally, if backend also recalculates balance server-side and you want to sync:
      // const fresh = await api.getContainer(row.id as any);
      // if (fresh) {
      //   setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...fresh, paid: !!fresh.paid } : r)));
      // }
    } catch (e) {
      // ---- revert on error
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, paid: prevPaid, balance: prevBalance } : r
        )
      );
      alert("Promjena statusa plaćanja nije uspjela. Pokušajte ponovo.");
    } finally {
      setToggling((m) => ({ ...m, [row.id]: false }));
    }
  }
  async function saveNewRow() {
    if (!token) return alert("Niste prijavljeni.");
    try {
      // Prepare robust payload with multiple alias field names so various backends accept it
      const proforma = String(newRow.proforma_no ?? "").trim();
      const qty = Number(newRow.cargo_qty ?? 0);
      const containerNo = String(newRow.container_no ?? "").trim();

      const base: any = {
        // keep current shape
        ...newRow,
        // normalize obvious number fields
        cargo_qty: qty,
        contain_price: Number(newRow.contain_price ?? 0),
        total: Number(newRow.total ?? 0),
        deposit: Number(newRow.deposit ?? 0),
        balance: Number(newRow.balance ?? 0),
        paid: !!newRow.paid,
      };

      // add aliases that many backends expect
      const payload: any = {
        ...base,
        // proforma aliases
        proforma_no: proforma,
        proforma: proforma,
        proformaNo: proforma,
        proforma_number: proforma,
        pf_no: proforma,
        pfNumber: proforma,
        // quantity aliases
        qty: qty,
        quantity: qty,
        cargoQty: qty,
        cargo_quantity: qty,
        // container number aliases
        container_no: containerNo,
        container: containerNo,
        containerNo: containerNo,
        container_number: containerNo,
        containerno: containerNo,
        containerNum: containerNo,
      };

      // 1) Try the API helper first (likely POST /api/containers JSON)
      let created: any = await api.createContainer(payload as any);

      // If helper threw or returned something unexpected, try a couple of direct fallbacks
      const getNewId = (res: any) =>
        (res as any)?.data?.id ?? (res as any)?.id ?? (typeof res === "object" ? (res as any)?.data?.[0]?.id : undefined);

      let newId = getNewId(created);

      if (!newId) {
        // 2) Try direct POST JSON to collection
        const res = await fetch(`${API_BASE}/api/containers`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json, text/plain;q=0.9, */*;q=0.8", ...authHeaders() },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const ct = res.headers.get("content-type") || "";
          const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null);
          created = data;
          newId = getNewId(data);
        }
      }

      if (!newId) {
        // 3) Try FORM-encoded fallback
        const usp = new URLSearchParams();
        Object.entries(payload).forEach(([k, v]) => {
          if (v === undefined || v === null) return;
          usp.append(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
        });
        const res2 = await fetch(`${API_BASE}/api/containers`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json, text/plain;q=0.9, */*;q=0.8", ...authHeaders() },
          body: usp.toString(),
        });
        if (res2.ok) {
          const ct2 = res2.headers.get("content-type") || "";
          const data2 = ct2.includes("application/json") ? await res2.json().catch(() => null) : await res2.text().catch(() => null);
          created = data2;
          newId = getNewId(data2);
        }
      }

      // upload fajlova (ako su dodati prije snimanja)
      if (newId && newFiles.length > 0) {
        const fd = new FormData();
        newFiles.forEach((f) => fd.append("files", f));
        const resU = await fetch(`${API_BASE}/api/containers/${newId}/files`, {
          method: "POST",
          headers: { ...authHeaders() },
          body: fd,
        });
        if (!resU.ok) {
          const text = await resU.text().catch(() => "");
          console.warn("Upload fajlova nakon kreiranja nije uspio:", resU.status, text);
        }
      }

      setShowNewRow(false);
      setNewRow({
        supplier: "",
        proforma_no: "",
        cargo: "",
        container_no: "",
        roba: "",
        etd: "",
        delivery: "",
        eta: "",
        cargo_qty: 1,
        contain_price: 0,
        total: 0,
        deposit: 0,
        balance: 0,
        agent: "",
        paid: false,
      });
      setNewFiles([]);
      await refresh();
    } catch (e) {
      console.error(e);
      alert("Kreiranje nije uspjelo.");
    }
  }
  function cancelNewRow() {
    setShowNewRow(false);
    setNewFiles([]);
    setNewRow({
      supplier: "",
      proforma_no: "",
      cargo: "",
      container_no: "",
      roba: "",
      etd: "",
      delivery: "",
      eta: "",
      cargo_qty: 1,
      contain_price: 0,
      total: 0,
      deposit: 0,
      balance: 0,
      agent: "",
      paid: false,
    });
  }

  /* -------- export -------- */
  function exportExcelCSV() {
    const header = [
      "ID","Dobavljač","Proforma","ETD","Delivery","ETA","Qty","Tip","Kontejner","Roba",
      "Cijena (EUR)","Agent","Total (EUR)","Depozit (EUR)","Balans (EUR)","Plaćeno",
    ];
    const lines = rows.map(r => [
      r.id,
      r.supplier ?? "",
      r.proforma_no ?? "",
      r.etd ?? "",
      r.delivery ?? "",
      r.eta ?? "",
      r.cargo_qty ?? "",
      r.cargo ?? "",
      r.container_no ?? "",
      r.roba ?? "",
      Number(r.contain_price ?? 0),
      r.agent ?? "",
      Number(r.total ?? 0),
      Number(r.deposit ?? 0),
      Number(r.balance ?? 0),
      r.paid ? "plaćeno" : "nije plaćeno",
    ]);
    const csv =
      header.join(",") +
      "\n" +
      lines
        .map(row =>
          row
            .map(v =>
              typeof v === "string"
                ? `"${v.replace(/"/g, '""')}"`
                : String(v)
            )
            .join(",")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "containers.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function exportPDF() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rowsHtml = rows
      .map(
        (r) => `<tr>
          <td>${r.id ?? ""}</td>
          <td>${r.supplier ?? ""}</td>
          <td>${r.proforma_no ?? ""}</td>
          <td>${r.etd ?? ""}</td>
          <td>${r.delivery ?? ""}</td>
          <td>${r.eta ?? ""}</td>
          <td style="text-align:center">${r.cargo_qty ?? ""}</td>
          <td>${r.cargo ?? ""}</td>
          <td>${r.container_no ?? ""}</td>
          <td>${r.roba ?? ""}</td>
          <td style="text-align:right">${fmtCurrency(r.contain_price)}</td>
          <td>${r.agent ?? ""}</td>
          <td style="text-align:right">${fmtCurrency(r.total)}</td>
          <td style="text-align:right">${fmtCurrency(r.deposit)}</td>
          <td style="text-align:right">${fmtCurrency(r.balance)}</td>
          <td>${r.paid ? "plaćeno" : "nije plaćeno"}</td>
        </tr>`
      )
      .join("");

    const t = sumBy(rows, "total");
    const d = sumBy(rows, "deposit");
    const b = sumBy(rows, "balance");

    w.document.write(`
      <html>
        <head>
          <meta charset="utf-8"/>
          <title>Kontejneri</title>
          <style>
            body{font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; font-size:11px; padding:16px;}
            h2{margin:0 0 8px 0;}
            table{width:100%; border-collapse:collapse; font-size:11px;}
            th,td{border:1px solid #d9dbe3; padding:6px 8px; text-align:left;}
            th{background:#f4f6fb; position:sticky; top:0;}
            tfoot td{font-weight:700; background:#fbfcff;}
            .right{text-align:right}
            @page{margin:12mm}
          </style>
        </head>
        <body>
          <h2>Informacije o Kontejnerima</h2>
          <table>
            <thead>
              <tr>
                <th>#</th><th>Dobavljač</th><th>Proforma</th><th>ETD</th><th>Delivery</th>
                <th>ETA</th><th>Qty</th><th>Tip</th><th>Kontejner</th><th>Roba</th>
                <th>Cijena</th><th>Agent</th><th>Total</th><th>Depozit</th><th>Balans</th><th>Plaćanje</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="12">Sume</td>
                <td class="right">${fmtCurrency(t)}</td>
                <td class="right">${fmtCurrency(d)}</td>
                <td class="right">${fmtCurrency(b)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <script>window.print()</script>
        </body>
      </html>
    `);
    w.document.close();
  }

  /* -------- render -------- */
  // Show NET total (gross total minus balances of paid rows) immediately after toggle
  const totalSum = netTotalSumVisible;
  const depositSum = depositSumVisible;
  const balanceSum = balanceSumVisible;

  return (
    <div className="content-area flex-1 transition-all duration-300">
      <div className="page-head card fullbleed" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12 }}>
        <div>
          {/* TITLE + FILTER TOGGLE */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <h1 style={{ margin: 0 }}>Informacije o Kontejnerima</h1>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              title={filtersOpen ? "Sakrij filtere" : "Prikaži filtere"}
              style={{ whiteSpace: "nowrap" }}
            >
              {filtersOpen ? "Sakrij filtere ▲" : "Prikaži filtere ▼"}
            </button>
          </div>

          {/* FILTERS BAR */}
          {filtersOpen && (
            <div
              className="filters-bar"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                marginTop: 10,
              }}
            >
              {/* Dobavljač */}
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" title="Dobavljač">📦</span>
                <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Dobavljač</label>
                <select className="input" value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
                  <option value="">Svi</option>
                  {supplierOptions.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" title="Status">💳</span>
                <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Status</label>
                <select className="input" value={filterPaid} onChange={(e) => setFilterPaid(e.target.value as any)}>
                  <option value="all">Svi</option>
                  <option value="paid">Plaćeni</option>
                  <option value="unpaid">Neplaćeni</option>
                </select>
              </div>

              {/* Datum raspon */}
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" title="Datum">📅</span>
                <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Datum</label>
                <select className="input" value={filterDateField} onChange={(e) => setFilterDateField(e.target.value as any)}>
                  <option value="eta">ETA</option>
                  <option value="etd">ETD</option>
                  <option value="delivery">Delivery</option>
                </select>
                <input className="input" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
                <span style={{ opacity: 0.7 }}>–</span>
                <input className="input" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </div>

              {/* Sortiranje */}
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" title="Sortiraj">↕️</span>
                <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Sortiraj po</label>
                <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                  <option value="eta">ETA</option>
                  <option value="etd">ETD</option>
                  <option value="total">Total</option>
                  <option value="balance">Balans</option>
                  <option value="supplier">Dobavljač</option>
                  <option value="paid">Plaćanje</option>
                  <option value="id">#</option>
                </select>
                <select className="input" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
                  <option value="asc">Rastuće</option>
                  <option value="desc">Opadajuće</option>
                </select>
              </div>

              {/* Pretraga */}
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 260px" }}>
                <span aria-hidden="true" title="Pretraga">🔎</span>
                <label style={{ fontSize: 12, opacity: 0.8, whiteSpace: "nowrap" }}>Pretraga</label>
                <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="search"
                    className="input"
                    placeholder="dobavljač, proforma, kontejner, agent, …"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSearchText(searchText)}
                    title="Primijeni pretragu"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    Pretraži
                  </button>
                  {searchText && (
                    <button
                      type="button"
                      aria-label="Očisti pretragu"
                      onClick={() => setSearchText("")}
                      className="btn ghost"
                      title="Očisti"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Reset – niži prioritet, sivi ton */}
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setFilterSupplier("");
                    setFilterPaid("all");
                    setFilterFrom("");
                    setFilterTo("");
                    setFilterDateField("eta");
                    setSortBy("eta");
                    setSortDir("asc");
                    setSearchText("");
                  }}
                  title="Resetuj filtere"
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="head-actions" style={{ display: "flex", gap: 8, alignItems: "center", justifySelf: "end" }}>
          <button type="button" className="btn" onClick={() => setShowNewRow((v) => !v)}>
            {showNewRow ? "Zatvori unos" : "Novi unos"}
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={selectedIds.size === 0}
            onClick={bulkDeleteSelected}
            title="Obriši selektovane redove"
          >
            Obriši selektovane
          </button>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            ref={importInputRef}
            style={{ display: "none" }}
            onChange={(e) => onImportFiles(e.target.files)}
          />
          <button className="btn" onClick={onClickImport}>Import</button>
          <button className="btn ghost" onClick={exportExcelCSV}>Export Excel</button>
          <button className="btn ghost" onClick={exportPDF}>Export PDF</button>
        </div>
      </div>

      <div className="card table-wrap fullbleed">
        {loading ? (
          <p style={{ padding: 12 }}>Učitavanje…</p>
        ) : (
          <table
            className="table responsive"
            style={{ tableLayout: "fixed", width: "100%" }}
          >
            <colgroup>
              {/* Selection */}
              <col style={{ width: "36px" }} />
              {/* # */}
              <col style={{ width: "56px" }} />
              {/* Dobavljač */}
              <col style={{ width: "10%" }} />
              {/* Proforma */}
              <col style={{ width: "8%" }} />
              {/* ETD */}
              <col style={{ width: "5%" }} />
              {/* Delivery */}
              <col style={{ width: "5%" }} />
              {/* ETA */}
              <col style={{ width: "5%" }} />
              {/* Qty */}
              <col style={{ width: "4%" }} />
              {/* Tip */}
              <col style={{ width: "5%" }} />
              {/* Kontejner */}
              <col style={{ width: "7%" }} />
              {/* Roba */}
              <col style={{ width: "9%" }} />
              {/* Cijena */}
              <col style={{ width: "6%" }} />
              {/* Agent */}
              <col style={{ width: "6%" }} />
              {/* Total */}
              <col style={{ width: "6%" }} />
              {/* Depozit */}
              <col style={{ width: "6%" }} />
              {/* Balans */}
              <col style={{ width: "6%" }} />
              {/* Plaćanje */}
              <col style={{ width: "5%" }} />
              {/* Akcije */}
              <col style={{ width: "180px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="al-center">
                  <input
                    type="checkbox"
                    aria-label="Selektuj sve vidljive"
                    checked={filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id))}
                    onChange={(e) => {
                      const checked = e.currentTarget.checked;
                      setSelectedIds(prev => {
                        if (!checked) return new Set();
                        const next = new Set(prev);
                        filteredRows.forEach(r => next.add(r.id));
                        return next;
                      });
                    }}
                    ref={(el) => {
                      if (!el) return;
                      const someSelected = filteredRows.some(r => selectedIds.has(r.id));
                      const allSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id));
                      el.indeterminate = someSelected && !allSelected;
                    }}
                  />
                </th>
                <th className="al-center">#</th>
                <th className="al-left">Dobavljač</th>
                <th className="al-center">Proforma</th>
                <th className="al-center">ETD</th>
                <th className="al-center">Delivery</th>
                <th className="al-center">ETA</th>
                <th className="al-right">Qty</th>
                <th className="al-left">Tip</th>
                <th className="al-left">Kontejner</th>
                <th className="al-left">Roba</th>
                <th className="al-right">Cijena</th>
                <th className="al-left">Agent</th>
                <th className="al-right">Total</th>
                <th className="al-right">Depozit</th>
                <th className="al-right">Balans</th>
                <th className="al-center">Plaćanje</th>
                <th className="al-center" style={{ width: 180 }}>Akcije</th>
              </tr>
            </thead>
            <tbody>
              {showNewRow && (
                <tr className="new-row compact">
                  <td></td>
                  <td>—</td>
                  <td><input className="cell-input compact" value={newRow.supplier || ""} onChange={(e) => setNewRow((s) => ({ ...s, supplier: e.target.value }))} /></td>
                  <td className="al-center"><input className="cell-input compact" value={newRow.proforma_no || ""} onChange={(e) => setNewRow((s) => ({ ...s, proforma_no: e.target.value }))} style={{ textAlign:'center' }} /></td>
                  <td><input className="cell-input compact" type="date" value={newRow.etd || ""} onChange={(e) => setNewRow((s) => ({ ...s, etd: e.target.value }))} style={{ textAlign: "center" }} /></td>
                  <td><input className="cell-input compact" type="date" value={newRow.delivery || ""} onChange={(e) => setNewRow((s) => ({ ...s, delivery: e.target.value }))} style={{ textAlign: "center" }} /></td>
                  <td><input className="cell-input compact" type="date" value={newRow.eta || ""} onChange={(e) => setNewRow((s) => ({ ...s, eta: e.target.value }))} style={{ textAlign: "center" }} /></td>
                  <td className="al-right">
                    <input
                      className="cell-input compact"
                      type="number"
                      step="1"
                      min={1}
                      max={100000}
                      value={newRow.cargo_qty ?? 1}
                      onChange={(e) => {
                        let v = parseInt(e.target.value || "0", 10);
                        if (isNaN(v)) v = 1;
                        if (v < 1) v = 1;
                        if (v > 100000) v = 100000;
                        setNewRow((s) => ({ ...s, cargo_qty: v }));
                      }}
                      style={{ textAlign: "right", maxWidth: 80 }}
                    />
                  </td>
                  <td><input className="cell-input compact" value={newRow.cargo || ""} onChange={(e) => setNewRow((s) => ({ ...s, cargo: e.target.value }))} /></td>
                  <td><input className="cell-input compact" value={newRow.container_no || ""} onChange={(e) => setNewRow((s) => ({ ...s, container_no: e.target.value }))} /></td>
                  <td><input className="cell-input compact" value={newRow.roba || ""} onChange={(e) => setNewRow((s) => ({ ...s, roba: e.target.value }))} /></td>
                  <td className="currency-cell">
                    <input className="cell-input right compact" type="number" step="0.01" value={newRow.contain_price ?? 0} onChange={(e) => setNewRow((s) => ({ ...s, contain_price: Number(e.target.value) }))} style={{ textAlign: "right" }} />
                  </td>
                  <td><input className="cell-input compact" value={newRow.agent || ""} onChange={(e) => setNewRow((s) => ({ ...s, agent: e.target.value }))} /></td>
                  <td className="currency-cell">
                    <input className="cell-input right compact" type="number" step="0.01" value={newRow.total ?? 0} onChange={(e) => setNewRow((s) => ({ ...s, total: Number(e.target.value) }))} style={{ textAlign: "right" }} />
                  </td>
                  <td className="currency-cell">
                    <input className="cell-input right compact" type="number" step="0.01" value={newRow.deposit ?? 0} onChange={(e) => setNewRow((s) => ({ ...s, deposit: Number(e.target.value) }))} style={{ textAlign: "right" }} />
                  </td>
                  <td className="currency-cell">
                    <input className="cell-input right compact" type="number" step="0.01" value={newRow.balance ?? 0} onChange={(e) => setNewRow((s) => ({ ...s, balance: Number(e.target.value) }))} style={{ textAlign: "right" }} />
                  </td>
                  <td className="al-right" style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className={`btn xsmall pill ${newRow.paid ? "success" : "danger"}`}
                      onClick={() => setNewRow((s) => ({ ...s, paid: !s.paid }))}
                    >
                      {newRow.paid ? "Plaćeno" : "Nije plaćeno"}
                    </button>
                  </td>
                  <td className="actions-cell" style={{whiteSpace: "nowrap"}}>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      style={{ display: "none" }}
                      ref={newFileInputRef}
                      onChange={(e) => onPickNewFiles(e.target.files)}
                    />
                    <div className="row-actions compact">
                      <button type="button" className="btn small ghost" onClick={() => newFileInputRef.current?.click()}>
                        Dodaj fajlove
                      </button>
                      <button type="button" className="btn small" onClick={saveNewRow}>
                        Sačuvaj
                      </button>
                      <button type="button" className="btn small ghost" onClick={cancelNewRow}>
                        Otkaži
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {showNewRow && newFiles.length > 0 && (
                <tr>
                  <td colSpan={17}>
                    <div className="new-files">
                      {newFiles.map((f, idx) => (
                        <span key={idx} className="chip">
                          {f.name}
                          <button type="button" className="chip-x" title="Ukloni" onClick={() => removeNewFileAt(idx)}>×</button>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}

              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td className="al-center">
                    <input
                      type="checkbox"
                      aria-label={`Selektuj red ${r.id}`}
                      checked={isSelected(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td className="al-center">{r.id}</td>
                  <EditableCell row={r} field="supplier" align="left" onSave={(v)=>patchContainer(r.id,{ supplier: String(v||"")}).then(refresh)} />
                  <EditableCell
                    row={r}
                    field="proforma_no"
                    align="center"
                    onSave={(v) =>
                      updateContainerWithFallbacks(r.id, {
                        proforma_no: String(v || ""),
                        proforma: String(v || ""),
                        proformaNumber: String(v || ""),
                        proformaNo: String(v || ""),
                        proforma_number: String(v || ""),
                        pf_no: String(v || ""),
                        pfNumber: String(v || ""),
                      }).then(refresh)
                    }
                  />
                  <EditableCell row={r} field="etd" type="date" align="center" onSave={(v)=>patchContainer(r.id,{ etd: String(v||"")}).then(refresh)} />
                  <EditableCell row={r} field="delivery" type="date" align="center" onSave={(v)=>patchContainer(r.id,{ delivery: String(v||"")}).then(refresh)} />
                  <EditableCell row={r} field="eta" type="date" align="center" onSave={(v)=>patchContainer(r.id,{ eta: String(v||"")}).then(refresh)} />
                  <EditableCell
                    row={r}
                    field="cargo_qty"
                    type="number"
                    align="right"
                    min={1}
                    max={100000}
                    onSave={(v) =>
                      updateContainerWithFallbacks(r.id, {
                        cargo_qty: Number(v || 0),
                        qty: Number(v || 0),
                        quantity: Number(v || 0),
                        cargoQty: Number(v || 0),
                        cargo_quantity: Number(v || 0),
                      }).then(refresh)
                    }
                  />
                  <EditableCell row={r} field="cargo" align="left" onSave={(v)=>patchContainer(r.id,{ cargo: String(v||"")}).then(refresh)} />
                  <EditableCell
                    row={r}
                    field="container_no"
                    align="left"
                    onSave={(v) =>
                      updateContainerWithFallbacks(r.id, {
                        container_no: String(v || ""),
                        container: String(v || ""),
                        containerNo: String(v || ""),
                        container_number: String(v || ""),
                        containerno: String(v || ""),
                        containerNum: String(v || ""),
                      }).then(refresh)
                    }
                  />
                  <EditableCell row={r} field="roba" align="left" onSave={(v)=>patchContainer(r.id,{ roba: String(v||"")}).then(refresh)} />
                  <EditableCell row={r} field="contain_price" type="number" isCurrency align="right" onSave={(v)=>patchContainer(r.id,{ contain_price: Number(v||0)}).then(refresh)} />
                  <EditableCell row={r} field="agent" align="left" onSave={(v)=>patchContainer(r.id,{ agent: String(v||"")}).then(refresh)} />
                  <EditableCell row={r} field="total" type="number" isCurrency align="right" onSave={(v)=>patchContainer(r.id,{ total: Number(v||0)}).then(refresh)} />
                  <EditableCell row={r} field="deposit" type="number" isCurrency align="right" onSave={(v)=>patchContainer(r.id,{ deposit: Number(v||0)}).then(refresh)} />
                  <EditableCell row={r} field="balance" type="number" isCurrency align="right" onSave={(v)=>patchContainer(r.id,{ balance: Number(v||0)}).then(refresh)} />
                  <td className="al-right" style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className={`btn xsmall pill ${r.paid ? "success" : "danger"}`}
                      title="Promijeni status plaćanja"
                      onClick={() => togglePaid(r)}
                      disabled={!!toggling[r.id]}
                    >
                      {toggling[r.id] ? "…" : (r.paid ? "Plaćeno" : "Nije plaćeno")}
                    </button>
                  </td>
                  <td className="actions-cell" style={{whiteSpace: "nowrap"}}>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      style={{ display: "none" }}
                      ref={(el) => { fileInputsRef.current[r.id] = el; }}
                      onChange={(e) => uploadFiles(r.id, e.target.files)}
                    />
                    <div className="row-actions">
                      <button type="button" className="btn small ghost" onClick={() => listFiles(r.id)}>
                        Fajlovi
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => fileInputsRef.current[r.id]?.click()}
                      >
                        Upload
                      </button>
                      <button type="button" className="btn small danger" onClick={() => onDelete(r.id)}>
                        Obriši
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <td colSpan={13} style={{ fontWeight: 600 }} className="al-left">Sume</td>
                <td className="al-right" style={{ fontWeight: 700 }}>{fmtCurrency(totalSum)}</td>
                <td className="al-right" style={{ fontWeight: 700 }}>{fmtCurrency(depositSum)}</td>
                <td className="al-right" style={{ fontWeight: 700 }}>{fmtCurrency(balanceSum)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {filesModalId !== null && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setFilesModalId(null);
            setPreviewUrl(null);
            setPreviewName(null);
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <strong>Fajlovi za kontejner #{filesModalId}</strong>
              <button
                className="btn small ghost"
                onClick={() => {
                  setFilesModalId(null);
                  setPreviewUrl(null);
                  setPreviewName(null);
                }}
              >
                Zatvori
              </button>
            </div>
            {filesLoading ? (
              <p>Učitavanje…</p>
            ) : filesList.length === 0 ? (
              <p>Nema fajlova.</p>
            ) : (
              <>
                <ul className="files">
                  {filesList.map((f: FileMeta) => (
                    <li key={f.id}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                        <a
                          href={f.url || `${API_BASE}/api/containers/${filesModalId ?? 0}/files/${f.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            const url = f.url || `${API_BASE}/api/containers/${filesModalId ?? 0}/files/${f.id}`;
                            setPreviewUrl(url);
                            setPreviewName(f.filename);
                          }}
                        >
                          {f.filename}
                        </a>
                        <button className="btn xsmall danger" onClick={() => deleteFile(filesModalId, f.id)}>
                          Obriši
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {previewUrl && (
                  <div style={{ marginTop: 12, position: "relative" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <strong>Pregled: {previewName}</strong>
                      <button className="btn xsmall ghost" onClick={() => { setPreviewUrl(null); setPreviewName(null); }}>
                        Zatvori pregled
                      </button>
                    </div>
                    <iframe
                      src={previewUrl}
                      style={{ width: "100%", height: "400px", border: "1px solid #ccc", borderRadius: 8 }}
                      title={`Preview of ${previewName}`}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

    
    </div>
  );
}