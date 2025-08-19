import { api } from '../lib/api';
import type { Arrival } from '../lib/api';
import { useState } from 'react';
import { toast } from 'sonner';

type Props = {
  data: Arrival[];
  onChanged: () => void;
  filter: { q: string; status: string; supplier: string };
};

function match(a: Arrival, f: Props['filter']) {
  const q = f.q.toLowerCase().trim();
  const okQ = !q || [a.plate, a.supplier, a.carrier || ''].some(v => v.toLowerCase().includes(q));
  const okS = !f.status || a.status === f.status;
  const okSup = !f.supplier || a.supplier.toLowerCase().includes(f.supplier.toLowerCase());
  return okQ && okS && okSup;
}

export default function ArrivalsTable({ data, onChanged, filter }: Props) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const filtered = data.filter(a => match(a, filter));

  async function setStatus(id: number, status: Arrival['status']) {
    setBusyId(id);
    try {
      await api.update(id, { status });
      toast.success('Status ažuriran');
      onChanged();
    } catch (e: any) {
      toast.error(`Greška: ${e.message || e}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="table-wrap">
      <table className="modern">
        <thead>
          <tr>
            <th>ID</th>
            <th>Vrijeme</th>
            <th>Dobavljač</th>
            <th>Prevoznik</th>
            <th>Tablica</th>
            <th>Tip</th>
            <th>Status</th>
            <th className="text-right">Akcije</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(a => (
            <tr key={a.id} className="bg-white dark:bg-slate-950/20">
              <td className="px-4 py-3">{a.id}</td>
              <td className="px-4 py-3">{new Date(a.created_at).toLocaleString()}</td>
              <td className="px-4 py-3">{a.supplier}</td>
              <td className="px-4 py-3">{a.carrier || '—'}</td>
              <td className="px-4 py-3 font-mono">{a.plate}</td>
              <td className="px-4 py-3 capitalize">{a.type}</td>
              <td className="px-4 py-3">
                <span className={`status status-${a.status}`}>{a.status}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button className="btn-outline" disabled={busyId===a.id} onClick={()=>setStatus(a.id,'arrived')}>Markiraj stiglo</button>
                  <button className="btn-outline" disabled={busyId===a.id} onClick={()=>setStatus(a.id,'delayed')}>Označi kasni</button>
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nema rezultata za zadate filtere.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}