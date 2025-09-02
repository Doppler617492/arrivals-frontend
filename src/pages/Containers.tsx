import { useEffect, useRef, useState } from "react";
import { listContainers, createContainer, deleteContainer, type Container } from "../lib/api";

/**
 * Base URL for the backend API (falls back to localhost if the Vite env var is missing)
 */
const API_BASE: string =
  (import.meta as any)?.env?.VITE_API_BASE || "http://localhost:8081";

/** Simple metadata for container files returned by the backend */
type FileMeta = {
  id: number;
  filename: string;
  url?: string;
  size?: number;
  created_at?: string;
};

/** Read current token from localStorage and expose it as a hook */
function useToken() {
  const [t, setT] = useState<string | null>(localStorage.getItem("token"));
  useEffect(() => {
    const onStorage = () => setT(localStorage.getItem("token"));
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return t;
}

/** Authorization header helper */
function authHeaders() {
  const t = localStorage.getItem("token") || "";
  return t ? { Authorization: `Bearer ${t}` } as const : {};
}

export default function ContainersPage() {
  // refs for per-row hidden file inputs
  const fileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  // modal + file preview state
  const [filesModalId, setFilesModalId] = useState<number | null>(null);
  const [filesList, setFilesList] = useState<FileMeta[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);

  // table state
  const [rows, setRows] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);

  // auth token
  const token = useToken();

  // form state for create
  const [form, setForm] = useState<Partial<Container>>({
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
    status: "kreiran",
  });

  async function refresh() {
    setLoading(true);
    try {
      const data = await listContainers();
      setRows(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function listFiles(containerId: number) {
    // open modal immediately to give visual feedback
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
        headers: { ...authHeaders() }, // NE postavljati Content-Type ručno kod FormData
        body: fd,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Upload failed: ${res.status} ${text}`);
      }
      // osvježi listu za modal ako je otvoren
      if (filesModalId === containerId) await listFiles(containerId);
      alert("Fajlovi su uploadovani.");
    } catch (err) {
      console.error(err);
      alert("Upload fajlova nije uspio.");
    } finally {
      // reset input da može opet isti fajl da se pošalje
      const input = fileInputsRef.current[containerId];
      if (input) input.value = "";
    }
  }

  async function deleteFile(containerId: number, fileId: number) {
    if (!confirm("Obrisati fajl?")) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/containers/${containerId}/files/${fileId}`,
        {
          method: "DELETE",
          headers: { ...authHeaders() },
        }
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

  useEffect(() => {
    refresh();
  }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return alert("Niste prijavljeni.");
    await createContainer(form as any, token);
    setForm({
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
      status: "kreiran",
    });
    await refresh();
  }

  async function onDelete(id: number) {
    if (!token) return alert("Niste prijavljeni.");
    if (!confirm("Obrisati ovaj kontejner?")) return;
    await deleteContainer(id, token);
    await refresh();
  }

  return (
    <div className="page">
      <h1>Informacije o Kontejnerima</h1>

      <form className="card" onSubmit={onAdd}>
        <div className="grid">
          <label>
            Dobavljač
            <input
              value={form.supplier || ""}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
            />
          </label>
          <label>
            Proforma
            <input
              value={form.proforma_no || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, proforma_no: e.target.value }))
              }
            />
          </label>
          <label>
            ETD (YYYY-MM-DD)
            <input
              value={form.etd || ""}
              onChange={(e) => setForm((f) => ({ ...f, etd: e.target.value }))}
            />
          </label>
          <label>
            Isporuka (Delivery)
            <input
              value={form.delivery || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, delivery: e.target.value }))
              }
            />
          </label>
          <label>
            ETA (YYYY-MM-DD)
            <input
              value={form.eta || ""}
              onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))}
            />
          </label>
          <label>
            Količina (Cargo Qty)
            <input
              type="number"
              step="1"
              value={form.cargo_qty ?? 1}
              onChange={(e) =>
                setForm((f) => ({ ...f, cargo_qty: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Tip (npr. 40HQ)
            <input
              value={form.cargo || ""}
              onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
            />
          </label>
          <label>
            Broj kontejnera
            <input
              value={form.container_no || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, container_no: e.target.value }))
              }
            />
          </label>
          <label>
            Roba
            <input
              value={form.roba || ""}
              onChange={(e) => setForm((f) => ({ ...f, roba: e.target.value }))}
            />
          </label>
          <label>
            Cijena kontejnera
            <input
              type="number"
              step="0.01"
              value={form.contain_price ?? 0}
              onChange={(e) =>
                setForm((f) => ({ ...f, contain_price: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Agent
            <input
              value={form.agent || ""}
              onChange={(e) => setForm((f) => ({ ...f, agent: e.target.value }))}
            />
          </label>
          <label>
            Total
            <input
              type="number"
              step="0.01"
              value={form.total ?? 0}
              onChange={(e) =>
                setForm((f) => ({ ...f, total: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Depozit
            <input
              type="number"
              step="0.01"
              value={form.deposit ?? 0}
              onChange={(e) =>
                setForm((f) => ({ ...f, deposit: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Balans
            <input
              type="number"
              step="0.01"
              value={form.balance ?? 0}
              onChange={(e) =>
                setForm((f) => ({ ...f, balance: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Status
            <input
              value={form.status || "kreiran"}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            />
          </label>
        </div>
        <button type="submit">Dodaj</button>
      </form>

      <div className="card">
        {loading ? (
          <p>Učitavanje…</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Dobavljač</th>
                <th>Proforma</th>
                <th>ETD</th>
                <th>Delivery</th>
                <th>ETA</th>
                <th>Qty</th>
                <th>Tip</th>
                <th>Kontejner</th>
                <th>Roba</th>
                <th>Cijena</th>
                <th>Agent</th>
                <th>Total</th>
                <th>Depozit</th>
                <th>Balans</th>
                <th>Status</th>
                <th style={{ width: 160 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.supplier}</td>
                  <td>{r.proforma_no}</td>
                  <td>{r.etd}</td>
                  <td>{r.delivery}</td>
                  <td>{r.eta}</td>
                  <td>{r.cargo_qty}</td>
                  <td>{r.cargo}</td>
                  <td>{r.container_no}</td>
                  <td>{r.roba}</td>
                  <td>{r.contain_price}</td>
                  <td>{r.agent}</td>
                  <td>{r.total}</td>
                  <td>{r.deposit}</td>
                  <td>{r.balance}</td>
                  <td>{r.status}</td>
                  <td className="actions-cell">
                    {/* Skriveni file input specifičan za red */}
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      style={{ display: "none" }}
                      ref={(el) => (fileInputsRef.current[r.id] = el)}
                      onChange={(e) => uploadFiles(r.id, e.target.files)}
                    />
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => listFiles(r.id)}
                      >
                        Fajlovi
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          const el = fileInputsRef.current[r.id];
                          if (el) el.click();
                          else alert("Greška sa inputom za upload.");
                        }}
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => onDelete(r.id)}
                      >
                        Obriši
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
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
                  {filesList.map((f) => (
                    <li key={f.id}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <a
                          href={f.url || `${API_BASE}/api/containers/${filesModalId ?? 0}/files/${f.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            // keep inline preview behavior too
                            e.preventDefault();
                            if (f.url) {
                              setPreviewUrl(f.url);
                              setPreviewName(f.filename);
                            } else {
                              const url = `${API_BASE}/api/containers/${filesModalId ?? 0}/files/${f.id}`;
                              setPreviewUrl(url);
                              setPreviewName(f.filename);
                            }
                          }}
                        >
                          {f.filename}
                        </a>
                        <button
                          className="btn xsmall danger"
                          onClick={() => deleteFile(filesModalId, f.id)}
                        >
                          Obriši
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {previewUrl && (
                  <div style={{ marginTop: 12, position: "relative" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <strong>Pregled: {previewName}</strong>
                      <button
                        className="btn xsmall ghost"
                        onClick={() => {
                          setPreviewUrl(null);
                          setPreviewName(null);
                        }}
                      >
                        Zatvori pregled
                      </button>
                    </div>
                    <iframe
                      src={previewUrl}
                      style={{
                        width: "100%",
                        height: "400px",
                        border: "1px solid #ccc",
                        borderRadius: 8,
                      }}
                      title={`Preview of ${previewName}`}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        .page{padding:24px; background:#f7f8fb; color:#0b1220; min-height:100vh;}
        h1{font-size:22px; margin-bottom:16px;}
        .card{background:#fff; border:1px solid #e6e8ef; border-radius:12px; padding:16px; margin-bottom:16px; box-shadow:0 1px 2px rgba(0,0,0,.04);}
        .grid{display:grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap:12px;}
        label{font-size:12px; display:flex; flex-direction:column; gap:6px;}
        input{border:1px solid #d5d8e1; border-radius:8px; padding:8px; font-size:14px; background:#fff;}
        button{border:0; background:#0d6efd; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer;}
        button:hover{opacity:.9}
        .table{width:100%; border-collapse:collapse; font-size:13px;}
        .table th,.table td{padding:10px; border-bottom:1px solid #eef0f5; text-align:left;}
        .table thead th{background:#fafbff; font-weight:600;}

        .actions-cell .row-actions{display:flex; gap:6px; align-items:center; justify-content:flex-start; flex-wrap:wrap;}
        .btn{border:0; background:#0d6efd; color:#fff; padding:10px 14px; border-radius:10px; cursor:pointer;}
        .btn.small{padding:6px 10px; border-radius:8px; font-size:12px;}
        .btn.xsmall{padding:4px 8px; border-radius:8px; font-size:11px;}
        .btn.ghost{background:#eef2ff; color:#29324a;}
        .btn.danger{background:#e03131;}

        .modal-backdrop{position:fixed; inset:0; background:rgba(9,16,29,.35); display:flex; align-items:center; justify-content:center; z-index:50;}
        .modal{width:min(720px,90vw); background:#fff; border:1px solid #e6e8ef; border-radius:12px; padding:16px; box-shadow:0 10px 30px rgba(0,0,0,.15);}
        .modal-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;}
        .files{list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px;}
        .files li{display:flex; align-items:center; justify-content:space-between; gap:10px; border:1px solid #eef0f5; border-radius:8px; padding:8px 10px;}
      `}</style>
    </div>
  );
}