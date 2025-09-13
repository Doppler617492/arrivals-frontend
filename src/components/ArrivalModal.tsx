import React, { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileIcon, UploadIcon, TrashIcon, X as CloseIcon, Eye, Download } from "lucide-react";
import type { Arrival } from "./ArrivalCard";

const statusAccent: Record<string, string> = {
  not_shipped: "bg-gray-400",
  shipped: "bg-blue-500",
  arrived: "bg-green-500",
};

type Props = {
  open: boolean;
  onClose: () => void;
  arrival: Arrival | null;
  onSaved?: (updated: Arrival) => void;
};

const API_BASE =
  (import.meta as any)?.env?.DEV
    ? ""
    : ((import.meta as any)?.env?.VITE_API_BASE?.replace(/\/$/, "") || "");
const authHeaders = (): Record<string, string> => {
  // Try to get "token", then fallback to "access_token"
  const token = localStorage.getItem("token") || localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ENABLE_LOCATION_FETCH: boolean = Boolean((import.meta as any)?.env?.VITE_ENABLE_LOCATION_FETCH === "1");

const DEFAULT_RESPONSIBLES = ["Ludvig", "Gazi", "Gezim", "Armir", "Rrezart", "Beki"];
const responsibleOptions: string[] = (() => {
  const win = (window as any).responsibleOptions;
  const base = Array.isArray(win) && win.length ? win : DEFAULT_RESPONSIBLES;
  const seen = new Set<string>();
  return base
    .map((s: any) => String(s ?? "").trim())
    .filter(Boolean)
    .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
})();

// Default fallback list of locations (shops & warehouse)
const DEFAULT_LOCATION_OPTIONS: string[] = [
  "Veleprodajni Magacin",   // ispravka naziva
  "Pg Centar",
  "Pg",
  "Bar",
  "Bar Centar",
  "Budva",
  "Kotor Centar",
  "Herceg Novi",
  "Herceg Novi Centar",
  "Niksic",
  "Bijelo polje",
  "Ulcinj Centar",
  "Carinsko Skladiste",
  "Horeca",
];

// Preferred casing / spelling for locations (handles common typos & variants)
const LOCATION_SYNONYMS: Record<string, string> = {
  "veleprodajni magaci": "Veleprodajni Magacin", // previous typo variant
  "veleprodajni magacin": "Veleprodajni Magacin",
  "veleprodajni-magacin": "Veleprodajni Magacin",
  "veleprodajni": "Veleprodajni Magacin",
  "carinsko skladiste": "Carinsko Skladiste",
  "carinsko skladište": "Carinsko Skladiste",
  "carisnko skladiste": "Carinsko Skladiste",
  "pg": "Pg",
  "pg centar": "Pg Centar",
  "bar": "Bar",
  "bar centar": "Bar Centar",
  "budva": "Budva",
  "kotor centar": "Kotor Centar",
  "herceg novi": "Herceg Novi",
  "herceg novi centar": "Herceg Novi Centar",
  "niksic": "Niksic",
  "bijelo polje": "Bijelo polje",
  "ulcinj centar": "Ulcinj Centar",
  "horeca": "Horeca",
};

function preferredCaseLocation(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase();
  return LOCATION_SYNONYMS[key] || raw;
}

// Normalize -> preferred casing -> trim -> uniq -> ensure obavezne lokacije postoje
function uniqPreferred(list: string[]): string[] {
  const seen = new Set<string>();
  const norm = (Array.isArray(list) ? list : [])
    .map((s) => preferredCaseLocation(String(s || "").trim()))
    .filter((s) => s.length > 0)
    .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));

  // Obavezne lokacije – osiguraj da postoje tačno jednom
  const mustHave = ["Veleprodajni Magacin", "Carinsko Skladiste", "Horeca"];
  for (const req of mustHave) {
    if (!norm.includes(req)) norm.push(req);
  }
  return norm;
}

// Helper to normalize and persist location options
function setLocOptionsUniq(next: string[]) {
  const normalized = uniqPreferred((next || []).map((s) => String(s || "").trim()));
  setLocOptions(normalized);
  try { localStorage.setItem("locationOptions", JSON.stringify(normalized)); } catch {}
}

// Try to pull a unified list of locations from several globals used around the app (filters, boot data, etc.)
function collectGlobalLocations(): string[] {
  try {
    const w = window as any;

    // Try a lot of common globals we/you may have used around the app
    const rawCandidates: any[] = [
      w.locationOptions,
      w.arrivalsLocationOptions,
      w.appLocations,
      w.ALL_LOCATIONS,
      w.LOCATIONS,
      w.locations,
      w.storeOptions,
      w.stores,
      w.shops,
      w.ALL_SHOPS,
      w.filters?.locations,
      w.filterOptions?.locations,
      // Some apps stash boot payloads here:
      w.__BOOT__?.locations,
      w.__APP__?.locations,
      // Additional candidates:
      w.allLocations,
      w.filterLocations,
      w.SVE_LOKACIJE,
      w.__ARRIVALS__?.locations,
      w.__ARRIVALS_FILTERS__?.locationOptions,
      w.__BOOT__?.filters?.locations,
      w.__APP__?.filters?.locations,
      JSON.parse(localStorage.getItem("arrivalsLocations") || "null"),
      JSON.parse(localStorage.getItem("filters.locations") || "null"),
    ].filter(Boolean);

    // Also accept an object map like { "Bar": "Bar", "Delta": "Delta" }
    const out: string[] = [];
    for (const c of rawCandidates) {
      if (!c) continue;
      if (Array.isArray(c)) {
        for (const it of c) {
          if (typeof it === "string") out.push(it);
          else if (it && typeof it === "object") {
            // Common shapes: { value, label } or { id, name }
            const v =
              it.value ?? it.label ??
              it.name ?? it.title ?? it.slug ?? "";
            if (v != null) out.push(String(v));
          }
        }
      } else if (typeof c === "object") {
        // Map-like object
        for (const [k, v] of Object.entries(c)) {
          if (typeof v === "string") { out.push(v); continue; }
          if (v && typeof v === "object") {
            const vv = (v as any).value ?? (v as any).label ?? (v as any).name ?? (v as any).title;
            if (vv != null) { out.push(String(vv)); continue; }
          }
          out.push(String(k));
        }
      }
    }

    // normalize/uniq – keep insertion order
    const seen = new Set<string>();
    const norm = out
      .map((s) => String(s || "").trim())
      .filter((s) => s.length > 0)
      .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));

    if (norm.length === 0) {
      try { console.debug("[ArrivalModal] locations: no globals found"); } catch {}
    } else {
      try { console.debug("[ArrivalModal] locations from globals:", norm); } catch {}
    }
    return norm;
  } catch (e) {
    try { console.debug("[ArrivalModal] locations: error while collecting", e); } catch {}
    return [];
  }
}

