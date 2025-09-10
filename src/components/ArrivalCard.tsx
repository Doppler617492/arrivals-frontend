import { FileIcon, TruckIcon, MapPin, Train, Package, Car, Eye, Upload, Calendar } from "lucide-react";

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
  note?: string;
  files: string[];
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
};

export default function ArrivalCard({ arrival, onDetails, onUploadFiles }: Props) {
  const status = statusMap[arrival.status];

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
          <span>{Array.isArray(arrival.files) ? arrival.files.length : 0}</span>
        </div>
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
        <span>{arrival.location || "—"}</span>
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
            <span>{Array.isArray(arrival.files) ? arrival.files.length : 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}