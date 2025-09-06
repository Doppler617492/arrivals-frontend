import { useEffect, useRef, useState } from "react";
import React from "react";
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

// Try a list of candidate payloads for PATCH/PUT/POST by delegating to updateContainerWithFallbacks
async function patchAny(id: number, candidates: Record<string, any>[]) {
  let lastErr: any = null;
  for (const body of candidates) {
    try {
      await updateContainerWithFallbacks(id, body);
      return;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  if (lastErr) throw lastErr;
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

// --- New helper for paid toggle, robust to many backend variants ---
async function updatePaidAny(row: Container, nextPaid: boolean) {
  // Build a "full" object (some backends require full resource payloads)
  const fullObj: Record<string, any> = { ...row, paid: !!nextPaid };
  // Normalize nullable/undefineds for stricter backends
  Object.keys(fullObj).forEach((k) => {
    if (fullObj[k as keyof typeof fullObj] === undefined) fullObj[k as keyof typeof fullObj] = null;
  });

  // Prepare common bodies with different field spellings / encodings
  const valBool = !!nextPaid;
  const valNum = nextPaid ? 1 : 0;
  const valStr = nextPaid ? "true" : "false";
  const valPaidTxt = nextPaid ? "paid" : "unpaid";
  const valLocalTxt = nextPaid ? "plaćeno" : "nije plaćeno";

  const bodies: Record<string, any>[] = [
    { paid: valBool },
    { paid: valNum },
    { paid: valStr },
    { is_paid: valNum },
    { isPaid: valBool },
    { payment: valNum },
    { paymentStatus: valPaidTxt },
    { payment_status: valPaidTxt },
    { payment_status: valNum },
    { status: valLocalTxt },
  ];

  // Try a wide range of endpoints / verbs / encodings, including overrides and action-like routes
  const variants: { url: string; method: string; type: "json" | "form" | "json-override"; body: Record<string, any> }[] = [];

  const resourceUrl = `${API_BASE}/api/containers/${row.id}`;
  const collUrl = `${API_BASE}/api/containers`;
  const actionUrls = [
    `${API_BASE}/api/containers/${row.id}/paid`,
    `${API_BASE}/api/containers/${row.id}/pay`,
    `${API_BASE}/api/containers/${row.id}/status`,
    `${API_BASE}/api/containers/${row.id}/toggle_paid`,
  ];

  // Minimal bodies
  for (const b of bodies) {
    variants.push({ url: resourceUrl, method: "PATCH", type: "json", body: b });
    variants.push({ url: resourceUrl, method: "PUT",   type: "json", body: b });
    variants.push({ url: resourceUrl, method: "POST",  type: "json", body: b });
    variants.push({ url: resourceUrl, method: "POST",  type: "form", body: b });
  }

  // Collection endpoints with id in body
  for (const b of bodies) {
    variants.push({ url: collUrl, method: "PATCH", type: "json", body: { id: row.id, ...b } });
    variants.push({ url: collUrl, method: "POST",  type: "json", body: { id: row.id, ...b } });
    variants.push({ url: collUrl, method: "POST",  type: "form", body: { id: row.id, ...b } });
  }

  // Full object (some backends require full payloads)
  variants.push({ url: resourceUrl, method: "PUT",   type: "json", body: fullObj });
  variants.push({ url: resourceUrl, method: "POST",  type: "json", body: fullObj });

  // Action-like endpoints
  for (const u of actionUrls) {
    for (const b of bodies) {
      variants.push({ url: u, method: "POST", type: "json", body: b });
      variants.push({ url: u, method: "POST", type: "form", body: b });
    }
  }

  // Method override variant
  variants.push({ url: resourceUrl, method: "POST", type: "json-override", body: { paid: valBool } });

  let lastErr: any = null;
  for (const v of variants) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        ...authHeaders(),
      };
      let body: any;
      const method = v.method;
      if (v.type === "json") {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(v.body);
      } else if (v.type === "form") {
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
        const usp = new URLSearchParams();
        Object.entries(v.body).forEach(([k, val]) => usp.append(k, String(val)));
        body = usp.toString();
      } else if (v.type === "json-override") {
        headers["Content-Type"] = "application/json";
        headers["X-HTTP-Method-Override"] = "PATCH";
        body = JSON.stringify(v.body);
      }

      const res = await fetch(v.url, { method, headers, body });
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const badBody = (typeof data === "string" ? data.trim() : "") as string;
      if (badBody === "403" || badBody === "405") throw new Error(`Body says ${badBody}`);
      if (data && typeof data === "object" && (data.error || data.errors || data.status === 403 || data.code === 403)) {
        throw new Error(data.error || JSON.stringify(data.errors) || "403");
      }
      return data ?? {};
    } catch (e) {
      lastErr = e;
      // eslint-disable-next-line no-console
      console.debug("updatePaidAny attempt failed:", v.method, v.url, v.type, e);
      continue;
    }
  }
  throw lastErr || new Error("All paid update attempts failed");
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

  // ---- filters & sorting (page header) ----
  const [filterSupplier, setFilterSupplier] = useState<string>(""); // empty = all
  const [filterPaid, setFilterPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [filterFrom, setFilterFrom] = useState<string>(""); // ISO date
  const [filterTo, setFilterTo] = useState<string>("");     // ISO date
  const [filterDateField, setFilterDateField] = useState<"eta" | "etd" | "delivery">("eta");
  const [sortBy, setSortBy] = useState<"id" | "supplier" | "eta" | "etd" | "total" | "balance" | "paid">("eta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

          return {
            ...r,
            proforma_no,
            container_no,
            cargo_qty,
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
        // Send to backend for Excel parsing
        const fd = new FormData();
        fd.append("file", file, file.name);
        const res = await fetch(`${API_BASE}/api/containers/import`, {
          method: "POST",
          headers: { ...authHeaders() }, // NE postavljati Content-Type, browser će dodati multipart boundary
          body: fd,
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(`Import nije uspio: ${res.status} ${msg}`);
        }
        alert("Excel import poslan serveru i obrađen.");
        await refresh();
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

  async function importFromCSV(text: string) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return;
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

    const hIndex = (names: string[]) => {
      for (const n of names) {
        const idx = headers.indexOf(n.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idx = {
      supplier: hIndex(["supplier","dobavljač","dobavljac"]),
      proforma: hIndex(["proforma","proforma_no","proforma number","pf_no","pf number"]),
      etd: hIndex(["etd"]),
      delivery: hIndex(["delivery"]),
      eta: hIndex(["eta"]),
      qty: hIndex(["qty","količina","kolicina","quantity","cargo_qty","cargo quantity"]),
      cargo: hIndex(["tip","cargo","type"]),
      container: hIndex(["kontejner","container","container_no","container number"]),
      roba: hIndex(["roba","goods","product"]),
      contain_price: hIndex(["cijena","cena","price","contain_price"]),
      agent: hIndex(["agent"]),
      total: hIndex(["total","ukupno"]),
      deposit: hIndex(["deposit","depozit"]),
      balance: hIndex(["balance","balans"]),
      paid: hIndex(["paid","plaćeno","placeno","payment_status"]),
    };

    // create sequentially to avoid hammering the API
    for (let li = 1; li < lines.length; li++) {
      const cols = parseCSVLine(lines[li]);
      if (cols.length === 0) continue;

      const pick = (i: number) => (i >= 0 && i < cols.length ? cols[i] : "");
      const toNum = (v: any) => {
        const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : 0;
        };
      const truthy = (v: any) => isTruthy(v);

      const proforma_no = pick(idx.proforma);
      const container_no = pick(idx.container);
      const qty = toNum(pick(idx.qty));

      const payload: any = {
        supplier: pick(idx.supplier),
        proforma_no,
        proforma: proforma_no,
        etd: pick(idx.etd),
        delivery: pick(idx.delivery),
        eta: pick(idx.eta),
        cargo_qty: qty,
        qty,
        quantity: qty,
        cargo: pick(idx.cargo),
        container_no,
        container: container_no,
        containerNo: container_no,
        roba: pick(idx.roba),
        contain_price: toNum(pick(idx.contain_price)),
        agent: pick(idx.agent),
        total: toNum(pick(idx.total)),
        deposit: toNum(pick(idx.deposit)),
        balance: toNum(pick(idx.balance)),
        paid: truthy(pick(idx.paid)),
      };

      try {
        await api.createContainer(payload as any);
      } catch (e) {
        console.error("Ne mogu kreirati iz CSV reda", li + 1, e);
      }
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
          <h1 style={{ marginBottom: 8 }}>Informacije o Kontejnerima</h1>
          <div className="filters" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <div className="filter-item">
              <label style={{ fontSize: 12, opacity: 0.8 }}>Dobavljač</label>
              <select className="input" value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}>
                <option value="">Svi</option>
                {supplierOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <label style={{ fontSize: 12, opacity: 0.8 }}>Status</label>
              <select className="input" value={filterPaid} onChange={(e) => setFilterPaid(e.target.value as any)}>
                <option value="all">Svi</option>
                <option value="paid">Plaćeni</option>
                <option value="unpaid">Neplaćeni</option>
              </select>
            </div>

            <div className="filter-item" style={{ display: "flex", gap: 6, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Datum</label>
                <select className="input" value={filterDateField} onChange={(e) => setFilterDateField(e.target.value as any)}>
                  <option value="eta">ETA</option>
                  <option value="etd">ETD</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Od</label>
                <input className="input" type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Do</label>
                <input className="input" type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </div>
            </div>

            <div className="filter-item" style={{ display: "flex", gap: 6, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Sortiraj po</label>
                <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                  <option value="eta">ETA</option>
                  <option value="etd">ETD</option>
                  <option value="total">Total</option>
                  <option value="balance">Balans</option>
                  <option value="supplier">Dobavljač</option>
                  <option value="paid">Plaćanje</option>
                  <option value="id">#</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Smjer</label>
                <select className="input" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
                  <option value="asc">Rastuće</option>
                  <option value="desc">Opadajuće</option>
                </select>
              </div>
            </div>

            <div className="filter-item" style={{ flex: "1 1 260px", position: "relative" }}>
              <label style={{ fontSize: 12, opacity: 0.8 }}>Pretraga</label>
              <input
                type="search"
                className="input"
                placeholder="dobavljač, proforma, kontejner, agent, …"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ paddingRight: 28 }}
              />
              {searchText && (
                <button
                  type="button"
                  aria-label="Očisti pretragu"
                  onClick={() => setSearchText("")}
                  style={{ position: "absolute", right: 6, bottom: 6, fontSize: 16, lineHeight: 1, background: "transparent", border: 0, cursor: "pointer" }}
                >
                  ×
                </button>
              )}
            </div>

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
              style={{ alignSelf: "end" }}
            >
              Reset
            </button>
          </div>
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