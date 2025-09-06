import { useState } from 'react';
import { createArrival } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export default function NewArrivalPage() {
  const [form, setForm] = useState({ supplier: '', carrier: '', plate: '', type: 'truck', eta: '', status: 'announced', note: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createArrival(form);
      navigate('/');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl grid gap-4">
      <h1 className="text-xl font-semibold">Novi dolazak</h1>
      {[
        ['Dobavljač', 'supplier'],
        ['Prevoznik', 'carrier'],
        ['Tablice', 'plate'],
        ['Tip (truck/ship/rail)', 'type'],
        ['ETA', 'eta'],
        ['Status', 'status'],
      ].map(([label, key]) => (
        <label key={key} className="grid gap-1">
          <span className="text-sm opacity-80">{label}</span>
          <input
            className="h-10 rounded-md bg-white/5 px-3"
            value={(form as any)[key]}
            onChange={(e) => setForm(p => ({ ...p, [key]: e.target.value }))}
          />
        </label>
      ))}
      <label className="grid gap-1">
        <span className="text-sm opacity-80">Napomena</span>
        <textarea className="rounded-md bg-white/5 px-3 py-2" rows={4}
          value={form.note} onChange={(e) => setForm(p => ({ ...p, note: e.target.value }))} />
      </label>
      <button disabled={loading} className="h-10 rounded-md bg-blue-600 px-4 disabled:opacity-50">
        Sačuvaj
      </button>
    </form>
  );
}