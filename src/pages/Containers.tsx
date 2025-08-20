import { useEffect, useMemo, useState } from "react";
import { listContainers, createContainer, updateContainer, deleteContainer, type Container } from "../lib/api";

function useToken() {
  return localStorage.getItem("token") || "";
}

export default function ContainersPage() {
  const [rows, setRows] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const token = useToken();

  const [form, setForm] = useState<Partial<Container>>({
    supplier: "", proforma_no: "", cargo: "", container_no: "", roba: "",
    etd: "", delivery: "", eta: "", cargo_qty: 1, contain_price: 0, total: 0, deposit: 0, balance: 0, agent: "", status: "kreiran"
  });

  async function refresh() {
    setLoading(true);
    try {
      const data = await listContainers();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = token;
    if (!t) return alert("Niste prijavljeni.");
    await createContainer(form as any, t);
    setForm({ supplier: "", proforma_no: "", cargo: "", container_no: "", roba: "", etd: "", delivery: "", eta: "", cargo_qty: 1, contain_price: 0, total: 0, deposit: 0, balance: 0, agent: "", status: "kreiran" });
    await refresh();
  }

  async function onDelete(id: number) {
    const t = token;
    if (!t) return alert("Niste prijavljeni.");
    if (!confirm("Obrisati ovaj kontejner?")) return;
    await deleteContainer(id, t);
    await refresh();
  }

  return (
    <div className="page">
      <h1>Informacije o Kontejnerima</h1>

      <form className="card" onSubmit={onAdd}>
        <div className="grid">
          <label>
            Dobavljač
            <input value={form.supplier||""} onChange={e=>setForm(f=>({...f, supplier:e.target.value}))}/>
          </label>
          <label>
            Proforma
            <input value={form.proforma_no||""} onChange={e=>setForm(f=>({...f, proforma_no:e.target.value}))}/>
          </label>
          <label>
            ETD (YYYY-MM-DD)
            <input value={form.etd||""} onChange={e=>setForm(f=>({...f, etd:e.target.value}))}/>
          </label>
          <label>
            Isporuka (Delivery)
            <input value={form.delivery||""} onChange={e=>setForm(f=>({...f, delivery:e.target.value}))}/>
          </label>
          <label>
            ETA (YYYY-MM-DD)
            <input value={form.eta||""} onChange={e=>setForm(f=>({...f, eta:e.target.value}))}/>
          </label>
          <label>
            Količina (Cargo Qty)
            <input type="number" step="1" value={form.cargo_qty??1} onChange={e=>setForm(f=>({...f, cargo_qty:Number(e.target.value)}))}/>
          </label>
          <label>
            Tip (npr. 40HQ)
            <input value={form.cargo||""} onChange={e=>setForm(f=>({...f, cargo:e.target.value}))}/>
          </label>
          <label>
            Broj kontejnera
            <input value={form.container_no||""} onChange={e=>setForm(f=>({...f, container_no:e.target.value}))}/>
          </label>
          <label>
            Roba
            <input value={form.roba||""} onChange={e=>setForm(f=>({...f, roba:e.target.value}))}/>
          </label>
          <label>
            Cijena kontejnera
            <input type="number" step="0.01" value={form.contain_price??0} onChange={e=>setForm(f=>({...f, contain_price:Number(e.target.value)}))}/>
          </label>
          <label>
            Agent
            <input value={form.agent||""} onChange={e=>setForm(f=>({...f, agent:e.target.value}))}/>
          </label>
          <label>
            Total
            <input type="number" step="0.01" value={form.total??0} onChange={e=>setForm(f=>({...f, total:Number(e.target.value)}))}/>
          </label>
          <label>
            Depozit
            <input type="number" step="0.01" value={form.deposit??0} onChange={e=>setForm(f=>({...f, deposit:Number(e.target.value)}))}/>
          </label>
          <label>
            Balans
            <input type="number" step="0.01" value={form.balance??0} onChange={e=>setForm(f=>({...f, balance:Number(e.target.value)}))}/>
          </label>
          <label>
            Status
            <input value={form.status||"kreiran"} onChange={e=>setForm(f=>({...f, status:e.target.value}))}/>
          </label>
        </div>
        <button type="submit">Dodaj</button>
      </form>

      <div className="card">
        {loading ? <p>Učitavanje…</p> : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Dobavljač</th><th>Proforma</th><th>ETD</th><th>Delivery</th><th>ETA</th>
                <th>Qty</th><th>Tip</th><th>Kontejner</th><th>Roba</th>
                <th>Cijena</th><th>Agent</th><th>Total</th><th>Depozit</th><th>Balans</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
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
                  <td><button onClick={()=>onDelete(r.id)}>Obriši</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
      `}</style>
    </div>
  );
}