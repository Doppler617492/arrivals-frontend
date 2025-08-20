// src/App.tsx

import React, { useEffect, useMemo, useState } from "react";

type FileMeta = { id: number; filename: string; url: string; uploaded_at: string; size?: number };
type ArrivalSearchResponse = { items: Arrival[]; total: number; page: number; per_page: number };

type User = { id: number; email: string; name: string; role: string };
type Arrival = {
  id: number;
  supplier: string;
  carrier: string | null;
  plate: string | null;
  type: string;
  eta: string | null;
  status:
    | "announced"
    | "working"
    | "producing"
    | "shipped"
    | "arriving"
    | "arrived"
    | "delayed"
    | "cancelled";
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
      // JWT expired/invalid – force logout by clearing token
      localStorage.removeItem("token");
    }
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

// Dozvole po ulozi – mora da se poklopi sa backend ROLE_FIELDS
const ROLE_FIELDS: Record<string, Set<string>> = {
  admin: new Set(["supplier", "carrier", "plate", "type", "eta", "status", "note"]),
  planer: new Set(["supplier", "status", "eta", "note"]),
  proizvodnja: new Set(["status", "note"]),
  transport: new Set(["carrier", "plate", "eta", "status", "note"]),
  carina: new Set(["status", "note"]),
  viewer: new Set([]),
};

const STATUSES: Arrival["status"][] = [
  "announced",
  "working",
  "producing",
  "shipped",
  "arriving",
  "arrived",
  "delayed",
  "cancelled",
];

