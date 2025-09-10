import React, { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileIcon, UploadIcon, TrashIcon, X as CloseIcon } from "lucide-react";
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
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ArrivalModal({ open, onClose, arrival, onSaved }: Props) {
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

  // Controlled form state
  const [form, setForm] = useState<Arrival>(() => (arrival ? { ...arrival } : newDefaults));
  React.useEffect(() => {
    setForm(arrival ? { ...arrival } : newDefaults);
  }, [arrival]);

  React.useEffect(() => {
    function highlightFiles() {
      const el = filesSectionRef.current;
      if (!el) return;
      // nježno skrolovanje i vizuelni highlight
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
      // Fokusiraj sekciju i pokušaj otvoriti file dialog ako modal već otvoren
      highlightFiles();
      // mali delay da DOM odradi fokus
      setTimeout(() => uploadBtnRef.current?.click(), 200);
    }
    window.addEventListener("focus-files", onFocusFiles as EventListener);
    window.addEventListener("open-upload", onOpenUpload as EventListener);
    return () => {
      window.removeEventListener("focus-files", onFocusFiles as EventListener);
      window.removeEventListener("open-upload", onOpenUpload as EventListener);
    };
  }, []);


  if (!open || !form) return null;
  async function createArrival() {
    setSaving(true);
    const payload = {
      supplier: form.supplier,
      carrier: form.carrier,
      driver: form.driver,
      plate: form.plate,
      pickup_date: form.pickup_date,
      eta: form.eta,
      arrived_at: form.arrived_at,
      transport_type: form.transport_type,
      status: form.status,
      goods_cost: Number(form.goods_cost || 0),
      freight_cost: Number(form.freight_cost || 0),
      location: form.location,
      note: form.note,
      ...( (form as any).phone ? { phone: (form as any).phone } : {} ),
    };
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
      onSaved?.(created as any);
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
      supplier: form.supplier,
      carrier: form.carrier,
      driver: form.driver,
      plate: form.plate,
      pickup_date: form.pickup_date,
      eta: form.eta,
      arrived_at: form.arrived_at,
      transport_type: form.transport_type,
      status: form.status,
      goods_cost: Number(form.goods_cost || 0),
      freight_cost: Number(form.freight_cost || 0),
      location: form.location,
      note: form.note,
      ...( (form as any).phone ? { phone: (form as any).phone } : {} ),
    };

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
      const updated =
        (ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null)) ||
        payload;
      onSaved?.(updated as any);
      onClose();
    } catch (e: any) {
      console.error("Greška pri čuvanju Arrival-a:", e);
      alert(`Nije sačuvano. Detalji: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
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
      const data = await res.json().catch(() => ({}));
      // Pokušaj da pročitaš novi list fajlova; ako nema, dodaj ime optimistički
      const newFile =
        (data && (data.name || data.filename || data.file || data.id)) || file.name;
      setForm((prev: any) => ({
        ...prev,
        files: Array.isArray(prev.files) ? [...prev.files, newFile] : [newFile],
      }));
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

  function onPreview(f: string) {
    // Najčešći backend patterni – probaj nekoliko ruta
    const tries = [
      `${API_BASE}/api/files/${encodeURIComponent(f)}`,
      `${API_BASE}/files/${encodeURIComponent(f)}`,
      `${API_BASE}/uploads/${encodeURIComponent(f)}`,
    ];
    window.open(tries[0], "_blank", "noopener,noreferrer");
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
        return { ...prev, files: next };
      });
    } catch (e) {
      console.error("Brisanje fajla nije uspjelo:", e);
      alert("Brisanje nije uspjelo.");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Content className="max-w-2xl rounded bg-white p-6 shadow-lg focus:outline-none">
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
            <div>
              <label className="font-semibold">Pickup date</label>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={form.pickup_date?.slice(0, 10) || ""}
                onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
              />
            </div>
            <div>
              <label className="font-semibold">ETA</label>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={form.eta?.slice(0, 10) || ""}
                onChange={(e) => setForm({ ...form, eta: e.target.value })}
              />
            </div>
            <div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              <input
                className="border rounded px-2 py-1 w-full"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
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
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
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
                {isNew && <p className="text-xs text-gray-500">Sačuvaj novi unos da bi dodao fajlove.</p>}
              </div>
              <ul className="space-y-1">
                {((arrival?.files as any) || form.files || []).map((f: string, idx: number) => (
                  <li key={`${f}-${idx}`} className="flex justify-between items-center border rounded p-2">
                    <div className="flex items-center gap-2">
                      <FileIcon size={16} />
                      <span>{String(f)}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded border"
                        onClick={() => onPreview(String(f))}
                      >
                        Pregled
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded border bg-red-600 text-white hover:bg-red-700 flex items-center disabled:opacity-50"
                        onClick={() => onDeleteFile(String(f), idx)}
                        disabled={isNew}
                        title={isNew ? "Sačuvaj novi unos prije brisanja fajlova" : undefined}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
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