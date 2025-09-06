// src/features/users/UsersView.tsx
import React from "react";
import { apiGET, apiPOST, apiPATCH, apiDELETE } from "../../api/client";
import styles from "../../styles";
import type { User } from "../../types";

export default function UsersView() {
  const [rows, setRows] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [form, setForm] = React.useState<{name:string; email:string; password:string; role:string}>({
    name: "", email: "", password: "", role: "viewer",
  });

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const list = await apiGET<User[]>("/users", true);
      setRows(list);
    } catch (e:any) {
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
    } catch (e:any) { alert(`Kreiranje korisnika nije uspjelo:\n${e.message}`); }
  };
  const updateRole = async (id:number, role:string) => {
    try {
      const u = await apiPATCH<User>(`/users/${id}`, { role }, true);
      setRows(prev => prev.map(r => r.id===id?u:r));
    } catch (e:any) { alert(`Izmjena uloge nije uspjela:\n${e.message}`); }
  };
  const remove = async (id:number) => {
    if (!confirm("Obrisati korisnika?")) return;
    try {
      await apiDELETE<{ok:boolean}>(`/users/${id}`, true);
      setRows(prev => prev.filter(r => r.id!==id));
    } catch (e:any) { alert(`Brisanje nije uspjelo:\n${e.message}`); }
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