export default function ArrivalModal({ open, onClose, arrival, onSaved }: Props) {
  React.useEffect(() => {
    // Allow other parts of the app (e.g., Arrivals page) to push locations here.
    (window as any).setArrivalLocations = (input: any) => {
      try {
        const listLike = Array.isArray(input) ? input : (input?.locations ?? input?.options ?? []);
        const arr: string[] = (Array.isArray(listLike) ? listLike : []).map((it: any) => {
          if (typeof it === "string") return it;
          if (it && typeof it === "object") return String(it.value ?? it.label ?? it.name ?? it.title ?? "");
          return "";
        }).filter(Boolean).map((s: string) => s.trim());
        const seen = new Set<string>();
        const uniq = arr.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
        try { localStorage.setItem("locationOptions", JSON.stringify(uniq)); } catch {}
        try { window.dispatchEvent(new CustomEvent("locations-set", { detail: { locations: uniq } })); } catch {}
      } catch {}
    };
    return () => { try { delete (window as any).setArrivalLocations; } catch {} };
  }, []);
  const newDefaults: Arrival = {
    // Type-only casting because some fields may be optional in Arrival
    id: 0 as any,
    supplier: "",
    carrier: "",
    driver: "",
    plate: "",
    pickup_date: "",
    eta: "",
    arrived_at: "",
    transport_type: "truck" as any,
    status: "not_shipped" as any,
    goods_cost: 0,
    freight_cost: 0,
    responsible: "" as any,
    location: "",
    note: "",
    files: [],
  };
  const isNew = !arrival;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesSectionRef = useRef<HTMLDivElement>(null);
  const uploadBtnRef = useRef<HTMLButtonElement>(null);

  const [locOptions, setLocOptions] = useState<string[]>(() => {
    // 1) take from various globals (Arrivals filter etc.) if present
    const fromGlobals = collectGlobalLocations();
    try {
      const w = window as any;
      const quick: any[] = [w.allLocations, w.filterLocations, w.__ARRIVALS__?.locations, w.__ARRIVALS_FILTERS__?.locationOptions].filter(Boolean);
      if (quick.length) {
        const add: string[] = [];
        for (const q of quick) {
          if (Array.isArray(q)) add.push(...q.map((x:any)=> String((x?.value ?? x?.label ?? x?.name ?? x) ?? "").trim()));
        }
        const seen = new Set<string>();
        const merged = [...fromGlobals, ...add]
          .map((s) => String(s || "").trim())
          .filter((s) => s.length > 0)
          .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
        if (merged.length) {
          try { console.debug("[ArrivalModal] quick-merged globals for locations", merged); } catch {}
          return uniqPreferred(merged);
        }
      }
    } catch {}
    if (fromGlobals.length) {
      try { console.debug("[ArrivalModal] using locations from globals"); } catch {}
      return uniqPreferred(fromGlobals);
    }

    // 2) then try explicit window.locationOptions
    try {
      const winLoc = (window as any).locationOptions;
      if (Array.isArray(winLoc) && winLoc.length) {
        try { console.debug("[ArrivalModal] using locations from window.locationOptions"); } catch {}
        return uniqPreferred(winLoc as string[]);
      }
    } catch {}

    // 3) then localStorage cache
    try {
      const cached = localStorage.getItem("locationOptions");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          try { console.debug("[ArrivalModal] using locations from localStorage"); } catch {}
          return uniqPreferred(parsed as string[]);
        }
      }
    } catch {}

    // 4) otherwise use our fixed defaults so the dropdown is always populated
    try {
      if (!localStorage.getItem("locationOptions")) {
        localStorage.setItem("locationOptions", JSON.stringify(DEFAULT_LOCATION_OPTIONS));
      }
    } catch {}
    try { console.debug("[ArrivalModal] using DEFAULT_LOCATION_OPTIONS", DEFAULT_LOCATION_OPTIONS); } catch {}
    return uniqPreferred([...DEFAULT_LOCATION_OPTIONS]);
  });

  // Optional: log location options count at mount and whenever locOptions changes
  React.useEffect(() => {
    try { console.debug("[ArrivalModal] locOptions count:", (locOptions || []).length); } catch {}
  }, [locOptions]);

  // Expose current location options to window for debugging/interop
  React.useEffect(() => {
    try { (window as any).locationOptions = [...locOptions]; } catch {}
  }, [locOptions]);

  // Controlled form state
  const [form, setForm] = useState<Arrival>(() => (
    arrival
      ? ({
          ...arrival,
          // normalize possible backend aliases into form.location
          location: (arrival as any)?.location ?? (arrival as any)?.store ?? (arrival as any)?.shop ?? "",
        } as any)
      : newDefaults
  ));
  React.useEffect(() => {
    setForm(
      arrival
        ? ({
            ...arrival,
            location: (arrival as any)?.location ?? (arrival as any)?.store ?? (arrival as any)?.shop ?? "",
          } as any)
        : newDefaults
    );
  }, [arrival]);

  // Inline files panel toggle
  const [showFilesPanel, setShowFilesPanel] = useState(false);

  // Local sorting state for files
  const [sortBy, setSortBy] = useState<"date" | "name" | "size">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Helper to fetch and set files list for current arrival
  async function refreshFilesList() {
    const id = arrival?.id ?? form?.id;
    if (!id) return;
    const res = await fetch(`${API_BASE}/api/arrivals/${id}/files`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json", ...authHeaders() },
    });
    if (res.ok) {
      const filesData = await res.json();
      const arr = Array.isArray(filesData) ? filesData : [];
      setForm((prev: any) => ({ ...prev, files: arr }));
      try {
        const count = arr.length;
        const idNum = Number(arrival?.id ?? form?.id);
        if (idNum) {
          window.dispatchEvent(new CustomEvent("arrival-updated", { detail: { id: idNum, patch: { files_count: count } } }));
        }
      } catch {}
    }
  }

  // Helper to rename file (best-effort)
  async function renameFile(item: any, newName: string) {
    const id = arrival?.id ?? form?.id;
    if (!id) return;
    const body = { id: item?.id, filename: item?.filename, original_name: item?.original_name, new_name: newName };
    // Try common endpoints: PATCH file by id, or POST to a rename endpoint
    const candidates = [
      `${API_BASE}/api/arrivals/${id}/files/${encodeURIComponent(item?.id ?? item?.filename ?? "")}`,
      `${API_BASE}/api/files/rename`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: url.endsWith("/rename") ? "POST" : "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          await refreshFilesList();
          return true;
        }
      } catch {}
    }
    return false;
  }

  React.useEffect(() => {
    function highlightFiles() {
      const el = filesSectionRef.current;
      if (!el) return;
      try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
      el.classList.add("ring-2", "ring-blue-400", "rounded");
      const t = setTimeout(() => {
        el.classList.remove("ring-2", "ring-blue-400", "rounded");
      }, 1200);
      return () => clearTimeout(t as any);
    }
    function onFocusFiles() {
      highlightFiles();
    }
    function onOpenUpload(e: Event) {
      highlightFiles();
      setTimeout(() => uploadBtnRef.current?.click(), 200);
    }
    window.addEventListener("focus-files", onFocusFiles as EventListener);
    window.addEventListener("open-upload", onOpenUpload as EventListener);
    return () => {
      window.removeEventListener("focus-files", onFocusFiles as EventListener);
      window.removeEventListener("open-upload", onOpenUpload as EventListener);
    };
  }, []);

  // Helper: derive distinct locations from the arrivals list (GET /api/arrivals)
  async function fetchLocationsFromArrivals(): Promise<string[]> {
    try {
      const res = await fetch(`${API_BASE}/api/arrivals`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json", ...authHeaders() },
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      if (!Array.isArray(data)) return [];
      const uniq = new Set<string>();
      for (const it of data) {
        const v = (it && typeof it === "object") ? (String(it.location ?? it.store ?? it.shop ?? "").trim()) : "";
        if (v) uniq.add(v);
      }
      const list = Array.from(uniq).filter(Boolean).sort((a,b)=>a.localeCompare(b));
      if (list.length) {
        try { console.debug("[ArrivalModal] locations derived from /api/arrivals:", list); } catch {}
      }
      return list;
    } catch {
      return [];
    }
  }
  // Fallback: ako nema lokacija u window/localStorage, probaj dohvatiti sa API-a
  React.useEffect(() => {
    if (locOptions && locOptions.length > 0) return;
    if (!ENABLE_LOCATION_FETCH) {
      try { console.debug("[ArrivalModal] locations fetch disabled; waiting for globals/events/localStorage"); } catch {}
      return; // do not hit API when not enabled
    }
    let aborted = false;
    (async () => {
      const endpoints = [
        `${API_BASE}/api/locations`,
        `${API_BASE}/api/arrivals/locations`,
        `${API_BASE}/api/locations/all`,
        `${API_BASE}/api/locations/list`,
      ];
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json", ...authHeaders() },
          });
          if (!res.ok) continue;
          const data = await res.json().catch(() => null);
          if (aborted) return;
          const list: string[] = Array.isArray(data)
            ? (data as any[]).map((it) => {
                if (typeof it === "string") return it;
                if (it && typeof it === "object" && (it.value || it.label || it.name)) {
                  return String(it.value ?? it.label ?? it.name);
                }
                return "";
              }).filter(Boolean)
            : [];
          if (list.length) {
            const seen = new Set<string>();
            const merged = [...(locOptions || []), ...list]
              .map((s) => String(s || "").trim())
              .filter((s) => s.length > 0)
              .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
            setLocOptionsUniq(merged);
            try { console.debug("[ArrivalModal] locations fetched from", ep, merged); } catch {}
            break; // stop after first successful endpoint
          }
        } catch {}
      }
      // Final fallback: derive locations by scanning the arrivals list
      if (!aborted && (!locOptions || locOptions.length === 0)) {
        const derived = await fetchLocationsFromArrivals();
        if (derived.length) {
          const seen2 = new Set<string>();
          const merged2 = [...(locOptions || []), ...derived]
            .map((s) => String(s || "").trim())
            .filter((s) => s.length > 0)
            .filter((s) => (seen2.has(s) ? false : (seen2.add(s), true)));
          setLocOptionsUniq(merged2);
          try { console.debug("[ArrivalModal] locations derived from /api/arrivals applied", merged2); } catch {}
        } else {
          try { console.debug("[ArrivalModal] no locations from endpoints nor /api/arrivals"); } catch {}
        }
      }
    })();
    return () => { aborted = true; };
  }, [locOptions, ENABLE_LOCATION_FETCH]);

  // Ensure current selected location is present in the options
  React.useEffect(() => {
    const cur = String(form?.location || "").trim();
    if (!cur) return;
    if (locOptions.includes(cur)) return;
    const merged = [...locOptions, cur];
    setLocOptionsUniq(merged);
  }, [form?.location]);

  React.useEffect(() => {
    // Sync from global/window if provided later
    function normalizeList(nextLike: any): string[] {
      if (!nextLike) return [];
      if (Array.isArray(nextLike)) return nextLike;
      if (nextLike instanceof Set) return Array.from(nextLike);
      if (Array.isArray(nextLike?.locations)) return nextLike.locations;
      return [];
    }
    function mergeAndSet(nextLike: any) {
      const nextList: string[] = normalizeList(nextLike);
      if (!nextList.length) return;
      const seen = new Set<string>();
      const merged = [...(locOptions || []), ...nextList]
        .map((s) => String(s || "").trim())
        .filter((s) => s.length > 0)
        .filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
      setLocOptionsUniq(merged);
      try { console.debug("[ArrivalModal] merged locations via event/global", merged); } catch {}
    }

    try {
      const winList = (window as any).locationOptions
        || (window as any).arrivalsLocationOptions
        || (window as any).appLocations
        || (window as any).filters?.locations;
      if (Array.isArray(winList) && winList.length && locOptions.length === 0) {
        mergeAndSet(winList);
      }
    } catch {}

    function onLocationsSet(e: any) { mergeAndSet(e?.detail?.locations ?? e?.detail ?? e); }
    function onFiltersSet(e: any) { mergeAndSet(e?.detail?.locations ?? e?.detail ?? e); }

    window.addEventListener("locations-set", onLocationsSet as EventListener);
    window.addEventListener("filters-set", onFiltersSet as EventListener);
    window.addEventListener("arrivals-filter-locations", onLocationsSet as EventListener);
    window.addEventListener("arrivals-locations-ready", onLocationsSet as EventListener);
    window.addEventListener("locations-ready", onLocationsSet as EventListener);
    return () => {
      window.removeEventListener("locations-set", onLocationsSet as EventListener);
      window.removeEventListener("filters-set", onFiltersSet as EventListener);
      window.removeEventListener("arrivals-filter-locations", onLocationsSet as EventListener);
      window.removeEventListener("arrivals-locations-ready", onLocationsSet as EventListener);
      window.removeEventListener("locations-ready", onLocationsSet as EventListener);
    };
  }, [locOptions.length]);

  // Canonicalize a typed location against available options (case/whitespace-insensitive)
  function canonicalizeLocation(input: string): string {
    const raw = preferredCaseLocation(String(input || "").trim());
    if (!raw) return "";
    try {
      const needle = raw.toLowerCase();
      for (const opt of (locOptions || [])) {
        const optStr = String(opt).trim();
        if (optStr.toLowerCase() === needle) return preferredCaseLocation(optStr);
      }
    } catch {}
    // If not found among options, still return the preferred-case version
    return raw;
  }

  async function createArrival() {
    setSaving(true);
    const payload = {
      supplier: String(form.supplier ?? ""),
      carrier: String(form.carrier ?? ""),
      driver: String(form.driver ?? ""),
      plate: String(form.plate ?? ""),
      pickup_date: String(form.pickup_date ?? ""),
      eta: String(form.eta ?? ""),
      arrived_at: form.arrived_at ? String(form.arrived_at) : null,
      transport_type: String(form.transport_type ?? ""),
      type: String(form.transport_type ?? ""),
      status: String(form.status ?? ""),
      goods_cost: Number(form.goods_cost || 0),
      freight_cost: Number(form.freight_cost || 0),
      responsible: String((form as any).responsible ?? ""),
      location: canonicalizeLocation(String(form.location ?? "").trim()),
      store: canonicalizeLocation(String(form.location ?? "").trim()),
      shop: canonicalizeLocation(String(form.location ?? "").trim()),
      location_name: canonicalizeLocation(String(form.location ?? "").trim()),
      note: String(form.note ?? ""),
      assignee: String((form as any).responsible ?? ""),
      assignee_name: String((form as any).responsible ?? ""),
      ...( (form as any).phone ? { phone: String((form as any).phone) } : {} ),
    };
    console.log("[ArrivalModal] CREATE payload", payload);
    try {
      const headersCreate: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders(),
      };
      const res = await fetch(`${API_BASE}/api/arrivals`, {
        method: "POST",
        credentials: "include",
        headers: headersCreate,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        alert(`Kreiranje nije uspjelo: ${res.status} ${res.statusText}\n${body}`);
        return;
      }
      const ct = res.headers.get("content-type") || "";
      const created = (ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null)) || payload;
      console.log("[ArrivalModal] CREATE response", created);
      onSaved?.(created as any);
      // obavijesti board da se refrešuje
      try { window.dispatchEvent(new CustomEvent("arrivals-refetch")); } catch {}
      onClose();
    } catch (e: any) {
      alert(`Greška pri kreiranju: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveArrival() {
    if (isNew) return createArrival();
    return patchArrival();
  }

  async function patchArrival() {
    setSaving(true);
    const payload = {
      supplier: String(form.supplier ?? ""),
      carrier: String(form.carrier ?? ""),
      driver: String(form.driver ?? ""),
      plate: String(form.plate ?? ""),
      pickup_date: String(form.pickup_date ?? ""),
      eta: String(form.eta ?? ""),
      arrived_at: form.arrived_at ? String(form.arrived_at) : null,
      transport_type: String(form.transport_type ?? ""),
      type: String(form.transport_type ?? ""),
      status: String(form.status ?? ""),
      goods_cost: Number(form.goods_cost || 0),
      freight_cost: Number(form.freight_cost || 0),
      responsible: String((form as any).responsible ?? ""),
      location: canonicalizeLocation(String(form.location ?? "").trim()),
      store: canonicalizeLocation(String(form.location ?? "").trim()),
      shop: canonicalizeLocation(String(form.location ?? "").trim()),
      location_name: canonicalizeLocation(String(form.location ?? "").trim()),
      note: String(form.note ?? ""),
      assignee: String((form as any).responsible ?? ""),
      assignee_name: String((form as any).responsible ?? ""),
      ...( (form as any).phone ? { phone: String((form as any).phone) } : {} ),
    };
    console.log("[ArrivalModal] PATCH payload", payload);

    const id = arrival?.id ?? form?.id;
    if (!id) {
      setSaving(false);
      alert("Nema ID-a pošiljke za ažuriranje.");
      return;
    }
    const url = `${API_BASE}/api/arrivals/${id}`;

    async function tryJSON(method: string, targetUrl = url) {
      const headersJSON: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders(),
      };
      const r = await fetch(targetUrl, {
        method,
        credentials: "include",
        headers: headersJSON,
        body: JSON.stringify(payload),
      });
      return r;
    }

    try {
      // 1) PATCH JSON
      let res = await tryJSON("PATCH");
      if (!res.ok && (res.status === 405 || res.status === 404)) {
        // 2) PUT JSON fallback
        res = await tryJSON("PUT");
      }
      if (!res.ok && (res.status === 405 || res.status === 404)) {
        // 3) POST with _method=PATCH (JSON)
        res = await tryJSON("POST", `${url}?_method=PATCH`);
      }
      if (!res.ok) {
        // 4) FORM-URLENCODED fallback
        const usp = new URLSearchParams();
        Object.entries(payload).forEach(([k, v]) => usp.append(k, String(v ?? "")));
        res = await fetch(`${url}?_method=PATCH`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
            ...authHeaders(),
          } as Record<string, string>,
          body: usp.toString(),
        });
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("PATCH/PUT fallback failed:", res.status, res.statusText, body);
        alert(`Nije sačuvano. Server vratio: ${res.status} ${res.statusText}\n${body}`);
        return;
      }

      const ct = res.headers.get("content-type") || "";
      const updatedRaw =
        (ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null)) ||
        payload;
      const updated = {
        ...updatedRaw,
        // backend ponekad ne vrati ova polja – zadrži vrijednosti iz payload-a
        responsible: (updatedRaw as any)?.responsible ?? payload.responsible,
        location:
          (updatedRaw as any)?.location ??
          (updatedRaw as any)?.store ??
          (updatedRaw as any)?.shop ??
          (updatedRaw as any)?.location_name ??
          payload.location,
        type: (updatedRaw as any)?.type ?? payload.type,
      } as any;
      console.log("[ArrivalModal] PATCH response", updated);
      onSaved?.(updated as any);
      // Optimistični update: reci listi da ažurira samo ovaj ID sa parcijalnim poljima
      try {
        const idNum = Number(arrival?.id ?? form?.id);
        if (idNum) {
          window.dispatchEvent(new CustomEvent("arrival-updated", { detail: { id: idNum, patch: { responsible: updated.responsible, location: updated.location, type: updated.type } } }));
        }
      } catch {}
      // i dalje odradi puni refetch da sve sjedne iz backenda
      try { window.dispatchEvent(new CustomEvent("arrivals-refetch")); } catch {}
      onClose();
    } catch (e: any) {
      console.error("Greška pri čuvanju Arrival-a:", e);
      alert(`Nije sačuvano. Detalji: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  // Helpers to format bytes and datetime
  function formatBytes(n?: number): string {
    if (n == null || isNaN(n as any)) return "–";
    if (n < 1024) return n + " B";
    const kb = n / 1024;
    if (kb < 1024) return kb.toFixed(1) + " KB";
    const mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(1) + " MB";
    const gb = mb / 1024;
    return gb.toFixed(1) + " GB";
  }
  function formatDT(v?: string): string {
    if (!v) return "–";
    const d = new Date(v);
    const pad = (x:number)=> String(x).padStart(2,"0");
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const id = arrival?.id ?? form?.id;
      if (!id) {
        alert("Sačuvaj unos prije upload-a fajlova.");
        return;
      }
      const fd = new FormData();
      fd.append("file", file, file.name);
      const headersUpload: Record<string, string> = {
        Accept: "application/json",
        ...authHeaders(), // NEMOJ postavljati Content-Type; browser dodaje boundary
      };
      // Upload the file
      const res = await fetch(`${API_BASE}/api/arrivals/${id}/files`, {
        method: "POST",
        credentials: "include",
        headers: headersUpload,
        body: fd,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(msg);
      }
      // After successful upload, fetch the updated list of files
      const filesRes = await fetch(`${API_BASE}/api/arrivals/${id}/files`, {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
      });
      if (!filesRes.ok) {
        throw new Error("Ne mogu dohvatiti ažurirani spisak fajlova.");
      }
      const filesData = await filesRes.json();
      // filesData is expected to be an array, fallback to []
      setForm((prev: any) => ({
        ...prev,
        files: Array.isArray(filesData) ? filesData : [],
      }));
      try {
        const count = (Array.isArray(filesData) ? filesData.length : 0);
        const idNum = Number(arrival?.id ?? form?.id);
        if (idNum) {
          window.dispatchEvent(new CustomEvent("arrival-updated", { detail: { id: idNum, patch: { files_count: count } } }));
        }
      } catch {}
      // Broadcast files-updated event
      window.dispatchEvent(new CustomEvent("files-updated", { detail: { arrivalId: id } }));
    } catch (e) {
      console.error("Upload fajla nije uspio:", e);
      alert("Upload nije uspio.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onChooseFile() {
    fileInputRef.current?.click();
  }

  // Pregled fajla – proba više ruta, uključujući ID-scope, i fallback na GET ako HEAD nije podržan
  async function onPreview(f: string) {
    const id = arrival?.id ?? form?.id;

    const isFullUrl = (s: string) => /^https?:\/\//i.test(s);
    const isPath = (s: string) => s.startsWith("/");
    const isStaticPath = (u: string) => /\/(files|uploads)\//.test(u);

    function buildPreviewUrls(name: string): string[] {
      const raw = String(name || "").trim();
      // If it's already a URL or app-relative path, just try it directly (and ?inline=1)
      if (isFullUrl(raw) || isPath(raw)) {
        const u = raw;
        const withInline = u.includes("?") ? `${u}&inline=1` : `${u}?inline=1`;
        // Avoid doubling /files if user passed a path already containing /files
        return [u, withInline];
      }
      const enc = encodeURIComponent(raw);
      const idScoped = id
        ? [
            `${API_BASE}/api/arrivals/${id}/files/${enc}`,
            `${API_BASE}/api/arrivals/${id}/files/${enc}?inline=1`,
          ]
        : [];
      return [
        ...idScoped,
        `${API_BASE}/api/files/${enc}`,
        `${API_BASE}/api/files/${enc}?inline=1`,
        // NOTE: keep these app-relative so the Vite proxy can handle CORS for us in dev
        `/files/${enc}`,
        `/files/${enc}?inline=1`,
        `/uploads/${enc}`,
        `/uploads/${enc}?inline=1`,
      ].filter(Boolean);
    }

    async function openFirstReachable(urls: string[]) {
      for (const u of urls) {
        try {
          // Static paths often 405 on HEAD and use wildcard CORS; do NOT send credentials or auth.
          if (isStaticPath(u)) {
            // Try to open directly without probing to avoid CORS preflight issues.
            window.open(u, "_blank", "noopener,noreferrer");
            return true;
          }
          // For API-scoped URLs keep auth and credentials
          let res = await fetch(u, { method: "HEAD", credentials: "include", headers: { ...authHeaders() } });
          if (res.ok) {
            window.open(u, "_blank", "noopener,noreferrer");
            return true;
          }
          if (res.status === 405) {
            res = await fetch(u, {
              method: "GET",
              credentials: "include",
              headers: {
                Accept: "application/pdf,image/*,text/plain,application/octet-stream",
                ...authHeaders(),
              } as Record<string, string>,
            });
            if (res.ok) {
              window.open(u, "_blank", "noopener,noreferrer");
              return true;
            }
          }
        } catch {}
      }
      return false;
    }

    const ok = await openFirstReachable(buildPreviewUrls(f));
    if (!ok) {
      alert('Pregled nije dostupan za ovaj fajl. Pokušajte "Preuzmi".');
    }
  }

  // Preuzimanje fajla – proba više ruta i ?download=1 fallback
  async function onDownload(f: string) {
    const id = arrival?.id ?? form?.id;
    const raw = String(f || "");
    const isFullUrl = /^https?:\/\//i.test(raw);
    const isPath = raw.startsWith("/");
    const isStaticPath = (u: string) => /\/(files|uploads)\//.test(u);

    // If user already provided a URL/path, just open it (prefer ?download=1)
    if (isFullUrl || isPath) {
      const u = raw.includes("?") ? `${raw}&download=1` : `${raw}?download=1`;
      window.open(u, "_blank", "noopener,noreferrer");
      return;
    }

    const enc = encodeURIComponent(raw);
    const candidates = [
      ...(id
        ? [
            `${API_BASE}/api/arrivals/${id}/files/${enc}?download=1`,
            `${API_BASE}/api/arrivals/${id}/files/${enc}`,
          ]
        : []),
      `${API_BASE}/api/files/${enc}?download=1`,
      `${API_BASE}/api/files/${enc}`,
      // app-relative (proxy-friendly) static paths
      `/files/${enc}?download=1`,
      `/files/${enc}`,
      `/uploads/${enc}`,
    ].filter(Boolean);

    for (const u of candidates) {
      try {
        if (isStaticPath(u)) {
          // Open static directly (no credentials) to avoid CORS issues
          window.open(u, "_blank", "noopener,noreferrer");
          return;
        }
        const res = await fetch(u, { method: "HEAD", credentials: "include", headers: { ...authHeaders() } });
        if (res.ok || res.status === 405) {
          window.open(u, "_blank", "noopener,noreferrer");
          return;
        }
      } catch {}
    }
    alert("Preuzimanje nije dostupno za ovaj fajl.");
  }

  async function onDeleteFile(f: string, idx: number) {
    const id = arrival?.id ?? form?.id;
    if (!id) {
      alert("Nema ID-a pošiljke.");
      return;
    }
    try {
      // Najčešći DELETE patterni – best-effort
      const urls = [
        `${API_BASE}/api/files/${encodeURIComponent(f)}`,
        `${API_BASE}/api/arrivals/${id}/files/${encodeURIComponent(f)}`,
      ];
      for (const u of urls) {
        try {
          const rr = await fetch(u, {
            method: "DELETE",
            credentials: "include",
            headers: authHeaders() as Record<string, string>,
          });
          if (rr.ok) break;
        } catch {}
      }
      setForm((prev: any) => {
        const next = Array.isArray(prev.files) ? [...prev.files] : [];
        next.splice(idx, 1);
        // Emit optimistic files_count update
        try {
          const idNum = Number(arrival?.id ?? form?.id);
          if (idNum) {
            window.dispatchEvent(new CustomEvent("arrival-updated", { detail: { id: idNum, patch: { files_count: next.length } } }));
          }
        } catch {}
        return { ...prev, files: next };
      });
      // Broadcast files-updated event
      window.dispatchEvent(new CustomEvent("files-updated", { detail: { arrivalId: id } }));
    } catch (e) {
      console.error("Brisanje fajla nije uspjelo:", e);
      alert("Brisanje nije uspjelo.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Content
        className="max-w-2xl rounded bg-white p-6 shadow-lg focus:outline-none"
      >
        <div className="mb-4">
          <div className={`h-1 w-full rounded ${statusAccent[form?.status || "not_shipped"] || "bg-gray-300"} mb-3`} />
          <div className="flex justify-between items-center">
            <Dialog.Title className="text-lg font-semibold">
              {isNew ? "Novi unos" : `Detalji pošiljke #${arrival?.id}`}
            </Dialog.Title>
            <Dialog.Description className="sr-only" id="arrival-modal-desc">
              Uredi ili sačuvaj podatke pošiljke. Sva polja su editabilna prema ovlašćenjima.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-gray-200">
                <CloseIcon />
              </button>
            </Dialog.Close>
          </div>
        </div>

        <div className="space-y-3">
          {/* Osnovno */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold">Dobavljač</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold">Prevoznik</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={form.carrier}
                onChange={(e) => setForm({ ...form, carrier: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold">Vozač</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={form.driver}
                onChange={(e) => setForm({ ...form, driver: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold">Tablice</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
              />
            </div>
          </div>

          {/* Datumi */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="font-semibold">Pickup date</label>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={form.pickup_date?.slice(0, 10) || ""}
                onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
              />
            </div>
            <div className="md:col-span-1">
              <label className="font-semibold">ETA</label>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={form.eta?.slice(0, 10) || ""}
                onChange={(e) => setForm({ ...form, eta: e.target.value })}
              />
            </div>
            <div className="md:col-span-1">
              <label className="font-semibold">Broj telefona</label>
              <input
                type="tel"
                className="border rounded px-2 py-1 w-full"
                value={(form as any).phone || ""}
                onChange={(e) => setForm({ ...form, ...( { phone: e.target.value } as any) })}
                placeholder="+382 67 123 456"
              />
            </div>
          </div>

          {/* Status i tip */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="font-semibold">Status</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              >
                <option value="not_shipped">Najavljeno</option>
                <option value="shipped">U transportu</option>
                <option value="arrived">Stiglo</option>
              </select>
            </div>
            <div>
              <label className="font-semibold">Vrsta transporta</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={form.transport_type}
                onChange={(e) => setForm({ ...form, transport_type: e.target.value })}
              >
                <option value="truck">Kamion</option>
                <option value="container">Kontejner</option>
                <option value="van">Kombi</option>
                <option value="train">Voz</option>
              </select>
            </div>
            <div>
              <label className="font-semibold">Lokacija</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={preferredCaseLocation(form.location)}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                onBlur={(e) => setForm({ ...form, location: canonicalizeLocation(e.target.value) })}
              >
                <option value="">—</option>
                {(!Array.isArray(locOptions) || locOptions.length === 0) && (
                  <option disabled>(nema definisanih lokacija)</option>
                )}
                {Array.isArray(locOptions) && uniqPreferred([...locOptions])
                  .map((s) => preferredCaseLocation(String(s)))
                  .sort((a,b) => a.localeCompare(b))
                  .map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                {form.location && Array.isArray(locOptions) && locOptions.length > 0 && !locOptions.includes(form.location) && (
                  <option disabled>──────────</option>
                )}
                {/* Ensure current value is visible even if it's not in the list */}
                {form.location && !locOptions.includes(form.location) && (
                  <option value={preferredCaseLocation(form.location)}>{preferredCaseLocation(form.location)}</option>
                )}
              </select>
            </div>
            <div>
              <label className="font-semibold">Odgovorna osoba</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={String((form as any).responsible ?? "")}
                onChange={(e) => setForm({ ...form, ...( { responsible: String(e.target.value || "") } as any) })}
              >
                <option value="">—</option>
                {responsibleOptions.map((opt: string) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Troškovi */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold">Cijena robe (EUR)</label>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={form.goods_cost ?? 0}
                onChange={(e) =>
                  setForm({ ...form, goods_cost: Number(e.target.value || 0) })
                }
              />
            </div>
            <div>
              <label className="font-semibold">Cijena prevoza (EUR)</label>
              <input
                type="number"
                className="border rounded px-2 py-1 w-full"
                value={form.freight_cost ?? 0}
                onChange={(e) =>
                  setForm({ ...form, freight_cost: Number(e.target.value || 0) })
                }
              />
            </div>
          </div>

          {/* Beleške */}
          <div>
            <label className="font-semibold">Beleške</label>
            <textarea
              className="border rounded px-2 py-1 w-full"
              value={form.note ?? ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>

          {/* Fajlovi */}
          <div ref={filesSectionRef}>
            <label className="font-semibold">Fajlovi</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files) {
                      Array.from(files).forEach((f) => handleUpload(f));
                    }
                  }}
                />
                <button
                  ref={uploadBtnRef}
                  className="px-3 py-1 rounded border flex items-center gap-2 disabled:opacity-50"
                  onClick={onChooseFile}
                  disabled={uploading || isNew}
                  type="button"
                  title={isNew ? "Sačuvaj unos prije upload-a fajlova" : undefined}
                >
                  <UploadIcon size={16} /> {uploading ? "Uploading…" : "Upload fajl"}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded border flex items-center gap-2"
                  onClick={async () => {
                    const id = arrival?.id ?? form?.id;
                    if (!id) {
                      alert("Nema ID-a pošiljke za prikaz fajlova.");
                      return;
                    }
                    await refreshFilesList();
                    setShowFilesPanel((v) => !v);
                  }}
                >
                  Prikaži fajlove
                </button>
                {isNew && <p className="text-xs text-gray-500">Sačuvaj novi unos da bi dodao fajlove.</p>}
              </div>
              {showFilesPanel && (
                <div className="mt-2 rounded-lg border bg-white/70">
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <div className="font-semibold">Prikačeni fajlovi</div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">Sortiraj po</label>
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                      >
                        <option value="date">Datumu</option>
                        <option value="name">Nazivu</option>
                        <option value="size">Veličini</option>
                      </select>
                      <button
                        type="button"
                        className="text-sm underline"
                        onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        title="Promijeni smjer"
                      >
                        {sortDir === "asc" ? "▲" : "▼"}
                      </button>
                      <button
                        type="button"
                        className="text-sm underline"
                        onClick={refreshFilesList}
                        title="Osvježi listu"
                      >
                        Osvježi
                      </button>
                    </div>
                  </div>
                  <div className="p-3">
                    {(() => {
                      const filesArray: any[] = Array.isArray(form.files) ? form.files : [];
                      const sortedFiles = [...filesArray].sort((a: any, b: any) => {
                        const aName = (a?.original_name ?? a?.filename ?? "").toString().toLowerCase();
                        const bName = (b?.original_name ?? b?.filename ?? "").toString().toLowerCase();
                        const aSize = Number(a?.size ?? 0);
                        const bSize = Number(b?.size ?? 0);
                        const aDate = new Date(a?.uploaded_at ?? 0).getTime();
                        const bDate = new Date(b?.uploaded_at ?? 0).getTime();
                        let cmp = 0;
                        if (sortBy === "name") cmp = aName.localeCompare(bName);
                        else if (sortBy === "size") cmp = aSize - bSize;
                        else cmp = aDate - bDate;
                        return sortDir === "asc" ? cmp : -cmp;
                      });
                      if (sortedFiles.length === 0) {
                        return <div className="text-sm text-gray-600 italic">Nema fajlova.</div>;
                      }
                      return (
                        <ul className="divide-y rounded-md border bg-white/70">
                          {sortedFiles.map((f: any, idx: number) => {
                            const name = typeof f === "object" && f !== null ? (f.original_name ?? f.filename ?? String(f)) : String(f);
                            const url = typeof f === "object" && f !== null ? (f.url ?? f.filename ?? String(f)) : String(f);
                            const idOrFile = typeof f === "object" && f !== null ? (f.id ?? f.filename ?? String(f)) : String(f);
                            const size = typeof f === "object" && f !== null ? Number(f.size ?? NaN) : NaN;
                            const uploaded = typeof f === "object" && f !== null ? (f.uploaded_at ?? "") : "";
                            return (
                              <li key={(f?.id ? `row-${f.id}` : `${name}-${idx}`)} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                                <div className="min-w-0 flex items-center gap-3">
                                  <FileIcon size={16} />
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">{name}</div>
                                    <div className="text-xs text-gray-500">
                                      {formatBytes(size)} • {formatDT(uploaded)}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-gray-200"
                                    title="Pregled"
                                    aria-label="Pregled"
                                    disabled={!url}
                                    onClick={() => url && onPreview(url)}
                                  >
                                    <Eye size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-gray-200"
                                    title="Preuzmi"
                                    aria-label="Preuzmi"
                                    disabled={!url}
                                    onClick={() => url && onDownload(url)}
                                  >
                                    <Download size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1 rounded hover:bg-red-100 text-red-700"
                                    title="Obriši"
                                    aria-label="Obriši"
                                    onClick={() => onDeleteFile(idOrFile, idx)}
                                  >
                                    <TrashIcon size={16} />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      );
                    })()}
                  </div>
                </div>
              )}
              {/* Old file list removed as superseded by redesigned panel */}
              {/* <ul className="space-y-1">
                {((arrival?.files as any) || form.files || []).map((f: any, idx: number) => {
                  // ...old rendering...
                })}
              </ul> */}
            </div>
          </div>

          {/* Akcije */}
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              className="px-3 py-1 rounded border"
              onClick={onClose}
            >
              Zatvori
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded border bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={saveArrival}
              disabled={saving}
            >
              {saving ? "Čuvam…" : "Sačuvaj"}
            </button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
