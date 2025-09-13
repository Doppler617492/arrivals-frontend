import React from "react";
import { FileIcon, TruckIcon, MapPin, Train, Package, Car, Eye, Upload, Calendar, Loader2 as Loader, Trash2 as Trash } from "lucide-react";

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString() : "—");
const fmtMoney = (n?: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);

const transportIcon = (t?: string) => {
  const common = { size: 14, className: "opacity-80" } as const;
  switch ((t || "").toLowerCase()) {
    case "kamion":
    case "truck":
      return <TruckIcon {...common} />;
    case "kontejner":
    case "container":
      return <Package {...common} />;
    case "voz":
    case "train":
      return <Train {...common} />;
    case "kombi":
    case "van":
      return <Car {...common} />;
    default:
      return <TruckIcon {...common} />;
  }
};

export type Arrival = {
  id: number;
  supplier: string;
  carrier: string;
  driver: string;
  plate: string;
  pickup_date: string;
  eta: string;
  arrived_at: string;
  transport_type: string;
  status: "not_shipped" | "shipped" | "arrived";
  goods_cost: number;
  freight_cost: number;
  location: string;
  responsible?: string;
  note?: string;
  files: string[];
  files_count?: number;
};

const statusMap = {
  not_shipped: { label: "Najavljeno", badge: "bg-gray-300 text-gray-800", accent: "bg-gray-400" },
  shipped: { label: "U transportu", badge: "bg-blue-500/90 text-white", accent: "bg-blue-500" },
  arrived: { label: "Stiglo", badge: "bg-green-500/90 text-white", accent: "bg-green-500" },
};

type Props = {
  arrival: Arrival;
  onDetails: (a: Arrival) => void;
  onUploadFiles?: (a: Arrival) => void;
  onDelete?: (a: Arrival) => void;
};

