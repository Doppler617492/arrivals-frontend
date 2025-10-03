import { useEffect, useRef, useState } from "react";
import React from "react";
import { Card, Button, Select, DatePicker, Input, Space, InputNumber, Switch, Modal, Pagination } from "antd";
import { FolderOpenOutlined, UploadOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "../lib/debounce";

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
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Najavljeno' },
  { value: 'shipped', label: 'U transportu' },
  { value: 'arrived', label: 'Stiglo' },
  { value: 'delivered', label: 'Isporučeno' },
] as const;

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
function authHeaders(required: boolean = false): Record<string, string> {
  const t = localStorage.getItem("token");
  if (!t) {
    if (required) {
      alert("Potrebna je prijava");
      throw new Error("AUTH_MISSING");
    }
    return {};
  }
  return { Authorization: `Bearer ${t}` };
}
async function patchContainer(id: number, payload: Record<string, any>) {
  const res = await fetch(`${API_BASE}/api/containers/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      // some backends are picky with Accept header when body can be empty
      ...authHeaders(true),
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
      const headers: Record<string, string> = { Accept: "application/json,text/plain;q=0.9,*/*;q=0.8", ...authHeaders(true) };
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
// Robust money parsing: accepts "12,345.67", "12.345,67", "$12.345,67", etc.
const parseMoney = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  // Strip currency and non-numeric except separators and minus
  s = s.replace(/[^0-9,.-\s]/g, '');
  if (s.includes('.') && s.includes(',')) {
    // Decide decimal by the right-most separator
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
      // US style: comma thousands, dot decimal
      s = s.replace(/,/g, '');
    } else {
      // EU style: dot thousands, comma decimal
      s = s.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (s.includes(',') && !s.includes('.')) {
    // Only comma present → treat as decimal
    s = s.replace(/,/g, '.');
  } else {
    // Only dot or plain digits → keep
  }
  s = s.replace(/\s/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const fmtCurrency = (v?: number | string | null): string =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseMoney(v));
const sumBy = (rows: Container[], key: keyof Container) =>
  rows.reduce((acc, r) => acc + parseMoney(r[key] as any), 0);

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
  sticky,
  truncate = false,
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
  sticky?: "selector" | "ordinal" | "actions";
  truncate?: boolean;
  align?: "left" | "right" | "center";
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const normalize = (input: any) => {
    if (input === null || input === undefined) return type === "number" ? 0 : "";
    if (typeof input === "number" && Number.isNaN(input)) return type === "number" ? 0 : "";
    if (typeof input === "string" && input.trim().toLowerCase() === "nan") return "";
    if (isCurrency) return parseMoney(input);
    if (type === "number" && typeof input === "string") {
      const parsed = Number(input);
      return Number.isFinite(parsed) ? parsed : parseMoney(input);
    }
    return input;
  };
  const [value, setValue] = useState<any>(normalize(row[field]));
  const inputRef = useRef<any>(null);

  useEffect(() => {
    setValue(normalize(row[field]));
  }, [row[field]]);

  useEffect(() => {
    if (editing && inputRef.current && typeof inputRef.current.focus === 'function') {
      inputRef.current.focus();
    }
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

  // Escape to cancel editing when supported inputs have key handlers
  // AntD inputs commit on blur/Enter; Escape handling is omitted for simplicity.

  const baseStyle: React.CSSProperties = { textAlign: align || (isCurrency ? "right" : undefined) };
  const tdClassName = [
    alignToClass(align || (isCurrency ? "right" : "left")),
    sticky ? `sticky-col ${sticky}` : '',
    isCurrency ? 'currency-cell' : '',
  ].filter(Boolean).join(' ');

  if (!editing) {
    let display: any = row[field] ?? "";
    if (typeof display === "number" && Number.isNaN(display)) display = "";
    if (typeof display === "string" && display.trim().toLowerCase() === "nan") display = "";
    if (type === "date") display = toEU(String(display));
    if (isCurrency) {
      display = display === "" || display === null || (typeof display === 'string' && !display.trim())
        ? ""
        : fmtCurrency(display);
    }
    if (typeof display === "number" && Number.isNaN(display)) display = "";
    const hasValue = display !== "" && display !== null && display !== undefined;
    const stringValue = hasValue ? String(display) : "";
    const cellTitle = truncate && stringValue ? stringValue : 'Dvaput kliknite za uređivanje';

    // status badge coloring for all statuses
    let badgeClass = "ghost";
    if (type === "select") {
      const sv = stringValue.toLowerCase();
      if (sv.includes("plaćeno")) badgeClass = "green";
      else if (sv.includes("nije")) badgeClass = "red";
      else if (sv.includes("transport")) badgeClass = "blue";
      else if (sv.includes("luci")) badgeClass = "amber";
      else if (sv.includes("spreman")) badgeClass = "gray";
    }

    return (
      <td
        style={baseStyle}
        className={tdClassName}
        onDoubleClick={() => setEditing(true)}
        title={cellTitle}
      >
        {type === "select" ? (
          <span className={`pill ${badgeClass}`}>{stringValue || "—"}</span>
        ) : (
          truncate && stringValue ? (
            <span className="cell-truncate">{stringValue}</span>
          ) : (
            stringValue || "—"
          )
        )}
      </td>
    );
  }

  // edit mode
  return (
    <td style={baseStyle} className={tdClassName}>
      {type === 'select' && options ? (
        <Select
          ref={inputRef}
          size="small"
          value={String(value || '')}
          onChange={(v) => { setValue(v); commit(); }}
          onBlur={commit}
          options={options.map(op => ({ label: op, value: op }))}
          style={{ width: '100%' }}
        />
      ) : type === 'date' ? (
        <DatePicker
          ref={inputRef}
          size="small"
          value={value ? dayjs(String(value).includes('-') ? String(value) : fromEU(String(value))) : null}
          onChange={(d) => { setValue(d ? d.format('YYYY-MM-DD') : ''); commit(); }}
          style={{ width: '100%' }}
        />
      ) : type === 'number' ? (
        <InputNumber
          ref={inputRef}
          size="small"
          value={Number(value ?? 0)}
          min={min}
          max={max}
          step={isCurrency ? 0.01 : 1}
          onChange={(v) => setValue(Number(v ?? 0))}
          onBlur={commit}
          onPressEnter={commit as any}
          style={{ width: '100%' }}
        />
      ) : (
        <Input
          ref={inputRef}
          size="small"
          value={String(value ?? '')}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onPressEnter={commit as any}
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  // ---- pagination ----
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20); // default 20; user-adjustable
  const [sumScope, setSumScope] = useState<'page' | 'all'>(() => {
    try { const v = localStorage.getItem('containers.table.sumScope.v1') as 'page'|'all'|null; return v === 'all' ? 'all' : 'page'; } catch { return 'page'; }
  });
  const LS_Q = 'containers.table.q.v1';
  const LS_PAGE = 'containers.table.page.v1';

  // ---- filters & sorting (page header) ----
  const [filterSupplier, setFilterSupplier] = useState<string>(""); // empty = all
  const [filterPaid, setFilterPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterFrom, setFilterFrom] = useState<string>(""); // ISO date
  const [filterTo, setFilterTo] = useState<string>("");     // ISO date
  const [filterDateField, setFilterDateField] = useState<"eta" | "etd" | "delivery">("eta");
  type SortField =
    | "id"
    | "supplier"
    | "proforma_no"
    | "etd"
    | "delivery"
    | "eta"
    | "cargo_qty"
    | "cargo"
    | "container_no"
    | "roba"
    | "contain_price"
    | "agent"
    | "total"
    | "deposit"
    | "balance"
    | "paid"
    | "status";

  const [sortBy, setSortBy] = useState<SortField>("eta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ---- column visibility (persisted) ----
  const ALL_COLS = [
    'supplier','proforma_no','etd','delivery','eta','cargo_qty','cargo','container_no','roba','contain_price','agent','total','deposit','balance','status','paid','actions'
  ] as const;
  type ColKey = typeof ALL_COLS[number];
  const [visibleCols] = useState<Record<ColKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem('containers.table.visibleCols.v1');
      if (raw) return JSON.parse(raw);
    } catch {}
    return ALL_COLS.reduce((acc:any,k)=>{ acc[k]=true; return acc; },{});
  });
  function isColVisible(k: ColKey) { return !!visibleCols[k]; }
  // Column layout controls removed per request
  // Column widths (px) persisted
  const [colWidths] = useState<Record<ColKey, number>>(() => {
    try { const raw = localStorage.getItem('containers.table.colWidths.v1'); if (raw) return JSON.parse(raw); } catch {}
    return {} as any;
  });
  // Col width setter UI removed; widths still read from storage
  function getColWidth(k: ColKey, fallback: number): number {
    const v = colWidths[k] || fallback;
    // Clamp to reasonable bounds to avoid layout overflow
    return Math.max(60, Math.min(v, 240));
  }

  // Tighter default widths to reduce overflow for typical datasets
  const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
    supplier: 140,
    proforma_no: 120,
    etd: 100,
    delivery: 100,
    eta: 100,
    cargo_qty: 70,
    cargo: 90,
    container_no: 130,
    roba: 140,
    contain_price: 110,
    agent: 120,
    total: 110,
    deposit: 110,
    balance: 110,
    paid: 110,
    status: 110,
    actions: 180,
  } as const;
  // Column order (DnD) persisted
  const [colOrder] = useState<ColKey[]>(() => {
    try { const raw = localStorage.getItem('containers.table.colOrder.v1'); if (raw) return JSON.parse(raw); } catch {}
    return [...ALL_COLS];
  });
  // Column order save function removed with UI
  // Drag & drop column ordering UI removed

  const sortableColumnMap: Partial<Record<ColKey, SortField>> = {
    supplier: 'supplier',
    proforma_no: 'proforma_no',
    etd: 'etd',
    delivery: 'delivery',
    eta: 'eta',
    cargo_qty: 'cargo_qty',
    cargo: 'cargo',
    container_no: 'container_no',
    roba: 'roba',
    contain_price: 'contain_price',
    agent: 'agent',
    total: 'total',
    deposit: 'deposit',
    balance: 'balance',
    status: 'status',
    paid: 'paid',
  };

  const handleHeaderSort = (k: ColKey) => {
    const field = sortableColumnMap[k];
    if (!field) return;
    setSortBy((prevField) => {
      setSortDir((prevDir) => {
        if (prevField === field) {
          return prevDir === 'asc' ? 'desc' : 'asc';
        }
        return 'asc';
      });
      return field;
    });
  };

  // Render helpers (header/new-row/row cells)
  function renderHeaderCell(k: ColKey) {
    const labels: Record<ColKey, string> = {
      supplier:'Dobavljač', proforma_no:'Proforma', etd:'ETD', delivery:'Delivery', eta:'ETA', cargo_qty:'Qty', cargo:'Tip', container_no:'Kontejner', roba:'Roba', contain_price:'Cijena', agent:'Agent', total:'Total', deposit:'Depozit', balance:'Balans', status:'Status', paid:'Plaćanje', actions:'Akcije'
    } as any;
    const align = (k==='cargo_qty' || k==='contain_price' || k==='total' || k==='deposit' || k==='balance') ? 'al-right' : (k==='proforma_no' || k==='etd' || k==='delivery' || k==='eta' || k==='paid' || k==='status' || k==='actions') ? 'al-center' : 'al-left';
    const extraClass = k==='paid' ? ' payment-column' : k==='actions' ? ' actions-column sticky-col actions' : '';
    const sortField = sortableColumnMap[k];
    if (!sortField) {
      return <th key={`h-${k}`} className={`${align}${extraClass}`}>{labels[k]}</th>;
    }
    const isSorted = sortBy === sortField;
    const indicator = isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '⇅';
    const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    return (
      <th key={`h-${k}`} className={`${align} table-sortable${extraClass}`} aria-sort={ariaSort}>
        <button type="button" className={`table-sort-button${isSorted ? ' is-active' : ''}`} onClick={() => handleHeaderSort(k)}>
          <span>{labels[k]}</span>
          <span className="table-sort-icon" aria-hidden>{indicator}</span>
        </button>
      </th>
    );
  }
  function renderNewRowCell(k: ColKey) {
    switch (k) {
      case 'supplier':
        return (
          <td key={`n-${k}`}>
            <Input size="small" value={newRow.supplier || ""} onChange={(e) => setNewRow((s) => ({ ...s, supplier: e.target.value }))} />
          </td>
        );
      case 'proforma_no':
        return (
          <td key={`n-${k}`} className="al-center payment-cell">
            <Input size="small" value={newRow.proforma_no || ""} onChange={(e) => setNewRow((s) => ({ ...s, proforma_no: e.target.value }))} style={{ textAlign: 'center' }} />
          </td>
        );
      case 'etd':
      case 'delivery':
      case 'eta': {
        const iso = (newRow as any)[k] || '';
        return (
          <td key={`n-${k}`} className="al-center">
            <DatePicker
              size="small"
              value={iso ? dayjs(iso) : null}
              onChange={(d) => setNewRow((s) => ({ ...s, [k]: d ? d.format('YYYY-MM-DD') : '' }))}
            />
          </td>
        );
      }
      case 'cargo_qty':
        return (
          <td key={`n-${k}`} className="al-right">
            <InputNumber
              size="small"
              min={1}
              max={100000}
              value={newRow.cargo_qty ?? 1}
              onChange={(v) => {
                let n = Number(v ?? 1);
                if (!Number.isFinite(n) || n < 1) n = 1;
                if (n > 100000) n = 100000;
                setNewRow((s) => ({ ...s, cargo_qty: n }));
              }}
              style={{ width: 90 }}
            />
          </td>
        );
      case 'cargo':
        return (
          <td key={`n-${k}`}>
            <Input size="small" value={newRow.cargo || ''} onChange={(e) => setNewRow((s) => ({ ...s, cargo: e.target.value }))} />
          </td>
        );
      case 'container_no':
        return (
          <td key={`n-${k}`}>
            <Input size="small" value={newRow.container_no || ''} onChange={(e) => setNewRow((s) => ({ ...s, container_no: e.target.value }))} />
          </td>
        );
      case 'roba':
        return (
          <td key={`n-${k}`}>
            <Input size="small" value={newRow.roba || ''} onChange={(e) => setNewRow((s) => ({ ...s, roba: e.target.value }))} />
          </td>
        );
      case 'contain_price':
        return (
          <td key={`n-${k}`} className="currency-cell al-right">
            <InputNumber
              size="small"
              step={0.01}
              value={newRow.contain_price ?? 0}
              onChange={(v) => setNewRow((s) => ({ ...s, contain_price: Number(v ?? 0) }))}
              style={{ width: 120 }}
            />
          </td>
        );
      case 'agent':
        return (
          <td key={`n-${k}`}>
            <Input size="small" value={newRow.agent || ''} onChange={(e) => setNewRow((s) => ({ ...s, agent: e.target.value }))} />
          </td>
        );
      case 'total':
        return (
          <td key={`n-${k}`} className="currency-cell al-right">
            <InputNumber
              size="small"
              step={0.01}
              value={newRow.total ?? 0}
              onChange={(v) => setNewRow((s) => ({ ...s, total: Number(v ?? 0) }))}
              style={{ width: 120 }}
            />
          </td>
        );
      case 'deposit':
        return (
          <td key={`n-${k}`} className="currency-cell al-right">
            <InputNumber
              size="small"
              step={0.01}
              value={newRow.deposit ?? 0}
              onChange={(v) => setNewRow((s) => ({ ...s, deposit: Number(v ?? 0) }))}
              style={{ width: 120 }}
            />
          </td>
        );
      case 'balance':
        return (
          <td key={`n-${k}`} className="currency-cell al-right">
            <InputNumber
              size="small"
              step={0.01}
              value={newRow.balance ?? (Number(newRow.total ?? 0) - Number(newRow.deposit ?? 0))}
              onChange={(v) => setNewRow((s) => ({ ...s, balance: Number(v ?? 0) }))}
              style={{ width: 120 }}
            />
          </td>
        );
      case 'paid':
        return (
          <td key={`n-${k}`} className="payment-cell">
            <div className="payment-cell-inner">
              <span className={`payment-label ${newRow.paid ? 'payment-label--paid' : 'payment-label--unpaid'}`}>
                {newRow.paid ? 'Plaćeno' : 'Nije plaćeno'}
              </span>
              <Switch
                size="small"
                className="table-switch"
                checked={!!newRow.paid}
                onChange={(checked) => setNewRow((s) => ({ ...s, paid: !!checked }))}
              />
            </div>
          </td>
        );

      case 'status':
        return (
          <td key={`n-${k}`} className="al-center">
            <Select
              size="small"
              value={newRow.status || 'pending'}
              onChange={(v)=> setNewRow((s)=> ({ ...s, status: String(v) }))}
              style={{ width: 140 }}
              options={STATUS_OPTIONS as any}
            />
          </td>
        );
      case 'actions':
        return (
          <td key={`n-${k}`} className="actions-cell actions-column sticky-col actions" style={{ whiteSpace: 'nowrap' }}>
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" style={{ display: 'none' }} ref={newFileInputRef} onChange={(e)=> onPickNewFiles(e.target.files)} />
            <Space size={12} wrap className="table-action-group">
              <Button size="small" onClick={()=> newFileInputRef.current?.click()}>
                Dodaj fajlove
              </Button>
              <Button size="small" type="primary" onClick={saveNewRow}>
                Sačuvaj
              </Button>
              <Button size="small" onClick={cancelNewRow}>
                Otkaži
              </Button>
            </Space>
          </td>
        );
    }
  }
  function renderRowCell(k: ColKey, r: Container) {
    switch (k) {
      case 'supplier': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="supplier" align="left" truncate onSave={(v)=>patchContainer(r.id,{ supplier: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'proforma_no': return (<EditableCell key={`c-${k}-${r.id}`} row={r} field="proforma_no" align="center" onSave={(v)=> updateContainerWithFallbacks(r.id, { proforma_no: String(v||""), proforma:String(v||""), proformaNumber:String(v||""), proformaNo:String(v||""), proforma_number:String(v||""), pf_no:String(v||""), pfNumber:String(v||"") }).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />);
      case 'etd': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="etd" type="date" align="center" onSave={(v)=>patchContainer(r.id,{ etd: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'delivery': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="delivery" type="date" align="center" onSave={(v)=>patchContainer(r.id,{ delivery: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'eta': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="eta" type="date" align="center" onSave={(v)=>patchContainer(r.id,{ eta: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'cargo_qty': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="cargo_qty" type="number" align="right" onSave={(v)=>patchContainer(r.id,{ cargo_qty: Number(v||0)}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'cargo': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="cargo" align="left" truncate onSave={(v)=>patchContainer(r.id,{ cargo: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'container_no': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="container_no" align="left" truncate onSave={(v)=>patchContainer(r.id,{ container_no: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'roba': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="roba" align="left" truncate onSave={(v)=>patchContainer(r.id,{ roba: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'contain_price': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="contain_price" type="number" isCurrency align="right" onSave={(v)=>patchContainer(r.id,{ contain_price: Number(v||0)}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'agent': return <EditableCell key={`c-${k}-${r.id}`} row={r} field="agent" align="left" truncate onSave={(v)=>patchContainer(r.id,{ agent: String(v||"")}).then(()=> qc.invalidateQueries({ queryKey: ['containers'] }))} />;
      case 'status': return (
        <td key={`c-${k}-${r.id}`} className="al-center">
          <Select
            size="small"
            className="table-status-select"
            value={(r.status || 'pending') as any}
            onChange={async (v)=> {
              const next = String(v);
              setRows(prev => prev.map(x => x.id===r.id ? { ...x, status: next } : x));
              try { await updateContainerWithFallbacks(r.id, { status: next }); await qc.invalidateQueries({ queryKey: ['containers'] }); } catch (e) { /* rollback simplistic */ }
            }}
            style={{ width: 150 }}
            options={STATUS_OPTIONS as any}
          />
        </td>
      );
      case 'total': return (<EditableCell key={`c-${k}-${r.id}`} row={r} field="total" type="number" isCurrency align="right" onSave={async (v)=>{ let T = parseMoney(v); if (!Number.isFinite(T) || T < 0) { alert('Total ne može biti negativan. Postavljeno na 0.'); T = 0; } const D = parseMoney(r.deposit); const nextBalance = +(T - D).toFixed(2); setRows(prev => prev.map(x => x.id===r.id ? { ...x, total: T, balance: nextBalance } : x)); await patchContainer(r.id,{ total: T}); await qc.invalidateQueries({ queryKey: ['containers'] }); }} />);
      case 'deposit': return (<EditableCell key={`c-${k}-${r.id}`} row={r} field="deposit" type="number" isCurrency align="right" onSave={async (v)=>{ let D = parseMoney(v); if (!Number.isFinite(D) || D < 0) { alert('Depozit ne može biti negativan. Postavljeno na 0.'); D = 0; } const T = parseMoney(r.total); const nextBalance = +(T - D).toFixed(2); setRows(prev => prev.map(x => x.id===r.id ? { ...x, deposit: D, balance: nextBalance } : x)); await patchContainer(r.id,{ deposit: D}); await qc.invalidateQueries({ queryKey: ['containers'] }); }} />);
      case 'balance': return (
        <EditableCell
          key={`c-${k}-${r.id}`}
          row={r}
          field="balance"
          type="number"
          isCurrency
          align="right"
          onSave={async (v)=>{
            let B = parseMoney(v);
            if (!Number.isFinite(B) || B < 0) B = 0;
            setRows(prev => prev.map(x => x.id===r.id ? { ...x, balance: B } : x));
            await patchContainer(r.id, { balance: B });
            await qc.invalidateQueries({ queryKey: ['containers'] });
          }}
        />
      );
      case 'paid': {
        const isPaid = !!r.paid;
        return (
          <td key={`c-${k}-${r.id}`} className="payment-cell">
            <div className="payment-cell-inner">
              <span className={`payment-label ${isPaid ? 'payment-label--paid' : 'payment-label--unpaid'}`}>
                {isPaid ? 'Plaćeno' : 'Nije plaćeno'}
              </span>
              <Switch
                size="small"
                className="table-switch"
                checked={isPaid}
                loading={!!toggling[r.id]}
                onChange={() => togglePaid(r)}
              />
            </div>
          </td>
        );
      }
      case 'actions': return (
        <td key={`c-${k}-${r.id}`} className="actions-cell actions-column sticky-col actions" style={{whiteSpace: 'nowrap'}}>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" style={{ display: 'none' }} ref={(el) => { fileInputsRef.current[r.id] = el; }} onChange={(e) => uploadFiles(r.id, e.target.files)} />
          <Space size={12} wrap className="table-action-group">
            <Button
              size="small"
              className="table-action-btn"
              icon={<FolderOpenOutlined />}
              onClick={() => listFiles(r.id)}
            >
              Fajlovi
            </Button>
            <Button
              size="small"
              className="table-action-btn table-action-btn--upload"
              icon={<UploadOutlined />}
              onClick={() => fileInputsRef.current[r.id]?.click()}
            >
              Upload
            </Button>
            <Button
              size="small"
              className="table-action-btn table-action-btn--danger"
              icon={<DeleteOutlined />}
              onClick={() => onDelete(r.id)}
            >
              Obriši
            </Button>
         </Space>
       </td>
      );
    }
  }
  // Saved views
  // Saved views removed per request

  // --- pick up global search (?q=...) from URL and apply to table search ---
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    // Read ?q whenever URL changes (e.g., Header navigate or manual edit)
    const sp = new URLSearchParams(location.search || "");
    const q = sp.get("q");
    if (q !== null) {
      setSearchText(q);
    } else {
      try { const saved = localStorage.getItem(LS_Q) || ''; setSearchText(saved); } catch {}
      try { const p = Number(localStorage.getItem(LS_PAGE) || ''); if (!Number.isNaN(p) && p >= 1) setPage(p); } catch {}
    }
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
      try { localStorage.setItem(LS_Q, next); } catch {}
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
  const qc = useQueryClient();

  // We need filters first, then reconfigure query using a derived key
  // (placing this block after filter states)

  // refresh helper removed (unused)
  // pageSize preference
  useEffect(() => {
    try {
      const ps = Number(localStorage.getItem('containers.table.pageSize.v1') || '');
      if (!Number.isNaN(ps) && ps > 0) setPageSize(ps);
    } catch {}
  }, []);

  // -------- search & visible rows --------
  const debouncedSearch = useDebouncedValue(searchText, 300);
  // Server-side fetch with current filters
  const serverStatus = filterPaid === 'all' ? '' : (filterPaid as 'paid' | 'unpaid');
  const serverSortBy = ((): 'created_at' | 'eta' | 'etd' | 'supplier' | 'status' | 'total' | 'balance' | 'id' => {
    switch (sortBy) {
      case 'id': return 'id';
      case 'supplier': return 'supplier';
      case 'eta': return 'eta';
      case 'etd': return 'etd';
      case 'total': return 'total';
      case 'balance': return 'balance';
      case 'paid': return 'status';
      case 'status': return 'status';
      default: return 'created_at';
    }
  })();
  const { data: serverData, isLoading: isServerLoading } = useQuery({
    queryKey: ['containers', { q: debouncedSearch, status: serverStatus, statusText: filterStatus, dateField: filterDateField, from: filterFrom, to: filterTo, sortBy: serverSortBy, sortDir }],
    queryFn: async () => {
      return await api.fetchContainers({ q: debouncedSearch, status: serverStatus as any, statusText: filterStatus || undefined, dateField: filterDateField, from: filterFrom, to: filterTo, sortBy: serverSortBy, sortDir });
    },
    refetchOnWindowFocus: false,
    staleTime: 180_000,
  });
  React.useEffect(() => { if (Array.isArray(serverData)) setRows(serverData as any); }, [serverData]);
  React.useEffect(() => { setLoading(!!isServerLoading); }, [isServerLoading]);
  const filteredRows = React.useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

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

    // 5) status filter
    if (filterStatus) {
      list = list.filter(r => String((r as any).status || '') === filterStatus);
    }

    // 6) sorting
    const toNum = (x: any) => Number(x ?? 0);
    const toStr = (x: any) => String(x ?? "").toLowerCase();
    const cmp = (a: Container, b: Container) => {
      let aa: any, bb: any;
      switch (sortBy) {
        case "id": aa = toNum(a.id); bb = toNum(b.id); break;
        case "supplier": aa = toStr(a.supplier); bb = toStr(b.supplier); break;
        case "proforma_no": aa = toStr(a.proforma_no); bb = toStr(b.proforma_no); break;
        case "eta": aa = String(a.eta || ""); bb = String(b.eta || ""); break;
        case "etd": aa = String(a.etd || ""); bb = String(b.etd || ""); break;
        case "delivery": aa = String(a.delivery || ""); bb = String(b.delivery || ""); break;
        case "cargo_qty": aa = toNum(a.cargo_qty); bb = toNum(b.cargo_qty); break;
        case "cargo": aa = toStr(a.cargo); bb = toStr(b.cargo); break;
        case "container_no": aa = toStr(a.container_no); bb = toStr(b.container_no); break;
        case "roba": aa = toStr(a.roba); bb = toStr(b.roba); break;
        case "contain_price": aa = parseMoney(a.contain_price); bb = parseMoney(b.contain_price); break;
        case "agent": aa = toStr(a.agent); bb = toStr(b.agent); break;
        case "total": aa = parseMoney(a.total); bb = parseMoney(b.total); break;
        case "deposit": aa = parseMoney(a.deposit); bb = parseMoney(b.deposit); break;
        case "balance": aa = parseMoney(a.balance); bb = parseMoney(b.balance); break;
        case "paid": aa = a.paid ? 1 : 0; bb = b.paid ? 1 : 0; break;
        case "status": aa = toStr((a as any).status); bb = toStr((b as any).status); break;
        default: aa = 0; bb = 0;
      }
      if (aa < bb) return sortDir === "asc" ? -1 : 1;
      if (aa > bb) return sortDir === "asc" ? 1 : -1;
      return 0;
    };
    list = [...list].sort(cmp);

    return list;
  }, [rows, debouncedSearch, filterSupplier, filterPaid, filterFrom, filterTo, filterDateField, sortBy, sortDir]);

  // Compute paging
  const totalPages = Math.max(1, Math.ceil(Math.max(filteredRows.length, 1) / pageSize));
  useEffect(() => {
    // Keep current page within bounds when filters change
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [totalPages]);
  const firstIdx = (page - 1) * pageSize;
  const lastIdx = firstIdx + pageSize;
  const pagedRows = React.useMemo(() => filteredRows.slice(firstIdx, lastIdx), [filteredRows, firstIdx, lastIdx]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const updateShadows = () => {
      const { scrollLeft, scrollWidth, clientWidth } = node;
      node.classList.toggle('has-left', scrollLeft > 1);
      node.classList.toggle('has-right', scrollLeft + clientWidth < scrollWidth - 1);
    };
    updateShadows();
    node.addEventListener('scroll', updateShadows, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateShadows) : null;
    if (ro) ro.observe(node);
    return () => {
      node.removeEventListener('scroll', updateShadows);
      ro?.disconnect();
    };
  }, [pagedRows.length, colOrder, visibleCols, page, pageSize]);
  useEffect(()=>{ try { localStorage.setItem(LS_PAGE, String(page)); } catch {} }, [page]);
  useEffect(()=>{ try { localStorage.setItem('containers.table.sumScope.v1', sumScope); } catch {} }, [sumScope]);

  // Footer sums – for the current page only
  // Page sums
  const totalSumPage = React.useMemo(() => sumBy(pagedRows, "total"), [pagedRows]);
  const depositSumPage = React.useMemo(() => sumBy(pagedRows, "deposit"), [pagedRows]);
  const balanceSumPage = React.useMemo(() => sumBy(pagedRows, "balance"), [pagedRows]);
  // All filtered sums
  const totalSumAll = React.useMemo(() => sumBy(filteredRows, "total"), [filteredRows]);
  const depositSumAll = React.useMemo(() => sumBy(filteredRows, "deposit"), [filteredRows]);
  const balanceSumAll = React.useMemo(() => sumBy(filteredRows, "balance"), [filteredRows]);
  // Optional: exclude balances of paid rows for NET (keep for future use)
  // const paidBalanceSumPage = React.useMemo(() => sumBy(pagedRows.filter(r => !!r.paid), "balance"), [pagedRows]);
  // Removed unused computed net total
  // Currently display GROSS totals based on selected scope
  const totalSum = sumScope === 'page' ? totalSumPage : totalSumAll;
  const depositSum = sumScope === 'page' ? depositSumPage : depositSumAll;
  const balanceSum = sumScope === 'page' ? balanceSumPage : balanceSumAll;

  /* -------- files -------- */
  async function listFiles(containerId: number) {
    setFilesModalId(containerId);
    setFilesLoading(true);
    setFilesList([]);
    setPreviewUrl(null);
    setPreviewName(null);
    try {
      const headersJson = { Accept: "application/json", ...authHeaders(true) } as Record<string,string>;
      const headersForm = { ...headersJson, "Content-Type": "application/json" } as Record<string,string>;
      // Try a series of common patterns to list files
      const tries: Array<() => Promise<Response>> = [
        // GET base
        () => fetch(`${API_BASE}/api/containers/${containerId}/files`, { method: 'GET', headers: headersJson }),
        // GET with trailing slash
        () => fetch(`${API_BASE}/api/containers/${containerId}/files/`, { method: 'GET', headers: headersJson }),
        // GET with explicit list=1
        () => fetch(`${API_BASE}/api/containers/${containerId}/files?list=1`, { method: 'GET', headers: headersJson }),
        // POST list endpoint (JSON)
        () => fetch(`${API_BASE}/api/containers/${containerId}/files/list`, { method: 'POST', headers: headersForm, body: JSON.stringify({}) }),
        // POST on base to request list (JSON)
        () => fetch(`${API_BASE}/api/containers/${containerId}/files`, { method: 'POST', headers: headersForm, body: JSON.stringify({ action: 'list' }) }),
      ];
      let res: Response | null = null;
      for (const fn of tries) {
        try {
          res = await fn();
          if (res.ok) break;
        } catch {}
      }
      if (!res || !res.ok) throw new Error(`List files failed: ${res ? res.status : 'no-response'}`);
      const data = await res.json().catch(()=>({ files: [] }));
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
        headers: { ...authHeaders(true) }, // NE stavljati Content-Type uz FormData
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
        { method: "DELETE", headers: { ...authHeaders(true) } }
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
        await qc.invalidateQueries({ queryKey: ['containers'] });
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
            await qc.invalidateQueries({ queryKey: ['containers'] });
          } else {
            // If server says route/method not allowed, try parsing in-browser
            if (res.status === 405 || res.status === 404) {
              await importFromXLSX(file);
              alert("Excel import završen (obrada u pregledaču).");
              await qc.invalidateQueries({ queryKey: ['containers'] });
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
            await qc.invalidateQueries({ queryKey: ['containers'] });
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

    // Create from bottom to top so the first row in the file
    // (usually highest "redni broj") is created last and gets highest ID
    for (let li = linesRaw.length - 1; li > headerRow; li--) {
      const cols = parseCSVLine(linesRaw[li]);
      if (cols.length === 0) continue;

      const pick = (i: number) => (i >= 0 && i < cols.length ? cols[i] : "");
      const toNum = (v: any, fallback = 0) => {
        if (v === null || v === undefined || v === "") return fallback;
        if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
        // Remove currency symbols and any non-numeric except separators
        const s0 = String(v).trim().replace(/[^0-9,.-\s]/g, "");
        // If both separators exist, assume EU style ('.' thousands, ',' decimal)
        if (s0.includes(".") && s0.includes(",")) {
          const s = s0.replace(/\./g, "").replace(/,/g, ".");
          const n = Number(s);
          return Number.isFinite(n) ? n : fallback;
        }
        // If only comma exists, treat comma as decimal separator
        if (s0.includes(",") && !s0.includes(".")) {
          const s = s0.replace(/\s/g, "").replace(/,/g, ".");
          const n = Number(s);
          return Number.isFinite(n) ? n : fallback;
        }
        // Default: plain Number after removing thin spaces
        const n = Number(s0.replace(/\s/g, ""));
        return Number.isFinite(n) ? n : fallback;
      };
      const truthy = (v: any) => isTruthy(v);

      const interpretQty = (raw: any) => {
        const txt = String(raw ?? "").trim();
        if (!txt) return { qty: 0, cargoType: "" };
        const match = txt.match(/(\d+[\d.,]*)\s*[xX]\s*([0-9A-Za-z\- ]+)/);
        if (match) {
          const qty = toNum(match[1], 0);
          const cargoType = match[2].trim();
          return { qty, cargoType };
        }
        return { qty: toNum(raw, 0), cargoType: "" };
      };

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
      const rawQtyCell = pick(idx.qty);
      const interpretedQty = interpretQty(rawQtyCell);
      let qtyParsed = interpretedQty.qty;
      let cargoTypeFromQty = interpretedQty.cargoType;
      // Fallback: detect container number anywhere in the row if column missing
      let container_no_detected = container_no;
      if (!container_no_detected) {
        const joined = cols.join(" ");
        const mC = joined.match(/\b([A-Z]{4}\d{7})\b/i);
        if (mC) container_no_detected = mC[1].toUpperCase();
      }

      // Handle Cijena (EUR): blank -> '0,00', otherwise keep original text
      const rawCijena = pick(idx.contain_price);
      const containPriceValue = toNum(rawCijena, 0);

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
        contain_price: containPriceValue || null,
        container_price: containPriceValue || null,
        price: containPriceValue || null, // extra alias
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

      payload.status = payload.paid ? 'paid' : 'unpaid';
      payload.cargo_qty = qtyParsed || null;
      if (cargoTypeFromQty && !payload.type) payload.type = cargoTypeFromQty;
      if (!payload.type && rawQtyCell) payload.type = String(rawQtyCell).trim();

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
    try {
      const resp = await api.deleteContainer(id as any);
      if (!resp?.ok) {
        const msg = (resp as any)?.error || 'Brisanje nije dozvoljeno (potrebne admin ovlasti).';
        alert(msg);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['containers'] });
    } catch (e: any) {
      console.error('Delete failed', e);
      alert('Brisanje nije uspjelo. Provjerite da li imate ovlasti (admin).');
    }
  }
  async function bulkDeleteSelected() {
    if (!token) return alert("Niste prijavljeni.");
    if (selectedIds.size === 0) return;
    const ok = confirm("Da li ste sigurni da želite obrisati izabrane redove?");
    if (!ok) return;
    try {
      // delete in parallel but not too aggressively
      const ids = Array.from(selectedIds);
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const r = await api.deleteContainer(id as any);
          if (!r?.ok) throw new Error((r as any)?.error || 'forbidden');
          return { id, ok: true };
        } catch (e) {
          console.error('Delete failed for', id, e);
          return { id, ok: false };
        }
      }));
      const failed = results.filter(r => !r.ok).map(r => r.id);
      // remove only successfully deleted from UI and then refresh
      const okIds = new Set(results.filter(r => r.ok).map(r => r.id));
      setRows(prev => prev.filter(r => okIds.has(r.id) ? false : true));
      clearSelection();
      await qc.invalidateQueries({ queryKey: ['containers'] });
      if (failed.length) {
        alert(`Neki zapisi nisu obrisani (npr. bez ovlasti): ${failed.join(', ')}`);
      }
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
      // Use dedicated endpoint to toggle paid, backend also updates status/balance
      await api.setContainerPaid(row.id as any, nextPaid);
      await qc.invalidateQueries({ queryKey: ['containers'] });
      // Sync from server to reflect any recomputed fields
      const fresh = await api.getContainer(row.id as any);
      if ((fresh as any)?.ok && (fresh as any).data) {
        qc.setQueryData(['containers', Number(row.id)], (old: any) => ({ ...(old || {}), ...(fresh as any).data }));
      }
      if ((fresh as any)?.ok && (fresh as any).data) {
        const d = (fresh as any).data as any;
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...d, paid: !!(d.paid ?? d.placeno) } : r)));
      }
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
      await qc.invalidateQueries({ queryKey: ['containers'] });
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
      "Cijena (USD)","Agent","Total (USD)","Depozit (USD)","Balans (USD)","Plaćeno",
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

  return (
    <div className="content-area flex-1 transition-all duration-300">
      <Card
        className="page-head fullbleed"
        title={<span>Informacije o Kontejnerima</span>}
        extra={
          <Space wrap>
            <Button type="primary" onClick={() => setShowNewRow((v) => !v)}>
              {showNewRow ? "Zatvori unos" : "Novi unos"}
            </Button>
            <Button danger disabled={selectedIds.size === 0} onClick={bulkDeleteSelected} title="Obriši selektovane redove">
              Obriši selektovane
            </Button>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              ref={importInputRef}
              style={{ display: "none" }}
              onChange={(e) => onImportFiles(e.target.files)}
            />
            <Button onClick={onClickImport}>Import</Button>
            <Button onClick={exportExcelCSV}>Export Excel</Button>
            <Button onClick={exportPDF}>Export PDF</Button>
            <Button onClick={() => setFiltersOpen((v) => !v)} type="default">
              {filtersOpen ? "Sakrij filtere" : "Prikaži filtere"}
            </Button>
          </Space>
        }
        styles={{ body: { paddingTop: 8 } }}
      >
        {filtersOpen && (
          <Space direction="vertical" style={{ width: "100%" }} size="middle">
            <Space wrap align="center">
              <span aria-hidden title="Dobavljač">📦</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Dobavljač</span>
              <Select
                style={{ minWidth: 160 }}
                value={filterSupplier || undefined}
                allowClear
                placeholder="Svi"
                options={[{ label: "Svi", value: "" }].concat(supplierOptions.map(s => ({ label: s, value: s })))}
                onChange={(v) => setFilterSupplier(v || "")}
              />

              <span aria-hidden title="Plaćanje">💳</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Plaćanje</span>
              <Select
                style={{ width: 140 }}
                value={filterPaid}
                onChange={(v) => setFilterPaid(v as any)}
                options={[
                  { label: "Svi", value: "all" },
                  { label: "Plaćeni", value: "paid" },
                  { label: "Neplaćeni", value: "unpaid" },
                ]}
              />

              <span aria-hidden title="Status">🏷️</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Status</span>
              <Select
                style={{ width: 160 }}
                value={filterStatus || undefined}
                onChange={(v) => setFilterStatus(v || "")}
                allowClear
                placeholder="Svi"
                options={[{ label: "Svi", value: "" }].concat(Array.from(new Set(rows.map(r => String((r as any).status || '')).filter(Boolean))).sort().map(s => ({ label: s, value: s })))}
              />

              <span aria-hidden title="Datum">📅</span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Datum</span>
              <Select
                style={{ width: 140 }}
                value={filterDateField}
                onChange={(v) => setFilterDateField(v as any)}
                options={[
                  { label: "ETA", value: "eta" },
                  { label: "ETD", value: "etd" },
                  { label: "Delivery", value: "delivery" },
                ]}
              />
              <DatePicker
                value={filterFrom ? dayjs(filterFrom) : null}
                onChange={(d: Dayjs | null) => setFilterFrom(d ? d.format("YYYY-MM-DD") : "")}
              />
              <span style={{ opacity: 0.7 }}>–</span>
              <DatePicker
                value={filterTo ? dayjs(filterTo) : null}
                onChange={(d: Dayjs | null) => setFilterTo(d ? d.format("YYYY-MM-DD") : "")}
              />

              <Button
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
              >
                Reset
              </Button>
            </Space>

            <Space style={{ width: "100%" }}>
              <Input.Search
                allowClear
                style={{ maxWidth: 460, flex: 1 }}
                placeholder="dobavljač, proforma, kontejner, agent, …"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onSearch={(v) => setSearchText(v)}
              />
            </Space>
          </Space>
        )}
      </Card>

      <Card className="table-wrap fullbleed" styles={{ body: { overflowX: "auto", paddingTop: 12 } }}>
        {loading ? (
          <p style={{ padding: 12 }}>Učitavanje…</p>
        ) : (
          <>
          {/* Pagination controls (top, AntD) */}
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }} align="center">
            <Space align="center">
              <span style={{ fontSize: 12, color: '#4b5563' }}>Redova po strani:</span>
              <Select
                value={pageSize}
                style={{ width: 100 }}
                options={[{value:10,label:'10'},{value:20,label:'20'},{value:50,label:'50'}]}
                onChange={(n)=>{ setPageSize(n); setPage(1); try { localStorage.setItem('containers.table.pageSize.v1', String(n)); } catch {} }}
              />
            </Space>
            <Space align="center">
              <Pagination simple current={page} pageSize={pageSize} total={filteredRows.length} onChange={(p)=> setPage(p)} />
              <Space align="center">
                <span style={{ fontSize: 12, color: '#4b5563' }}>Sume:</span>
                <Select value={sumScope} style={{ width: 120 }} options={[{value:'page',label:'Stranica'},{value:'all',label:'Sve'}]} onChange={(v)=> setSumScope(v as any)} />
              </Space>
            </Space>
          </Space>

          {/* Secondary toolbar removed per request (exports, saved views, Kolone panel) */}

          <div className="table-scroll scroll-shadow-left scroll-shadow-right" ref={scrollRef}>
          <table
            className="table responsive"
            style={{ tableLayout: "fixed", width: "100%" }}
          >
            <colgroup>
              {/* Selection */}
              <col style={{ width: "60px" }} />
              {/* # */}
              <col style={{ width: "80px" }} />
              {colOrder.filter(isColVisible).map((k) => {
                const w = getColWidth(k as any, DEFAULT_COL_WIDTHS[k]);
                return (<col key={`c-${k}`} style={{ width: `${w}px` }} />);
              })}
            </colgroup>
            <thead>
              <tr>
                <th className="al-center sticky-col selector">
                  <input
                    type="checkbox"
                    aria-label="Selektuj sve vidljive"
                    checked={pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(r.id))}
                    onChange={(e) => {
                      const checked = e.currentTarget.checked;
                      setSelectedIds(prev => {
                        if (!checked) {
                          // Unselect only currently visible rows
                          const next = new Set(prev);
                          pagedRows.forEach(r => next.delete(r.id));
                          return next;
                        }
                        const next = new Set(prev);
                        pagedRows.forEach(r => next.add(r.id));
                        return next;
                      });
                    }}
                    ref={(el) => {
                      if (!el) return;
                      const someSelected = pagedRows.some(r => selectedIds.has(r.id));
                      const allSelected = pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(r.id));
                      el.indeterminate = someSelected && !allSelected;
                    }}
                  />
                </th>
                <th className="al-center sticky-col ordinal">#</th>
                {colOrder.filter(isColVisible).map(renderHeaderCell)}
              </tr>
            </thead>
            <tbody>
              {showNewRow && (
                <tr className="new-row compact">
                  <td className="sticky-col selector"></td>
                  <td className="sticky-col ordinal">—</td>
                  {colOrder.filter(isColVisible).map(renderNewRowCell)}
                </tr>
              )}

              {showNewRow && newFiles.length > 0 && (
                <tr>
                  <td colSpan={colOrder.filter(isColVisible).length + 2}>
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

              {pagedRows.map((r, idx) => {
                const ordinal = (page - 1) * pageSize + idx;
                return (
                  <tr key={r.id}>
                    <td className="al-center sticky-col selector">
                      <input
                        type="checkbox"
                        aria-label={`Selektuj red ${r.id}`}
                        checked={isSelected(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="al-center sticky-col ordinal">{ordinal}</td>
                    {colOrder.filter(isColVisible).map(k => renderRowCell(k, r))}
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <td className="sticky-col selector" />
                <td className="sticky-col ordinal" />
                {colOrder.filter(isColVisible).map((k) => {
                  const align = (k==='cargo_qty' || k==='contain_price' || k==='total' || k==='deposit' || k==='balance')
                    ? 'right'
                    : (k==='proforma_no' || k==='etd' || k==='delivery' || k==='eta' || k==='paid' || k==='status')
                      ? 'center'
                      : 'left';
                  const classes = [
                    alignToClass(align as any),
                    (k === 'actions') ? 'sticky-col actions actions-column' : '',
                    (k === 'paid') ? 'payment-cell' : '',
                    (k === 'contain_price' || k === 'total' || k === 'deposit' || k === 'balance') ? 'currency-cell' : '',
                  ].filter(Boolean).join(' ');
                  let content: React.ReactNode = '—';
                  if (k === 'total') content = fmtCurrency(totalSum);
                  else if (k === 'deposit') content = fmtCurrency(depositSum);
                  else if (k === 'balance') content = fmtCurrency(balanceSum);
                  else if (k === 'actions') content = null;
                  else if (k === 'contain_price') content = '—';
                  return (
                    <td key={`foot-${k}`} className={classes} style={k === 'total' || k === 'deposit' || k === 'balance' ? { fontWeight: 700 } : undefined}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
          </div>
          <div className="scroll-hint">Povuci za još kolona →</div>

          {/* Pagination controls (bottom, AntD) */}
          <Space style={{ width: '100%', justifyContent: 'space-between', marginTop: 8 }} align="center">
            <Space align="center">
              <span style={{ fontSize: 12, color: '#4b5563' }}>Redova po strani:</span>
              <Select
                value={pageSize}
                style={{ width: 100 }}
                options={[{value:10,label:'10'},{value:20,label:'20'},{value:50,label:'50'}]}
                onChange={(n)=>{ setPageSize(n); setPage(1); try { localStorage.setItem('containers.table.pageSize.v1', String(n)); } catch {} }}
              />
            </Space>
            <Pagination simple current={page} pageSize={pageSize} total={filteredRows.length} onChange={(p)=> setPage(p)} />
          </Space>
          </>
        )}
      </Card>

      <Modal
        open={filesModalId !== null}
        onCancel={() => { setFilesModalId(null); setPreviewUrl(null); setPreviewName(null); }}
        title={filesModalId !== null ? `Fajlovi za kontejner #${filesModalId}` : 'Fajlovi'}
        footer={null}
        width={720}
      >
        {filesLoading ? (
          <p>Učitavanje…</p>
        ) : filesList.length === 0 ? (
          <p>Nema fajlova.</p>
        ) : (
          <>
            <ul className="files" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filesList.map((f: FileMeta) => (
                <li key={f.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
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
                    <Button size="small" danger onClick={() => deleteFile(filesModalId as number, f.id)}>
                      Obriši
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {previewUrl && (
              <div style={{ marginTop: 12, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>Pregled: {previewName}</strong>
                  <Button size="small" onClick={() => { setPreviewUrl(null); setPreviewName(null); }}>Zatvori pregled</Button>
                </div>
                <iframe
                  src={previewUrl}
                  style={{ width: '100%', height: '400px', border: '1px solid #ccc', borderRadius: 8 }}
                  title={`Preview of ${previewName}`}
                />
              </div>
            )}
          </>
        )}
      </Modal>

    
    </div>
  );
}