// ——— Login view ————————————————————————————————————————————————————————
function LoginView({ onLoggedIn }: { onLoggedIn: (u: User) => void }) {
  const [email, setEmail] = useState("it@cungu.com");
  const [password, setPassword] = useState("Dekodera19892603@@@");
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
    <div style={styles.centeredPage}>
      <form onSubmit={submit} style={styles.card}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Prijava</h2>
        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
        />
        <label style={styles.label}>Lozinka</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="lozinka"
        />
        {err && <div style={styles.error}>{err}</div>}
        <button disabled={loading} style={styles.primaryBtn}>
          {loading ? "Učitavam..." : "Uloguj se"}
        </button>
        <div style={styles.hint}>
          * Kreiranje koristi API ključ (X-API-Key). Postavi VITE_API_KEY u
          .env.local da bi radio “Novi dolazak”.
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
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  // toggle users view
  const [showUsers, setShowUsers] = useState(false);

  // modal – novi dolazak
  const [openCreate, setOpenCreate] = useState(false);
  const [newForm, setNewForm] = useState<Partial<Arrival>>({
    supplier: "",
    carrier: "",
    plate: "",
    type: "truck",
    eta: "",
    status: "announced",
    note: "",
  });

  // updates modal
  const [openUpdates, setOpenUpdates] = useState<null | number>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [newNote, setNewNote] = useState("");

  // files modal
  const [openFiles, setOpenFiles] = useState<null | number>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);

  // deleting state for arrivals
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const may = useMemo(() => ROLE_FIELDS[user.role] || new Set<string>(), [user.role]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const query = qs({
        q, status: statusFilter || undefined,
        sort_by: sortBy, sort_dir: sortDir,
        page, per_page: perPage,
      });
      const data = await apiGET<ArrivalSearchResponse>(`/api/arrivals/search?${query}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      // fallback na staru listu ako search endpoint nije dostupan
      try {
        const data = await apiGET<Arrival[]>("/api/arrivals");
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
    Array.from(fl).forEach(f => form.append("files", f));
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
        alert("VITE_API_KEY nije postavljen u .env.local");
        return;
      }
      const created = await apiPOST<Arrival>("/api/arrivals", newForm, {
        useApiKey: true,
      });
      setItems((prev) => [created, ...prev]);
      setOpenCreate(false);
      setNewForm({
        supplier: "",
        carrier: "",
        plate: "",
        type: "truck",
        eta: "",
        status: "announced",
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

  return (
    <div style={{ minHeight: "100vh", background: "#0b1220", color: "#e6ebff" }}>
      <header style={styles.header}>
        <div>
          <strong>Arrivals</strong>{" "}
          <span style={{ opacity: 0.7 }}>• {user.name} ({user.role})</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.secondaryBtn} onClick={load}>Osveži</button>
          <button style={styles.secondaryBtn} onClick={() => setOpenCreate(true)}>+ Novi dolazak</button>
          {user.role === "admin" && (
            <button
              style={styles.secondaryBtn}
              onClick={() => setShowUsers(prev => !prev)}
              title="Upravljanje korisnicima"
            >
              {showUsers ? "← Nazad na dolaske" : "Korisnici"}
            </button>
          )}
          <button style={styles.dangerGhost} onClick={() => { setToken(null); onLogout(); }}>Odjava</button>
        </div>
      </header>

      <main style={{ padding: 24 }}>
        {loading && <div>Učitavanje...</div>}
        {err && <div style={styles.error}>{err}</div>}

        {!showUsers && (
          <div style={{ display:"grid", gap:8, gridTemplateColumns:"1.2fr .8fr .8fr .6fr .6fr", marginBottom: 12 }}>
            <input
              style={styles.input}
              placeholder="Pretraga (dobavljač, tablice…)"
              value={qRaw}
              onChange={(e) => setQRaw(e.target.value)}
            />
            <select style={styles.select} value={statusFilter} onChange={e=>{ setPage(1); setStatusFilter(e.target.value); }}>
              <option value="">Svi statusi</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={styles.select} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="created_at">Sortiraj po: kreirano</option>
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

        {!loading && !err && !showUsers && (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Dobavljač</th>
                  <th>Prevoznik</th>
                  <th>Tablice</th>
                  <th>Tip</th>
                  <th>ETA</th>
                  <th>Status</th>
                  <th>Napomena</th>
                  <th>Kreirano</th>
                  <th style={{ textAlign: "right" }}>Akcije</th>
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
                    <td>{a.plate || "-"}</td>
                    <td>{a.type}</td>
                    <td>{a.eta ? new Date(a.eta).toLocaleString() : "-"}</td>
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
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        a.status
                      )}
                    </td>
                    <td style={{ maxWidth: 220 }}>
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
                    <td>{new Date(a.created_at).toLocaleString()}</td>
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
                    <td colSpan={10} style={{ textAlign: "center", opacity: 0.7 }}>
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
        {showUsers && user.role === "admin" && <UsersView />}
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
              <input
                style={styles.input}
                value={newForm.carrier || ""}
                onChange={(e) => setNewForm({ ...newForm, carrier: e.target.value })}
              />
              <label style={styles.label}>Tablice</label>
              <input
                style={styles.input}
                value={newForm.plate || ""}
                onChange={(e) => setNewForm({ ...newForm, plate: e.target.value })}
              />
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
    background: "#0b1220",
    color: "#e6ebff",
    placeItems: "center",
    padding: 24,
  },
  card: {
    width: 360,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    position: "sticky",
    top: 0,
    background: "#0b1220",
    zIndex: 2,
  },
  input: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "#e6ebff",
    outline: "none",
  },
  textarea: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "#e6ebff",
    outline: "none",
    minHeight: 80,
  },
  label: { fontSize: 12, opacity: 0.8 },
  error: {
    background: "rgba(255,0,0,0.12)",
    border: "1px solid rgba(255,0,0,0.3)",
    color: "#ffb3b3",
    padding: "8px 10px",
    borderRadius: 8,
    marginTop: 8,
  },
  warn: {
    background: "rgba(255,165,0,0.12)",
    border: "1px solid rgba(255,165,0,0.3)",
    color: "#ffd49a",
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
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.05)",
    color: "#e6ebff",
    cursor: "pointer",
  },
  dangerGhost: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,77,77,0.3)",
    background: "transparent",
    color: "#ff9c9c",
    cursor: "pointer",
  },
  ghostBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "#e6ebff",
    cursor: "pointer",
    marginRight: 6,
  },
  select: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.05)",
    color: "#e6ebff",
  },
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
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
    background: "rgba(15,20,35,1)",
    color: "#e6ebff",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 16,
  },
};

// ——— Kraj ———————————————————————————————————————————————————————————————