export default function ArrivalCard({ arrival, onDetails, onUploadFiles, onDelete }: Props) {
  const status = statusMap[arrival.status];

  const [savingResp, setSavingResp] = React.useState(false);
  const [savingLoc, setSavingLoc] = React.useState(false);
  const [resp, setResp] = React.useState(arrival.responsible || "");
  const [loc, setLoc] = React.useState(arrival.location || "");

  const authHeaders = () => {
    const t = localStorage.getItem("token") || localStorage.getItem("access_token");
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  };
  const API_BASE = (window as any).API_BASE || "";

  async function onChangeResponsible(val: string) {
    setSavingResp(true);
    try {
      const res = await fetch(`${API_BASE}/api/arrivals/${arrival.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(authHeaders() ? authHeaders() : {}),
        },
        body: JSON.stringify({
          responsible: val,
          // aliases for backends that persist assignee fields
          assignee: val,
          assignee_name: val,
        }),
      });
      if (res.ok) {
        // Persist override locally to survive list refresh or API omissions
        try {
          const key = "arrivalResponsibleOverrides";
          const raw = localStorage.getItem(key);
          const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
          map[String(arrival.id)] = val || "";
          localStorage.setItem(key, JSON.stringify(map));
        } catch {}

        // Notify UI to refresh
        window.dispatchEvent(new CustomEvent("arrivals-refetch"));
        try {
          window.dispatchEvent(new CustomEvent("arrival-updated", { detail: { id: arrival.id, patch: { responsible: val } } }));
        } catch {}
      }
    } finally {
      setSavingResp(false);
    }
  }
  async function onChangeLocation(val: string) {
    setSavingLoc(true);
    try {
      const res = await fetch(`${API_BASE}/api/arrivals/${arrival.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
        body: JSON.stringify({ location: val }),
      });
      if (res.ok) {
        setLoc(val);
        // Persist override locally to survive list refresh or API omissions
        try {
          const key = "arrivalLocationOverrides";
          const raw = localStorage.getItem(key);
          const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
          map[String(arrival.id)] = val || "";
          localStorage.setItem(key, JSON.stringify(map));
        } catch {}

        // Notify UI to refresh
        window.dispatchEvent(new CustomEvent("arrivals-refetch"));
        try {
          window.dispatchEvent(new CustomEvent("arrival-updated", { detail: { id: arrival.id, patch: { location: val } } }));
        } catch {}
      }
    } finally {
      setSavingLoc(false);
    }
  }

  const responsibleOptions = (() => {
    const fallback = ["Ludvig", "Gazi", "Gezim", "Armir", "Rrezart", "Beki"];
    const globals = (window as any).responsibleOptions as string[] | undefined;
    if (!globals || globals.length === 0) return fallback;
    // merge + dedupe (preserve global order first, then fallback)
    const seen = new Set<string>();
    const out: string[] = [];
    [...globals, ...fallback].forEach((name) => {
      const key = String(name || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out;
  })();

  // Fallback list of known shop/warehouse locations
  const fallbackLocations = [
    "Veleprodajni Magacin",
    "Carinsko Skladiste",
    "Pg Centar",
    "Pg",
    "Bar",
    "Bar Centar",
    "Budva",
    "Kotor Centar",
    "Herceg Novi",
    "Herceg Novi Centar",
    "Niksic",
    "Bijelo Polje",
    "Ulcinj Centar",
    "Horeca",
  ];

  // Build unique, normalized list (case-insensitive, trimmed, Unicode-normalized)
  const normalizeLoc = (s: string) => s.normalize("NFKC").trim().toLowerCase();

  const rawLocationOptions = (window as any).locationOptions as string[] | undefined;

  const locationOptionsMap = new Map<string, string>();
  [...(rawLocationOptions ?? []), ...fallbackLocations].forEach((s) => {
    if (typeof s !== "string") return;
    const clean = s.trim();
    if (!clean) return;
    const key = normalizeLoc(clean);
    if (!locationOptionsMap.has(key)) {
      locationOptionsMap.set(key, clean);
    }
  });

  // Ensure required items are present with exact casing
  ["Veleprodajni Magacin", "Carinsko Skladiste"].forEach((must) => {
    const key = normalizeLoc(must);
    if (!locationOptionsMap.has(key)) locationOptionsMap.set(key, must);
  });

  const locationOptions: string[] = Array.from(locationOptionsMap.values()).sort((a, b) =>
    a.localeCompare(b, "sr-Latn")
  );

  React.useEffect(() => {
    setResp(arrival.responsible || "");
    // Prefer arrival.location, otherwise fallback to locally stored override
    try {
      const key = "arrivalLocationOverrides";
      const raw = localStorage.getItem(key);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      const overridden = map[String(arrival.id)] || "";
      setLoc(arrival.location || overridden || "");
    } catch {
      setLoc(arrival.location || "");
    }
  }, [arrival.id, arrival.responsible, arrival.location]);

  // Keep in sync if other components (e.g. modal) broadcast updates
  React.useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as { id?: number; patch?: Record<string, any> } | undefined;
        if (!detail) return;
        if (detail.id === arrival.id && detail.patch) {
          if (Object.prototype.hasOwnProperty.call(detail.patch, "location")) {
            const newLoc = (detail.patch as any).location ?? "";
            setLoc(newLoc);
            // also cache override so it survives list refreshes
            try {
              const key = "arrivalLocationOverrides";
              const raw = localStorage.getItem(key);
              const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
              map[String(arrival.id)] = newLoc || "";
              localStorage.setItem(key, JSON.stringify(map));
            } catch {}
          }
          if (Object.prototype.hasOwnProperty.call(detail.patch, "responsible")) {
            setResp((detail.patch as any).responsible ?? "");
          }
        }
      } catch {}
    };
    window.addEventListener("arrival-updated", handler as EventListener);
    return () => window.removeEventListener("arrival-updated", handler as EventListener);
  }, [arrival.id]);

  return (
    <div className="relative rounded shadow-sm border p-3 mb-2 bg-white overflow-hidden">
      {/* Status accent strip on the left */}
      <div className={`absolute left-0 top-0 h-full w-1 ${status.accent}`} />

      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span className="font-bold">#{arrival.id}</span>
          <span className={`text-xs px-2 py-1 rounded ${status.badge}`}>{status.label}</span>
          <span className="ml-1">{transportIcon(arrival.transport_type)}</span>
        </div>
        <div className="flex items-center gap-1 text-sm opacity-80">
          <FileIcon size={16} />
          <span>{arrival.files_count ?? (Array.isArray(arrival.files) ? arrival.files.length : 0)}</span>
        </div>
      </div>

      {/* Responsible meta row */}
      <div className="text-sm mb-1 flex items-center gap-1" title="Odgovorna osoba">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
        <span>{arrival.responsible || '—'}</span>
      </div>

      {/* Primary info */}
      <div className="font-semibold mb-1">{arrival.supplier}</div>
      <div className="text-sm mb-1 flex items-center gap-1">
        <Calendar size={14} className="opacity-80" />
        <span>Preuzimanje: {fmtDate(arrival.pickup_date)}</span>
      </div>
      <div className="text-sm mb-1">ETA: {fmtDate(arrival.eta)}</div>
      
      {arrival.status === "arrived" && (
        <div className="text-xs mb-1 opacity-70">Stiglo: {fmtDate(arrival.arrived_at)}</div>
      )}

      {/* Secondary info */}
      <div className="text-sm flex items-center gap-1 mb-1">
        <TruckIcon size={14} className="opacity-80" />
        <span>{arrival.plate || "—"}</span>
      </div>
      <div className="text-sm mb-1">Prevoznik: {arrival.carrier || "—"}</div>
      {arrival.driver && (
        <div className="text-xs mb-1 opacity-70">Vozač: {arrival.driver}</div>
      )}
      <div className="text-sm flex items-center gap-1 mb-2">
        <MapPin size={14} className="opacity-80" />
        <span>
          {loc ||
            arrival.location ||
            (() => {
              try {
                const raw = localStorage.getItem("arrivalLocationOverrides");
                const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
                return map[String(arrival.id)] || "—";
              } catch {
                return "—";
              }
            })()}
        </span>
      </div>

      {/* Inline controls: Responsible & Location */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="flex items-center gap-2">
          <label className="text-xs opacity-70 whitespace-nowrap">Odgovorna osoba</label>
          <div className="relative flex-1">
            <select
              className="w-full border rounded px-2 py-1 text-sm bg-white"
              value={resp}
              onChange={(e) => { const v = e.target.value; setResp(v); onChangeResponsible(v); }}
              disabled={savingResp}
              title="Odgovorna osoba"
            >
              <option value="">—</option>
              {responsibleOptions.map((opt: string) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {savingResp && <Loader className="absolute right-2 top-1.5 animate-spin" size={14} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs opacity-70 whitespace-nowrap">Lokacija</label>
          <div className="relative flex-1">
            <select
              className="w-full border rounded px-2 py-1 text-sm bg-white"
              value={loc}
              onChange={(e) => { const v = e.target.value; setLoc(v); onChangeLocation(v); }}
              disabled={savingLoc}
              title="Lokacija"
            >
              {(!locationOptions || locationOptions.length === 0) && (
                <option value="">—</option>
              )}
              {locationOptions.map((opt) => (
                <option key={normalizeLoc(opt)} value={opt}>{opt}</option>
              ))}
            </select>
            {savingLoc && <Loader className="absolute right-2 top-1.5 animate-spin" size={14} />}
          </div>
        </div>
      </div>

      {/* Individual prices */}
      <div className="text-xs mb-0.5 opacity-80">
        Cijena robe: {fmtMoney(Number(arrival.goods_cost) || 0)}
      </div>
      <div className="text-xs mb-2 opacity-80">
        Cijena prevoza: {fmtMoney(Number(arrival.freight_cost) || 0)}
      </div>

      {/* Total price */}
      <div
        className="text-sm font-bold"
        title={`Roba: ${fmtMoney(Number(arrival.goods_cost) || 0)} + Prevoz: ${fmtMoney(Number(arrival.freight_cost) || 0)}`}
      >
        Cijena: {fmtMoney((Number(arrival.goods_cost) || 0) + (Number(arrival.freight_cost) || 0))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-2">
        <div className="text-xs opacity-60">ID: {arrival.id}</div>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-gray-100"
            title="Detalji"
            onClick={() => onDetails(arrival)}
            type="button"
          >
            <Eye size={16} />
          </button>
          <button
            className="p-1 rounded hover:bg-gray-100"
            title="Fajlovi / Upload"
            onClick={() => {
              if (onUploadFiles) onUploadFiles(arrival);
              else window.dispatchEvent(new CustomEvent("open-upload", { detail: { id: arrival.id } }));
            }}
            type="button"
          >
            <Upload size={16} />
          </button>
          <div className="flex items-center gap-1 text-sm opacity-80" title="Broj fajlova">
            <FileIcon size={16} />
            <span>{arrival.files_count ?? (Array.isArray(arrival.files) ? arrival.files.length : 0)}</span>
          </div>
          {/* Delete button (red) */}
          <button
            className="inline-flex w-10 h-10 items-center justify-center rounded-md bg-red-600 hover:bg-red-700 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            title="Obriši"
            aria-label="Obriši karticu"
            onClick={() => {
              if (typeof window !== "undefined") {
                const ok = confirm(`Obrisati prijem #${arrival.id}?`);
                if (!ok) return;
              }
              if (typeof (onDelete) === "function") {
                onDelete(arrival);
              } else {
                try {
                  window.dispatchEvent(new CustomEvent("arrival-delete", { detail: { id: arrival.id } }));
                } catch {}
              }
            }}
            type="button"
          >
            <Trash size={28} />
          </button>
        </div>
      </div>
    </div>
  );
}