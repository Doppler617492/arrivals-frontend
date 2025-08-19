import { useState } from 'react';

type Props = {
  onSubmit: (data: {
    supplier: string; plate: string; type: 'truck' | 'container' | 'van';
    carrier?: string; eta?: string; note?: string;
  }) => Promise<void>;
  loading?: boolean;
};

const presets: Array<{label: string; type: 'truck'|'container'|'van'}> = [
  { label: 'Šleper', type: 'truck' },
  { label: 'Kontejner', type: 'container' },
  { label: 'Kombi', type: 'van' },
];

export default function ArrivalForm({ onSubmit, loading }: Props) {
  const [supplier, setSupplier] = useState('');
  const [plate, setPlate] = useState('');
  const [type, setType] = useState<'truck'|'container'|'van'>('truck');
  const [carrier, setCarrier] = useState('');
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier || !plate) return;
    await onSubmit({ supplier, plate, type, carrier: carrier || undefined, eta: eta || undefined, note: note || undefined });
    setSupplier(''); setPlate(''); setCarrier(''); setEta(''); setNote('');
  }

  return (
    <form onSubmit={handleSave} className="card p-4 space-y-3">
      <div className="flex gap-2">
        {presets.map(p => (
          <button type="button" key={p.type}
            onClick={() => setType(p.type)}
            className={`btn-outline ${type===p.type ? 'ring-2 ring-blue-500/40' : ''}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Dobavljač *</label>
          <input className="input" value={supplier} onChange={e=>setSupplier(e.target.value)} required />
        </div>
        <div>
          <label className="label">Tablica *</label>
          <input className="input uppercase" value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())} required />
        </div>
        <div>
          <label className="label">Prevoznik</label>
          <input className="input" value={carrier} onChange={e=>setCarrier(e.target.value)} />
        </div>
        <div>
          <label className="label">ETA (opciono)</label>
          <input className="input" placeholder="YYYY-MM-DD HH:mm" value={eta} onChange={e=>setEta(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Napomena</label>
          <input className="input" value={note} onChange={e=>setNote(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn" disabled={loading}>Sačuvaj</button>
        <span className="text-xs text-slate-500">Obavezno: dobavljač i tablica</span>
      </div>
    </form>
  );
}